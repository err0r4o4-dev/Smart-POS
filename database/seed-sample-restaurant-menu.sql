-- SmartPOS Sample Restaurant Menu & Dining Tables Seed Script
-- สำหรับสร้างรายการอาหารและเครื่องดื่มตัวอย่าง 26 รายการ 6 หมวดหมู่ พร้อมโต๊ะอาหารและสต็อกพร้อมขาย
-- รองรับ Dine-In QR Ordering และ Storefront

DO $$
DECLARE
  r_org RECORD;
  v_branch_id uuid;
  v_location_id uuid;
  v_user_id uuid;
  v_terminal_id uuid;
  
  -- Unit IDs
  u_dish uuid;
  u_bowl uuid;
  u_glass uuid;
  u_cup uuid;
  u_set uuid;

  -- Category IDs
  c_single uuid;
  c_noodle uuid;
  c_soup uuid;
  c_snack uuid;
  c_drink uuid;
  c_dessert uuid;

  -- Product & Variant Loop helper
  v_prod_id uuid;
  v_var_id uuid;
  v_cat_id uuid;
  v_unit_id uuid;
BEGIN
  FOR r_org IN SELECT id, name FROM organizations LOOP
    SELECT id INTO v_branch_id FROM branches WHERE organization_id = r_org.id ORDER BY created_at ASC LIMIT 1;
    IF v_branch_id IS NULL THEN CONTINUE; END IF;

    SELECT id INTO v_location_id FROM stock_locations WHERE organization_id = r_org.id AND branch_id = v_branch_id ORDER BY created_at ASC LIMIT 1;
    IF v_location_id IS NULL THEN CONTINUE; END IF;

    SELECT id INTO v_user_id FROM users ORDER BY created_at ASC LIMIT 1;
    IF v_user_id IS NULL THEN CONTINUE; END IF;

    SELECT id INTO v_terminal_id FROM pos_terminals WHERE organization_id = r_org.id ORDER BY created_at ASC LIMIT 1;

    PERFORM set_config('app.organization_id', r_org.id::text, true);
    PERFORM set_config('app.user_id', v_user_id::text, true);

    IF NOT EXISTS (SELECT 1 FROM storefronts WHERE organization_id = r_org.id) AND v_terminal_id IS NOT NULL THEN
      INSERT INTO storefronts (
        organization_id, slug, name, description, contact_phone, pickup_instructions, terminal_id, published, accepting_orders, revision
      ) VALUES (
        r_org.id,
        lower(regexp_replace(r_org.name, '[^a-zA-Z0-9]+', '-', 'g')),
        r_org.name,
        'ร้านอาหารและเครื่องดื่ม',
        '02-123-4567',
        'กรุณารับอาหารที่เคาน์เตอร์ หรือรอเสิร์ฟที่โต๊ะ',
        v_terminal_id,
        true,
        true,
        1
      ) ON CONFLICT (organization_id) DO NOTHING;
    END IF;

    INSERT INTO units (organization_id, code, name, description, unit_type, conversion_factor, status)
    VALUES
      (r_org.id, 'DISH', 'จาน', 'หน่วยนับอาหารจานหลัก', 'COUNT', 1, 'ACTIVE'),
      (r_org.id, 'BOWL', 'ชาม', 'หน่วยนับอาหารประเภทซุป/ก๋วยเตี๋ยว', 'COUNT', 1, 'ACTIVE'),
      (r_org.id, 'GLASS', 'แก้ว', 'หน่วยนับเครื่องดื่ม', 'COUNT', 1, 'ACTIVE'),
      (r_org.id, 'CUP', 'ถ้วย', 'หน่วยนับขนมหวาน/ถ้วย', 'COUNT', 1, 'ACTIVE'),
      (r_org.id, 'SET', 'ที่', 'หน่วยนับเซ็ตอาหาร', 'COUNT', 1, 'ACTIVE')
    ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';

    SELECT id INTO u_dish FROM units WHERE organization_id = r_org.id AND code = 'DISH';
    SELECT id INTO u_bowl FROM units WHERE organization_id = r_org.id AND code = 'BOWL';
    SELECT id INTO u_glass FROM units WHERE organization_id = r_org.id AND code = 'GLASS';
    SELECT id INTO u_cup FROM units WHERE organization_id = r_org.id AND code = 'CUP';
    SELECT id INTO u_set FROM units WHERE organization_id = r_org.id AND code = 'SET';

    INSERT INTO categories (organization_id, name, description, status)
    VALUES
      (r_org.id, 'อาหารจานเดียว', 'อาหารจานเดียว', 'ACTIVE'),
      (r_org.id, 'เส้นและก๋วยเตี๋ยว', 'เส้นและก๋วยเตี๋ยว', 'ACTIVE'),
      (r_org.id, 'กับข้าวและต้มแกง', 'กับข้าวและต้มแกง', 'ACTIVE'),
      (r_org.id, 'ของทานเล่น', 'ของทานเล่น', 'ACTIVE'),
      (r_org.id, 'เครื่องดื่มและกาแฟ', 'เครื่องดื่มและกาแฟ', 'ACTIVE'),
      (r_org.id, 'ของหวาน', 'ของหวาน', 'ACTIVE')
    ON CONFLICT (organization_id, lower(btrim(name))) DO NOTHING;

    SELECT id INTO c_single FROM categories WHERE organization_id = r_org.id AND lower(btrim(name)) = lower('อาหารจานเดียว');
    SELECT id INTO c_noodle FROM categories WHERE organization_id = r_org.id AND lower(btrim(name)) = lower('เส้นและก๋วยเตี๋ยว');
    SELECT id INTO c_soup FROM categories WHERE organization_id = r_org.id AND lower(btrim(name)) = lower('กับข้าวและต้มแกง');
    SELECT id INTO c_snack FROM categories WHERE organization_id = r_org.id AND lower(btrim(name)) = lower('ของทานเล่น');
    SELECT id INTO c_drink FROM categories WHERE organization_id = r_org.id AND lower(btrim(name)) = lower('เครื่องดื่มและกาแฟ');
    SELECT id INTO c_dessert FROM categories WHERE organization_id = r_org.id AND lower(btrim(name)) = lower('ของหวาน');

    INSERT INTO restaurant_tables (organization_id, branch_id, code, name, seats, qr_token_hash, status, created_by, updated_by)
    VALUES
      (r_org.id, v_branch_id, 'A01', 'โต๊ะ A01 หน้าร้าน', 4, '5046fc6a473e44c9d427d60964d349515a352e9b282425a3a8792757fab240e1', 'ACTIVE', v_user_id, v_user_id),
      (r_org.id, v_branch_id, 'A02', 'โต๊ะ A02 ในร้าน', 4, 'fba50500d882e7ae0065e8be62d3d2fa95dcb1db2009d8506ebf88fe765f9631', 'ACTIVE', v_user_id, v_user_id),
      (r_org.id, v_branch_id, 'A03', 'โต๊ะ A03 ริมหน้าต่าง', 2, '31fe8c1c07892413333604006da66776fbd6fdecdfe32035c3f06ff55dc13f03', 'ACTIVE', v_user_id, v_user_id)
    ON CONFLICT (organization_id, branch_id, code) DO UPDATE SET
      name = EXCLUDED.name,
      seats = EXCLUDED.seats,
      qr_token_hash = EXCLUDED.qr_token_hash,
      status = 'ACTIVE';

    -- Item: ข้าวกะเพราหมูกรอบไข่ดาว (DINE-KAPRAO-CRISPY)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-KAPRAO-CRISPY' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'ข้าวกะเพราหมูกรอบไข่ดาว', 'หมูกรอบคั่วพริกกระเพรารสเด็ด เสิร์ฟพร้อมข้าวสวยร้อนๆ และไข่ดาวกรอบ', c_single, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-KAPRAO-CRISPY', 'ข้าวกะเพราหมูกรอบไข่ดาว', '{"storefront_image_url":"/images/products/pad-kra-pao.svg","description":"หมูกรอบคั่วพริกกระเพรารสเด็ด เสิร์ฟพร้อมข้าวสวยร้อนๆ และไข่ดาวกรอบ"}'::jsonb, u_dish, 40.00, 75.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: ข้าวกะเพราเนื้อสับไข่ดาว (DINE-KAPRAO-BEEF)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-KAPRAO-BEEF' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'ข้าวกะเพราเนื้อสับไข่ดาว', 'เนื้อโคขุนบดผัดกะเพราพริกแห้งรสเข้มข้น จัดจ้านถึงเครื่อง', c_single, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-KAPRAO-BEEF', 'ข้าวกะเพราเนื้อสับไข่ดาว', '{"storefront_image_url":"/images/products/pad-kra-pao.svg","description":"เนื้อโคขุนบดผัดกะเพราพริกแห้งรสเข้มข้น จัดจ้านถึงเครื่อง"}'::jsonb, u_dish, 45.00, 85.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: ข้าวผัดกุ้งสด (DINE-FRIEDRICE-SHRIMP)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-FRIEDRICE-SHRIMP' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'ข้าวผัดกุ้งสด', 'ข้าวหอมมะลิผัดไข่ใส่กุ้งสดตัวโต หอมกลิ่นกระทะไหม้กำลังดี', c_single, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-FRIEDRICE-SHRIMP', 'ข้าวผัดกุ้งสด', '{"storefront_image_url":"/images/products/fried-rice.svg","description":"ข้าวหอมมะลิผัดไข่ใส่กุ้งสดตัวโต หอมกลิ่นกระทะไหม้กำลังดี"}'::jsonb, u_dish, 38.00, 75.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: ข้าวผัดเนื้อปู (DINE-FRIEDRICE-CRAB)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-FRIEDRICE-CRAB' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'ข้าวผัดเนื้อปู', 'ข้าวผัดปูแกะสด เนื้อก้อนเน้นๆ ผัดแห้งเรียงเม็ดอร่อยกลมกล่อม', c_single, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-FRIEDRICE-CRAB', 'ข้าวผัดเนื้อปู', '{"storefront_image_url":"/images/products/fried-rice.svg","description":"ข้าวผัดปูแกะสด เนื้อก้อนเน้นๆ ผัดแห้งเรียงเม็ดอร่อยกลมกล่อม"}'::jsonb, u_dish, 50.00, 95.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: ข้าวหมูกระเทียมพริกไทยอ่อน (DINE-PORK-GARLIC)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-PORK-GARLIC' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'ข้าวหมูกระเทียมพริกไทยอ่อน', 'สันคอหมูนุ่มหมักผัดกระเทียมเจียวกรอบและพริกไทยสด', c_single, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-PORK-GARLIC', 'ข้าวหมูกระเทียมพริกไทยอ่อน', '{"storefront_image_url":"/images/products/garlic-pork.svg","description":"สันคอหมูนุ่มหมักผัดกระเทียมเจียวกรอบและพริกไทยสด"}'::jsonb, u_dish, 35.00, 65.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: ข้าวไข่ข้นกุ้งสับ (DINE-OMELET-SHRIMP)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-OMELET-SHRIMP' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'ข้าวไข่ข้นกุ้งสับ', 'ไข่ข้นเนื้อเนียนนุ่มเยิ้มๆ ราดบนข้าวสวย ท็อปปิ้งกุ้งสดเด้ง', c_single, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-OMELET-SHRIMP', 'ข้าวไข่ข้นกุ้งสับ', '{"storefront_image_url":"/images/products/creamy-omelet.svg","description":"ไข่ข้นเนื้อเนียนนุ่มเยิ้มๆ ราดบนข้าวสวย ท็อปปิ้งกุ้งสดเด้ง"}'::jsonb, u_dish, 38.00, 75.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: ผัดไทยกุ้งสดสูตรโบราณ (DINE-PAD-THAI)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-PAD-THAI' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'ผัดไทยกุ้งสดสูตรโบราณ', 'ผัดไทยเส้นจันท์เหนียวนุ่ม ซอสมะขามเปียกเคี่ยวเข้มข้น กุ้งสดตัวโต', c_noodle, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-PAD-THAI', 'ผัดไทยกุ้งสดสูตรโบราณ', '{"storefront_image_url":"/images/products/pad-thai.svg","description":"ผัดไทยเส้นจันท์เหนียวนุ่ม ซอสมะขามเปียกเคี่ยวเข้มข้น กุ้งสดตัวโต"}'::jsonb, u_dish, 40.00, 80.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: ผัดซีอิ๊วหมูนุ่ม (DINE-PAD-SEE-EW)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-PAD-SEE-EW' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'ผัดซีอิ๊วหมูนุ่ม', 'เส้นใหญ่คั่วกระทะหอมกรุ่น คะน้าฮ่องกงกรอบ และหมูหมักนุ่มละมุน', c_noodle, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-PAD-SEE-EW', 'ผัดซีอิ๊วหมูนุ่ม', '{"storefront_image_url":"/images/products/pad-see-ew.svg","description":"เส้นใหญ่คั่วกระทะหอมกรุ่น คะน้าฮ่องกงกรอบ และหมูหมักนุ่มละมุน"}'::jsonb, u_dish, 35.00, 65.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: ราดหน้าทะเลเส้นใหญ่ (DINE-RAD-NA-SEAFOOD)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-RAD-NA-SEAFOOD' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'ราดหน้าทะเลเส้นใหญ่', 'น้ำราดหน้าเหนียวข้นกำลังดี เครื่องทะเลแน่น ทั้งกุ้งและปลาหมึก', c_noodle, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-RAD-NA-SEAFOOD', 'ราดหน้าทะเลเส้นใหญ่', '{"storefront_image_url":"/images/products/rad-na.svg","description":"น้ำราดหน้าเหนียวข้นกำลังดี เครื่องทะเลแน่น ทั้งกุ้งและปลาหมึก"}'::jsonb, u_bowl, 42.00, 79.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: สปาเก็ตตี้ขี้เมาทะเล (DINE-SPAGHETTI-KEEMAO)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-SPAGHETTI-KEEMAO' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'สปาเก็ตตี้ขี้เมาทะเล', 'เส้นสปาเก็ตตี้อัลเดนเต้ ผัดขี้เมาพริกสดใบกะเพราและซีฟู้ดรสจัด', c_noodle, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-SPAGHETTI-KEEMAO', 'สปาเก็ตตี้ขี้เมาทะเล', '{"storefront_image_url":"/images/products/spaghetti-keemao.svg","description":"เส้นสปาเก็ตตี้อัลเดนเต้ ผัดขี้เมาพริกสดใบกะเพราและซีฟู้ดรสจัด"}'::jsonb, u_dish, 50.00, 95.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: ต้มยำกุ้งน้ำข้นยอดมะพร้าว (DINE-TOM-YUM-KUNG)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-TOM-YUM-KUNG' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'ต้มยำกุ้งน้ำข้นยอดมะพร้าว', 'ต้มยำกุ้งแม่น้ำน้ำข้นมันกุ้งเข้มข้น หอมสมุนไพรข่า ตะไคร้ ใบมะกรูด', c_soup, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-TOM-YUM-KUNG', 'ต้มยำกุ้งน้ำข้นยอดมะพร้าว', '{"storefront_image_url":"/images/products/tom-yum.svg","description":"ต้มยำกุ้งแม่น้ำน้ำข้นมันกุ้งเข้มข้น หอมสมุนไพรข่า ตะไคร้ ใบมะกรูด"}'::jsonb, u_bowl, 80.00, 159.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: ต้มข่าไก่เห็ดออรินจิ (DINE-TOM-KHA-GAI)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-TOM-KHA-GAI' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'ต้มข่าไก่เห็ดออรินจิ', 'กะทิสดแท้เคี่ยวสมุนไพรรสเปรี้ยวเค็มหวานกลมกล่อม เนื้อสะโพกไก่นุ่ม', c_soup, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-TOM-KHA-GAI', 'ต้มข่าไก่เห็ดออรินจิ', '{"storefront_image_url":"/images/products/tom-kha-gai.svg","description":"กะทิสดแท้เคี่ยวสมุนไพรรสเปรี้ยวเค็มหวานกลมกล่อม เนื้อสะโพกไก่นุ่ม"}'::jsonb, u_bowl, 60.00, 120.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: แกงเขียวหวานไก่โรตีกรอบ (DINE-GREEN-CURRY)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-GREEN-CURRY' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'แกงเขียวหวานไก่โรตีกรอบ', 'แกงเขียวหวานพริกแกงตำสด ทานคู่กับแป้งโรตีกรอบนอกนุ่มใน', c_soup, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-GREEN-CURRY', 'แกงเขียวหวานไก่โรตีกรอบ', '{"storefront_image_url":"/images/products/green-curry.svg","description":"แกงเขียวหวานพริกแกงตำสด ทานคู่กับแป้งโรตีกรอบนอกนุ่มใน"}'::jsonb, u_set, 65.00, 129.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: ปีกไก่ทอดน้ำปลาสมุนไพร (DINE-CHICKEN-WINGS)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-CHICKEN-WINGS' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'ปีกไก่ทอดน้ำปลาสมุนไพร', 'ปีกไก่กลางหมักน้ำปลาแท้ทอดกรอบหนังบาง หอมกลิ่นใบเตยและตะไคร้', c_soup, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-CHICKEN-WINGS', 'ปีกไก่ทอดน้ำปลาสมุนไพร', '{"storefront_image_url":"/images/products/fried-wings.svg","description":"ปีกไก่กลางหมักน้ำปลาแท้ทอดกรอบหนังบาง หอมกลิ่นใบเตยและตะไคร้"}'::jsonb, u_dish, 45.00, 89.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: เฟรนช์ฟรายส์ชีสชีสซี่ดิป (DINE-FRENCH-FRIES)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-FRENCH-FRIES' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'เฟรนช์ฟรายส์ชีสชีสซี่ดิป', 'มันฝรั่งทอดแท่งใหญ่ทอดกรอบ โรยผงชีสและดิปซอสเชดด้าชีสเข้มข้น', c_snack, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-FRENCH-FRIES', 'เฟรนช์ฟรายส์ชีสชีสซี่ดิป', '{"storefront_image_url":"/images/products/french-fries.svg","description":"มันฝรั่งทอดแท่งใหญ่ทอดกรอบ โรยผงชีสและดิปซอสเชดด้าชีสเข้มข้น"}'::jsonb, u_dish, 30.00, 65.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: นักเก็ตไก่กรอบซอสบาร์บีคิว (DINE-NUGGETS)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-NUGGETS' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'นักเก็ตไก่กรอบซอสบาร์บีคิว', 'นักเก็ตเนื้อไก่ล้วน 6 ชิ้น ทอดกรอบนอกนุ่มชุ่มฉ่ำ เสิร์ฟพร้อมซอสบาร์บีคิว', c_snack, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-NUGGETS', 'นักเก็ตไก่กรอบซอสบาร์บีคิว', '{"storefront_image_url":"/images/products/nuggets.svg","description":"นักเก็ตเนื้อไก่ล้วน 6 ชิ้น ทอดกรอบนอกนุ่มชุ่มฉ่ำ เสิร์ฟพร้อมซอสบาร์บีคิว"}'::jsonb, u_dish, 28.00, 59.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: ทอดมันกุ้งแท้เกล็ดขนมปัง (DINE-SHRIMP-CAKE)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-SHRIMP-CAKE' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'ทอดมันกุ้งแท้เกล็ดขนมปัง', 'เนื้อกุ้งสับล้วนคลุกเกล็ดขนมปังทอดฟูกรอบ เสิร์ฟคู่น้ำจิ้มบ๊วยเจี่ยหวานอมเปรี้ยว', c_snack, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-SHRIMP-CAKE', 'ทอดมันกุ้งแท้เกล็ดขนมปัง', '{"storefront_image_url":"/images/products/shrimp-cake.svg","description":"เนื้อกุ้งสับล้วนคลุกเกล็ดขนมปังทอดฟูกรอบ เสิร์ฟคู่น้ำจิ้มบ๊วยเจี่ยหวานอมเปรี้ยว"}'::jsonb, u_dish, 48.00, 99.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: ยำวุ้นเส้นโบราณหมูสับกุ้งสด (DINE-YUM-WOON-SEN)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-YUM-WOON-SEN' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'ยำวุ้นเส้นโบราณหมูสับกุ้งสด', 'วุ้นเส้นเหนียวนุ่ม ยำสไตล์โบราณใส่หมูสับรวน กุ้งสด ถั่วลิสงคั่ว และพริกขี้หนู', c_snack, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-YUM-WOON-SEN', 'ยำวุ้นเส้นโบราณหมูสับกุ้งสด', '{"storefront_image_url":"/images/products/yum-woon-sen.svg","description":"วุ้นเส้นเหนียวนุ่ม ยำสไตล์โบราณใส่หมูสับรวน กุ้งสด ถั่วลิสงคั่ว และพริกขี้หนู"}'::jsonb, u_dish, 45.00, 89.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: อเมริกาโน่เย็นคั่วกลาง (DINE-AMERICANO)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-AMERICANO' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'อเมริกาโน่เย็นคั่วกลาง', 'เมล็ดกาแฟอาราบิก้า 100% สกัดช็อตสด หอมโทนผลไม้และช็อกโกแลต', c_drink, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-AMERICANO', 'อเมริกาโน่เย็นคั่วกลาง', '{"storefront_image_url":"/images/products/iced-americano.svg","description":"เมล็ดกาแฟอาราบิก้า 100% สกัดช็อตสด หอมโทนผลไม้และช็อกโกแลต"}'::jsonb, u_glass, 22.00, 55.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: ลาเต้เย็นนมสดละมุน (DINE-LATTE)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-LATTE' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'ลาเต้เย็นนมสดละมุน', 'กาแฟเอสเพรสโซ่ผสมนมสดแท้ 100% หอมมันละมุน นุ่มนวล', c_drink, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-LATTE', 'ลาเต้เย็นนมสดละมุน', '{"storefront_image_url":"/images/products/iced-latte.svg","description":"กาแฟเอสเพรสโซ่ผสมนมสดแท้ 100% หอมมันละมุน นุ่มนวล"}'::jsonb, u_glass, 28.00, 65.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: ชาไทยเย็นโบราณสูตรปักษ์ใต้ (DINE-THAI-TEA)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-THAI-TEA' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'ชาไทยเย็นโบราณสูตรปักษ์ใต้', 'ใบชาแท้คัดเกรดต้มกรองสด หอมเข้มมัน ไม่หวานเลี่ยน รสดั้งเดิม', c_drink, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-THAI-TEA', 'ชาไทยเย็นโบราณสูตรปักษ์ใต้', '{"storefront_image_url":"/images/products/thai-tea.svg","description":"ใบชาแท้คัดเกรดต้มกรองสด หอมเข้มมัน ไม่หวานเลี่ยน รสดั้งเดิม"}'::jsonb, u_glass, 20.00, 50.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: มัทฉะลาเต้แท้จากอุจิ (DINE-MATCHA)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-MATCHA' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'มัทฉะลาเต้แท้จากอุจิ', 'ผงมัทฉะพรีเมียมจากเมืองอุจิ ประเทศญี่ปุ่น ตีสดแก้วต่อแก้ว หอมเข้มข้น', c_drink, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-MATCHA', 'มัทฉะลาเต้แท้จากอุจิ', '{"storefront_image_url":"/images/products/matcha-latte.svg","description":"ผงมัทฉะพรีเมียมจากเมืองอุจิ ประเทศญี่ปุ่น ตีสดแก้วต่อแก้ว หอมเข้มข้น"}'::jsonb, u_glass, 35.00, 75.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: อิตาเลียนโซดาสตรอว์เบอร์รีสด (DINE-SODA-STRAWBERRY)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-SODA-STRAWBERRY' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'อิตาเลียนโซดาสตรอว์เบอร์รีสด', 'ไซรัปสตรอว์เบอร์รีเข้มข้นผสมโซดาซ่าเย็นชื่นใจ ท็อปปิ้งใบสะระแหน่', c_drink, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-SODA-STRAWBERRY', 'อิตาเลียนโซดาสตรอว์เบอร์รีสด', '{"storefront_image_url":"/images/products/italian-soda.svg","description":"ไซรัปสตรอว์เบอร์รีเข้มข้นผสมโซดาซ่าเย็นชื่นใจ ท็อปปิ้งใบสะระแหน่"}'::jsonb, u_glass, 20.00, 50.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: บิงซูสตรอว์เบอร์รีเกล็ดหิมะ (DINE-BINGSU-STRAWBERRY)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-BINGSU-STRAWBERRY' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'บิงซูสตรอว์เบอร์รีเกล็ดหิมะ', 'น้ำแข็งไสเกล็ดหิมะรสนมสดนุ่มฟู ท็อปปิ้งสตรอว์เบอร์รีสดและซอสราดหวานฉ่ำ', c_dessert, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-BINGSU-STRAWBERRY', 'บิงซูสตรอว์เบอร์รีเกล็ดหิมะ', '{"storefront_image_url":"/images/products/bingsu.svg","description":"น้ำแข็งไสเกล็ดหิมะรสนมสดนุ่มฟู ท็อปปิ้งสตรอว์เบอร์รีสดและซอสราดหวานฉ่ำ"}'::jsonb, u_cup, 55.00, 129.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: บราวนี่ดาร์กช็อกโกแลตไอศกรีม (DINE-BROWNIE-ICECREAM)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-BROWNIE-ICECREAM' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'บราวนี่ดาร์กช็อกโกแลตไอศกรีม', 'บราวนี่เนื้อฟัดจ์ดาร์กช็อกโกแลต 70% อบอุ่นๆ เสิร์ฟคู่ไอศกรีมวานิลลาแท้', c_dessert, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-BROWNIE-ICECREAM', 'บราวนี่ดาร์กช็อกโกแลตไอศกรีม', '{"storefront_image_url":"/images/products/brownie.svg","description":"บราวนี่เนื้อฟัดจ์ดาร์กช็อกโกแลต 70% อบอุ่นๆ เสิร์ฟคู่ไอศกรีมวานิลลาแท้"}'::jsonb, u_dish, 38.00, 85.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

    -- Item: ฮันนี่โทสต์เนยสดคาราเมล (DINE-HONEY-TOAST)
    SELECT p.id INTO v_prod_id FROM products p
    JOIN product_variants v ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE p.organization_id = r_org.id AND v.sku = 'DINE-HONEY-TOAST' LIMIT 1;

    IF v_prod_id IS NULL THEN
      INSERT INTO products (organization_id, name, description, category_id, status, created_by, updated_by)
      VALUES (r_org.id, 'ฮันนี่โทสต์เนยสดคาราเมล', 'ขนมปังบริออชอบเนยสดแท้กรอบนอกนุ่มฉ่ำใน ราดน้ำผึ้งและไอศกรีมวานิลลา', c_dessert, 'ACTIVE', v_user_id, v_user_id)
      RETURNING id INTO v_prod_id;
    END IF;

    INSERT INTO product_variants (organization_id, product_id, sku, name, attributes, unit_id, cost_price, selling_price, currency, status)
    VALUES (r_org.id, v_prod_id, 'DINE-HONEY-TOAST', 'ฮันนี่โทสต์เนยสดคาราเมล', '{"storefront_image_url":"/images/products/honey-toast.svg","description":"ขนมปังบริออชอบเนยสดแท้กรอบนอกนุ่มฉ่ำใน ราดน้ำผึ้งและไอศกรีมวานิลลา"}'::jsonb, u_dish, 50.00, 119.00, 'THB', 'ACTIVE')
    ON CONFLICT (organization_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      attributes = EXCLUDED.attributes,
      unit_id = EXCLUDED.unit_id,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      status = 'ACTIVE'
    RETURNING id INTO v_var_id;

    INSERT INTO stock_balances (organization_id, branch_id, location_id, variant_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO quality_stock_balances (organization_id, branch_id, location_id, variant_id, batch_id, quantity, version)
    VALUES (r_org.id, v_branch_id, v_location_id, v_var_id, NULL, 100.000, 1)
    ON CONFLICT (organization_id, location_id, variant_id, batch_id) DO UPDATE SET
      quantity = 100.000,
      branch_id = EXCLUDED.branch_id;

    INSERT INTO storefront_products (organization_id, variant_id, published)
    VALUES (r_org.id, v_var_id, true)
    ON CONFLICT (organization_id, variant_id) DO UPDATE SET published = true;

  END LOOP;
END $$;
