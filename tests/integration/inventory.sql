BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version=7 AND NOT dirty) THEN RAISE EXCEPTION 'inventory schema missing'; END IF;
 IF has_table_privilege('smartpos_runtime','stock_balances','UPDATE') OR has_table_privilege('smartpos_runtime','stock_movements','UPDATE') OR has_table_privilege('smartpos_runtime','stock_movements','DELETE') THEN RAISE EXCEPTION 'unsafe inventory runtime grants'; END IF;
END $$;
INSERT INTO users(id,email,email_normalized,password_hash,display_name) VALUES('30000000-0000-4000-8000-000000000001','inventory-sql@example.test','inventory-sql@example.test','$argon2id$fixture','Inventory SQL');
INSERT INTO organizations(id,name,code) VALUES('30000000-0000-4000-8000-000000000010','Inventory A','INV-SQL-A'),('30000000-0000-4000-8000-000000000020','Inventory B','INV-SQL-B');
INSERT INTO organization_memberships(organization_id,user_id,role) VALUES('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000001','OWNER'),('30000000-0000-4000-8000-000000000020','30000000-0000-4000-8000-000000000001','OWNER');
INSERT INTO branches(id,organization_id,name,code) VALUES('30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000010','Branch A','A'),('30000000-0000-4000-8000-000000000021','30000000-0000-4000-8000-000000000020','Branch B','B');
SET CONSTRAINTS ALL IMMEDIATE;
SET LOCAL ROLE smartpos_runtime;
SELECT set_config('app.organization_id','30000000-0000-4000-8000-000000000010',true),set_config('app.user_id','30000000-0000-4000-8000-000000000001',true);
INSERT INTO units(id,organization_id,code,name,unit_type) VALUES('30000000-0000-4000-8000-000000000012','30000000-0000-4000-8000-000000000010','PCS','Pieces','COUNT');
INSERT INTO products(id,organization_id,name,created_by,updated_by) VALUES('30000000-0000-4000-8000-000000000013','30000000-0000-4000-8000-000000000010','Inventory item','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
INSERT INTO product_variants(id,organization_id,product_id,sku,name,unit_id,cost_price,selling_price,currency) VALUES('30000000-0000-4000-8000-000000000014','30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000013','INV-SQL','Default','30000000-0000-4000-8000-000000000012',1,2,'THB');
INSERT INTO stock_locations(id,organization_id,branch_id,code,name,type,created_by,updated_by) VALUES('30000000-0000-4000-8000-000000000015','30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000011','WH','Warehouse','WAREHOUSE','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
INSERT INTO inventory_operations(id,organization_id,actor_id,operation,idempotency_key,fingerprint) VALUES('30000000-0000-4000-8000-000000000016','30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000001','SQL','30000000-0000-4000-8000-000000000016',repeat('a',64));
INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by) VALUES('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000015','30000000-0000-4000-8000-000000000014','OPENING_BALANCE',10,'30000000-0000-4000-8000-000000000016','INITIAL','30000000-0000-4000-8000-000000000001');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM stock_balances WHERE quantity=10 AND version=1) THEN RAISE EXCEPTION 'balance not posted'; END IF;
 IF NOT EXISTS(SELECT 1 FROM stock_movements WHERE quantity_before=0 AND quantity_after=10) THEN RAISE EXCEPTION 'ledger invalid'; END IF;
 BEGIN UPDATE stock_balances SET quantity=100; RAISE EXCEPTION 'balance writable'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE stock_movements SET quantity_delta=100; RAISE EXCEPTION 'ledger writable'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM stock_movements; RAISE EXCEPTION 'ledger deletable'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO stock_locations(organization_id,branch_id,code,name,type,created_by,updated_by) VALUES('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000021','WRONG','Wrong branch','SHELF','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001'); RAISE EXCEPTION 'cross tenant FK accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;
SELECT set_config('app.organization_id','30000000-0000-4000-8000-000000000020',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM stock_balances) OR EXISTS(SELECT 1 FROM stock_movements) OR EXISTS(SELECT 1 FROM stock_locations) THEN RAISE EXCEPTION 'RLS leak'; END IF; END $$;
SELECT set_config('app.organization_id','30000000-0000-4000-8000-000000000010',true);
INSERT INTO inventory_operations(id,organization_id,actor_id,operation,idempotency_key,fingerprint) VALUES('30000000-0000-4000-8000-000000000017','30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000001','SQL','30000000-0000-4000-8000-000000000017',repeat('b',64));
DO $$ BEGIN
 BEGIN INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by) VALUES('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000015','30000000-0000-4000-8000-000000000014','ADJUSTMENT_OUT',-11,'30000000-0000-4000-8000-000000000017','TEST','30000000-0000-4000-8000-000000000001'); RAISE EXCEPTION 'negative allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
 IF (SELECT quantity FROM stock_balances)<>10 OR (SELECT count(*) FROM stock_movements)<>1 THEN RAISE EXCEPTION 'failed mutation leaked'; END IF;
 BEGIN INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by) VALUES('30000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000015','30000000-0000-4000-8000-000000000014','ADJUSTMENT_IN',0.1,'30000000-0000-4000-8000-000000000017','TEST','30000000-0000-4000-8000-000000000001'); RAISE EXCEPTION 'fractional count allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM stock_balances balance LEFT JOIN (SELECT organization_id,location_id,variant_id,sum(quantity_delta) AS total FROM stock_movements GROUP BY organization_id,location_id,variant_id) ledger USING(organization_id,location_id,variant_id) WHERE balance.quantity<>COALESCE(ledger.total,0)) THEN RAISE EXCEPTION 'ledger reconciliation failed'; END IF;
END $$;
ROLLBACK;
