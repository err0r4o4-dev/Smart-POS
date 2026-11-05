BEGIN;

ALTER TABLE online_orders ADD CONSTRAINT online_orders_queue_branch_identity
 UNIQUE (organization_id,branch_id,id);

CREATE TABLE restaurant_queue_periods (
 organization_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 period_start timestamptz NOT NULL,
 period_end timestamptz NOT NULL,
 last_number bigint NOT NULL CHECK(last_number>0),
 PRIMARY KEY (organization_id,branch_id,period_start),
 FOREIGN KEY (organization_id,branch_id) REFERENCES branches(organization_id,id),
 CHECK(period_start<period_end)
);

CREATE TABLE restaurant_order_queue (
 organization_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 order_id uuid NOT NULL,
 period_start timestamptz NOT NULL,
 queue_number bigint NOT NULL CHECK(queue_number>0),
 issued_at timestamptz NOT NULL,
 PRIMARY KEY (organization_id,order_id),
 UNIQUE (organization_id,branch_id,period_start,queue_number),
 FOREIGN KEY (organization_id,branch_id,order_id) REFERENCES online_orders(organization_id,branch_id,id),
 FOREIGN KEY (organization_id,branch_id,period_start) REFERENCES restaurant_queue_periods(organization_id,branch_id,period_start),
 CHECK(issued_at>=period_start)
);

CREATE FUNCTION restaurant_queue_period_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.organization_id,NEW.branch_id,NEW.period_start,NEW.period_end)
  IS DISTINCT FROM ROW(OLD.organization_id,OLD.branch_id,OLD.period_start,OLD.period_end)
  OR NEW.last_number<>OLD.last_number+1 THEN
  RAISE EXCEPTION 'queue period identity is immutable and its counter must advance once' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER restaurant_queue_period_history BEFORE UPDATE ON restaurant_queue_periods
 FOR EACH ROW EXECUTE FUNCTION restaurant_queue_period_guard();

CREATE FUNCTION restaurant_order_queue_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM restaurant_queue_periods period
  WHERE period.organization_id=NEW.organization_id AND period.branch_id=NEW.branch_id
   AND period.period_start=NEW.period_start AND NEW.issued_at<period.period_end
   AND NEW.queue_number=period.last_number
 ) THEN
  RAISE EXCEPTION 'queue ticket must match its allocated period and counter' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER restaurant_order_queue_identity BEFORE INSERT ON restaurant_order_queue
 FOR EACH ROW EXECUTE FUNCTION restaurant_order_queue_guard();

ALTER TABLE restaurant_queue_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_queue_periods FORCE ROW LEVEL SECURITY;
CREATE POLICY restaurant_scope ON restaurant_queue_periods
 USING (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);

ALTER TABLE restaurant_order_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_order_queue FORCE ROW LEVEL SECURITY;
CREATE POLICY restaurant_scope ON restaurant_order_queue
 USING (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);

GRANT SELECT,INSERT ON restaurant_queue_periods,restaurant_order_queue TO smartpos_runtime;
GRANT UPDATE(last_number) ON restaurant_queue_periods TO smartpos_runtime;

COMMIT;
