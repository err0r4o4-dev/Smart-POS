  -- SmartPOS Sample Data Seed Script
-- สำหรับสร้างสินค้าตัวอย่าง หมวดหมู่ แบรนด์ สต็อก ชั้นวาง ล็อตสินค้า และซัพพลายเออร์
-- ครอบคลุมทุกสถานะสินค้า: ACTIVE, INACTIVE, ARCHIVED

DO $$
DECLARE
  v_org_id uuid;
  v_branch_id uuid;
  v_user_id uuid;
  v_supplier_id uuid := '7f2b4034-16fc-4458-b072-9054922cf51d';
  
  -- Unit IDs
  u_can uuid := gen_random_uuid();
  u_bottle uuid := gen_random_uuid();
  u_bag uuid := gen_random_uuid();
  u_cup uuid := gen_random_uuid();
  u_box uuid := gen_random_uuid();
  u_piece uuid := gen_random_uuid();

  -- Category IDs
  c_bev uuid := gen_random_uuid();
  c_snack uuid := gen_random_uuid();
  c_instant uuid := gen_random_uuid();
  c_dairy uuid := gen_random_uuid();

  -- Brand IDs
  b_coke uuid := gen_random_uuid();
  b_lays uuid := gen_random_uuid();
  b_mama uuid := gen_random_uuid();
  b_ichi uuid := gen_random_uuid();
  b_dutch uuid := gen_random_uuid();
  b_nestle uuid := gen_random_uuid();
  b_oishi uuid := gen_random_uuid();
  b_pepsi uuid := gen_random_uuid();

  -- Product & Variant IDs (ACTIVE)
  p_coke uuid := gen_random_uuid();
  var_coke_can uuid := gen_random_uuid();
  var_coke_pet uuid := gen_random_uuid();

  p_lays uuid := gen_random_uuid();
  var_lays_44 uuid := gen_random_uuid();
  var_lays_73 uuid := gen_random_uuid();

  p_mama uuid := gen_random_uuid();
  var_mama_bag uuid := gen_random_uuid();
  var_mama_cup uuid := gen_random_uuid();

  p_ichi uuid := gen_random_uuid();
  var_ichi_pet uuid := gen_random_uuid();

  p_dutch uuid := gen_random_uuid();
  var_dutch_box uuid := gen_random_uuid();

  -- Product & Variant IDs (INACTIVE)
  p_nescafe uuid := gen_random_uuid();
  var_nescafe uuid := gen_random_uuid();

  p_oishi uuid := gen_random_uuid();
  var_oishi uuid := gen_random_uuid();

  -- Product & Variant IDs (ARCHIVED)
  p_pepsi uuid := gen_random_uuid();
  var_pepsi uuid := gen_random_uuid();

  p_lays_ghost uuid := gen_random_uuid();
  var_lays_ghost uuid := gen_random_uuid();

  -- Location IDs
  loc_wh uuid := gen_random_uuid();
  loc_floor uuid := gen_random_uuid();
  loc_shelf_drink uuid := gen_random_uuid();
  loc_shelf_snack uuid := gen_random_uuid();

  -- Shelf IDs
  sh_drink uuid := gen_random_uuid();
  slot_d1 uuid := gen_random_uuid();
  slot_d2 uuid := gen_random_uuid();

  sh_snack uuid := gen_random_uuid();
  slot_s1 uuid := gen_random_uuid();
  slot_s2 uuid := gen_random_uuid();

  -- Batch IDs
  batch_coke uuid := gen_random_uuid();
  batch_lays uuid := gen_random_uuid();
  batch_dutch uuid := gen_random_uuid();

  -- Inventory Operations for Movements
  op_opening uuid := gen_random_uuid();
  op_transfer uuid := gen_random_uuid();
  op_adjust_in uuid := gen_random_uuid();
  op_adjust_out uuid := gen_random_uuid();

  -- New Supplier ID
  supp_cpall uuid := gen_random_uuid();
BEGIN
  -- ค้นหา organization จากฐานข้อมูล หากไม่มี ID เดิม ให้ใช้ Organization แรกที่พบ
  SELECT id INTO v_org_id FROM organizations WHERE id = '08ac3879-d23c-49a7-bd3c-8c7f0641b3b5';
  IF v_org_id IS NULL THEN
    SELECT id INTO v_org_id FROM organizations ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- ค้นหา branch จากฐานข้อมูล หากไม่มี ID เดิม ให้ใช้ Branch แรกของ Organization
  SELECT id INTO v_branch_id FROM branches WHERE id = 'e6250b1b-35cb-4de1-a2c3-e2a150bb17e0' AND organization_id = v_org_id;
  IF v_branch_id IS NULL THEN
    SELECT id INTO v_branch_id FROM branches WHERE organization_id = v_org_id ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- ค้นหา user จากฐานข้อมูล หากไม่มี ID เดิม ให้ใช้ User แรกที่พบ
  SELECT id INTO v_user_id FROM users WHERE id = '8e919a6e-8f10-4021-9552-404818dca899';
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM users ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF v_org_id IS NULL OR v_branch_id IS NULL OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'Cannot seed data: organization, branch, or user not found. Please ensure at least one organization, branch, and user exist in the database.';
  END IF;

  -- ตั้งค่า session variables สำหรับ RLS & Triggers
  PERFORM set_config('app.organization_id', v_org_id::text, true);
  PERFORM set_config('app.user_id', v_user_id::text, true);

  -------------------------------------------------------------
  -- 1. สร้างหน่วยนับ (Units)
  -------------------------------------------------------------
  INSERT INTO units (id, organization_id, code, name, description, unit_type, conversion_factor, status)
  VALUES 
    (u_can, v_org_id, 'CAN', 'กระป๋อง', 'หน่วยนับกระป๋องเครื่องดื่ม', 'COUNT', 1, 'ACTIVE'),
    (u_bottle, v_org_id, 'BOTTLE', 'ขวด', 'หน่วยนับขวดแก้ว/พลาสติก', 'COUNT', 1, 'ACTIVE'),
    (u_bag, v_org_id, 'BAG', 'ซอง/ถุง', 'หน่วยนับซองขนม/ถุง', 'COUNT', 1, 'ACTIVE'),
    (u_cup, v_org_id, 'CUP', 'ถ้วย/คัพ', 'หน่วยนับแบบถ้วยพร้อมทาน', 'COUNT', 1, 'ACTIVE'),
    (u_box, v_org_id, 'BOX', 'กล่อง', 'หน่วยนับกล่องยูเอชที/กล่องบรรจุ', 'COUNT', 1, 'ACTIVE'),
    (u_piece, v_org_id, 'PIECE', 'ชิ้น', 'หน่วยนับชิ้นทั่วไป', 'COUNT', 1, 'ACTIVE')
  ON CONFLICT (organization_id, code) DO NOTHING;

  SELECT id INTO u_can FROM units WHERE organization_id = v_org_id AND code = 'CAN';
  SELECT id INTO u_bottle FROM units WHERE organization_id = v_org_id AND code = 'BOTTLE';
  SELECT id INTO u_bag FROM units WHERE organization_id = v_org_id AND code = 'BAG';
  SELECT id INTO u_cup FROM units WHERE organization_id = v_org_id AND code = 'CUP';
  SELECT id INTO u_box FROM units WHERE organization_id = v_org_id AND code = 'BOX';
  SELECT id INTO u_piece FROM units WHERE organization_id = v_org_id AND code = 'PIECE';

  -------------------------------------------------------------
  -- 2. สร้างหมวดหมู่ (Categories)
  -------------------------------------------------------------
  INSERT INTO categories (id, organization_id, name, description, status)
  VALUES
    (c_bev, v_org_id, 'เครื่องดื่ม', 'น้ำอัดลม ชา กาแฟ น้ำผลไม้', 'ACTIVE'),
    (c_snack, v_org_id, 'ขนมขบเคี้ยว', 'มันฝรั่งทอด ขนมปังกรอบ ถั่วอบ', 'ACTIVE'),
    (c_instant, v_org_id, 'อาหารกึ่งสำเร็จรูป', 'บะหมี่ โจ๊ก ซุปกึ่งสำเร็จรูป', 'ACTIVE'),
    (c_dairy, v_org_id, 'ผลิตภัณฑ์นมและเนย', 'นมสด นมเปรี้ยว โยเกิร์ต', 'ACTIVE')
  ON CONFLICT (organization_id, lower(btrim(name))) DO NOTHING;

  SELECT id INTO c_bev FROM categories WHERE organization_id = v_org_id AND lower(btrim(name)) = lower('เครื่องดื่ม');
  SELECT id INTO c_snack FROM categories WHERE organization_id = v_org_id AND lower(btrim(name)) = lower('ขนมขบเคี้ยว');
  SELECT id INTO c_instant FROM categories WHERE organization_id = v_org_id AND lower(btrim(name)) = lower('อาหารกึ่งสำเร็จรูป');
  SELECT id INTO c_dairy FROM categories WHERE organization_id = v_org_id AND lower(btrim(name)) = lower('ผลิตภัณฑ์นมและเนย');

  -------------------------------------------------------------
  -- 3. สร้างแบรนด์ (Brands)
  -------------------------------------------------------------
  INSERT INTO brands (id, organization_id, name, description, status)
  VALUES
    (b_coke, v_org_id, 'โคคา-โคล่า', 'Coca-Cola Company', 'ACTIVE'),
    (b_lays, v_org_id, 'เลย์', 'Lay''s Potato Chips', 'ACTIVE'),
    (b_mama, v_org_id, 'มาม่า', 'บะหมี่กึ่งสำเร็จรูปมาม่า', 'ACTIVE'),
    (b_ichi, v_org_id, 'อิชิตัน', 'Ichitan Group', 'ACTIVE'),
    (b_dutch, v_org_id, 'ดัชมิลล์', 'Dutch Mill Group', 'ACTIVE'),
    (b_nestle, v_org_id, 'เนสท์เล่', 'Nestle Thailand', 'ACTIVE'),
    (b_oishi, v_org_id, 'โออิชิ', 'Oishi Group', 'ACTIVE'),
    (b_pepsi, v_org_id, 'เป๊ปซี่', 'PepsiCo', 'ACTIVE')
  ON CONFLICT (organization_id, lower(btrim(name))) DO NOTHING;

  SELECT id INTO b_coke FROM brands WHERE organization_id = v_org_id AND lower(btrim(name)) = lower('โคคา-โคล่า');
  SELECT id INTO b_lays FROM brands WHERE organization_id = v_org_id AND lower(btrim(name)) = lower('เลย์');
  SELECT id INTO b_mama FROM brands WHERE organization_id = v_org_id AND lower(btrim(name)) = lower('มาม่า');
  SELECT id INTO b_ichi FROM brands WHERE organization_id = v_org_id AND lower(btrim(name)) = lower('อิชิตัน');
  SELECT id INTO b_dutch FROM brands WHERE organization_id = v_org_id AND lower(btrim(name)) = lower('ดัชมิลล์');
  SELECT id INTO b_nestle FROM brands WHERE organization_id = v_org_id AND lower(btrim(name)) = lower('เนสท์เล่');
  SELECT id INTO b_oishi FROM brands WHERE organization_id = v_org_id AND lower(btrim(name)) = lower('โออิชิ');
  SELECT id INTO b_pepsi FROM brands WHERE organization_id = v_org_id AND lower(btrim(name)) = lower('เป๊ปซี่');

  -------------------------------------------------------------
  -- 4. สินค้าสถานะ ACTIVE (พร้อมจำหน่าย)
  -------------------------------------------------------------
  -- สินค้า 1: โค้ก ออริจินัล
  INSERT INTO products (id, organization_id, name, description, category_id, brand_id, status, created_by, updated_by)
  VALUES (p_coke, v_org_id, 'โค้ก ออริจินัล', 'เครื่องดื่มน้ำอัดลม โคคา-โคล่า รสชาติดั้งเดิม', c_bev, b_coke, 'ACTIVE', v_user_id, v_user_id)
  ON CONFLICT (organization_id, id) DO NOTHING;

  INSERT INTO product_variants (id, organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
  VALUES
    (var_coke_can, v_org_id, p_coke, 'COKE-CAN-325', 'โค้ก 325 มล. กระป๋อง', '{"volume":"325ml","packaging":"กระป๋อง"}'::jsonb, u_can, 10.00, 15.00, 'THB', 'ACTIVE'),
    (var_coke_pet, v_org_id, p_coke, 'COKE-PET-500', 'โค้ก 500 มล. ขวดพลาสติก', '{"volume":"500ml","packaging":"ขวด"}'::jsonb, u_bottle, 13.00, 19.00, 'THB', 'ACTIVE')
  ON CONFLICT (organization_id, sku) DO NOTHING;

  INSERT INTO product_barcodes (organization_id, variant_id, code, symbology, source, is_primary)
  VALUES
    (v_org_id, var_coke_can, '8851959132012', 'EAN13', 'MANUFACTURER', true),
    (v_org_id, var_coke_pet, '8851959132029', 'EAN13', 'MANUFACTURER', true)
  ON CONFLICT (organization_id, code) DO NOTHING;

  -- สินค้า 2: มันฝรั่งทอดกรอบ เลย์ รสคลาสสิค
  INSERT INTO products (id, organization_id, name, description, category_id, brand_id, status, created_by, updated_by)
  VALUES (p_lays, v_org_id, 'มันฝรั่งแท้ทอดกรอบ เลย์ รสคลาสสิค', 'มันฝรั่งทอดกรอบ แผ่นเรียบ รสชาติเค็มมันกำลังดี', c_snack, b_lays, 'ACTIVE', v_user_id, v_user_id)
  ON CONFLICT (organization_id, id) DO NOTHING;

  INSERT INTO product_variants (id, organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
  VALUES
    (var_lays_44, v_org_id, p_lays, 'LAYS-CLA-44G', 'เลย์ คลาสสิค ซองเล็ก 44 กรัม', '{"weight":"44g"}'::jsonb, u_bag, 16.00, 22.00, 'THB', 'ACTIVE'),
    (var_lays_73, v_org_id, p_lays, 'LAYS-CLA-73G', 'เลย์ คลาสสิค ซองใหญ่ 73 กรัม', '{"weight":"73g"}'::jsonb, u_bag, 24.00, 32.00, 'THB', 'ACTIVE')
  ON CONFLICT (organization_id, sku) DO NOTHING;

  INSERT INTO product_barcodes (organization_id, variant_id, code, symbology, source, is_primary)
  VALUES
    (v_org_id, var_lays_44, '8850718801152', 'EAN13', 'MANUFACTURER', true),
    (v_org_id, var_lays_73, '8850718801169', 'EAN13', 'MANUFACTURER', true)
  ON CONFLICT (organization_id, code) DO NOTHING;

  -- สินค้า 3: บะหมี่กึ่งสำเร็จรูป มาม่า รสต้มยำกุ้ง
  INSERT INTO products (id, organization_id, name, description, category_id, brand_id, status, created_by, updated_by)
  VALUES (p_mama, v_org_id, 'บะหมี่กึ่งสำเร็จรูป มาม่า รสต้มยำกุ้ง', 'มาม่ารสต้มยำกุ้ง แซ่บจี๊ดถึงใจ เครื่องแน่น', c_instant, b_mama, 'ACTIVE', v_user_id, v_user_id)
  ON CONFLICT (organization_id, id) DO NOTHING;

  INSERT INTO product_variants (id, organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
  VALUES
    (var_mama_bag, v_org_id, p_mama, 'MAMA-TYK-55G', 'มาม่า ต้มยำกุ้ง ซอง 55 กรัม', '{"weight":"55g","packaging":"ซอง"}'::jsonb, u_bag, 5.50, 7.00, 'THB', 'ACTIVE'),
    (var_mama_cup, v_org_id, p_mama, 'MAMA-TYK-CUP', 'มาม่า ต้มยำกุ้ง คัพ 60 กรัม', '{"weight":"60g","packaging":"คัพ"}'::jsonb, u_cup, 11.00, 15.00, 'THB', 'ACTIVE')
  ON CONFLICT (organization_id, sku) DO NOTHING;

  INSERT INTO product_barcodes (organization_id, variant_id, code, symbology, source, is_primary)
  VALUES
    (v_org_id, var_mama_bag, '8850987101014', 'EAN13', 'MANUFACTURER', true),
    (v_org_id, var_mama_cup, '8850987101021', 'EAN13', 'MANUFACTURER', true)
  ON CONFLICT (organization_id, code) DO NOTHING;

  -- สินค้า 4: ชาเขียว อิชิตัน รสต้นตำรับ
  INSERT INTO products (id, organization_id, name, description, category_id, brand_id, status, created_by, updated_by)
  VALUES (p_ichi, v_org_id, 'ชาเขียวพร้อมดื่ม อิชิตัน กรีนที รสต้นตำรับ', 'ชาเขียวออร์แกนิค รสชาติกลมกล่อม หอมสดชื่น', c_bev, b_ichi, 'ACTIVE', v_user_id, v_user_id)
  ON CONFLICT (organization_id, id) DO NOTHING;

  INSERT INTO product_variants (id, organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
  VALUES
    (var_ichi_pet, v_org_id, p_ichi, 'ICHI-ORI-420', 'อิชิตัน กรีนที 420 มล.', '{"volume":"420ml"}'::jsonb, u_bottle, 14.00, 20.00, 'THB', 'ACTIVE')
  ON CONFLICT (organization_id, sku) DO NOTHING;

  INSERT INTO product_barcodes (organization_id, variant_id, code, symbology, source, is_primary)
  VALUES
    (v_org_id, var_ichi_pet, '8859088100018', 'EAN13', 'MANUFACTURER', true)
  ON CONFLICT (organization_id, code) DO NOTHING;

  -- สินค้า 5: นมเปรี้ยว ดัชมิลล์ 4อิน1 รสผลไม้รวม
  INSERT INTO products (id, organization_id, name, description, category_id, brand_id, status, created_by, updated_by)
  VALUES (p_dutch, v_org_id, 'นมเปรี้ยว ดัชมิลล์ 4อิน1 รสผลไม้รวม', 'โยเกิร์ตพร้อมดื่ม ยูเอชที รสผลไม้รวม อร่อย มีประโยชน์', c_dairy, b_dutch, 'ACTIVE', v_user_id, v_user_id)
  ON CONFLICT (organization_id, id) DO NOTHING;

  INSERT INTO product_variants (id, organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
  VALUES
    (var_dutch_box, v_org_id, p_dutch, 'DUTCH-4IN1-180', 'ดัชมิลล์ 4อิน1 กล่อง 180 มล.', '{"volume":"180ml"}'::jsonb, u_box, 8.50, 12.00, 'THB', 'ACTIVE')
  ON CONFLICT (organization_id, sku) DO NOTHING;

  INSERT INTO product_barcodes (organization_id, variant_id, code, symbology, source, is_primary)
  VALUES
    (v_org_id, var_dutch_box, '8850188800013', 'EAN13', 'MANUFACTURER', true)
  ON CONFLICT (organization_id, code) DO NOTHING;

  -------------------------------------------------------------
  -- 5. สินค้าสถานะ INACTIVE (ระงับจำหน่ายชั่วคราว)
  -------------------------------------------------------------
  -- สินค้า 6: เนสกาแฟ ริช อโรมา
  INSERT INTO products (id, organization_id, name, description, category_id, brand_id, status, created_by, updated_by)
  VALUES (p_nescafe, v_org_id, 'เนสกาแฟ เบลนด์ แอนด์ บรู ริช อโรมา', 'กาแฟปรุงสำเร็จชนิดผง รสชาติเข้มข้น หอมกรุ่น (ระงับจำหน่ายชั่วคราว)', c_bev, b_nestle, 'INACTIVE', v_user_id, v_user_id)
  ON CONFLICT (organization_id, id) DO NOTHING;

  INSERT INTO product_variants (id, organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
  VALUES (var_nescafe, v_org_id, p_nescafe, 'NES-RICHA-27P', 'เนสกาแฟ ริช อโรมา ถุง 27 ซอง', '{"packaging":"ถุงใหญ่"}'::jsonb, u_bag, 95.00, 119.00, 'THB', 'INACTIVE')
  ON CONFLICT (organization_id, sku) DO NOTHING;

  INSERT INTO product_barcodes (organization_id, variant_id, code, symbology, source, is_primary)
  VALUES (v_org_id, var_nescafe, '8850124001016', 'EAN13', 'MANUFACTURER', true)
  ON CONFLICT (organization_id, code) DO NOTHING;

  -- สินค้า 7: โออิชิ ข้าวญี่ปุ่น
  INSERT INTO products (id, organization_id, name, description, category_id, brand_id, status, created_by, updated_by)
  VALUES (p_oishi, v_org_id, 'โออิชิ กรีนที รสข้าวญี่ปุ่น เก็นไมฉะ', 'ชาเขียวพร้อมดื่ม รสข้าวญี่ปุ่น กลิ่นหอมเป็นเอกลักษณ์ (พักการขาย)', c_bev, b_oishi, 'INACTIVE', v_user_id, v_user_id)
  ON CONFLICT (organization_id, id) DO NOTHING;

  INSERT INTO product_variants (id, organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
  VALUES (var_oishi, v_org_id, p_oishi, 'OISHI-GEN-380', 'โออิชิ ข้าวญี่ปุ่น 380 มล.', '{"volume":"380ml"}'::jsonb, u_bottle, 14.00, 20.00, 'THB', 'INACTIVE')
  ON CONFLICT (organization_id, sku) DO NOTHING;

  INSERT INTO product_barcodes (organization_id, variant_id, code, symbology, source, is_primary)
  VALUES (v_org_id, var_oishi, '8854698005883', 'EAN13', 'MANUFACTURER', true)
  ON CONFLICT (organization_id, code) DO NOTHING;

  -------------------------------------------------------------
  -- 6. สินค้าสถานะ ARCHIVED (ยกเลิกจำหน่ายถาวร / เก็บถาวร)
  -------------------------------------------------------------
  -- สินค้า 8: เป๊ปซี่ กลิ่นไลม์ ลิมิเต็ด
  INSERT INTO products (id, organization_id, name, description, category_id, brand_id, status, created_by, updated_by)
  VALUES (p_pepsi, v_org_id, 'เป๊ปซี่ กลิ่นไลม์ มะนาว ลิมิเต็ด (เลิกจำหน่าย)', 'เครื่องดื่มน้ำอัดลมกลิ่นมะนาว รุ่นพิเศษจำกัดเวลา (ยกเลิกการผลิตแล้ว)', c_bev, b_pepsi, 'ARCHIVED', v_user_id, v_user_id)
  ON CONFLICT (organization_id, id) DO NOTHING;

  INSERT INTO product_variants (id, organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
  VALUES (var_pepsi, v_org_id, p_pepsi, 'PEPSI-LIME-245', 'เป๊ปซี่ กลิ่นไลม์ 245 มล. กระป๋อง', '{"volume":"245ml"}'::jsonb, u_can, 9.00, 14.00, 'THB', 'ARCHIVED')
  ON CONFLICT (organization_id, sku) DO NOTHING;

  INSERT INTO product_barcodes (organization_id, variant_id, code, symbology, source, is_primary)
  VALUES (v_org_id, var_pepsi, '8851959990018', 'EAN13', 'MANUFACTURER', true)
  ON CONFLICT (organization_id, code) DO NOTHING;

  -- สินค้า 9: เลย์ แม็กซ์ พริกปีศาจ
  INSERT INTO products (id, organization_id, name, description, category_id, brand_id, status, created_by, updated_by)
  VALUES (p_lays_ghost, v_org_id, 'เลย์ แม็กซ์ แผ่นหยัก กลิ่นพริกปีศาจ เอกซ์ตรีม (เลิกจำหน่าย)', 'มันฝรั่งทอดกรอบ รสเผ็ดระดับพริกปีศาจ (เลิกผลิตถาวร)', c_snack, b_lays, 'ARCHIVED', v_user_id, v_user_id)
  ON CONFLICT (organization_id, id) DO NOTHING;

  INSERT INTO product_variants (id, organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
  VALUES (var_lays_ghost, v_org_id, p_lays_ghost, 'LAYS-GHOST-48G', 'เลย์ แม็กซ์ พริกปีศาจ 48 กรัม', '{"weight":"48g"}'::jsonb, u_bag, 22.00, 30.00, 'THB', 'ARCHIVED')
  ON CONFLICT (organization_id, sku) DO NOTHING;

  INSERT INTO product_barcodes (organization_id, variant_id, code, symbology, source, is_primary)
  VALUES (v_org_id, var_lays_ghost, '8850718899012', 'EAN13', 'MANUFACTURER', true)
  ON CONFLICT (organization_id, code) DO NOTHING;

  -------------------------------------------------------------
  -- 7. สร้างสถานที่จัดเก็บสต็อก (Stock Locations)
  -------------------------------------------------------------
  INSERT INTO stock_locations (id, organization_id, branch_id, code, name, type, status, description, created_by, updated_by)
  VALUES
    (loc_wh, v_org_id, v_branch_id, 'LOC-WH-MAIN', 'คลังสินค้าหลัก (หลังร้าน)', 'WAREHOUSE', 'ACTIVE', 'พื้นที่สต็อกสินค้าสำรองหลังร้าน', v_user_id, v_user_id),
    (loc_floor, v_org_id, v_branch_id, 'LOC-SALES-FLOOR', 'พื้นที่ขายหน้าร้าน', 'SALES_FLOOR', 'ACTIVE', 'พื้นที่วางสินค้าพร้อมขายหน้าร้าน', v_user_id, v_user_id),
    (loc_shelf_drink, v_org_id, v_branch_id, 'LOC-SHELF-DRINK', 'โซนชั้นวางเครื่องดื่ม A', 'SHELF', 'ACTIVE', 'ชั้นวางแผนกเครื่องดื่ม', v_user_id, v_user_id),
    (loc_shelf_snack, v_org_id, v_branch_id, 'LOC-SHELF-SNACK', 'โซนชั้นวางขนมขบเคี้ยว B', 'SHELF', 'ACTIVE', 'ชั้นวางแผนกขนมและอาหารกึ่งสำเร็จรูป', v_user_id, v_user_id)
  ON CONFLICT (organization_id, branch_id, code) DO NOTHING;

  SELECT id INTO loc_wh FROM stock_locations WHERE organization_id = v_org_id AND branch_id = v_branch_id AND code = 'LOC-WH-MAIN';
  SELECT id INTO loc_floor FROM stock_locations WHERE organization_id = v_org_id AND branch_id = v_branch_id AND code = 'LOC-SALES-FLOOR';
  SELECT id INTO loc_shelf_drink FROM stock_locations WHERE organization_id = v_org_id AND branch_id = v_branch_id AND code = 'LOC-SHELF-DRINK';
  SELECT id INTO loc_shelf_snack FROM stock_locations WHERE organization_id = v_org_id AND branch_id = v_branch_id AND code = 'LOC-SHELF-SNACK';

  -------------------------------------------------------------
  -- 8. ยอดสต็อกคงเหลือ (Stock Balances & Quality Balances)
  -------------------------------------------------------------
  -- คลังสินค้าหลังร้าน
  INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
  VALUES
    (v_org_id, v_branch_id, loc_wh, var_coke_can, 120.000, 1),
    (v_org_id, v_branch_id, loc_wh, var_coke_pet, 80.000, 1),
    (v_org_id, v_branch_id, loc_wh, var_lays_44, 90.000, 1),
    (v_org_id, v_branch_id, loc_wh, var_lays_73, 50.000, 1),
    (v_org_id, v_branch_id, loc_wh, var_mama_bag, 200.000, 1),
    (v_org_id, v_branch_id, loc_wh, var_mama_cup, 72.000, 1),
    (v_org_id, v_branch_id, loc_wh, var_ichi_pet, 60.000, 1),
    (v_org_id, v_branch_id, loc_wh, var_dutch_box, 60.000, 1),
    (v_org_id, v_branch_id, loc_wh, var_nescafe, 40.000, 1),
    (v_org_id, v_branch_id, loc_wh, var_oishi, 30.000, 1)
  ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET quantity = EXCLUDED.quantity;

  -- หน้าร้าน / ลานวางขาย (เฉพาะสินค้า ACTIVE)
  INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
  VALUES
    (v_org_id, v_branch_id, loc_floor, var_coke_can, 30.000, 1),
    (v_org_id, v_branch_id, loc_floor, var_coke_pet, 24.000, 1),
    (v_org_id, v_branch_id, loc_floor, var_lays_44, 25.000, 1),
    (v_org_id, v_branch_id, loc_floor, var_lays_73, 15.000, 1),
    (v_org_id, v_branch_id, loc_floor, var_mama_bag, 50.000, 1),
    (v_org_id, v_branch_id, loc_floor, var_mama_cup, 24.000, 1),
    (v_org_id, v_branch_id, loc_floor, var_ichi_pet, 24.000, 1),
    (v_org_id, v_branch_id, loc_floor, var_dutch_box, 24.000, 1)
  ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET quantity = EXCLUDED.quantity;

  -- Quality Stock Balances (synced)
  INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
  SELECT organization_id, branch_id, location_id, variant_id, NULL, quantity, version
  FROM stock_balances WHERE organization_id = v_org_id
  ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET quantity = EXCLUDED.quantity;

  -------------------------------------------------------------
  -- 9. จุดสั่งซื้อสต็อก (Reorder Points)
  -------------------------------------------------------------
  INSERT INTO inventory_reorder_points (organization_id, branch_id, variant_id, minimum_quantity, target_quantity, status, updated_by)
  VALUES
    (v_org_id, v_branch_id, var_coke_can, 20.000, 100.000, 'ACTIVE', v_user_id),
    (v_org_id, v_branch_id, var_coke_pet, 15.000, 80.000, 'ACTIVE', v_user_id),
    (v_org_id, v_branch_id, var_lays_44, 15.000, 60.000, 'ACTIVE', v_user_id),
    (v_org_id, v_branch_id, var_lays_73, 10.000, 40.000, 'ACTIVE', v_user_id),
    (v_org_id, v_branch_id, var_mama_bag, 30.000, 150.000, 'ACTIVE', v_user_id),
    (v_org_id, v_branch_id, var_mama_cup, 12.000, 60.000, 'ACTIVE', v_user_id),
    (v_org_id, v_branch_id, var_ichi_pet, 15.000, 50.000, 'ACTIVE', v_user_id),
    (v_org_id, v_branch_id, var_dutch_box, 15.000, 50.000, 'ACTIVE', v_user_id)
  ON CONFLICT (organization_id, branch_id, variant_id) DO UPDATE 
  SET minimum_quantity = EXCLUDED.minimum_quantity, target_quantity = EXCLUDED.target_quantity;

  -------------------------------------------------------------
  -- 10. ชั้นวางสินค้า & การจัดวาง (Shelves & Shelf Assignments)
  -------------------------------------------------------------
  INSERT INTO shelves (id, organization_id, branch_id, stock_location_id, code, name, zone, description, status, created_by, updated_by)
  VALUES (sh_drink, v_org_id, v_branch_id, loc_shelf_drink, 'SHELF-A1', 'ชั้นวางเครื่องดื่ม A1', 'โซน A หน้าร้าน', 'ชั้นวางเครื่องดื่มกระป๋องและขวด', 'ACTIVE', v_user_id, v_user_id)
  ON CONFLICT (organization_id, branch_id, code) DO NOTHING;

  SELECT id INTO sh_drink FROM shelves WHERE organization_id = v_org_id AND branch_id = v_branch_id AND code = 'SHELF-A1';

  INSERT INTO shelf_slots (id, organization_id, shelf_id, code, position)
  VALUES
    (slot_d1, v_org_id, sh_drink, 'SLOT-A1-01', 1),
    (slot_d2, v_org_id, sh_drink, 'SLOT-A1-02', 2)
  ON CONFLICT (organization_id, shelf_id, code) DO NOTHING;

  SELECT id INTO slot_d1 FROM shelf_slots WHERE organization_id = v_org_id AND shelf_id = sh_drink AND code = 'SLOT-A1-01';
  SELECT id INTO slot_d2 FROM shelf_slots WHERE organization_id = v_org_id AND shelf_id = sh_drink AND code = 'SLOT-A1-02';

  INSERT INTO shelf_assignments (organization_id, shelf_id, slot_id, variant_id, minimum_quantity, target_quantity, capacity_quantity, status)
  VALUES
    (v_org_id, sh_drink, slot_d1, var_coke_can, 5.000, 20.000, 30.000, 'ACTIVE'),
    (v_org_id, sh_drink, slot_d2, var_ichi_pet, 4.000, 15.000, 24.000, 'ACTIVE')
  ON CONFLICT (organization_id, shelf_id, variant_id) DO UPDATE
  SET minimum_quantity = EXCLUDED.minimum_quantity, target_quantity = EXCLUDED.target_quantity, capacity_quantity = EXCLUDED.capacity_quantity;

  INSERT INTO shelves (id, organization_id, branch_id, stock_location_id, code, name, zone, description, status, created_by, updated_by)
  VALUES (sh_snack, v_org_id, v_branch_id, loc_shelf_snack, 'SHELF-B1', 'ชั้นวางขนมและอาหารกึ่งสำเร็จรูป B1', 'โซน B หน้าร้าน', 'ชั้นวางขนมขบเคี้ยวและมาม่า', 'ACTIVE', v_user_id, v_user_id)
  ON CONFLICT (organization_id, branch_id, code) DO NOTHING;

  SELECT id INTO sh_snack FROM shelves WHERE organization_id = v_org_id AND branch_id = v_branch_id AND code = 'SHELF-B1';

  INSERT INTO shelf_slots (id, organization_id, shelf_id, code, position)
  VALUES
    (slot_s1, v_org_id, sh_snack, 'SLOT-B1-01', 1),
    (slot_s2, v_org_id, sh_snack, 'SLOT-B1-02', 2)
  ON CONFLICT (organization_id, shelf_id, code) DO NOTHING;

  SELECT id INTO slot_s1 FROM shelf_slots WHERE organization_id = v_org_id AND shelf_id = sh_snack AND code = 'SLOT-B1-01';
  SELECT id INTO slot_s2 FROM shelf_slots WHERE organization_id = v_org_id AND shelf_id = sh_snack AND code = 'SLOT-B1-02';

  INSERT INTO shelf_assignments (organization_id, shelf_id, slot_id, variant_id, minimum_quantity, target_quantity, capacity_quantity, status)
  VALUES
    (v_org_id, sh_snack, slot_s1, var_lays_44, 5.000, 15.000, 25.000, 'ACTIVE'),
    (v_org_id, sh_snack, slot_s2, var_mama_bag, 10.000, 30.000, 50.000, 'ACTIVE')
  ON CONFLICT (organization_id, shelf_id, variant_id) DO UPDATE
  SET minimum_quantity = EXCLUDED.minimum_quantity, target_quantity = EXCLUDED.target_quantity, capacity_quantity = EXCLUDED.capacity_quantity;

  -------------------------------------------------------------
  -- 11. ล็อตสินค้าและวันหมดอายุ (Product Batches & Quality Tracking)
  -------------------------------------------------------------
  INSERT INTO product_batches (id, organization_id, variant_id, lot_number, manufactured_on, expires_on, status, reason, created_by, updated_by)
  VALUES
    (batch_coke, v_org_id, var_coke_can, 'LOT-COKE-2608', '2026-08-01', '2027-08-01', 'ACTIVE', 'ล็อตการผลิตปกติ', v_user_id, v_user_id),
    (batch_lays, v_org_id, var_lays_44, 'LOT-LAYS-2609', '2026-09-01', '2027-03-01', 'ACTIVE', 'ล็อตผลิตใหม่', v_user_id, v_user_id),
    (batch_dutch, v_org_id, var_dutch_box, 'LOT-DUTCH-EXP-SOON', '2026-09-15', '2026-10-25', 'ACTIVE', 'ล็อตใกล้หมดอายุสำหรับทดสอบระบบแจ้งเตือน', v_user_id, v_user_id)
  ON CONFLICT (organization_id, variant_id, lot_number) DO NOTHING;

  SELECT id INTO batch_coke FROM product_batches WHERE organization_id = v_org_id AND variant_id = var_coke_can AND lot_number = 'LOT-COKE-2608';
  SELECT id INTO batch_lays FROM product_batches WHERE organization_id = v_org_id AND variant_id = var_lays_44 AND lot_number = 'LOT-LAYS-2609';
  SELECT id INTO batch_dutch FROM product_batches WHERE organization_id = v_org_id AND variant_id = var_dutch_box AND lot_number = 'LOT-DUTCH-EXP-SOON';

  INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
  VALUES
    (v_org_id, v_branch_id, loc_wh, var_coke_can, batch_coke, 50.000, 1),
    (v_org_id, v_branch_id, loc_wh, var_lays_44, batch_lays, 40.000, 1),
    (v_org_id, v_branch_id, loc_wh, var_dutch_box, batch_dutch, 20.000, 1)
  ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET quantity = EXCLUDED.quantity;

  -------------------------------------------------------------
  -- 12. จัดซื้อและซัพพลายเออร์ (Suppliers & Supplier Products)
  -------------------------------------------------------------
  INSERT INTO suppliers (id, organization_id, code, name, contact_person, email, phone, address, tax_identifier, notes, status, created_by, updated_by)
  VALUES (
    supp_cpall, v_org_id, 'SUP-CPALL', 'บริษัท ซีพี ออลล์ ดิสทริบิวชั่น จำกัด', 
    'ฝ่ายจัดซื้อสินค้าอุปโภคบริโภค', 'order@cpall-dist.co.th', '02-123-4567',
    '313 อาคาร ซี.พี.ทาวเวอร์ ถนนสีลม เขตบางรัก กรุงเทพฯ 10500', '0107542000011',
    'ตัวแทนจำหน่ายหลักสินค้าขนม เครื่องดื่ม และของใช้', 'ACTIVE', v_user_id, v_user_id
  )
  ON CONFLICT (organization_id, code) DO NOTHING;

  SELECT id INTO supp_cpall FROM suppliers WHERE organization_id = v_org_id AND code = 'SUP-CPALL';

  INSERT INTO suppliers (id, organization_id, code, name, contact_person, email, phone, address, tax_identifier, notes, status, created_by, updated_by)
  VALUES (
    v_supplier_id, v_org_id, 'SUP-THAI-BEV', 'บริษัท ไทยเบฟเวอเรจ รีเทล จำกัด', 
    'ฝ่ายขายและจัดจำหน่าย', 'sales@thaibev-retail.co.th', '02-785-5555',
    '14 อาคารแสงโสม ถนนวิภาวดีรังสิต แขวงจอมพล เขตจตุจักร กรุงเทพฯ 10900', '0107546000345',
    'ตัวแทนจำหน่ายเครื่องดื่มเสริม', 'ACTIVE', v_user_id, v_user_id
  )
  ON CONFLICT (organization_id, code) DO NOTHING;

  SELECT id INTO v_supplier_id FROM suppliers WHERE organization_id = v_org_id AND code = 'SUP-THAI-BEV';

  INSERT INTO supplier_products (organization_id, supplier_id, variant_id, purchase_unit_id, supplier_sku, unit_cost, minimum_order_quantity, order_multiple, lead_time_days, is_preferred, status)
  VALUES
    (v_org_id, supp_cpall, var_coke_can, u_can, 'CP-COKE-325', 10.00, 24.000, 24.000, 2, true, 'ACTIVE'),
    (v_org_id, supp_cpall, var_coke_pet, u_bottle, 'CP-COKE-500', 13.00, 24.000, 12.000, 2, true, 'ACTIVE'),
    (v_org_id, supp_cpall, var_lays_44, u_bag, 'CP-LAYS-44', 16.00, 12.000, 12.000, 3, true, 'ACTIVE'),
    (v_org_id, supp_cpall, var_lays_73, u_bag, 'CP-LAYS-73', 24.00, 12.000, 6.000, 3, true, 'ACTIVE'),
    (v_org_id, supp_cpall, var_mama_bag, u_bag, 'CP-MAMA-TYK', 5.50, 30.000, 30.000, 1, true, 'ACTIVE'),
    (v_org_id, supp_cpall, var_mama_cup, u_cup, 'CP-MAMA-CUP', 11.00, 12.000, 12.000, 1, true, 'ACTIVE'),
    (v_org_id, supp_cpall, var_ichi_pet, u_bottle, 'CP-ICHI-420', 14.00, 24.000, 24.000, 2, true, 'ACTIVE'),
    (v_org_id, supp_cpall, var_dutch_box, u_box, 'CP-DUTCH-180', 8.50, 24.000, 24.000, 1, true, 'ACTIVE'),
    (v_org_id, supp_cpall, var_nescafe, u_bag, 'CP-NES-27P', 95.00, 10.000, 5.000, 2, true, 'ACTIVE'),
    (v_org_id, supp_cpall, var_oishi, u_bottle, 'CP-OISHI-GEN', 14.00, 24.000, 24.000, 2, true, 'ACTIVE'),
    (v_org_id, v_supplier_id, var_coke_can, u_can, 'SUP1-COKE', 9.80, 48.000, 24.000, 3, false, 'ACTIVE')
  ON CONFLICT (organization_id, supplier_id, variant_id) DO UPDATE
  SET unit_cost = EXCLUDED.unit_cost, minimum_order_quantity = EXCLUDED.minimum_order_quantity;

    -------------------------------------------------------------
  -- 13. ประวัติการเคลื่อนไหวสต็อก (Stock Movements History)
  -------------------------------------------------------------
  SELECT id INTO var_coke_can FROM product_variants WHERE organization_id = v_org_id AND sku = 'COKE-CAN-325';
  SELECT id INTO var_coke_pet FROM product_variants WHERE organization_id = v_org_id AND sku = 'COKE-PET-500';
  SELECT id INTO var_lays_44 FROM product_variants WHERE organization_id = v_org_id AND sku = 'LAYS-CLA-44G';
  SELECT id INTO var_lays_73 FROM product_variants WHERE organization_id = v_org_id AND sku = 'LAYS-CLA-73G';
  SELECT id INTO var_mama_bag FROM product_variants WHERE organization_id = v_org_id AND sku IN ('MAMA-TYK-BAG', 'MAMA-TYK-55G');
  SELECT id INTO var_mama_cup FROM product_variants WHERE organization_id = v_org_id AND sku = 'MAMA-TYK-CUP';
  SELECT id INTO var_ichi_pet FROM product_variants WHERE organization_id = v_org_id AND sku IN ('ICHI-HON-420', 'ICHI-ORI-420');
  SELECT id INTO var_dutch_box FROM product_variants WHERE organization_id = v_org_id AND sku = 'DUTCH-4IN1-180';
  SELECT id INTO var_nescafe FROM product_variants WHERE organization_id = v_org_id AND sku = 'NES-RICHA-27P';
  SELECT id INTO var_oishi FROM product_variants WHERE organization_id = v_org_id AND sku = 'OISHI-GEN-380';

  SELECT id INTO batch_coke FROM product_batches WHERE organization_id = v_org_id AND lot_number = 'LOT-COKE-2608';
  SELECT id INTO batch_lays FROM product_batches WHERE organization_id = v_org_id AND lot_number = 'LOT-LAYS-2609';
  SELECT id INTO batch_dutch FROM product_batches WHERE organization_id = v_org_id AND lot_number = 'LOT-DUTCH-EXP-SOON';

  -- 5. สร้าง Inventory Operations
  INSERT INTO inventory_operations (id, organization_id, actor_id, operation, idempotency_key, fingerprint, result, created_at)
  VALUES
    (op_opening, v_org_id, v_user_id, 'OPENING_BALANCE', gen_random_uuid(), repeat('1', 64), '{"status":"POSTED"}'::jsonb, now() - interval '7 days'),
    (op_transfer, v_org_id, v_user_id, 'TRANSFER', gen_random_uuid(), repeat('2', 64), '{"status":"POSTED"}'::jsonb, now() - interval '4 days'),
    (op_adjust_in, v_org_id, v_user_id, 'ADJUSTMENT', gen_random_uuid(), repeat('3', 64), '{"status":"POSTED"}'::jsonb, now() - interval '1 days' - interval '2 hours'),
    (op_adjust_out, v_org_id, v_user_id, 'ADJUSTMENT', gen_random_uuid(), repeat('4', 64), '{"status":"POSTED"}'::jsonb, now() - interval '1 days')
  ON CONFLICT (organization_id, id) DO NOTHING;

  -- 6. ปิด Triggers บน stock_movements ชั่วคราวเพื่อนำเข้าข้อมูลประวัติ
  ALTER TABLE stock_movements DISABLE TRIGGER ALL;

  DELETE FROM stock_movements WHERE organization_id = v_org_id;

  -- 7. บันทึกประวัติการเคลื่อนไหวสต็อก (Stock Movements)
  -- 7.1 ยอดเปิดต้นงวด (Opening Balance) 7 วันก่อน
  IF var_coke_can IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, batch_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES (v_org_id, v_branch_id, loc_wh, var_coke_can, batch_coke, 'OPENING_BALANCE', 150.000, 0.000, 150.000, op_opening, 'ยอดเปิดรอบต้นงวด / Opening Stock', v_user_id, now() - interval '7 days');
  END IF;

  IF var_coke_pet IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES (v_org_id, v_branch_id, loc_wh, var_coke_pet, 'OPENING_BALANCE', 104.000, 0.000, 104.000, op_opening, 'ยอดเปิดรอบต้นงวด / Opening Stock', v_user_id, now() - interval '7 days');
  END IF;

  IF var_lays_44 IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, batch_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES (v_org_id, v_branch_id, loc_wh, var_lays_44, batch_lays, 'OPENING_BALANCE', 115.000, 0.000, 115.000, op_opening, 'ยอดเปิดรอบสินค้าล็อตใหม่', v_user_id, now() - interval '6 days');
  END IF;

  IF var_lays_73 IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES (v_org_id, v_branch_id, loc_wh, var_lays_73, 'OPENING_BALANCE', 65.000, 0.000, 65.000, op_opening, 'ยอดเปิดรอบสินค้า', v_user_id, now() - interval '6 days');
  END IF;

  IF var_mama_bag IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES (v_org_id, v_branch_id, loc_wh, var_mama_bag, 'OPENING_BALANCE', 250.000, 0.000, 250.000, op_opening, 'ยอดเปิดรอบสินค้า', v_user_id, now() - interval '7 days');
  END IF;

  IF var_mama_cup IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES (v_org_id, v_branch_id, loc_wh, var_mama_cup, 'OPENING_BALANCE', 96.000, 0.000, 96.000, op_opening, 'ยอดเปิดรอบสินค้า', v_user_id, now() - interval '7 days');
  END IF;

  IF var_ichi_pet IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES (v_org_id, v_branch_id, loc_wh, var_ichi_pet, 'OPENING_BALANCE', 84.000, 0.000, 84.000, op_opening, 'ยอดเปิดรอบสินค้า', v_user_id, now() - interval '5 days');
  END IF;

  IF var_dutch_box IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, batch_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES (v_org_id, v_branch_id, loc_wh, var_dutch_box, batch_dutch, 'OPENING_BALANCE', 84.000, 0.000, 84.000, op_opening, 'ยอดเปิดรอบสินค้าล็อตใกล้หมดอายุ', v_user_id, now() - interval '5 days');
  END IF;

  IF var_nescafe IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES (v_org_id, v_branch_id, loc_wh, var_nescafe, 'OPENING_BALANCE', 40.000, 0.000, 40.000, op_opening, 'ยอดเปิดรอบสินค้า', v_user_id, now() - interval '7 days');
  END IF;

  IF var_oishi IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES (v_org_id, v_branch_id, loc_wh, var_oishi, 'OPENING_BALANCE', 30.000, 0.000, 30.000, op_opening, 'ยอดเปิดรอบสินค้า', v_user_id, now() - interval '7 days');
  END IF;

  -- 7.2 โอนย้ายสต็อกเข้าหน้าร้าน (Transfer Out / Transfer In) 4-2 วันก่อน
  IF var_coke_can IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, batch_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES
      (v_org_id, v_branch_id, loc_wh, var_coke_can, batch_coke, 'TRANSFER_OUT', -30.000, 150.000, 120.000, op_transfer, 'เติมสต็อกพื้นที่ขายหน้าร้าน', v_user_id, now() - interval '4 days' - interval '1 hour'),
      (v_org_id, v_branch_id, loc_floor, var_coke_can, batch_coke, 'TRANSFER_IN', 30.000, 0.000, 30.000, op_transfer, 'รับเข้าพื้นที่ขายหน้าร้าน', v_user_id, now() - interval '4 days');
  END IF;

  IF var_coke_pet IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES
      (v_org_id, v_branch_id, loc_wh, var_coke_pet, 'TRANSFER_OUT', -24.000, 104.000, 80.000, op_transfer, 'เติมสต็อกพื้นที่ขายหน้าร้าน', v_user_id, now() - interval '4 days' - interval '1 hour'),
      (v_org_id, v_branch_id, loc_floor, var_coke_pet, 'TRANSFER_IN', 24.000, 0.000, 24.000, op_transfer, 'รับเข้าพื้นที่ขายหน้าร้าน', v_user_id, now() - interval '4 days');
  END IF;

  IF var_lays_44 IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, batch_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES
      (v_org_id, v_branch_id, loc_wh, var_lays_44, batch_lays, 'TRANSFER_OUT', -25.000, 115.000, 90.000, op_transfer, 'ย้ายไปชั้นวางขนมขบเคี้ยว', v_user_id, now() - interval '3 days' - interval '1 hour'),
      (v_org_id, v_branch_id, loc_floor, var_lays_44, batch_lays, 'TRANSFER_IN', 25.000, 0.000, 25.000, op_transfer, 'รับเข้าพื้นที่ขายหน้าร้าน', v_user_id, now() - interval '3 days');
  END IF;

  IF var_lays_73 IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES
      (v_org_id, v_branch_id, loc_wh, var_lays_73, 'TRANSFER_OUT', -15.000, 65.000, 50.000, op_transfer, 'ย้ายไปชั้นวางขนมขบเคี้ยว', v_user_id, now() - interval '3 days' - interval '1 hour'),
      (v_org_id, v_branch_id, loc_floor, var_lays_73, 'TRANSFER_IN', 15.000, 0.000, 15.000, op_transfer, 'รับเข้าพื้นที่ขายหน้าร้าน', v_user_id, now() - interval '3 days');
  END IF;

  IF var_mama_bag IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES
      (v_org_id, v_branch_id, loc_wh, var_mama_bag, 'TRANSFER_OUT', -50.000, 250.000, 200.000, op_transfer, 'เบิกไปวางขายหน้าร้าน', v_user_id, now() - interval '4 days' - interval '1 hour'),
      (v_org_id, v_branch_id, loc_floor, var_mama_bag, 'TRANSFER_IN', 50.000, 0.000, 50.000, op_transfer, 'รับเข้าพื้นที่ขายหน้าร้าน', v_user_id, now() - interval '4 days');
  END IF;

  IF var_mama_cup IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES
      (v_org_id, v_branch_id, loc_wh, var_mama_cup, 'TRANSFER_OUT', -24.000, 96.000, 72.000, op_transfer, 'เบิกไปวางขายหน้าร้าน', v_user_id, now() - interval '4 days' - interval '1 hour'),
      (v_org_id, v_branch_id, loc_floor, var_mama_cup, 'TRANSFER_IN', 24.000, 0.000, 24.000, op_transfer, 'รับเข้าพื้นที่ขายหน้าร้าน', v_user_id, now() - interval '4 days');
  END IF;

  IF var_ichi_pet IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES
      (v_org_id, v_branch_id, loc_wh, var_ichi_pet, 'TRANSFER_OUT', -24.000, 84.000, 60.000, op_transfer, 'เติมตู้แช่เครื่องดื่มหน้าร้าน', v_user_id, now() - interval '2 days' - interval '1 hour'),
      (v_org_id, v_branch_id, loc_floor, var_ichi_pet, 'TRANSFER_IN', 24.000, 0.000, 24.000, op_transfer, 'รับเข้าพื้นที่ขายหน้าร้าน', v_user_id, now() - interval '2 days');
  END IF;

  IF var_dutch_box IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, batch_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES
      (v_org_id, v_branch_id, loc_wh, var_dutch_box, batch_dutch, 'TRANSFER_OUT', -24.000, 84.000, 60.000, op_transfer, 'เติมตู้แช่นมเปรี้ยวหน้าร้าน', v_user_id, now() - interval '2 days' - interval '1 hour'),
      (v_org_id, v_branch_id, loc_floor, var_dutch_box, batch_dutch, 'TRANSFER_IN', 24.000, 0.000, 24.000, op_transfer, 'รับเข้าพื้นที่ขายหน้าร้าน', v_user_id, now() - interval '2 days');
  END IF;

  -- 7.3 ปรับปรุงยอดสินค้า (Stock Adjustment) 1 วันก่อน
  IF var_coke_can IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, batch_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES
      (v_org_id, v_branch_id, loc_wh, var_coke_can, batch_coke, 'ADJUSTMENT_IN', 10.000, 120.000, 130.000, op_adjust_in, 'ตรวจนับพบสินค้าเกินในคลัง', v_user_id, now() - interval '1 day' - interval '2 hours'),
      (v_org_id, v_branch_id, loc_wh, var_coke_can, batch_coke, 'ADJUSTMENT_OUT', -10.000, 130.000, 120.000, op_adjust_out, 'ปรับยอดแก้ไขความคลาดเคลื่อน', v_user_id, now() - interval '1 day');
  END IF;

  -- 8. เปิด Triggers กลับคืนมาตามเดิม
  ALTER TABLE stock_movements ENABLE TRIGGER ALL;

  RAISE NOTICE 'Sample data with all statuses successfully created for organization %', v_org_id;
END $$;
