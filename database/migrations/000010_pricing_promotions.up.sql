BEGIN;
CREATE TABLE price_lists (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), branch_id uuid,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200), priority integer NOT NULL CHECK(priority BETWEEN -10000 AND 10000),
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE','PAUSED')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), starts_at timestamptz, ends_at timestamptz,
 items jsonb NOT NULL CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items) BETWEEN 1 AND 100),
 created_by uuid NOT NULL REFERENCES users(id), approved_by uuid REFERENCES users(id), approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), FOREIGN KEY(organization_id,branch_id) REFERENCES branches(organization_id,id),
 CHECK(ends_at IS NULL OR starts_at IS NULL OR ends_at>starts_at), CHECK((approved_by IS NULL)=(approved_at IS NULL)),
 CHECK(status NOT IN ('APPROVED','ACTIVE','PAUSED') OR approved_by IS NOT NULL)
);
CREATE TABLE promotions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), branch_id uuid,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200), priority integer NOT NULL CHECK(priority BETWEEN -10000 AND 10000),
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE','PAUSED')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), starts_at timestamptz, ends_at timestamptz,
 rule jsonb NOT NULL CHECK(jsonb_typeof(rule)='object'), usage_limit bigint NOT NULL CHECK(usage_limit>=0), used bigint NOT NULL DEFAULT 0 CHECK(used>=0 AND (usage_limit=0 OR used<=usage_limit)),
 created_by uuid NOT NULL REFERENCES users(id), approved_by uuid REFERENCES users(id), approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), FOREIGN KEY(organization_id,branch_id) REFERENCES branches(organization_id,id),
 CHECK(ends_at IS NULL OR starts_at IS NULL OR ends_at>starts_at), CHECK((approved_by IS NULL)=(approved_at IS NULL)),
 CHECK(status NOT IN ('APPROVED','ACTIVE','PAUSED') OR approved_by IS NOT NULL)
);
CREATE INDEX pricing_effective ON price_lists(organization_id,branch_id,status,priority DESC,id);
CREATE INDEX promotions_effective ON promotions(organization_id,branch_id,status,priority DESC,id);
CREATE TABLE discount_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), branch_id uuid NOT NULL, cart_id uuid NOT NULL,
 cart_revision bigint NOT NULL CHECK(cart_revision>0), pricing_revision text NOT NULL CHECK(length(pricing_revision)=64),
 amount numeric(18,2) NOT NULL CHECK(amount>0), reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','CONSUMED')),
 requested_by uuid NOT NULL REFERENCES users(id), approved_by uuid REFERENCES users(id), approved_at timestamptz,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes', revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 idempotency_key uuid NOT NULL, fingerprint text NOT NULL CHECK(length(fingerprint)=64), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), UNIQUE(organization_id,requested_by,idempotency_key),
 FOREIGN KEY(organization_id,branch_id) REFERENCES branches(organization_id,id), FOREIGN KEY(organization_id,cart_id) REFERENCES pos_carts(organization_id,id),
 CHECK((approved_by IS NULL)=(approved_at IS NULL)), CHECK(status NOT IN ('APPROVED','CONSUMED') OR approved_by IS NOT NULL)
);
CREATE INDEX discount_approval_queue ON discount_approvals(organization_id,branch_id,status,created_at DESC);
ALTER TABLE pos_checkouts ADD COLUMN pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pos_carts ADD COLUMN pricing_revision text NOT NULL DEFAULT '';
ALTER TABLE sales ADD COLUMN pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sale_items ADD COLUMN gross_total numeric(18,2) GENERATED ALWAYS AS (round(quantity*unit_price,2)) STORED, ADD COLUMN discount_total numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE sale_items DROP CONSTRAINT sale_items_check;
ALTER TABLE sale_items ADD CHECK(discount_total>=0 AND discount_total<=gross_total), ADD CHECK(line_total=gross_total-discount_total);
ALTER TABLE sales DROP CONSTRAINT sales_discount_total_check, DROP CONSTRAINT sales_check, DROP CONSTRAINT sales_subtotal_check;
ALTER TABLE sales ADD CHECK(subtotal>=0), ADD CHECK(discount_total>=0 AND discount_total<=subtotal), ADD CHECK(grand_total=subtotal-discount_total);
ALTER TABLE pos_checkouts DROP CONSTRAINT pos_checkouts_total_check, DROP CONSTRAINT pos_checkouts_method_check;
ALTER TABLE pos_checkouts ADD CHECK(total>=0), ADD CHECK(method IN ('CASH','QR_MANUAL','BANK_TRANSFER_MANUAL','EXCHANGE_CREDIT','NONE')), ADD CHECK((method='NONE')=(total=0)), ADD CHECK(method<>'NONE' OR (received=0 AND change=0 AND credit_amount=0));
DO $$ DECLARE constraint_name text; BEGIN
 SELECT conname INTO constraint_name FROM pg_constraint WHERE conrelid='sale_adjustments'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%kind <> %EXCHANGE%replacement_total > %';
 IF constraint_name IS NULL THEN RAISE EXCEPTION 'exchange replacement guard missing'; END IF;
 EXECUTE format('ALTER TABLE sale_adjustments DROP CONSTRAINT %I',constraint_name);
END $$;
ALTER TABLE sale_adjustments ADD CHECK(kind<>'EXCHANGE' OR (terminal_id IS NOT NULL AND replacement_total>=0 AND jsonb_array_length(replacement_items)>0));
ALTER TABLE sale_payments DROP CONSTRAINT sale_payments_method_check, DROP CONSTRAINT sale_payments_check3;
ALTER TABLE sale_payments ADD CHECK(method IN ('CASH','QR_MANUAL','BANK_TRANSFER_MANUAL','EXCHANGE_CREDIT','NONE')), ADD CHECK(amount>0 OR (method='EXCHANGE_CREDIT' AND credit_amount>0 AND received=0 AND change=0) OR (method='NONE' AND amount=0 AND credit_amount=0 AND received=0 AND change=0));
CREATE TABLE promotion_redemptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, promotion_id uuid NOT NULL, sale_id uuid NOT NULL,
 promotion_revision bigint NOT NULL, discount numeric(18,2) NOT NULL CHECK(discount>0), snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,promotion_id,sale_id), FOREIGN KEY(organization_id,promotion_id) REFERENCES promotions(organization_id,id), FOREIGN KEY(organization_id,sale_id) REFERENCES sales(organization_id,id)
);
CREATE INDEX redemption_sale ON promotion_redemptions(organization_id,sale_id);
CREATE UNIQUE INDEX sale_manual_approval_once ON sales(organization_id,(pricing_snapshot->>'approval_id')) WHERE pricing_snapshot ? 'approval_id';
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['price_lists','promotions','discount_approvals','promotion_redemptions'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY pricing_scope ON %I USING (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',table_name);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON price_lists,promotions,discount_approvals TO smartpos_runtime;
GRANT SELECT,INSERT ON promotion_redemptions TO smartpos_runtime;
CREATE FUNCTION pricing_definition_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
	IF TG_TABLE_NAME='promotions' THEN
	 IF NEW.used<>OLD.used AND (NEW.used<>OLD.used+1 OR (to_jsonb(NEW)-'used') IS DISTINCT FROM (to_jsonb(OLD)-'used')) THEN RAISE EXCEPTION 'promotion usage is redemption-only' USING ERRCODE='23514'; END IF;
	END IF;
 IF TG_OP='UPDATE' AND (ROW(NEW.id,NEW.organization_id,NEW.branch_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.organization_id,OLD.branch_id,OLD.created_by,OLD.created_at)
 OR (NEW.revision<>OLD.revision+1 AND NOT (TG_TABLE_NAME='promotions' AND (to_jsonb(NEW)-'used')=(to_jsonb(OLD)-'used')))) THEN RAISE EXCEPTION 'pricing revision mismatch' USING ERRCODE='23514'; END IF;
 IF OLD.status<>'DRAFT' AND (to_jsonb(NEW)-ARRAY['revision','status','approved_by','approved_at','used']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','status','approved_by','approved_at','used']) THEN RAISE EXCEPTION 'approved pricing definition immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER price_list_guard BEFORE UPDATE ON price_lists FOR EACH ROW EXECUTE FUNCTION pricing_definition_guard();
CREATE TRIGGER promotion_guard BEFORE UPDATE ON promotions FOR EACH ROW EXECUTE FUNCTION pricing_definition_guard();
CREATE FUNCTION pricing_redemption_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM sales sale JOIN pos_checkouts checkout ON checkout.organization_id=sale.organization_id AND checkout.id=sale.checkout_id WHERE sale.organization_id=NEW.organization_id AND sale.id=NEW.sale_id AND checkout.status IN ('CONFIRMED','RECONCILIATION_REQUIRED') AND EXISTS(SELECT 1 FROM jsonb_array_elements(sale.pricing_snapshot->'promotions') entry WHERE entry->>'id'=NEW.promotion_id::text AND (entry->>'revision')::bigint=NEW.promotion_revision AND (entry->>'discount')::numeric=NEW.discount AND entry=NEW.snapshot)) THEN RAISE EXCEPTION 'invalid redemption snapshot' USING ERRCODE='23514'; END IF;
 UPDATE promotions SET used=used+1 WHERE organization_id=NEW.organization_id AND id=NEW.promotion_id AND status='ACTIVE' AND revision=NEW.promotion_revision AND (usage_limit=0 OR used<usage_limit);
 IF NOT FOUND THEN RAISE EXCEPTION 'promotion exhausted or stale' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER redemption_usage BEFORE INSERT ON promotion_redemptions FOR EACH ROW EXECUTE FUNCTION pricing_redemption_guard();
CREATE FUNCTION pricing_sale_consistency() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.subtotal<>COALESCE((SELECT sum(gross_total) FROM sale_items WHERE organization_id=NEW.organization_id AND sale_id=NEW.id),0)
 OR NEW.discount_total<>COALESCE((SELECT sum(discount_total) FROM sale_items WHERE organization_id=NEW.organization_id AND sale_id=NEW.id),0)
 OR NEW.pricing_snapshot<>(SELECT pricing_snapshot FROM pos_checkouts WHERE organization_id=NEW.organization_id AND id=NEW.checkout_id)
 OR COALESCE((SELECT sum(discount) FROM promotion_redemptions WHERE organization_id=NEW.organization_id AND sale_id=NEW.id),0)<>COALESCE((SELECT sum((entry->>'discount')::numeric) FROM jsonb_array_elements(COALESCE(NEW.pricing_snapshot->'promotions','[]'::jsonb)) entry),0)
 OR (SELECT count(*) FROM promotion_redemptions WHERE organization_id=NEW.organization_id AND sale_id=NEW.id)<>jsonb_array_length(COALESCE(NEW.pricing_snapshot->'promotions','[]'::jsonb))
 OR NEW.discount_total<>COALESCE((SELECT sum(discount) FROM promotion_redemptions WHERE organization_id=NEW.organization_id AND sale_id=NEW.id),0)+COALESCE((SELECT amount FROM discount_approvals WHERE organization_id=NEW.organization_id AND id::text=NEW.pricing_snapshot->>'approval_id' AND status='CONSUMED'),0)
 OR (NEW.pricing_snapshot ? 'approval_id' AND NOT EXISTS(SELECT 1 FROM discount_approvals approval JOIN pos_checkouts checkout ON checkout.organization_id=approval.organization_id AND checkout.id=NEW.checkout_id WHERE approval.organization_id=NEW.organization_id AND approval.id::text=NEW.pricing_snapshot->>'approval_id' AND approval.status='CONSUMED' AND approval.cart_id=NEW.cart_id AND approval.branch_id=NEW.branch_id AND approval.requested_by=NEW.cashier_id AND approval.cart_revision=checkout.cart_revision))
 THEN RAISE EXCEPTION 'pricing settlement mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER pricing_sale_consistency AFTER INSERT ON sales DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pricing_sale_consistency();
CREATE FUNCTION discount_approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status IN ('REJECTED','CONSUMED') OR NEW.revision<>OLD.revision+1 OR (to_jsonb(NEW)-ARRAY['revision','status','approved_by','approved_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','status','approved_by','approved_at'])
 OR NOT ((OLD.status='PENDING' AND NEW.status IN ('APPROVED','REJECTED')) OR (OLD.status='APPROVED' AND NEW.status='CONSUMED' AND NEW.approved_by=OLD.approved_by AND NEW.approved_at=OLD.approved_at))
 THEN RAISE EXCEPTION 'discount approval immutable' USING ERRCODE='23514'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER discount_approval_guard BEFORE UPDATE ON discount_approvals FOR EACH ROW EXECUTE FUNCTION discount_approval_guard();
CREATE FUNCTION pricing_usage_consistency() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.used<>(SELECT count(*) FROM promotion_redemptions WHERE organization_id=NEW.organization_id AND promotion_id=NEW.id) THEN RAISE EXCEPTION 'usage does not reconcile with redemptions' USING ERRCODE='23514'; END IF;RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER pricing_usage_consistency AFTER UPDATE ON promotions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pricing_usage_consistency();
CREATE FUNCTION pricing_references_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE entry jsonb; identifiers jsonb; BEGIN
 IF TG_TABLE_NAME='price_lists' THEN
  IF (SELECT count(DISTINCT item->>'variant_id') FROM jsonb_array_elements(NEW.items) item)<>jsonb_array_length(NEW.items) THEN RAISE EXCEPTION 'duplicate price item' USING ERRCODE='23514'; END IF;
  FOR entry IN SELECT * FROM jsonb_array_elements(NEW.items) LOOP
   IF jsonb_typeof(entry)<>'object' OR (entry-ARRAY['variant_id','unit_price'])<>'{}'::jsonb OR NOT (entry ?& ARRAY['variant_id','unit_price']) OR jsonb_typeof(entry->'unit_price')<>'string' OR (entry->>'unit_price') !~ '^[0-9]{1,16}(\.[0-9]{1,2})?$' OR (entry->>'unit_price')::numeric<=0 OR NOT EXISTS(SELECT 1 FROM product_variants WHERE organization_id=NEW.organization_id AND id=(entry->>'variant_id')::uuid) THEN RAISE EXCEPTION 'invalid tenant price item' USING ERRCODE='23514'; END IF;
  END LOOP;
 ELSE
  IF (NEW.rule-ARRAY['type','policy','basis_points','amount','minimum_spend','buy','get','variant_ids','category_ids','usage_limit'])<>'{}'::jsonb OR NOT (NEW.rule ?& ARRAY['type','policy','basis_points','amount','minimum_spend','buy','get','usage_limit'])
   OR NEW.rule->>'type' NOT IN ('PERCENTAGE','FIXED','BOGO','MINIMUM_SPEND') OR NEW.rule->>'policy' NOT IN ('EXCLUSIVE','STACKABLE','BEST_DISCOUNT_ONLY') OR (NEW.rule->>'usage_limit')::bigint<>NEW.usage_limit
   OR (NEW.rule->>'basis_points')::bigint NOT BETWEEN 0 AND 10000 OR (NEW.rule->>'amount') !~ '^[0-9]{1,16}(\.[0-9]{1,2})?$' OR (NEW.rule->>'minimum_spend') !~ '^[0-9]{1,16}(\.[0-9]{1,2})?$'
   OR (NEW.rule->>'type'='PERCENTAGE' AND ((NEW.rule->>'basis_points')::bigint=0 OR (NEW.rule->>'amount')::numeric<>0 OR (NEW.rule->>'buy')::bigint<>0 OR (NEW.rule->>'get')::bigint<>0))
   OR (NEW.rule->>'type' IN ('FIXED','MINIMUM_SPEND') AND ((NEW.rule->>'amount')::numeric<=0 OR (NEW.rule->>'basis_points')::bigint<>0 OR (NEW.rule->>'buy')::bigint<>0 OR (NEW.rule->>'get')::bigint<>0))
   OR (NEW.rule->>'type'='MINIMUM_SPEND' AND (NEW.rule->>'minimum_spend')::numeric<=0)
   OR (NEW.rule->>'type'='BOGO' AND ((NEW.rule->>'buy')::bigint NOT BETWEEN 1 AND 1000 OR (NEW.rule->>'get')::bigint NOT BETWEEN 1 AND 1000 OR (NEW.rule->>'amount')::numeric<>0 OR (NEW.rule->>'basis_points')::bigint<>0)) THEN RAISE EXCEPTION 'invalid promotion rule' USING ERRCODE='23514'; END IF;
  FOR identifiers IN SELECT NEW.rule->'variant_ids' UNION ALL SELECT NEW.rule->'category_ids' LOOP
   IF identifiers<>'null'::jsonb AND (jsonb_typeof(identifiers)<>'array' OR jsonb_array_length(identifiers)>100) THEN RAISE EXCEPTION 'invalid eligibility array' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOR entry IN SELECT * FROM jsonb_array_elements(CASE WHEN NEW.rule->'variant_ids'='null'::jsonb THEN '[]'::jsonb ELSE COALESCE(NEW.rule->'variant_ids','[]'::jsonb) END) LOOP
   IF NOT EXISTS(SELECT 1 FROM product_variants WHERE organization_id=NEW.organization_id AND id=(entry#>>'{}')::uuid) THEN RAISE EXCEPTION 'cross tenant promotion variant' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOR entry IN SELECT * FROM jsonb_array_elements(CASE WHEN NEW.rule->'category_ids'='null'::jsonb THEN '[]'::jsonb ELSE COALESCE(NEW.rule->'category_ids','[]'::jsonb) END) LOOP
   IF NOT EXISTS(SELECT 1 FROM categories WHERE organization_id=NEW.organization_id AND id=(entry#>>'{}')::uuid) THEN RAISE EXCEPTION 'cross tenant promotion category' USING ERRCODE='23514'; END IF;
  END LOOP;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER price_list_references BEFORE INSERT OR UPDATE ON price_lists FOR EACH ROW EXECUTE FUNCTION pricing_references_guard();
CREATE TRIGGER promotion_references BEFORE INSERT OR UPDATE ON promotions FOR EACH ROW EXECUTE FUNCTION pricing_references_guard();
REVOKE ALL ON FUNCTION pricing_usage_consistency(),pricing_references_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION pricing_definition_guard(),pricing_redemption_guard(),pricing_sale_consistency(),discount_approval_guard() FROM PUBLIC;
COMMIT;
