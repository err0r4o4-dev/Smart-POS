BEGIN;

ALTER TABLE online_payment_observations ADD UNIQUE(organization_id,order_id,id);
CREATE TABLE online_payment_reconciliations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 order_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 idempotency_key uuid NOT NULL,
 request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
 action text NOT NULL CHECK(action IN ('VERIFY_SESSION','FULFILLMENT_REVIEW')),
 reason_code text NOT NULL,
 session_id text NOT NULL CHECK(session_id ~ '^cs_test_[A-Za-z0-9]{1,220}$'),
 observation_id uuid,
 payment_state text NOT NULL CHECK(payment_state IN ('OPEN','PROCESSING','PAID','EXPIRED')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,actor_id,idempotency_key),
 FOREIGN KEY(organization_id,actor_id) REFERENCES organization_memberships(organization_id,user_id),
 FOREIGN KEY(organization_id,order_id,session_id) REFERENCES online_payment_attempts(organization_id,order_id,session_id),
 FOREIGN KEY(organization_id,order_id,observation_id) REFERENCES online_payment_observations(organization_id,order_id,id),
 CHECK((action='VERIFY_SESSION' AND reason_code='PROVIDER_LOOKUP' AND observation_id IS NOT NULL)
  OR (action='FULFILLMENT_REVIEW' AND reason_code IN ('PRICE_CHANGED','QUALITY_BLOCKED','STOCK_UNAVAILABLE','SOURCE_UNAVAILABLE','OTHER_FULFILLMENT_BLOCKED') AND observation_id IS NULL AND payment_state='PAID'))
);
CREATE INDEX online_payment_review_order ON online_payment_reconciliations(organization_id,order_id,created_at,id);
ALTER TABLE online_payment_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_payment_reconciliations FORCE ROW LEVEL SECURITY;
CREATE POLICY online_payment_scope ON online_payment_reconciliations USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
GRANT SELECT,INSERT ON online_payment_reconciliations TO smartpos_runtime;

CREATE FUNCTION online_payment_reconciliation_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE attempt public.online_payment_attempts; doc public.online_orders;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'payment reconciliation is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.organization_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid
 OR NEW.actor_id IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid THEN
  RAISE EXCEPTION 'payment reconciliation context mismatch' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 SELECT * INTO doc FROM public.online_orders WHERE organization_id=NEW.organization_id AND id=NEW.order_id;
 SELECT * INTO attempt FROM public.online_payment_attempts WHERE organization_id=NEW.organization_id AND order_id=NEW.order_id;
 IF NOT EXISTS(SELECT 1 FROM public.organization_memberships member WHERE member.organization_id=NEW.organization_id AND member.user_id=NEW.actor_id AND member.status='ACTIVE'
  AND (member.role='OWNER' OR member.role='MANAGER' AND EXISTS(SELECT 1 FROM public.branch_memberships assignment JOIN public.branches branch ON branch.organization_id=assignment.organization_id AND branch.id=assignment.branch_id
   WHERE assignment.organization_id=member.organization_id AND assignment.membership_id=member.id AND assignment.branch_id=doc.branch_id AND branch.status='ACTIVE'))) THEN
  RAISE EXCEPTION 'payment reconciliation requires management scope' USING ERRCODE='42501';
 END IF;
 IF NEW.session_id IS DISTINCT FROM attempt.session_id OR NEW.payment_state IS DISTINCT FROM attempt.state
 OR (NEW.action='VERIFY_SESSION' AND NOT EXISTS(SELECT 1 FROM public.online_payment_observations observation
  WHERE observation.organization_id=NEW.organization_id AND observation.order_id=NEW.order_id AND observation.id=NEW.observation_id AND observation.source='RETRIEVE' AND observation.session_id=NEW.session_id))
 OR (NEW.action='FULFILLMENT_REVIEW' AND (attempt.state IS DISTINCT FROM 'PAID' OR doc.status='COMPLETED')) THEN
  RAISE EXCEPTION 'payment reconciliation evidence mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER online_payment_reconciliation BEFORE INSERT OR UPDATE OR DELETE ON online_payment_reconciliations FOR EACH ROW EXECUTE FUNCTION online_payment_reconciliation_guard();
REVOKE ALL ON FUNCTION online_payment_reconciliation_guard() FROM PUBLIC;

CREATE FUNCTION online_payment_review_settlement_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.prepaid_order_id IS NULL THEN RETURN NEW; END IF;
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 IF NEW.prepaid_order_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.online_payment_reconciliations
  WHERE organization_id=NEW.organization_id AND order_id=NEW.prepaid_order_id AND action='FULFILLMENT_REVIEW') THEN
  RAISE EXCEPTION 'prepaid fulfillment requires operational resolution' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER online_payment_review_settlement BEFORE INSERT OR UPDATE ON pos_checkouts FOR EACH ROW EXECUTE FUNCTION online_payment_review_settlement_guard();
REVOKE ALL ON FUNCTION online_payment_review_settlement_guard() FROM PUBLIC;

COMMIT;
