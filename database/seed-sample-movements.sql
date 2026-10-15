-- SmartPOS Sample Stock Movements Seed Script
-- สำหรับสร้างข้อมูลตัวอย่างประวัติการเคลื่อนไหวของสต็อก (Stock Movements History)
-- รองรับการแสดงผลในหน้า /manage/inventory/movements ครบถ้วนและสัมพันธ์กับยอดสต็อกปัจจุบัน

DO $$
DECLARE
  v_org_id uuid;
  v_branch_id uuid;
  v_user_id uuid;

  -- Location IDs
  loc_wh uuid;
  loc_floor uuid;

  -- Variant IDs
  var_coke_can uuid;
  var_coke_pet uuid;
  var_lays_44 uuid;
  var_lays_73 uuid;
  var_mama_bag uuid;
  var_mama_cup uuid;
  var_ichi_pet uuid;
  var_dutch_box uuid;
  var_nescafe uuid;
  var_oishi uuid;

  -- Batch IDs
  b_coke uuid;
  b_lays uuid;
  b_dutch uuid;

  -- Operations
  op_opening uuid := gen_random_uuid();
  op_transfer uuid := gen_random_uuid();
  op_adjust uuid := gen_random_uuid();
BEGIN
  -- 1. ค้นหาองค์กรและสาขา
  SELECT id INTO v_org_id FROM organizations ORDER BY created_at ASC LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบข้อมูล organization ในระบบ กรุณาเริ่มระบบหรือสร้างร้านค้าก่อน';
  END IF;

  SELECT id INTO v_branch_id FROM branches WHERE organization_id = v_org_id ORDER BY created_at ASC LIMIT 1;
  SELECT id INTO v_user_id FROM users ORDER BY created_at ASC LIMIT 1;

  -- 2. ค้นหาสถานที่เก็บ
  SELECT id INTO loc_wh FROM stock_locations WHERE organization_id = v_org_id AND code = 'LOC-WH-MAIN';
  SELECT id INTO loc_floor FROM stock_locations WHERE organization_id = v_org_id AND code = 'LOC-SALES-FLOOR';

  IF loc_wh IS NULL OR loc_floor IS NULL THEN
    RAISE EXCEPTION 'ไม่พบ LOC-WH-MAIN หรือ LOC-SALES-FLOOR กรุณารัน seed-sample-products.sql ก่อน';
  END IF;

  -- 3. ค้นหา Variants จาก SKU
  SELECT id INTO var_coke_can FROM product_variants WHERE organization_id = v_org_id AND sku = 'COKE-CAN-325';
  SELECT id INTO var_coke_pet FROM product_variants WHERE organization_id = v_org_id AND sku = 'COKE-PET-500';
  SELECT id INTO var_lays_44 FROM product_variants WHERE organization_id = v_org_id AND sku = 'LAYS-CLA-44G';
  SELECT id INTO var_lays_73 FROM product_variants WHERE organization_id = v_org_id AND sku = 'LAYS-CLA-73G';
  SELECT id INTO var_mama_bag FROM product_variants WHERE organization_id = v_org_id AND sku = 'MAMA-TYK-BAG';
  SELECT id INTO var_mama_cup FROM product_variants WHERE organization_id = v_org_id AND sku = 'MAMA-TYK-CUP';
  SELECT id INTO var_ichi_pet FROM product_variants WHERE organization_id = v_org_id AND sku = 'ICHI-HON-420';
  SELECT id INTO var_dutch_box FROM product_variants WHERE organization_id = v_org_id AND sku = 'DUTCH-4IN1-180';
  SELECT id INTO var_nescafe FROM product_variants WHERE organization_id = v_org_id AND sku = 'NES-RICHA-27P';
  SELECT id INTO var_oishi FROM product_variants WHERE organization_id = v_org_id AND sku = 'OISHI-GEN-380';

  -- 4. ค้นหา Batches
  SELECT id INTO b_coke FROM product_batches WHERE organization_id = v_org_id AND lot_number = 'LOT-COKE-2608';
  SELECT id INTO b_lays FROM product_batches WHERE organization_id = v_org_id AND lot_number = 'LOT-LAYS-2609';
  SELECT id INTO b_dutch FROM product_batches WHERE organization_id = v_org_id AND lot_number = 'LOT-DUTCH-EXP-SOON';

  -- 5. สร้าง Inventory Operations
  INSERT INTO inventory_operations (id, organization_id, actor_id, operation, idempotency_key, fingerprint, result, created_at)
  VALUES
    (op_opening, v_org_id, v_user_id, 'OPENING_BALANCE', gen_random_uuid(), repeat('1', 64), '{"status":"POSTED"}'::jsonb, now() - interval '7 days'),
    (op_transfer, v_org_id, v_user_id, 'TRANSFER', gen_random_uuid(), repeat('2', 64), '{"status":"POSTED"}'::jsonb, now() - interval '4 days'),
    (op_adjust, v_org_id, v_user_id, 'ADJUSTMENT', gen_random_uuid(), repeat('3', 64), '{"status":"POSTED"}'::jsonb, now() - interval '1 days')
  ON CONFLICT (organization_id, id) DO NOTHING;

  -- 6. ปิด Triggers บน stock_movements ชั่วคราวเพื่อนำเข้าข้อมูลประวัติ
  ALTER TABLE stock_movements DISABLE TRIGGER ALL;

  DELETE FROM stock_movements WHERE organization_id = v_org_id;

  -- 7. บันทึกประวัติการเคลื่อนไหวสต็อก (Stock Movements)
  -- 7.1 ยอดเปิดต้นงวด (Opening Balance) 7 วันก่อน
  IF var_coke_can IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, batch_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES (v_org_id, v_branch_id, loc_wh, var_coke_can, b_coke, 'OPENING_BALANCE', 150.000, 0.000, 150.000, op_opening, 'ยอดเปิดรอบต้นงวด / Opening Stock', v_user_id, now() - interval '7 days');
  END IF;

  IF var_coke_pet IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES (v_org_id, v_branch_id, loc_wh, var_coke_pet, 'OPENING_BALANCE', 104.000, 0.000, 104.000, op_opening, 'ยอดเปิดรอบต้นงวด / Opening Stock', v_user_id, now() - interval '7 days');
  END IF;

  IF var_lays_44 IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, batch_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES (v_org_id, v_branch_id, loc_wh, var_lays_44, b_lays, 'OPENING_BALANCE', 115.000, 0.000, 115.000, op_opening, 'ยอดเปิดรอบสินค้าล็อตใหม่', v_user_id, now() - interval '6 days');
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
    VALUES (v_org_id, v_branch_id, loc_wh, var_dutch_box, b_dutch, 'OPENING_BALANCE', 84.000, 0.000, 84.000, op_opening, 'ยอดเปิดรอบสินค้าล็อตใกล้หมดอายุ', v_user_id, now() - interval '5 days');
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
      (v_org_id, v_branch_id, loc_wh, var_coke_can, b_coke, 'TRANSFER_OUT', -30.000, 150.000, 120.000, op_transfer, 'เติมสต็อกพื้นที่ขายหน้าร้าน', v_user_id, now() - interval '4 days' - interval '1 hour'),
      (v_org_id, v_branch_id, loc_floor, var_coke_can, b_coke, 'TRANSFER_IN', 30.000, 0.000, 30.000, op_transfer, 'รับเข้าพื้นที่ขายหน้าร้าน', v_user_id, now() - interval '4 days');
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
      (v_org_id, v_branch_id, loc_wh, var_lays_44, b_lays, 'TRANSFER_OUT', -25.000, 115.000, 90.000, op_transfer, 'ย้ายไปชั้นวางขนมขบเคี้ยว', v_user_id, now() - interval '3 days' - interval '1 hour'),
      (v_org_id, v_branch_id, loc_floor, var_lays_44, b_lays, 'TRANSFER_IN', 25.000, 0.000, 25.000, op_transfer, 'รับเข้าพื้นที่ขายหน้าร้าน', v_user_id, now() - interval '3 days');
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
      (v_org_id, v_branch_id, loc_wh, var_dutch_box, b_dutch, 'TRANSFER_OUT', -24.000, 84.000, 60.000, op_transfer, 'เติมตู้แช่นมเปรี้ยวหน้าร้าน', v_user_id, now() - interval '2 days' - interval '1 hour'),
      (v_org_id, v_branch_id, loc_floor, var_dutch_box, b_dutch, 'TRANSFER_IN', 24.000, 0.000, 24.000, op_transfer, 'รับเข้าพื้นที่ขายหน้าร้าน', v_user_id, now() - interval '2 days');
  END IF;

  -- 7.3 ปรับปรุงยอดสินค้า (Stock Adjustment) 1 วันก่อน
  IF var_coke_can IS NOT NULL THEN
    INSERT INTO stock_movements (organization_id, branch_id, location_id, variant_id, batch_id, movement_type, quantity_delta, quantity_before, quantity_after, operation_id, reason_code, performed_by, created_at)
    VALUES
      (v_org_id, v_branch_id, loc_wh, var_coke_can, b_coke, 'ADJUSTMENT_IN', 10.000, 120.000, 130.000, op_adjust, 'ตรวจนับพบสินค้าเกินในคลัง', v_user_id, now() - interval '1 day' - interval '2 hours'),
      (v_org_id, v_branch_id, loc_wh, var_coke_can, b_coke, 'ADJUSTMENT_OUT', -10.000, 130.000, 120.000, op_adjust, 'ปรับยอดแก้ไขความคลาดเคลื่อน', v_user_id, now() - interval '1 day');
  END IF;

  -- 8. เปิด Triggers กลับคืนมาตามเดิม
  ALTER TABLE stock_movements ENABLE TRIGGER ALL;

  RAISE NOTICE 'สร้างประวัติการเคลื่อนไหวสต็อกตัวอย่างเรียบร้อยแล้วสำหรับ organization %', v_org_id;
END $$;
