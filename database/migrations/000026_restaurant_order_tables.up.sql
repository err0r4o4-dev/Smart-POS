BEGIN;

CREATE TABLE restaurant_order_tables (
 organization_id uuid NOT NULL,
 order_id uuid NOT NULL,
 table_id uuid NOT NULL,
 table_code text NOT NULL CHECK(length(btrim(table_code)) BETWEEN 1 AND 40),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id,order_id),
 FOREIGN KEY (organization_id,order_id) REFERENCES online_orders(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY (organization_id,table_id) REFERENCES restaurant_tables(organization_id,id)
);
CREATE INDEX restaurant_order_tables_table_idx ON restaurant_order_tables(organization_id,table_id,created_at DESC);

ALTER TABLE restaurant_order_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_order_tables FORCE ROW LEVEL SECURITY;
CREATE POLICY restaurant_scope ON restaurant_order_tables
 USING (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);

GRANT SELECT,INSERT ON restaurant_order_tables TO smartpos_runtime;

COMMIT;
