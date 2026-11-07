BEGIN;

CREATE OR REPLACE FUNCTION pos_sale_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pos_checkouts WHERE organization_id=NEW.organization_id AND id=NEW.checkout_id AND status='COMPLETED' AND total=NEW.grand_total AND cashier_id=NEW.cashier_id AND cart_id=NEW.cart_id AND shift_id=NEW.shift_id)
 OR NOT EXISTS(SELECT 1 FROM pos_carts WHERE organization_id=NEW.organization_id AND id=NEW.cart_id AND status='COMPLETED' AND cashier_id=NEW.cashier_id)
 OR NOT EXISTS(SELECT 1 FROM register_shifts WHERE organization_id=NEW.organization_id AND id=NEW.shift_id AND cashier_id=NEW.cashier_id)
 OR NOT EXISTS(SELECT 1 FROM inventory_operations WHERE organization_id=NEW.organization_id AND id=NEW.inventory_operation_id AND result IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM sale_payments payment JOIN pos_checkouts checkout ON checkout.organization_id=payment.organization_id AND checkout.id=payment.checkout_id WHERE payment.organization_id=NEW.organization_id AND payment.sale_id=NEW.id AND payment.checkout_id=NEW.checkout_id AND payment.amount=NEW.grand_total AND ROW(payment.method,payment.received,payment.change,payment.reference,payment.confirmed_by,payment.confirmed_at)=ROW(checkout.method,checkout.received,checkout.change,checkout.reference,checkout.confirmed_by,checkout.confirmed_at))
 OR NOT EXISTS(SELECT 1 FROM receipts WHERE organization_id=NEW.organization_id AND sale_id=NEW.id)
 OR COALESCE((SELECT sum(line_total) FROM sale_items WHERE organization_id=NEW.organization_id AND sale_id=NEW.id),0)<>NEW.grand_total
 OR NOT EXISTS(SELECT 1 FROM sale_items WHERE organization_id=NEW.organization_id AND sale_id=NEW.id)
 THEN RAISE EXCEPTION 'sale settlement mismatch' USING ERRCODE='23514'; END IF;

 IF EXISTS (
  WITH expected_raw AS (
   SELECT item.variant_id, item.stock_location_id, sum(item.quantity) AS quantity
   FROM sale_items item
   WHERE item.organization_id=NEW.organization_id AND item.sale_id=NEW.id
     AND NOT EXISTS(
      SELECT 1 FROM restaurant_recipes recipe
      WHERE recipe.organization_id=item.organization_id AND recipe.branch_id=item.branch_id
        AND recipe.menu_variant_id=item.variant_id AND recipe.status='ACTIVE'
     )
   GROUP BY item.variant_id,item.stock_location_id
   UNION ALL
   SELECT recipe_item.ingredient_variant_id, item.stock_location_id, round(sum(recipe_item.quantity*item.quantity),3)
   FROM sale_items item
   JOIN restaurant_recipes recipe ON recipe.organization_id=item.organization_id
    AND recipe.branch_id=item.branch_id AND recipe.menu_variant_id=item.variant_id AND recipe.status='ACTIVE'
   JOIN restaurant_recipe_items recipe_item ON recipe_item.organization_id=recipe.organization_id AND recipe_item.recipe_id=recipe.id
   WHERE item.organization_id=NEW.organization_id AND item.sale_id=NEW.id
   GROUP BY recipe_item.ingredient_variant_id,item.stock_location_id
  ), expected AS (
   SELECT variant_id,stock_location_id,sum(quantity) AS quantity
   FROM expected_raw
   GROUP BY variant_id,stock_location_id
  ), actual AS (
   SELECT movement.variant_id,movement.location_id AS stock_location_id,sum(-movement.quantity_delta) AS quantity
   FROM stock_movements movement
   WHERE movement.organization_id=NEW.organization_id AND movement.sale_id=NEW.id
     AND movement.operation_id=NEW.inventory_operation_id AND movement.movement_type='SALE'
   GROUP BY movement.variant_id,movement.location_id
  )
  SELECT 1
  FROM expected
  FULL OUTER JOIN actual USING (variant_id,stock_location_id)
  WHERE expected.quantity IS DISTINCT FROM actual.quantity
 ) THEN RAISE EXCEPTION 'sale inventory settlement mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

COMMIT;