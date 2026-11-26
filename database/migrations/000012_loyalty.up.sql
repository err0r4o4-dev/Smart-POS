BEGIN;
CREATE TABLE loyalty_programs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
 spend numeric(18,2) NOT NULL CHECK(spend>0),
 earn_points bigint NOT NULL CHECK(earn_points BETWEEN 0 AND 1000000),
 point_value numeric(18,2) NOT NULL CHECK(point_value>0),
 status text NOT NULL CHECK(status IN ('ACTIVE','SUSPENDED')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id)
);
CREATE UNIQUE INDEX loyalty_active_program ON loyalty_programs(organization_id) WHERE status='ACTIVE';
CREATE TABLE loyalty_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 customer_id uuid NOT NULL,
 program_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), UNIQUE(organization_id,customer_id),
 FOREIGN KEY(organization_id,customer_id) REFERENCES customers(organization_id,id),
 FOREIGN KEY(organization_id,program_id) REFERENCES loyalty_programs(organization_id,id)
);
CREATE TABLE loyalty_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 account_id uuid NOT NULL,
 branch_id uuid,
 kind text NOT NULL CHECK(kind IN ('EARN','REDEEM','EARN_REVERSAL','REDEEM_REVERSAL','ADJUST')),
 points bigint NOT NULL CHECK(points BETWEEN -1000000000000 AND 1000000000000),
 sale_id uuid,
 return_id uuid,
 operation_id uuid,
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 2000),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,account_id) REFERENCES loyalty_accounts(organization_id,id),
 FOREIGN KEY(organization_id,branch_id) REFERENCES branches(organization_id,id),
 FOREIGN KEY(organization_id,sale_id) REFERENCES sales(organization_id,id),
 FOREIGN KEY(organization_id,return_id) REFERENCES customer_returns(organization_id,id),
 FOREIGN KEY(organization_id,operation_id) REFERENCES inventory_operations(organization_id,id),
 CHECK((kind='ADJUST' AND sale_id IS NULL AND return_id IS NULL AND operation_id IS NOT NULL AND points<>0)
 OR (kind IN ('EARN','REDEEM') AND sale_id IS NOT NULL AND return_id IS NULL AND branch_id IS NOT NULL AND operation_id IS NULL)
 OR (kind IN ('EARN_REVERSAL','REDEEM_REVERSAL') AND sale_id IS NOT NULL AND return_id IS NOT NULL AND branch_id IS NOT NULL AND operation_id IS NULL)),
 CHECK((kind IN ('EARN','REDEEM_REVERSAL') AND points>=0) OR (kind IN ('REDEEM','EARN_REVERSAL') AND points<=0) OR kind='ADJUST')
);
CREATE UNIQUE INDEX loyalty_sale_once ON loyalty_ledger(organization_id,sale_id,kind) WHERE return_id IS NULL AND sale_id IS NOT NULL;
CREATE UNIQUE INDEX loyalty_return_once ON loyalty_ledger(organization_id,return_id,kind) WHERE return_id IS NOT NULL;
CREATE UNIQUE INDEX loyalty_adjust_once ON loyalty_ledger(organization_id,operation_id) WHERE kind='ADJUST';
CREATE INDEX loyalty_history ON loyalty_ledger(organization_id,account_id,created_at DESC,id);
CREATE INDEX loyalty_branch_history ON loyalty_ledger(organization_id,branch_id,created_at DESC,id);
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['loyalty_programs','loyalty_accounts','loyalty_ledger'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY loyalty_scope ON %I USING (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',table_name);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON loyalty_programs,loyalty_accounts TO smartpos_runtime;
GRANT SELECT,INSERT ON loyalty_ledger TO smartpos_runtime;
CREATE TRIGGER loyalty_ledger_immutable BEFORE UPDATE OR DELETE ON loyalty_ledger FOR EACH ROW EXECUTE FUNCTION pos_immutable();
CREATE FUNCTION loyalty_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.revision<>OLD.revision+1 OR NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id
 OR ROW(NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.created_by,OLD.created_at)
 OR (TG_TABLE_NAME='loyalty_accounts' AND (to_jsonb(NEW)-ARRAY['revision','status']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','status']))
 THEN RAISE EXCEPTION 'loyalty revision conflict' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER loyalty_program_revision BEFORE UPDATE ON loyalty_programs FOR EACH ROW EXECUTE FUNCTION loyalty_revision_guard();
CREATE TRIGGER loyalty_account_revision BEFORE UPDATE ON loyalty_accounts FOR EACH ROW EXECUTE FUNCTION loyalty_revision_guard();
CREATE FUNCTION loyalty_ledger_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE balance numeric; BEGIN
 PERFORM 1 FROM loyalty_accounts WHERE organization_id=NEW.organization_id AND id=NEW.account_id FOR UPDATE;
 IF NEW.sale_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sales sale JOIN loyalty_accounts account ON account.organization_id=sale.organization_id AND account.customer_id=sale.customer_id WHERE sale.organization_id=NEW.organization_id AND sale.id=NEW.sale_id AND sale.branch_id=NEW.branch_id AND account.id=NEW.account_id)
 THEN RAISE EXCEPTION 'loyalty sale scope mismatch' USING ERRCODE='23514'; END IF;
 IF NEW.return_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customer_returns WHERE organization_id=NEW.organization_id AND id=NEW.return_id AND original_sale_id=NEW.sale_id AND branch_id=NEW.branch_id)
 THEN RAISE EXCEPTION 'loyalty return scope mismatch' USING ERRCODE='23514'; END IF;
 SELECT COALESCE(sum(points),0) INTO balance FROM loyalty_ledger WHERE organization_id=NEW.organization_id AND account_id=NEW.account_id;
 IF NEW.kind IN ('REDEEM','ADJUST') AND NEW.points<0 AND balance+NEW.points<0
 THEN RAISE EXCEPTION 'insufficient loyalty points' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER loyalty_ledger_insert BEFORE INSERT ON loyalty_ledger FOR EACH ROW EXECUTE FUNCTION loyalty_ledger_guard();
REVOKE ALL ON FUNCTION loyalty_revision_guard(),loyalty_ledger_guard() FROM PUBLIC;
CREATE OR REPLACE FUNCTION pricing_sale_consistency() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.subtotal<>COALESCE((SELECT sum(gross_total) FROM sale_items WHERE organization_id=NEW.organization_id AND sale_id=NEW.id),0)
 OR NEW.discount_total<>COALESCE((SELECT sum(discount_total) FROM sale_items WHERE organization_id=NEW.organization_id AND sale_id=NEW.id),0)
 OR NEW.pricing_snapshot<>(SELECT pricing_snapshot FROM pos_checkouts WHERE organization_id=NEW.organization_id AND id=NEW.checkout_id)
 OR COALESCE((SELECT sum(discount) FROM promotion_redemptions WHERE organization_id=NEW.organization_id AND sale_id=NEW.id),0)<>COALESCE((SELECT sum((entry->>'discount')::numeric) FROM jsonb_array_elements(COALESCE(NEW.pricing_snapshot->'promotions','[]'::jsonb)) entry),0)
 OR (SELECT count(*) FROM promotion_redemptions WHERE organization_id=NEW.organization_id AND sale_id=NEW.id)<>jsonb_array_length(COALESCE(NEW.pricing_snapshot->'promotions','[]'::jsonb))
 OR NEW.discount_total<>COALESCE((SELECT sum(discount) FROM promotion_redemptions WHERE organization_id=NEW.organization_id AND sale_id=NEW.id),0)+COALESCE((SELECT amount FROM discount_approvals WHERE organization_id=NEW.organization_id AND id::text=NEW.pricing_snapshot->>'approval_id' AND status='CONSUMED'),0)+COALESCE((NEW.pricing_snapshot->'loyalty'->>'amount')::numeric,0)
 OR (NEW.pricing_snapshot ? 'approval_id' AND NOT EXISTS(SELECT 1 FROM discount_approvals approval JOIN pos_checkouts checkout ON checkout.organization_id=approval.organization_id AND checkout.id=NEW.checkout_id WHERE approval.organization_id=NEW.organization_id AND approval.id::text=NEW.pricing_snapshot->>'approval_id' AND approval.status='CONSUMED' AND approval.cart_id=NEW.cart_id AND approval.branch_id=NEW.branch_id AND approval.requested_by=NEW.cashier_id AND approval.cart_revision=checkout.cart_revision))
 THEN RAISE EXCEPTION 'pricing settlement mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION loyalty_checkout_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE reward jsonb; available numeric; BEGIN
 reward:=NEW.pricing_snapshot->'loyalty';
 IF reward IS NULL THEN RETURN NEW; END IF;
 PERFORM 1 FROM loyalty_accounts WHERE organization_id=NEW.organization_id AND id=(reward->>'account_id')::uuid FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM loyalty_accounts account JOIN loyalty_programs program ON program.organization_id=account.organization_id AND program.id=account.program_id WHERE account.organization_id=NEW.organization_id AND account.id=(reward->>'account_id')::uuid AND account.customer_id=NEW.customer_id AND account.status='ACTIVE' AND program.id=(reward->>'program_id')::uuid AND program.revision=(reward->>'program_revision')::bigint AND program.status='ACTIVE' AND program.point_value=(reward->>'point_value')::numeric)
 OR (reward->>'points')::bigint NOT BETWEEN 1 AND 1000000000000
 OR (reward->>'amount')::numeric<>(reward->>'points')::numeric*(reward->>'point_value')::numeric
 OR (NEW.pricing_snapshot->>'discount')::numeric<>(reward->>'amount')::numeric
 OR jsonb_array_length(NEW.pricing_snapshot->'promotions')<>0 OR NEW.pricing_snapshot ? 'approval_id'
 THEN RAISE EXCEPTION 'invalid loyalty checkout' USING ERRCODE='23514'; END IF;
 SELECT COALESCE((SELECT sum(points) FROM loyalty_ledger WHERE organization_id=NEW.organization_id AND account_id=(reward->>'account_id')::uuid),0)-COALESCE((SELECT sum((pricing_snapshot->'loyalty'->>'points')::numeric) FROM pos_checkouts WHERE organization_id=NEW.organization_id AND pricing_snapshot->'loyalty'->>'account_id'=reward->>'account_id' AND status NOT IN ('COMPLETED','CANCELLED','RESOLVED')),0) INTO available;
 IF available<(reward->>'points')::bigint THEN RAISE EXCEPTION 'loyalty reservation exceeds balance' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER loyalty_checkout_insert BEFORE INSERT ON pos_checkouts FOR EACH ROW EXECUTE FUNCTION loyalty_checkout_guard();
CREATE FUNCTION loyalty_sale_consistency() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE reward jsonb; BEGIN
 reward:=NEW.pricing_snapshot->'loyalty';
 IF reward IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM loyalty_ledger WHERE organization_id=NEW.organization_id AND sale_id=NEW.id AND kind='REDEEM' AND account_id=(reward->>'account_id')::uuid AND points=-(reward->>'points')::bigint AND snapshot=reward)
 OR NOT EXISTS(SELECT 1 FROM loyalty_ledger WHERE organization_id=NEW.organization_id AND sale_id=NEW.id AND kind='EARN' AND account_id=(reward->>'account_id')::uuid))
 THEN RAISE EXCEPTION 'loyalty sale posting mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER loyalty_sale_consistency AFTER INSERT ON sales DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION loyalty_sale_consistency();
REVOKE ALL ON FUNCTION loyalty_checkout_guard(),loyalty_sale_consistency() FROM PUBLIC;
COMMIT;
