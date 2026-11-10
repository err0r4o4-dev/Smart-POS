-- SmartPOS Sample Sales History Seed Script
-- สำหรับสร้างข้อมูลตัวอย่างประวัติการขายสินค้า (Sales History)
-- รองรับการแสดงผลในหน้า /sales (Store management > Sales)
-- ครอบคลุม:
--   - ยอดขายรวม (Total sales), จำนวนบิล (Transaction count), ยอดเฉลี่ยต่อบิล (Average per sale)
--   - แท็บวิธีชำระเงินครบทุกแบบ: All sales, Cash, Card/QR, Transfer
--   - ตัวกรองช่วงเวลา: Today, Last 7 days, Last 30 days
--   - รายละเอียดสินค้าในแต่ละบิล (Sale Items), ใบเสร็จรับเงิน (Receipts), การตัดสต็อก (Stock Movements)

DO $$
DECLARE
  v_org_id uuid;
  v_branch_id uuid;
  v_user_id uuid;
  loc_wh uuid;
  term_main uuid;

  v_store_name text;
  v_branch_name text;
  v_store_address text;
  v_cashier_name text;
  v_term_name text;

  -- Shifts
  shift_today uuid := gen_random_uuid();
  shift_week uuid := gen_random_uuid();
  shift_month uuid := gen_random_uuid();

  -- Fallback IDs if products needed
  u_piece uuid := gen_random_uuid();
  c_food uuid := gen_random_uuid();
  b_shop uuid := gen_random_uuid();
  p_s1 uuid := gen_random_uuid();
  p_s2 uuid := gen_random_uuid();
  p_s3 uuid := gen_random_uuid();

  -- Carts
  c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); c3 uuid := gen_random_uuid();
  c4 uuid := gen_random_uuid(); c5 uuid := gen_random_uuid(); c6 uuid := gen_random_uuid();
  c7 uuid := gen_random_uuid(); c8 uuid := gen_random_uuid(); c9 uuid := gen_random_uuid();
  c10 uuid := gen_random_uuid();

  -- Checkouts
  chk1 uuid := gen_random_uuid(); chk2 uuid := gen_random_uuid(); chk3 uuid := gen_random_uuid();
  chk4 uuid := gen_random_uuid(); chk5 uuid := gen_random_uuid(); chk6 uuid := gen_random_uuid();
  chk7 uuid := gen_random_uuid(); chk8 uuid := gen_random_uuid(); chk9 uuid := gen_random_uuid();
  chk10 uuid := gen_random_uuid();

  -- Sales
  s1 uuid := gen_random_uuid(); s2 uuid := gen_random_uuid(); s3 uuid := gen_random_uuid();
  s4 uuid := gen_random_uuid(); s5 uuid := gen_random_uuid(); s6 uuid := gen_random_uuid();
  s7 uuid := gen_random_uuid(); s8 uuid := gen_random_uuid(); s9 uuid := gen_random_uuid();
  s10 uuid := gen_random_uuid();

  -- Operations
  op1 uuid := gen_random_uuid(); op2 uuid := gen_random_uuid(); op3 uuid := gen_random_uuid();
  op4 uuid := gen_random_uuid(); op5 uuid := gen_random_uuid(); op6 uuid := gen_random_uuid();
  op7 uuid := gen_random_uuid(); op8 uuid := gen_random_uuid(); op9 uuid := gen_random_uuid();
  op10 uuid := gen_random_uuid();

  -- Variant details
  var1_id uuid; var1_pname text; var1_vname text; var1_sku text; var1_barcode text; var1_unit text; var1_price numeric(18,2);
  var2_id uuid; var2_pname text; var2_vname text; var2_sku text; var2_barcode text; var2_unit text; var2_price numeric(18,2);
  var3_id uuid; var3_pname text; var3_vname text; var3_sku text; var3_barcode text; var3_unit text; var3_price numeric(18,2);

  -- Totals
  tot1 numeric(18,2); tot2 numeric(18,2); tot3 numeric(18,2); tot4 numeric(18,2); tot5 numeric(18,2);
  tot6 numeric(18,2); tot7 numeric(18,2); tot8 numeric(18,2); tot9 numeric(18,2); tot10 numeric(18,2);

  cash_today numeric(18,2);
  cash_week numeric(18,2);
  cash_month numeric(18,2);
BEGIN
  -- 1. ค้นหาองค์กร สาขา และผู้ใช้งาน
  SELECT id INTO v_org_id FROM organizations ORDER BY created_at ASC LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบข้อมูล organization ในระบบ กรุณาลงทะเบียนหรือสร้างร้านค้าก่อน';
  END IF;

  SELECT id INTO v_branch_id FROM branches WHERE organization_id = v_org_id ORDER BY created_at ASC LIMIT 1;
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบข้อมูล branch ในระบบ';
  END IF;

  SELECT id INTO v_user_id FROM users ORDER BY created_at ASC LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบข้อมูล user ในระบบ';
  END IF;

  -- ตั้งค่า RLS Session
  PERFORM set_config('app.organization_id', v_org_id::text, true);
  PERFORM set_config('app.user_id', v_user_id::text, true);

  -- 2. ค้นหาคลังสินค้า (Stock Location)
  SELECT id INTO loc_wh FROM stock_locations WHERE organization_id = v_org_id AND branch_id = v_branch_id AND code = 'LOC-WH-MAIN';
  IF loc_wh IS NULL THEN
    SELECT id INTO loc_wh FROM stock_locations WHERE organization_id = v_org_id AND branch_id = v_branch_id ORDER BY created_at ASC LIMIT 1;
  END IF;
  IF loc_wh IS NULL THEN
    loc_wh := gen_random_uuid();
    INSERT INTO stock_locations (id, organization_id, branch_id, code, name, type, status, description, created_by, updated_by)
    VALUES (loc_wh, v_org_id, v_branch_id, 'LOC-WH-MAIN', 'คลังสินค้าหลัก', 'WAREHOUSE', 'ACTIVE', 'คลังสินค้าหลักสำหรับจัดเก็บและขายสินค้า', v_user_id, v_user_id);
  END IF;

  -- 3. ค้นหาจุดขาย (POS Terminal)
  SELECT id INTO term_main FROM pos_terminals WHERE organization_id = v_org_id AND branch_id = v_branch_id AND code = 'TERM-01';
  IF term_main IS NULL THEN
    SELECT id INTO term_main FROM pos_terminals WHERE organization_id = v_org_id AND branch_id = v_branch_id ORDER BY created_at ASC LIMIT 1;
  END IF;
  IF term_main IS NULL THEN
    term_main := gen_random_uuid();
    INSERT INTO pos_terminals (id, organization_id, branch_id, code, name, stock_location_id, status, revision)
    VALUES (term_main, v_org_id, v_branch_id, 'TERM-01', 'เคาน์เตอร์แคชเชียร์ 1 (หน้าร้าน)', loc_wh, 'ACTIVE', 1);
  END IF;

  -- 4. ดึงข้อมูลประกอบบิล (Store, Branch, Cashier, Terminal)
  SELECT COALESCE(name, 'ร้านค้าสาขาหลัก') INTO v_store_name FROM organizations WHERE id = v_org_id;
  SELECT COALESCE(name, 'สาขาหลัก'), COALESCE(address, 'กรุงเทพมหานคร') INTO v_branch_name, v_store_address FROM branches WHERE id = v_branch_id;
  SELECT COALESCE(display_name, 'แคชเชียร์หลัก') INTO v_cashier_name FROM users WHERE id = v_user_id;
  SELECT COALESCE(name, 'เคาน์เตอร์แคชเชียร์ 1 (หน้าร้าน)') INTO v_term_name FROM pos_terminals WHERE id = term_main;

  -- 5. ดึงรายการสินค้าตัวอย่างสำหรับขาย
  -- ถ้ายังไม่มีสินค้าในระบบ ให้สร้างสินค้าเบื้องต้นให้อัตโนมัติ
  IF (SELECT count(*) FROM product_variants WHERE organization_id = v_org_id AND status = 'ACTIVE') < 3 THEN
    INSERT INTO units (id, organization_id, code, name, description, unit_type, conversion_factor, status)
    VALUES (u_piece, v_org_id, 'PIECE', 'ชิ้น', 'หน่วยนับชิ้นทั่วไป', 'COUNT', 1, 'ACTIVE')
    ON CONFLICT (organization_id, code) DO NOTHING;
    SELECT id INTO u_piece FROM units WHERE organization_id = v_org_id AND code = 'PIECE';

    INSERT INTO categories (id, organization_id, name, description, status)
    VALUES (c_food, v_org_id, 'อาหารและเครื่องดื่ม', 'หมวดหมู่อาหารและเครื่องดื่มทั่วไป', 'ACTIVE')
    ON CONFLICT (organization_id, lower(btrim(name))) DO NOTHING;
    SELECT id INTO c_food FROM categories WHERE organization_id = v_org_id AND lower(btrim(name)) = lower('อาหารและเครื่องดื่ม');

    INSERT INTO brands (id, organization_id, name, description, status)
    VALUES (b_shop, v_org_id, 'สินค้าทางร้าน', 'สินค้าแบรนด์ของทางร้าน', 'ACTIVE')
    ON CONFLICT (organization_id, lower(btrim(name))) DO NOTHING;
    SELECT id INTO b_shop FROM brands WHERE organization_id = v_org_id AND lower(btrim(name)) = lower('สินค้าทางร้าน');

    INSERT INTO products (id, organization_id, name, description, category_id, brand_id, status, created_by, updated_by)
    VALUES
      (p_s1, v_org_id, 'ซูชิแซลมอนสด', 'ซูชิหน้าปลาแซลมอนนำเข้า นุ่มละมุนลิ้น', c_food, b_shop, 'ACTIVE', v_user_id, v_user_id),
      (p_s2, v_org_id, 'แคลิฟอร์เนียโรล', 'โรลไข่กุ้ง ปูอัด แตงกวา และอโวคาโด', c_food, b_shop, 'ACTIVE', v_user_id, v_user_id),
      (p_s3, v_org_id, 'ชาเขียวญี่ปุ่นเย็น', 'ชาเขียวมัทฉะแท้ ไม่หวาน หอมกลิ่นข้าวคั่ว', c_food, b_shop, 'ACTIVE', v_user_id, v_user_id)
    ON CONFLICT (organization_id, id) DO NOTHING;

    INSERT INTO product_variants (id, organization_id, product_id, sku, name, unit_id, cost_price, selling_price, currency, status)
    VALUES
      (gen_random_uuid(), v_org_id, p_s1, 'SUSHI-SAL-01', 'ซูชิแซลมอน (คู่)', u_piece, 30.00, 45.00, 'THB', 'ACTIVE'),
      (gen_random_uuid(), v_org_id, p_s2, 'ROLL-CAL-01', 'แคลิฟอร์เนียโรล (4 ชิ้น)', u_piece, 65.00, 119.00, 'THB', 'ACTIVE'),
      (gen_random_uuid(), v_org_id, p_s3, 'DRK-GREENTEA-01', 'ชาเขียวญี่ปุ่นเย็น (แก้ว)', u_piece, 12.00, 35.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO NOTHING;
  END IF;

  -- โหลดสินค้า 3 ชนิดแรกสำหรับใช้จำลองการขาย
  SELECT v.id, p.name, v.name, v.sku, COALESCE(b.code, '885000000001'), COALESCE(u.name, 'ชิ้น'), v.selling_price
  INTO var1_id, var1_pname, var1_vname, var1_sku, var1_barcode, var1_unit, var1_price
  FROM product_variants v
  JOIN products p ON p.organization_id = v.organization_id AND p.id = v.product_id
  LEFT JOIN units u ON u.organization_id = v.organization_id AND u.id = v.unit_id
  LEFT JOIN product_barcodes b ON b.organization_id = v.organization_id AND b.variant_id = v.id AND b.is_primary = true
  WHERE v.organization_id = v_org_id AND v.status = 'ACTIVE'
  ORDER BY v.created_at ASC LIMIT 1;

  SELECT v.id, p.name, v.name, v.sku, COALESCE(b.code, '885000000002'), COALESCE(u.name, 'ชิ้น'), v.selling_price
  INTO var2_id, var2_pname, var2_vname, var2_sku, var2_barcode, var2_unit, var2_price
  FROM product_variants v
  JOIN products p ON p.organization_id = v.organization_id AND p.id = v.product_id
  LEFT JOIN units u ON u.organization_id = v.organization_id AND u.id = v.unit_id
  LEFT JOIN product_barcodes b ON b.organization_id = v.organization_id AND b.variant_id = v.id AND b.is_primary = true
  WHERE v.organization_id = v_org_id AND v.status = 'ACTIVE' AND v.id <> var1_id
  ORDER BY v.created_at ASC LIMIT 1;

  SELECT v.id, p.name, v.name, v.sku, COALESCE(b.code, '885000000003'), COALESCE(u.name, 'ชิ้น'), v.selling_price
  INTO var3_id, var3_pname, var3_vname, var3_sku, var3_barcode, var3_unit, var3_price
  FROM product_variants v
  JOIN products p ON p.organization_id = v.organization_id AND p.id = v.product_id
  LEFT JOIN units u ON u.organization_id = v.organization_id AND u.id = v.unit_id
  LEFT JOIN product_barcodes b ON b.organization_id = v.organization_id AND b.variant_id = v.id AND b.is_primary = true
  WHERE v.organization_id = v_org_id AND v.status = 'ACTIVE' AND v.id NOT IN (var1_id, var2_id)
  ORDER BY v.created_at ASC LIMIT 1;

  IF var2_id IS NULL THEN var2_id := var1_id; var2_pname := var1_pname; var2_vname := var1_vname; var2_sku := var1_sku; var2_barcode := var1_barcode; var2_unit := var1_unit; var2_price := var1_price; END IF;
  IF var3_id IS NULL THEN var3_id := var1_id; var3_pname := var1_pname; var3_vname := var1_vname; var3_sku := var1_sku; var3_barcode := var1_barcode; var3_unit := var1_unit; var3_price := var1_price; END IF;

  -- 6. ปิด Triggers ทั้งหมดชั่วคราวเพื่อทำการ Seeding ข้อมูลประวัติการขาย
  ALTER TABLE sales DISABLE TRIGGER ALL;
  ALTER TABLE sale_items DISABLE TRIGGER ALL;
  ALTER TABLE sale_payments DISABLE TRIGGER ALL;
  ALTER TABLE receipts DISABLE TRIGGER ALL;
  ALTER TABLE stock_movements DISABLE TRIGGER ALL;
  ALTER TABLE pos_checkouts DISABLE TRIGGER ALL;
  ALTER TABLE register_shifts DISABLE TRIGGER ALL;
  ALTER TABLE pos_carts DISABLE TRIGGER ALL;

  -- 7. ล้างข้อมูลจำลองเดิมออกเพื่อความ Idempotent
  DELETE FROM receipts WHERE organization_id = v_org_id AND sale_id IN (SELECT id FROM sales WHERE organization_id = v_org_id AND sale_number LIKE 'SAL-DEMO-%');
  DELETE FROM sale_payments WHERE organization_id = v_org_id AND sale_id IN (SELECT id FROM sales WHERE organization_id = v_org_id AND sale_number LIKE 'SAL-DEMO-%');
  DELETE FROM sale_items WHERE organization_id = v_org_id AND sale_id IN (SELECT id FROM sales WHERE organization_id = v_org_id AND sale_number LIKE 'SAL-DEMO-%');
  DELETE FROM stock_movements WHERE organization_id = v_org_id AND movement_type = 'SALE' AND reason_code = 'Sample POS Sale';
  DELETE FROM sales WHERE organization_id = v_org_id AND sale_number LIKE 'SAL-DEMO-%';
  DELETE FROM pos_checkouts WHERE organization_id = v_org_id AND fingerprint LIKE 'demo_fingerprint_%';
  DELETE FROM pos_cart_items WHERE organization_id = v_org_id AND cart_id IN (SELECT id FROM pos_carts WHERE organization_id = v_org_id AND pricing_revision = 'DEMO_SEED');
  DELETE FROM pos_carts WHERE organization_id = v_org_id AND pricing_revision = 'DEMO_SEED';
  DELETE FROM register_shifts WHERE organization_id = v_org_id AND terminal_id = term_main AND open_key IN (
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'a0000000-0000-0000-0000-000000000002'::uuid,
    'a0000000-0000-0000-0000-000000000003'::uuid
  );

  -- คำนวณยอดขายสำหรับ 10 รายการ:
  tot1 := round(var1_price * 2 + var2_price * 1, 2);
  tot2 := round(var2_price * 2 + var3_price * 1, 2);
  tot3 := round(var1_price * 1 + var3_price * 2, 2);
  tot4 := round(var2_price * 3, 2);
  tot5 := round(var1_price * 3 + var2_price * 2, 2);
  tot6 := round(var3_price * 3, 2);
  tot7 := round(var1_price * 4 + var3_price * 1, 2);
  tot8 := round(var2_price * 1 + var3_price * 2, 2);
  tot9 := round(var1_price * 2 + var2_price * 2, 2);
  tot10 := round(var3_price * 4, 2);

  -- ยอดเงินสดในแต่ละกะ
  cash_today := tot1;
  cash_week := tot4 + tot7;
  cash_month := tot9;

  -- 8. สร้างประวัติกะการทำงาน (Register Shifts)
  INSERT INTO register_shifts (
    id, organization_id, branch_id, terminal_id, cashier_id, status,
    opening_cash, cash_sales, expected_cash, counted_cash, difference,
    open_key, close_key, closed_by, opened_at, closed_at, cash_refunds
  ) VALUES
    (shift_month, v_org_id, v_branch_id, term_main, v_user_id, 'CLOSED',
     1000.00, cash_month, 1000.00 + cash_month, 1000.00 + cash_month, 0.00,
     'a0000000-0000-0000-0000-000000000001'::uuid, gen_random_uuid(), v_user_id,
     now() - interval '26 days', now() - interval '10 days', 0.00),
    (shift_week, v_org_id, v_branch_id, term_main, v_user_id, 'CLOSED',
     1000.00, cash_week, 1000.00 + cash_week, 1000.00 + cash_week, 0.00,
     'a0000000-0000-0000-0000-000000000002'::uuid, gen_random_uuid(), v_user_id,
     now() - interval '7 days', now() - interval '1 day', 0.00),
    (shift_today, v_org_id, v_branch_id, term_main, v_user_id, 'CLOSED',
     1000.00, cash_today, 1000.00 + cash_today, 1000.00 + cash_today, 0.00,
     'a0000000-0000-0000-0000-000000000003'::uuid, gen_random_uuid(), v_user_id,
     now() - interval '10 hours', now() - interval '30 minutes', 0.00);

  -- 9. สร้างตะกร้าสินค้า (POS Carts)
  INSERT INTO pos_carts (id, organization_id, branch_id, terminal_id, cashier_id, status, revision, create_key, created_at, updated_at, pricing_revision, stock_policy)
  VALUES
    (c1, v_org_id, v_branch_id, term_main, v_user_id, 'COMPLETED', 1, gen_random_uuid(), now() - interval '4 hours', now() - interval '4 hours', 'DEMO_SEED', 'TRACKED'),
    (c2, v_org_id, v_branch_id, term_main, v_user_id, 'COMPLETED', 1, gen_random_uuid(), now() - interval '3 hours', now() - interval '3 hours', 'DEMO_SEED', 'TRACKED'),
    (c3, v_org_id, v_branch_id, term_main, v_user_id, 'COMPLETED', 1, gen_random_uuid(), now() - interval '1 hour', now() - interval '1 hour', 'DEMO_SEED', 'TRACKED'),
    (c4, v_org_id, v_branch_id, term_main, v_user_id, 'COMPLETED', 1, gen_random_uuid(), now() - interval '1 day' - interval '2 hours', now() - interval '1 day' - interval '2 hours', 'DEMO_SEED', 'TRACKED'),
    (c5, v_org_id, v_branch_id, term_main, v_user_id, 'COMPLETED', 1, gen_random_uuid(), now() - interval '2 days' - interval '4 hours', now() - interval '2 days' - interval '4 hours', 'DEMO_SEED', 'TRACKED'),
    (c6, v_org_id, v_branch_id, term_main, v_user_id, 'COMPLETED', 1, gen_random_uuid(), now() - interval '4 days' - interval '1 hour', now() - interval '4 days' - interval '1 hour', 'DEMO_SEED', 'TRACKED'),
    (c7, v_org_id, v_branch_id, term_main, v_user_id, 'COMPLETED', 1, gen_random_uuid(), now() - interval '6 days' - interval '5 hours', now() - interval '6 days' - interval '5 hours', 'DEMO_SEED', 'TRACKED'),
    (c8, v_org_id, v_branch_id, term_main, v_user_id, 'COMPLETED', 1, gen_random_uuid(), now() - interval '13 days', now() - interval '13 days', 'DEMO_SEED', 'TRACKED'),
    (c9, v_org_id, v_branch_id, term_main, v_user_id, 'COMPLETED', 1, gen_random_uuid(), now() - interval '19 days', now() - interval '19 days', 'DEMO_SEED', 'TRACKED'),
    (c10, v_org_id, v_branch_id, term_main, v_user_id, 'COMPLETED', 1, gen_random_uuid(), now() - interval '25 days', now() - interval '25 days', 'DEMO_SEED', 'TRACKED');

  -- รายการสินค้าในตะกร้า (Cart items)
  INSERT INTO pos_cart_items (organization_id, cart_id, variant_id, quantity, unit_price) VALUES
    (v_org_id, c1, var1_id, 2.000, var1_price), (v_org_id, c1, var2_id, 1.000, var2_price),
    (v_org_id, c2, var2_id, 2.000, var2_price), (v_org_id, c2, var3_id, 1.000, var3_price),
    (v_org_id, c3, var1_id, 1.000, var1_price), (v_org_id, c3, var3_id, 2.000, var3_price),
    (v_org_id, c4, var2_id, 3.000, var2_price),
    (v_org_id, c5, var1_id, 3.000, var1_price), (v_org_id, c5, var2_id, 2.000, var2_price),
    (v_org_id, c6, var3_id, 3.000, var3_price),
    (v_org_id, c7, var1_id, 4.000, var1_price), (v_org_id, c7, var3_id, 1.000, var3_price),
    (v_org_id, c8, var2_id, 1.000, var2_price), (v_org_id, c8, var3_id, 2.000, var3_price),
    (v_org_id, c9, var1_id, 2.000, var1_price), (v_org_id, c9, var2_id, 2.000, var2_price),
    (v_org_id, c10, var3_id, 4.000, var3_price);

  -- 10. สร้างการ Checkout (POS Checkouts)
  INSERT INTO pos_checkouts (
    id, organization_id, branch_id, terminal_id, shift_id, cart_id, cashier_id,
    cart_revision, idempotency_key, fingerprint, status, method, currency,
    total, received, change, items,
    confirmation_key, confirmed_by, confirmed_at, reference, created_at, pricing_snapshot
  ) VALUES
    (chk1, v_org_id, v_branch_id, term_main, shift_today, c1, v_user_id, 1, gen_random_uuid(), 'demo_fingerprint_0100000000000000000000000000000000000000000000000001', 'COMPLETED', 'CASH', 'THB', tot1, tot1 + 50.00, 50.00, '[]'::jsonb, gen_random_uuid(), v_user_id, now() - interval '4 hours', '', now() - interval '4 hours', '{}'::jsonb),
    (chk2, v_org_id, v_branch_id, term_main, shift_today, c2, v_user_id, 1, gen_random_uuid(), 'demo_fingerprint_0200000000000000000000000000000000000000000000000002', 'COMPLETED', 'QR_MANUAL', 'THB', tot2, tot2, 0.00, '[]'::jsonb, gen_random_uuid(), v_user_id, now() - interval '3 hours', 'PROMPTPAY-REF-90214', now() - interval '3 hours', '{}'::jsonb),
    (chk3, v_org_id, v_branch_id, term_main, shift_today, c3, v_user_id, 1, gen_random_uuid(), 'demo_fingerprint_0300000000000000000000000000000000000000000000000003', 'COMPLETED', 'BANK_TRANSFER_MANUAL', 'THB', tot3, tot3, 0.00, '[]'::jsonb, gen_random_uuid(), v_user_id, now() - interval '1 hour', 'KBANK-TXN-49102', now() - interval '1 hour', '{}'::jsonb),
    (chk4, v_org_id, v_branch_id, term_main, shift_week, c4, v_user_id, 1, gen_random_uuid(), 'demo_fingerprint_0400000000000000000000000000000000000000000000000004', 'COMPLETED', 'CASH', 'THB', tot4, tot4 + 20.00, 20.00, '[]'::jsonb, gen_random_uuid(), v_user_id, now() - interval '1 day' - interval '2 hours', '', now() - interval '1 day' - interval '2 hours', '{}'::jsonb),
    (chk5, v_org_id, v_branch_id, term_main, shift_week, c5, v_user_id, 1, gen_random_uuid(), 'demo_fingerprint_0500000000000000000000000000000000000000000000000005', 'COMPLETED', 'QR_MANUAL', 'THB', tot5, tot5, 0.00, '[]'::jsonb, gen_random_uuid(), v_user_id, now() - interval '2 days' - interval '4 hours', 'PROMPTPAY-REF-88412', now() - interval '2 days' - interval '4 hours', '{}'::jsonb),
    (chk6, v_org_id, v_branch_id, term_main, shift_week, c6, v_user_id, 1, gen_random_uuid(), 'demo_fingerprint_0600000000000000000000000000000000000000000000000006', 'COMPLETED', 'BANK_TRANSFER_MANUAL', 'THB', tot6, tot6, 0.00, '[]'::jsonb, gen_random_uuid(), v_user_id, now() - interval '4 days' - interval '1 hour', 'SCB-TXN-12049', now() - interval '4 days' - interval '1 hour', '{}'::jsonb),
    (chk7, v_org_id, v_branch_id, term_main, shift_week, c7, v_user_id, 1, gen_random_uuid(), 'demo_fingerprint_0700000000000000000000000000000000000000000000000007', 'COMPLETED', 'CASH', 'THB', tot7, tot7 + 100.00, 100.00, '[]'::jsonb, gen_random_uuid(), v_user_id, now() - interval '6 days' - interval '5 hours', '', now() - interval '6 days' - interval '5 hours', '{}'::jsonb),
    (chk8, v_org_id, v_branch_id, term_main, shift_month, c8, v_user_id, 1, gen_random_uuid(), 'demo_fingerprint_0800000000000000000000000000000000000000000000000008', 'COMPLETED', 'QR_MANUAL', 'THB', tot8, tot8, 0.00, '[]'::jsonb, gen_random_uuid(), v_user_id, now() - interval '13 days', 'PROMPTPAY-REF-71029', now() - interval '13 days', '{}'::jsonb),
    (chk9, v_org_id, v_branch_id, term_main, shift_month, c9, v_user_id, 1, gen_random_uuid(), 'demo_fingerprint_0900000000000000000000000000000000000000000000000009', 'COMPLETED', 'CASH', 'THB', tot9, tot9 + 100.00, 100.00, '[]'::jsonb, gen_random_uuid(), v_user_id, now() - interval '19 days', '', now() - interval '19 days', '{}'::jsonb),
    (chk10, v_org_id, v_branch_id, term_main, shift_month, c10, v_user_id, 1, gen_random_uuid(), 'demo_fingerprint_1000000000000000000000000000000000000000000000000010', 'COMPLETED', 'BANK_TRANSFER_MANUAL', 'THB', tot10, tot10, 0.00, '[]'::jsonb, gen_random_uuid(), v_user_id, now() - interval '25 days', 'BBL-TXN-55019', now() - interval '25 days', '{}'::jsonb);

  -- 11. สร้างคำสั่งการเคลื่อนไหวสต็อก (Inventory Operations)
  INSERT INTO inventory_operations (id, organization_id, actor_id, operation, idempotency_key, fingerprint, result, created_at)
  VALUES
    (op1, v_org_id, v_user_id, 'SALE', gen_random_uuid(), repeat('a', 64), '{"status":"POSTED"}'::jsonb, now() - interval '4 hours'),
    (op2, v_org_id, v_user_id, 'SALE', gen_random_uuid(), repeat('b', 64), '{"status":"POSTED"}'::jsonb, now() - interval '3 hours'),
    (op3, v_org_id, v_user_id, 'SALE', gen_random_uuid(), repeat('c', 64), '{"status":"POSTED"}'::jsonb, now() - interval '1 hour'),
    (op4, v_org_id, v_user_id, 'SALE', gen_random_uuid(), repeat('d', 64), '{"status":"POSTED"}'::jsonb, now() - interval '1 day' - interval '2 hours'),
    (op5, v_org_id, v_user_id, 'SALE', gen_random_uuid(), repeat('e', 64), '{"status":"POSTED"}'::jsonb, now() - interval '2 days' - interval '4 hours'),
    (op6, v_org_id, v_user_id, 'SALE', gen_random_uuid(), repeat('f', 64), '{"status":"POSTED"}'::jsonb, now() - interval '4 days' - interval '1 hour'),
    (op7, v_org_id, v_user_id, 'SALE', gen_random_uuid(), repeat('g', 64), '{"status":"POSTED"}'::jsonb, now() - interval '6 days' - interval '5 hours'),
    (op8, v_org_id, v_user_id, 'SALE', gen_random_uuid(), repeat('h', 64), '{"status":"POSTED"}'::jsonb, now() - interval '13 days'),
    (op9, v_org_id, v_user_id, 'SALE', gen_random_uuid(), repeat('i', 64), '{"status":"POSTED"}'::jsonb, now() - interval '19 days'),
    (op10, v_org_id, v_user_id, 'SALE', gen_random_uuid(), repeat('j', 64), '{"status":"POSTED"}'::jsonb, now() - interval '25 days');

  -- 12. สร้างข้อมูลการขาย (Sales Master Record)
  INSERT INTO sales (
    id, organization_id, branch_id, terminal_id, shift_id, cart_id, checkout_id, cashier_id,
    sale_number, status, currency, subtotal, discount_total, tax_total, grand_total,
    payment_status, inventory_operation_id, store_name, branch_name, store_address,
    terminal_name, cashier_name, completed_at, pricing_snapshot, stock_policy
  ) VALUES
    (s1, v_org_id, v_branch_id, term_main, shift_today, c1, chk1, v_user_id, 'SAL-DEMO-20261110-001', 'COMPLETED', 'THB', tot1, 0.00, 0.00, tot1, 'CONFIRMED', op1, v_store_name, v_branch_name, v_store_address, v_term_name, v_cashier_name, now() - interval '4 hours', '{}'::jsonb, 'TRACKED'),
    (s2, v_org_id, v_branch_id, term_main, shift_today, c2, chk2, v_user_id, 'SAL-DEMO-20261110-002', 'COMPLETED', 'THB', tot2, 0.00, 0.00, tot2, 'CONFIRMED', op2, v_store_name, v_branch_name, v_store_address, v_term_name, v_cashier_name, now() - interval '3 hours', '{}'::jsonb, 'TRACKED'),
    (s3, v_org_id, v_branch_id, term_main, shift_today, c3, chk3, v_user_id, 'SAL-DEMO-20261110-003', 'COMPLETED', 'THB', tot3, 0.00, 0.00, tot3, 'CONFIRMED', op3, v_store_name, v_branch_name, v_store_address, v_term_name, v_cashier_name, now() - interval '1 hour', '{}'::jsonb, 'TRACKED'),
    (s4, v_org_id, v_branch_id, term_main, shift_week, c4, chk4, v_user_id, 'SAL-DEMO-20261109-001', 'COMPLETED', 'THB', tot4, 0.00, 0.00, tot4, 'CONFIRMED', op4, v_store_name, v_branch_name, v_store_address, v_term_name, v_cashier_name, now() - interval '1 day' - interval '2 hours', '{}'::jsonb, 'TRACKED'),
    (s5, v_org_id, v_branch_id, term_main, shift_week, c5, chk5, v_user_id, 'SAL-DEMO-20261108-001', 'COMPLETED', 'THB', tot5, 0.00, 0.00, tot5, 'CONFIRMED', op5, v_store_name, v_branch_name, v_store_address, v_term_name, v_cashier_name, now() - interval '2 days' - interval '4 hours', '{}'::jsonb, 'TRACKED'),
    (s6, v_org_id, v_branch_id, term_main, shift_week, c6, chk6, v_user_id, 'SAL-DEMO-20261106-001', 'COMPLETED', 'THB', tot6, 0.00, 0.00, tot6, 'CONFIRMED', op6, v_store_name, v_branch_name, v_store_address, v_term_name, v_cashier_name, now() - interval '4 days' - interval '1 hour', '{}'::jsonb, 'TRACKED'),
    (s7, v_org_id, v_branch_id, term_main, shift_week, c7, chk7, v_user_id, 'SAL-DEMO-20261104-001', 'COMPLETED', 'THB', tot7, 0.00, 0.00, tot7, 'CONFIRMED', op7, v_store_name, v_branch_name, v_store_address, v_term_name, v_cashier_name, now() - interval '6 days' - interval '5 hours', '{}'::jsonb, 'TRACKED'),
    (s8, v_org_id, v_branch_id, term_main, shift_month, c8, chk8, v_user_id, 'SAL-DEMO-20261028-001', 'COMPLETED', 'THB', tot8, 0.00, 0.00, tot8, 'CONFIRMED', op8, v_store_name, v_branch_name, v_store_address, v_term_name, v_cashier_name, now() - interval '13 days', '{}'::jsonb, 'TRACKED'),
    (s9, v_org_id, v_branch_id, term_main, shift_month, c9, chk9, v_user_id, 'SAL-DEMO-20261022-001', 'COMPLETED', 'THB', tot9, 0.00, 0.00, tot9, 'CONFIRMED', op9, v_store_name, v_branch_name, v_store_address, v_term_name, v_cashier_name, now() - interval '19 days', '{}'::jsonb, 'TRACKED'),
    (s10, v_org_id, v_branch_id, term_main, shift_month, c10, chk10, v_user_id, 'SAL-DEMO-20261016-001', 'COMPLETED', 'THB', tot10, 0.00, 0.00, tot10, 'CONFIRMED', op10, v_store_name, v_branch_name, v_store_address, v_term_name, v_cashier_name, now() - interval '25 days', '{}'::jsonb, 'TRACKED');

  -- 13. สร้างรายการสินค้าในบิล (Sale Items)
  INSERT INTO sale_items (id, organization_id, sale_id, variant_id, stock_location_id, branch_id, product_name, variant_name, sku, barcode, unit, quantity, unit_price, line_total, discount_total)
  VALUES
    -- Sale 1
    (gen_random_uuid(), v_org_id, s1, var1_id, loc_wh, v_branch_id, var1_pname, var1_vname, var1_sku, var1_barcode, var1_unit, 2.000, var1_price, round(var1_price * 2, 2), 0.00),
    (gen_random_uuid(), v_org_id, s1, var2_id, loc_wh, v_branch_id, var2_pname, var2_vname, var2_sku, var2_barcode, var2_unit, 1.000, var2_price, round(var2_price * 1, 2), 0.00),
    -- Sale 2
    (gen_random_uuid(), v_org_id, s2, var2_id, loc_wh, v_branch_id, var2_pname, var2_vname, var2_sku, var2_barcode, var2_unit, 2.000, var2_price, round(var2_price * 2, 2), 0.00),
    (gen_random_uuid(), v_org_id, s2, var3_id, loc_wh, v_branch_id, var3_pname, var3_vname, var3_sku, var3_barcode, var3_unit, 1.000, var3_price, round(var3_price * 1, 2), 0.00),
    -- Sale 3
    (gen_random_uuid(), v_org_id, s3, var1_id, loc_wh, v_branch_id, var1_pname, var1_vname, var1_sku, var1_barcode, var1_unit, 1.000, var1_price, round(var1_price * 1, 2), 0.00),
    (gen_random_uuid(), v_org_id, s3, var3_id, loc_wh, v_branch_id, var3_pname, var3_vname, var3_sku, var3_barcode, var3_unit, 2.000, var3_price, round(var3_price * 2, 2), 0.00),
    -- Sale 4
    (gen_random_uuid(), v_org_id, s4, var2_id, loc_wh, v_branch_id, var2_pname, var2_vname, var2_sku, var2_barcode, var2_unit, 3.000, var2_price, round(var2_price * 3, 2), 0.00),
    -- Sale 5
    (gen_random_uuid(), v_org_id, s5, var1_id, loc_wh, v_branch_id, var1_pname, var1_vname, var1_sku, var1_barcode, var1_unit, 3.000, var1_price, round(var1_price * 3, 2), 0.00),
    (gen_random_uuid(), v_org_id, s5, var2_id, loc_wh, v_branch_id, var2_pname, var2_vname, var2_sku, var2_barcode, var2_unit, 2.000, var2_price, round(var2_price * 2, 2), 0.00),
    -- Sale 6
    (gen_random_uuid(), v_org_id, s6, var3_id, loc_wh, v_branch_id, var3_pname, var3_vname, var3_sku, var3_barcode, var3_unit, 3.000, var3_price, round(var3_price * 3, 2), 0.00),
    -- Sale 7
    (gen_random_uuid(), v_org_id, s7, var1_id, loc_wh, v_branch_id, var1_pname, var1_vname, var1_sku, var1_barcode, var1_unit, 4.000, var1_price, round(var1_price * 4, 2), 0.00),
    (gen_random_uuid(), v_org_id, s7, var3_id, loc_wh, v_branch_id, var3_pname, var3_vname, var3_sku, var3_barcode, var3_unit, 1.000, var3_price, round(var3_price * 1, 2), 0.00),
    -- Sale 8
    (gen_random_uuid(), v_org_id, s8, var2_id, loc_wh, v_branch_id, var2_pname, var2_vname, var2_sku, var2_barcode, var2_unit, 1.000, var2_price, round(var2_price * 1, 2), 0.00),
    (gen_random_uuid(), v_org_id, s8, var3_id, loc_wh, v_branch_id, var3_pname, var3_vname, var3_sku, var3_barcode, var3_unit, 2.000, var3_price, round(var3_price * 2, 2), 0.00),
    -- Sale 9
    (gen_random_uuid(), v_org_id, s9, var1_id, loc_wh, v_branch_id, var1_pname, var1_vname, var1_sku, var1_barcode, var1_unit, 2.000, var1_price, round(var1_price * 2, 2), 0.00),
    (gen_random_uuid(), v_org_id, s9, var2_id, loc_wh, v_branch_id, var2_pname, var2_vname, var2_sku, var2_barcode, var2_unit, 2.000, var2_price, round(var2_price * 2, 2), 0.00),
    -- Sale 10
    (gen_random_uuid(), v_org_id, s10, var3_id, loc_wh, v_branch_id, var3_pname, var3_vname, var3_sku, var3_barcode, var3_unit, 4.000, var3_price, round(var3_price * 4, 2), 0.00);

  -- 14. สร้างข้อมูลการชำระเงิน (Sale Payments)
  INSERT INTO sale_payments (id, organization_id, sale_id, checkout_id, method, status, amount, received, change, reference, confirmed_by, confirmed_at, credit_amount)
  VALUES
    (gen_random_uuid(), v_org_id, s1, chk1, 'CASH', 'CONFIRMED', tot1, tot1 + 50.00, 50.00, '', v_user_id, now() - interval '4 hours', 0.00),
    (gen_random_uuid(), v_org_id, s2, chk2, 'QR_MANUAL', 'CONFIRMED', tot2, tot2, 0.00, 'PROMPTPAY-REF-90214', v_user_id, now() - interval '3 hours', 0.00),
    (gen_random_uuid(), v_org_id, s3, chk3, 'BANK_TRANSFER_MANUAL', 'CONFIRMED', tot3, tot3, 0.00, 'KBANK-TXN-49102', v_user_id, now() - interval '1 hour', 0.00),
    (gen_random_uuid(), v_org_id, s4, chk4, 'CASH', 'CONFIRMED', tot4, tot4 + 20.00, 20.00, '', v_user_id, now() - interval '1 day' - interval '2 hours', 0.00),
    (gen_random_uuid(), v_org_id, s5, chk5, 'QR_MANUAL', 'CONFIRMED', tot5, tot5, 0.00, 'PROMPTPAY-REF-88412', v_user_id, now() - interval '2 days' - interval '4 hours', 0.00),
    (gen_random_uuid(), v_org_id, s6, chk6, 'BANK_TRANSFER_MANUAL', 'CONFIRMED', tot6, tot6, 0.00, 'SCB-TXN-12049', v_user_id, now() - interval '4 days' - interval '1 hour', 0.00),
    (gen_random_uuid(), v_org_id, s7, chk7, 'CASH', 'CONFIRMED', tot7, tot7 + 100.00, 100.00, '', v_user_id, now() - interval '6 days' - interval '5 hours', 0.00),
    (gen_random_uuid(), v_org_id, s8, chk8, 'QR_MANUAL', 'CONFIRMED', tot8, tot8, 0.00, 'PROMPTPAY-REF-71029', v_user_id, now() - interval '13 days', 0.00),
    (gen_random_uuid(), v_org_id, s9, chk9, 'CASH', 'CONFIRMED', tot9, tot9 + 100.00, 100.00, '', v_user_id, now() - interval '19 days', 0.00),
    (gen_random_uuid(), v_org_id, s10, chk10, 'BANK_TRANSFER_MANUAL', 'CONFIRMED', tot10, tot10, 0.00, 'BBL-TXN-55019', v_user_id, now() - interval '25 days', 0.00);

  -- 15. สร้างใบเสร็จรับเงิน (Receipts)
  INSERT INTO receipts (id, organization_id, sale_id, receipt_number, created_at)
  VALUES
    (gen_random_uuid(), v_org_id, s1, 'RCP-DEMO-20261110-001', now() - interval '4 hours'),
    (gen_random_uuid(), v_org_id, s2, 'RCP-DEMO-20261110-002', now() - interval '3 hours'),
    (gen_random_uuid(), v_org_id, s3, 'RCP-DEMO-20261110-003', now() - interval '1 hour'),
    (gen_random_uuid(), v_org_id, s4, 'RCP-DEMO-20261109-001', now() - interval '1 day' - interval '2 hours'),
    (gen_random_uuid(), v_org_id, s5, 'RCP-DEMO-20261108-001', now() - interval '2 days' - interval '4 hours'),
    (gen_random_uuid(), v_org_id, s6, 'RCP-DEMO-20261106-001', now() - interval '4 days' - interval '1 hour'),
    (gen_random_uuid(), v_org_id, s7, 'RCP-DEMO-20261104-001', now() - interval '6 days' - interval '5 hours'),
    (gen_random_uuid(), v_org_id, s8, 'RCP-DEMO-20261028-001', now() - interval '13 days'),
    (gen_random_uuid(), v_org_id, s9, 'RCP-DEMO-20261022-001', now() - interval '19 days'),
    (gen_random_uuid(), v_org_id, s10, 'RCP-DEMO-20261016-001', now() - interval '25 days');

  -- 16. บันทึกการตัดสต็อกสินค้าจากการขาย (Stock Movements)
  INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, sale_id, reason_code, performed_by, created_at)
  VALUES
    (v_org_id, v_branch_id, loc_wh, var1_id, 'SALE', -2.000, 100.000, 98.000, op1, s1, 'Sample POS Sale', v_user_id, now() - interval '4 hours'),
    (v_org_id, v_branch_id, loc_wh, var2_id, 'SALE', -1.000, 100.000, 99.000, op1, s1, 'Sample POS Sale', v_user_id, now() - interval '4 hours'),
    (v_org_id, v_branch_id, loc_wh, var2_id, 'SALE', -2.000, 99.000, 97.000, op2, s2, 'Sample POS Sale', v_user_id, now() - interval '3 hours'),
    (v_org_id, v_branch_id, loc_wh, var3_id, 'SALE', -1.000, 100.000, 99.000, op2, s2, 'Sample POS Sale', v_user_id, now() - interval '3 hours'),
    (v_org_id, v_branch_id, loc_wh, var1_id, 'SALE', -1.000, 98.000, 97.000, op3, s3, 'Sample POS Sale', v_user_id, now() - interval '1 hour'),
    (v_org_id, v_branch_id, loc_wh, var3_id, 'SALE', -2.000, 99.000, 97.000, op3, s3, 'Sample POS Sale', v_user_id, now() - interval '1 hour');

  -- 17. เปิด Triggers กลับคืนมาตามเดิม
  ALTER TABLE sales ENABLE TRIGGER ALL;
  ALTER TABLE sale_items ENABLE TRIGGER ALL;
  ALTER TABLE sale_payments ENABLE TRIGGER ALL;
  ALTER TABLE receipts ENABLE TRIGGER ALL;
  ALTER TABLE stock_movements ENABLE TRIGGER ALL;
  ALTER TABLE pos_checkouts ENABLE TRIGGER ALL;
  ALTER TABLE register_shifts ENABLE TRIGGER ALL;
  ALTER TABLE pos_carts ENABLE TRIGGER ALL;

  RAISE NOTICE 'Sample sales history successfully created for organization % (% sales records)', v_org_id, 10;
END $$;
