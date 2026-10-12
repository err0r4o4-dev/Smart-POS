BEGIN;

CREATE TABLE online_refund_intents (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 order_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 purpose text NOT NULL CHECK(purpose='CANCEL_BEFORE_SHIPMENT'),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 99999999),
 currency text NOT NULL DEFAULT 'thb' CHECK(currency='thb'),
 payment_intent text NOT NULL CHECK(payment_intent ~ '^pi_[A-Za-z0-9]{1,220}$'),
 request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
 state text NOT NULL DEFAULT 'REQUESTED' CHECK(state IN ('REQUESTED','PENDING','REQUIRES_ACTION','SUCCEEDED','FAILED','CANCELED')),
 provider_id text CHECK(provider_id ~ '^re_[A-Za-z0-9]{1,220}$'),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,order_id),
 UNIQUE(organization_id,order_id,id),
 UNIQUE(provider_id),
 FOREIGN KEY(organization_id,order_id) REFERENCES online_payment_attempts(organization_id,order_id),
 FOREIGN KEY(organization_id,actor_id) REFERENCES organization_memberships(organization_id,user_id),
 CHECK((state='REQUESTED')=(provider_id IS NULL))
);
CREATE TABLE online_refund_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 order_id uuid NOT NULL,
 refund_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 source text NOT NULL CHECK(source IN ('CREATE','RETRIEVE')),
 provider_id text NOT NULL CHECK(provider_id ~ '^re_[A-Za-z0-9]{1,220}$'),
 outcome text NOT NULL CHECK(outcome IN ('PENDING','REQUIRES_ACTION','SUCCEEDED','FAILED','CANCELED')),
 payment_intent text NOT NULL,
 amount_minor bigint NOT NULL,
 currency text NOT NULL CHECK(currency='thb'),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,refund_id,source,fingerprint),
 FOREIGN KEY(organization_id,order_id,refund_id) REFERENCES online_refund_intents(organization_id,order_id,id),
 FOREIGN KEY(organization_id,actor_id) REFERENCES organization_memberships(organization_id,user_id)
);
ALTER TABLE online_refund_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_refund_intents FORCE ROW LEVEL SECURITY;
ALTER TABLE online_refund_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_refund_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY online_refund_scope ON online_refund_intents USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY online_refund_scope ON online_refund_observations USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON online_refund_intents TO smartpos_runtime;
GRANT SELECT,INSERT ON online_refund_observations TO smartpos_runtime;

CREATE FUNCTION online_refund_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE doc public.online_orders; attempt public.online_payment_attempts; intent public.online_refund_intents;
BEGIN
 IF TG_OP='DELETE' OR TG_TABLE_NAME='online_refund_observations' AND TG_OP<>'INSERT' THEN
  RAISE EXCEPTION 'refund history is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.organization_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid THEN
  RAISE EXCEPTION 'refund context mismatch' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 SELECT * INTO doc FROM public.online_orders WHERE organization_id=NEW.organization_id AND id=NEW.order_id;
 IF NOT EXISTS(SELECT 1 FROM public.organization_memberships member WHERE member.organization_id=NEW.organization_id AND member.user_id=nullif(current_setting('app.user_id',true),'')::uuid AND member.status='ACTIVE'
  AND (member.role='OWNER' OR member.role='MANAGER' AND EXISTS(SELECT 1 FROM public.branch_memberships assignment JOIN public.branches branch ON branch.organization_id=assignment.organization_id AND branch.id=assignment.branch_id
   WHERE assignment.organization_id=member.organization_id AND assignment.membership_id=member.id AND assignment.branch_id=doc.branch_id AND branch.status='ACTIVE'))) THEN
  RAISE EXCEPTION 'refund requires management scope' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='online_refund_observations' THEN
  SELECT * INTO intent FROM public.online_refund_intents WHERE organization_id=NEW.organization_id AND id=NEW.refund_id AND order_id=NEW.order_id;
  IF NEW.actor_id IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid
  OR ROW(NEW.payment_intent,NEW.amount_minor,NEW.currency) IS DISTINCT FROM ROW(intent.payment_intent,intent.amount_minor,intent.currency)
  OR intent.provider_id IS NOT NULL AND NEW.provider_id IS DISTINCT FROM intent.provider_id THEN
   RAISE EXCEPTION 'refund observation evidence mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='INSERT' THEN
  SELECT * INTO attempt FROM public.online_payment_attempts WHERE organization_id=NEW.organization_id AND order_id=NEW.order_id;
  IF NEW.actor_id IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid OR NEW.state<>'REQUESTED' OR NEW.provider_id IS NOT NULL OR NEW.revision<>1 OR NEW.created_at IS DISTINCT FROM transaction_timestamp()
  OR doc.status NOT IN ('PENDING','PREPARING','READY') OR doc.cart_id IS NOT NULL OR attempt.state IS DISTINCT FROM 'PAID'
  OR ROW(NEW.payment_intent,NEW.amount_minor,NEW.currency) IS DISTINCT FROM ROW(attempt.payment_intent,attempt.amount_minor,attempt.currency)
  OR NEW.amount_minor<>doc.estimated_total*100 THEN
   RAISE EXCEPTION 'refund requires full frozen paid pre-shipment charge' USING ERRCODE='23514';
  END IF;
 ELSE
  IF ROW(NEW.id,NEW.organization_id,NEW.order_id,NEW.actor_id,NEW.purpose,NEW.amount_minor,NEW.currency,NEW.payment_intent,NEW.request_fingerprint,NEW.created_at)
   IS DISTINCT FROM ROW(OLD.id,OLD.organization_id,OLD.order_id,OLD.actor_id,OLD.purpose,OLD.amount_minor,OLD.currency,OLD.payment_intent,OLD.request_fingerprint,OLD.created_at)
  OR NEW.revision<>OLD.revision+1 OR OLD.provider_id IS NOT NULL AND NEW.provider_id IS DISTINCT FROM OLD.provider_id
  OR OLD.state IN ('SUCCEEDED','FAILED','CANCELED') AND NEW.state IS DISTINCT FROM OLD.state
  OR NEW.state='REQUESTED' OR NOT EXISTS(SELECT 1 FROM public.online_refund_observations observation WHERE observation.organization_id=NEW.organization_id AND observation.refund_id=NEW.id AND observation.provider_id=NEW.provider_id AND observation.outcome=NEW.state) THEN
   RAISE EXCEPTION 'refund state requires immutable provider evidence' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER online_refund_intent_history BEFORE INSERT OR UPDATE OR DELETE ON online_refund_intents FOR EACH ROW EXECUTE FUNCTION online_refund_guard();
CREATE TRIGGER online_refund_observation_history BEFORE INSERT OR UPDATE OR DELETE ON online_refund_observations FOR EACH ROW EXECUTE FUNCTION online_refund_guard();

CREATE OR REPLACE FUNCTION online_payment_hold_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 IF TG_OP='INSERT' THEN
  IF NEW.stock_hold_released THEN RAISE EXCEPTION 'payment hold starts unresolved' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.stock_hold_released IS DISTINCT FROM OLD.stock_hold_released THEN
   RAISE EXCEPTION 'payment hold release is server derived and irreversible' USING ERRCODE='23514';
  END IF;
  NEW.stock_hold_released:=OLD.stock_hold_released OR NEW.state='EXPIRED' OR EXISTS(SELECT 1 FROM public.online_refund_intents intent
   JOIN public.online_refund_observations observation ON observation.organization_id=intent.organization_id AND observation.refund_id=intent.id
   WHERE intent.organization_id=NEW.organization_id AND intent.order_id=NEW.order_id AND intent.purpose='CANCEL_BEFORE_SHIPMENT' AND intent.state='SUCCEEDED' AND intent.amount_minor=NEW.amount_minor
   AND intent.payment_intent=NEW.payment_intent AND observation.provider_id=intent.provider_id AND observation.outcome='SUCCEEDED');
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION online_order_payment_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE attempt public.online_payment_attempts;
BEGIN
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 SELECT * INTO attempt FROM public.online_payment_attempts WHERE organization_id=NEW.organization_id AND order_id=NEW.id;
 IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('CANCELLED','REJECTED','EXPIRED') AND attempt.state IS NOT NULL AND attempt.state<>'EXPIRED'
 AND NOT (NEW.status='CANCELLED' AND OLD.cart_id IS NULL AND EXISTS(SELECT 1 FROM public.online_refund_intents intent JOIN public.online_refund_observations observation ON observation.organization_id=intent.organization_id AND observation.refund_id=intent.id
  WHERE intent.organization_id=NEW.organization_id AND intent.order_id=NEW.id AND intent.purpose='CANCEL_BEFORE_SHIPMENT' AND intent.state='SUCCEEDED' AND intent.amount_minor=attempt.amount_minor AND intent.payment_intent=attempt.payment_intent AND observation.provider_id=intent.provider_id AND observation.outcome='SUCCEEDED')) THEN
  RAISE EXCEPTION 'payment must be reconciled before releasing an order' USING ERRCODE='23514';
 END IF;
 IF attempt.state IS NOT NULL AND (NEW.cart_id IS NOT NULL AND NEW.cart_id IS DISTINCT FROM OLD.cart_id OR NEW.status='COMPLETED') THEN
  IF attempt.state<>'PAID' OR attempt.stock_hold_released OR NEW.cart_id IS NULL OR NEW.status NOT IN ('READY','COMPLETED')
  OR EXISTS(SELECT 1 FROM public.online_refund_intents WHERE organization_id=NEW.organization_id AND order_id=NEW.id) THEN
   RAISE EXCEPTION 'customer payments require unrefunded prepaid settlement' USING ERRCODE='23514';
  END IF;
  IF NEW.status='COMPLETED' AND NOT EXISTS(SELECT 1 FROM public.sales sale JOIN public.pos_checkouts checkout ON checkout.organization_id=sale.organization_id AND checkout.id=sale.checkout_id
   WHERE sale.organization_id=NEW.organization_id AND sale.id=NEW.sale_id AND sale.cart_id=NEW.cart_id AND checkout.prepaid_order_id=NEW.id AND checkout.method='ONLINE_STRIPE' AND checkout.total=NEW.estimated_total) THEN
   RAISE EXCEPTION 'prepaid sale linkage mismatch' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('PREPARING','READY') AND NOT public.storefront_order_live(OLD.organization_id,OLD.id) THEN
  RAISE EXCEPTION 'expired order cannot resume fulfillment' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION online_refund_settlement_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.prepaid_order_id IS NOT NULL THEN
  PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.online_refund_intents WHERE organization_id=NEW.organization_id AND order_id=NEW.prepaid_order_id) THEN
   RAISE EXCEPTION 'refund intent blocks settlement' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER online_refund_checkout BEFORE INSERT OR UPDATE ON pos_checkouts FOR EACH ROW EXECUTE FUNCTION online_refund_settlement_guard();
CREATE FUNCTION online_refund_consistency() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE intent public.online_refund_intents;
BEGIN
 SELECT * INTO intent FROM public.online_refund_intents WHERE organization_id=NEW.organization_id AND id=NEW.id;
 IF intent.state='SUCCEEDED' AND NOT EXISTS(SELECT 1 FROM public.online_orders doc JOIN public.online_payment_attempts attempt ON attempt.organization_id=doc.organization_id AND attempt.order_id=doc.id
  WHERE doc.organization_id=intent.organization_id AND doc.id=intent.order_id AND doc.status='CANCELLED' AND doc.cart_id IS NULL AND attempt.stock_hold_released) THEN
  RAISE EXCEPTION 'successful refund must atomically cancel and release order' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER online_refund_consistent AFTER INSERT OR UPDATE ON online_refund_intents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION online_refund_consistency();
REVOKE ALL ON FUNCTION online_refund_guard(),online_refund_settlement_guard(),online_refund_consistency() FROM PUBLIC;
COMMIT;
