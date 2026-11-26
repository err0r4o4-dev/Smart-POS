BEGIN;

CREATE TABLE online_payment_attempts (
 organization_id uuid NOT NULL,
 order_id uuid NOT NULL,
 slug text NOT NULL CHECK(slug ~ '^[a-z][a-z0-9-]{2,49}$'),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1000 AND 99999999),
 currency text NOT NULL DEFAULT 'thb' CHECK(currency='thb'),
 expires_at timestamptz NOT NULL CHECK(expires_at=date_trunc('second',expires_at)),
 state text NOT NULL DEFAULT 'REQUESTED' CHECK(state IN ('REQUESTED','OPEN','PROCESSING','PAID','EXPIRED')),
 session_id text UNIQUE CHECK(session_id ~ '^cs_test_[A-Za-z0-9]{1,220}$'),
 payment_intent text CHECK(payment_intent ~ '^pi_[A-Za-z0-9]{1,220}$'),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,order_id),
 UNIQUE(organization_id,order_id,session_id),
 FOREIGN KEY(organization_id,order_id) REFERENCES online_orders(organization_id,id),
 CHECK((state='REQUESTED')=(session_id IS NULL)),
 CHECK((state='PAID')=(payment_intent IS NOT NULL))
);

CREATE TABLE online_payment_inbox (
 event_id text PRIMARY KEY CHECK(event_id ~ '^evt_[A-Za-z0-9]{1,220}$'),
 organization_id uuid NOT NULL,
 order_id uuid NOT NULL,
 event_type text NOT NULL CHECK(event_type IN ('checkout.session.completed','checkout.session.expired')),
 session_id text NOT NULL CHECK(session_id ~ '^cs_test_[A-Za-z0-9]{1,220}$'),
 outcome text NOT NULL CHECK(outcome IN ('PROCESSING','PAID','EXPIRED')),
 payment_intent text CHECK(payment_intent ~ '^pi_[A-Za-z0-9]{1,220}$'),
 amount_minor bigint NOT NULL,
 currency text NOT NULL CHECK(currency='thb'),
 expires_at timestamptz NOT NULL,
 event_created_at timestamptz NOT NULL CHECK(event_created_at>'1970-01-01 UTC'::timestamptz),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 accepted_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,order_id) REFERENCES online_payment_attempts(organization_id,order_id),
 FOREIGN KEY(organization_id,order_id,session_id) REFERENCES online_payment_attempts(organization_id,order_id,session_id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((outcome='PAID')=(payment_intent IS NOT NULL)),
 CHECK((event_type='checkout.session.expired' AND outcome='EXPIRED') OR (event_type='checkout.session.completed' AND outcome IN ('PROCESSING','PAID')))
);
CREATE INDEX online_payment_inbox_order ON online_payment_inbox(organization_id,order_id,accepted_at,event_id);

ALTER TABLE online_payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_payment_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE online_payment_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_payment_inbox FORCE ROW LEVEL SECURITY;
CREATE POLICY online_payment_scope ON online_payment_attempts USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY online_payment_scope ON online_payment_inbox USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON online_payment_attempts TO smartpos_runtime;
GRANT SELECT,INSERT ON online_payment_inbox TO smartpos_runtime;

CREATE FUNCTION online_payment_attempt_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'payment history cannot be deleted' USING ERRCODE='23514';
 END IF;
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
 IF NEW.state IN ('PAID','EXPIRED') AND NEW.state IS DISTINCT FROM OLD.state
 AND NOT EXISTS(SELECT 1 FROM public.online_payment_inbox event WHERE event.organization_id=NEW.organization_id AND event.order_id=NEW.order_id
  AND event.session_id=NEW.session_id AND event.outcome=NEW.state AND event.payment_intent IS NOT DISTINCT FROM NEW.payment_intent) THEN
  RAISE EXCEPTION 'terminal payment state requires durable event evidence' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER online_payment_attempt_history BEFORE INSERT OR UPDATE OR DELETE ON online_payment_attempts FOR EACH ROW EXECUTE FUNCTION online_payment_attempt_guard();

CREATE FUNCTION online_payment_inbox_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN
  RAISE EXCEPTION 'payment inbox is append only' USING ERRCODE='23514';
 END IF;
 IF NEW.organization_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid THEN
  RAISE EXCEPTION 'payment inbox context mismatch' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.online_payment_attempts attempt WHERE attempt.organization_id=NEW.organization_id AND attempt.order_id=NEW.order_id
  AND attempt.amount_minor=NEW.amount_minor AND attempt.currency=NEW.currency AND attempt.expires_at=NEW.expires_at
  AND (attempt.session_id IS NULL OR attempt.session_id=NEW.session_id)) THEN
  RAISE EXCEPTION 'payment inbox must match the frozen attempt' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER online_payment_inbox_history BEFORE INSERT OR UPDATE OR DELETE ON online_payment_inbox FOR EACH ROW EXECUTE FUNCTION online_payment_inbox_guard();
REVOKE ALL ON FUNCTION online_payment_attempt_guard(),online_payment_inbox_guard() FROM PUBLIC;

COMMIT;
