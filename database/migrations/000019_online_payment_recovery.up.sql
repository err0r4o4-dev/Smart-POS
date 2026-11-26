BEGIN;

CREATE TABLE online_payment_dispatches (
 organization_id uuid NOT NULL,
 order_id uuid NOT NULL,
 request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,order_id),
 FOREIGN KEY(organization_id,order_id) REFERENCES online_payment_attempts(organization_id,order_id)
);

CREATE TABLE online_payment_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 order_id uuid NOT NULL,
 source text NOT NULL CHECK(source IN ('CREATE_RESPONSE','RETRIEVE')),
 session_id text NOT NULL CHECK(session_id ~ '^cs_test_[A-Za-z0-9]{1,220}$'),
 provider_status text NOT NULL CHECK(provider_status IN ('open','complete','expired')),
 provider_payment_status text NOT NULL CHECK(provider_payment_status IN ('unpaid','paid')),
 outcome text NOT NULL CHECK(outcome IN ('OPEN','PROCESSING','PAID','EXPIRED')),
 payment_intent text CHECK(payment_intent ~ '^pi_[A-Za-z0-9]{1,220}$'),
 amount_minor bigint NOT NULL,
 currency text NOT NULL CHECK(currency='thb'),
 expires_at timestamptz NOT NULL,
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 observed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,order_id,source,fingerprint),
 FOREIGN KEY(organization_id,order_id,session_id) REFERENCES online_payment_attempts(organization_id,order_id,session_id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((provider_payment_status='paid')=(payment_intent IS NOT NULL)),
 CHECK(provider_payment_status<>'paid' OR provider_status='complete'),
 CHECK(outcome=CASE WHEN provider_status='open' THEN 'OPEN'
  WHEN source='CREATE_RESPONSE' THEN 'PROCESSING'
  WHEN provider_payment_status='paid' THEN 'PAID'
  WHEN provider_status='expired' THEN 'EXPIRED' ELSE 'PROCESSING' END)
);

ALTER TABLE online_payment_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_payment_dispatches FORCE ROW LEVEL SECURITY;
ALTER TABLE online_payment_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_payment_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY online_payment_scope ON online_payment_dispatches USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY online_payment_scope ON online_payment_observations USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
GRANT SELECT,INSERT ON online_payment_dispatches,online_payment_observations TO smartpos_runtime;

CREATE FUNCTION online_payment_dispatch_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'payment dispatch is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.organization_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid THEN
  RAISE EXCEPTION 'payment dispatch context mismatch' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.online_payment_attempts attempt
  JOIN public.online_orders doc ON doc.organization_id=attempt.organization_id AND doc.id=attempt.order_id
  JOIN public.storefronts shop ON shop.organization_id=attempt.organization_id
  WHERE attempt.organization_id=NEW.organization_id AND attempt.order_id=NEW.order_id
  AND attempt.state='REQUESTED' AND attempt.session_id IS NULL AND NOT attempt.stock_hold_released
  AND attempt.expires_at>statement_timestamp()+interval '31 minutes' AND attempt.expires_at<=statement_timestamp()+interval '24 hours'
  AND doc.status IN ('PENDING','PREPARING','READY') AND doc.cart_id IS NULL AND shop.published AND shop.accepting_orders AND shop.slug=attempt.slug) THEN
  RAISE EXCEPTION 'payment dispatch requires an eligible frozen attempt' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER online_payment_dispatch_history BEFORE INSERT OR UPDATE OR DELETE ON online_payment_dispatches FOR EACH ROW EXECUTE FUNCTION online_payment_dispatch_guard();

CREATE FUNCTION online_payment_observation_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'payment observations are append only' USING ERRCODE='23514'; END IF;
 IF NEW.organization_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid THEN
  RAISE EXCEPTION 'payment observation context mismatch' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.online_payment_attempts attempt WHERE attempt.organization_id=NEW.organization_id AND attempt.order_id=NEW.order_id
  AND attempt.amount_minor=NEW.amount_minor AND attempt.currency=NEW.currency AND attempt.expires_at=NEW.expires_at
  AND (attempt.session_id=NEW.session_id OR (attempt.session_id IS NULL AND NEW.source='CREATE_RESPONSE')))
 OR (NEW.source='CREATE_RESPONSE' AND NOT EXISTS(SELECT 1 FROM public.online_payment_dispatches WHERE organization_id=NEW.organization_id AND order_id=NEW.order_id)) THEN
  RAISE EXCEPTION 'observation must match a trusted attempt and dispatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER online_payment_observation_history BEFORE INSERT OR UPDATE OR DELETE ON online_payment_observations FOR EACH ROW EXECUTE FUNCTION online_payment_observation_guard();

CREATE OR REPLACE FUNCTION online_payment_attempt_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'payment history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF NEW.organization_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid THEN
  RAISE EXCEPTION 'payment context mismatch' USING ERRCODE='42501';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'REQUESTED' OR NEW.session_id IS NOT NULL OR NEW.payment_intent IS NOT NULL OR NEW.revision<>1
  OR NOT EXISTS(SELECT 1 FROM public.online_orders doc JOIN public.storefronts shop ON shop.organization_id=doc.organization_id
    WHERE doc.organization_id=NEW.organization_id AND doc.id=NEW.order_id AND doc.stock_reserved AND doc.cart_id IS NULL
    AND doc.status IN ('PENDING','PREPARING','READY') AND shop.slug=NEW.slug AND shop.published AND shop.accepting_orders
    AND NEW.amount_minor=doc.estimated_total*100 AND NEW.expires_at<=doc.expires_at
    AND NEW.expires_at>=now()+interval '30 minutes' AND NEW.expires_at<=now()+interval '24 hours') THEN
   RAISE EXCEPTION 'payment attempt requires an eligible frozen order' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF (NEW.organization_id,NEW.order_id,NEW.slug,NEW.amount_minor,NEW.currency,NEW.expires_at,NEW.created_at)
 IS DISTINCT FROM (OLD.organization_id,OLD.order_id,OLD.slug,OLD.amount_minor,OLD.currency,OLD.expires_at,OLD.created_at)
 OR NEW.revision<>OLD.revision+1
 OR (OLD.session_id IS NOT NULL AND NEW.session_id IS DISTINCT FROM OLD.session_id)
 OR (OLD.state='PAID' AND (NEW.state<>'PAID' OR NEW.payment_intent IS DISTINCT FROM OLD.payment_intent))
 OR (OLD.state='EXPIRED' AND NEW.state NOT IN ('EXPIRED','PAID'))
 OR (OLD.state='PROCESSING' AND NEW.state IN ('REQUESTED','OPEN')) THEN
  RAISE EXCEPTION 'payment evidence and history are immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.state='EXPIRED' AND EXISTS(SELECT 1 FROM public.online_payment_observations
  WHERE organization_id=NEW.organization_id AND order_id=NEW.order_id AND provider_payment_status='paid') THEN
  RAISE EXCEPTION 'paid provider evidence cannot release a hold' USING ERRCODE='23514';
 END IF;
 IF NEW.state IN ('PAID','EXPIRED') AND NEW.state IS DISTINCT FROM OLD.state
 AND NOT EXISTS(SELECT 1 FROM public.online_payment_inbox event WHERE event.organization_id=NEW.organization_id AND event.order_id=NEW.order_id
  AND event.session_id=NEW.session_id AND event.outcome=NEW.state AND event.payment_intent IS NOT DISTINCT FROM NEW.payment_intent)
 AND NOT EXISTS(SELECT 1 FROM public.online_payment_observations observation WHERE observation.organization_id=NEW.organization_id AND observation.order_id=NEW.order_id
  AND observation.source='RETRIEVE' AND observation.session_id=NEW.session_id AND observation.outcome=NEW.state
  AND observation.payment_intent IS NOT DISTINCT FROM NEW.payment_intent) THEN
  RAISE EXCEPTION 'terminal payment state requires durable provider evidence' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION online_payment_dispatch_guard(),online_payment_observation_guard() FROM PUBLIC;

COMMIT;
