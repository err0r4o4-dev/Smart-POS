DO $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
BEGIN
  -- ค้นหา organization_id จากฐานข้อมูล (ถ้ามี org เดิมให้ใช้ ถ้าไม่มีให้ใช้ org แรก)
  SELECT id INTO v_org_id FROM organizations WHERE id = '08ac3879-d23c-49a7-bd3c-8c7f0641b3b5';
  IF v_org_id IS NULL THEN
    SELECT id INTO v_org_id FROM organizations ORDER BY created_at ASC LIMIT 1;
  END IF;

  SELECT id INTO v_user_id FROM users WHERE id = '8e919a6e-8f10-4021-9552-404818dca899';
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM users ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF v_org_id IS NOT NULL THEN
    PERFORM set_config('app.organization_id', v_org_id::text, true);
    IF v_user_id IS NOT NULL THEN
      PERFORM set_config('app.user_id', v_user_id::text, true);
    END IF;

    DELETE FROM supplier_products WHERE organization_id = v_org_id;
    DELETE FROM suppliers WHERE organization_id = v_org_id AND code IN ('SUP-CPALL', 'SUP-THAI-BEV');
    DELETE FROM shelf_assignments WHERE organization_id = v_org_id;
    DELETE FROM shelf_slots WHERE organization_id = v_org_id;
    DELETE FROM shelves WHERE organization_id = v_org_id;
    DELETE FROM quality_stock_balances WHERE organization_id = v_org_id;
    DELETE FROM product_batches WHERE organization_id = v_org_id;
    DELETE FROM inventory_reorder_points WHERE organization_id = v_org_id;
    DELETE FROM stock_balances WHERE organization_id = v_org_id;
    DELETE FROM stock_locations WHERE organization_id = v_org_id;
    DELETE FROM product_barcodes WHERE organization_id = v_org_id;
    DELETE FROM product_variants WHERE organization_id = v_org_id;
    DELETE FROM products WHERE organization_id = v_org_id;
    DELETE FROM brands WHERE organization_id = v_org_id;
    DELETE FROM categories WHERE organization_id = v_org_id;
    DELETE FROM units WHERE organization_id = v_org_id;

    RAISE NOTICE 'Sample data cleaned successfully for organization %', v_org_id;
  END IF;
END $$;

