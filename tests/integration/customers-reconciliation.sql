BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM sales sale JOIN pos_checkouts checkout ON checkout.organization_id=sale.organization_id AND checkout.id=sale.checkout_id JOIN pos_carts cart ON cart.organization_id=checkout.organization_id AND cart.id=checkout.cart_id WHERE sale.customer_id IS DISTINCT FROM checkout.customer_id OR sale.customer_id IS DISTINCT FROM cart.customer_id OR sale.customer_code_snapshot<>checkout.customer_code_snapshot) THEN RAISE EXCEPTION 'customer Sale/checkout/cart linkage mismatch'; END IF;
 RAISE NOTICE 'PASS: immutable customer settlement linkage; zero violations';
 IF EXISTS(SELECT 1 FROM sales replacement JOIN pos_checkouts checkout ON checkout.organization_id=replacement.organization_id AND checkout.id=replacement.checkout_id JOIN sale_adjustments adjustment ON adjustment.organization_id=checkout.organization_id AND adjustment.id=checkout.adjustment_id JOIN sales original ON original.organization_id=adjustment.organization_id AND original.id=adjustment.original_sale_id WHERE replacement.customer_id IS DISTINCT FROM original.customer_id OR replacement.customer_code_snapshot<>original.customer_code_snapshot) THEN RAISE EXCEPTION 'replacement customer inheritance mismatch'; END IF;
 RAISE NOTICE 'PASS: replacement customer/code inheritance; zero violations';
 IF EXISTS(SELECT 1 FROM customer_group_memberships membership LEFT JOIN customers customer ON customer.organization_id=membership.organization_id AND customer.id=membership.customer_id LEFT JOIN customer_groups customer_group ON customer_group.organization_id=membership.organization_id AND customer_group.id=membership.group_id WHERE customer.id IS NULL OR customer_group.id IS NULL) THEN RAISE EXCEPTION 'customer membership tenant mismatch'; END IF;
 RAISE NOTICE 'PASS: customer membership tenant linkage; zero violations';
END $$;
SELECT count(*) FILTER(WHERE customer_id IS NOT NULL),count(*) FILTER(WHERE customer_id IS NULL) FROM sales;
ROLLBACK;
