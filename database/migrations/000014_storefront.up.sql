BEGIN;

ALTER TABLE auth_rate_limits DROP CONSTRAINT auth_rate_limits_scope_check;
ALTER TABLE auth_rate_limits ADD CONSTRAINT auth_rate_limits_scope_check
 CHECK (scope IN ('LOGIN','REGISTER','FORGOT','RESET','storefront.quote','storefront.order','storefront.track'));

CREATE TABLE storefronts (
 organization_id uuid PRIMARY KEY REFERENCES organizations(id),
 slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9-]{2,49}$'),
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
 description text NOT NULL DEFAULT '' CHECK (length(description)<=1000),
 contact_phone text NOT NULL DEFAULT '' CHECK (length(contact_phone)<=30),
 pickup_instructions text NOT NULL DEFAULT '' CHECK (length(pickup_instructions)<=1000),
 terminal_id uuid NOT NULL,
 published boolean NOT NULL DEFAULT false,
 accepting_orders boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,terminal_id) REFERENCES pos_terminals(organization_id,id),
 CHECK (NOT accepting_orders OR published)
);
CREATE TABLE storefront_products (
 organization_id uuid NOT NULL REFERENCES storefronts(organization_id),
 variant_id uuid NOT NULL,
 published boolean NOT NULL DEFAULT false,
 PRIMARY KEY(organization_id,variant_id),
 FOREIGN KEY(organization_id,variant_id) REFERENCES product_variants(organization_id,id)
);
CREATE TABLE online_orders (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES storefronts(organization_id),
 number text NOT NULL DEFAULT ('WEB-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 branch_id uuid NOT NULL,
 terminal_id uuid NOT NULL,
 stock_location_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PREPARING','READY','COMPLETED','REJECTED','CANCELLED','EXPIRED')),
 customer_name text NOT NULL CHECK(length(customer_name) BETWEEN 1 AND 200),
 contact_phone text NOT NULL CHECK(length(contact_phone) BETWEEN 3 AND 30),
 customer_note text NOT NULL DEFAULT '' CHECK(length(customer_note)<=1000),
 pickup_instructions text NOT NULL DEFAULT '',
 store_name text NOT NULL,
 store_phone text NOT NULL DEFAULT '',
 estimated_total numeric(18,2) NOT NULL CHECK(estimated_total>0),
 access_hash text NOT NULL CHECK(access_hash ~ '^[a-f0-9]{64}$'),
 request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
 cart_id uuid,
 sale_id uuid,
 revision bigint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '48 hours'),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id),
 UNIQUE(organization_id,number),
 UNIQUE(organization_id,cart_id),
 UNIQUE(organization_id,sale_id),
 FOREIGN KEY(organization_id,branch_id) REFERENCES branches(organization_id,id),
 FOREIGN KEY(organization_id,branch_id,terminal_id) REFERENCES pos_terminals(organization_id,branch_id,id),
 FOREIGN KEY(organization_id,branch_id,stock_location_id) REFERENCES stock_locations(organization_id,branch_id,id),
 FOREIGN KEY(organization_id,cart_id) REFERENCES pos_carts(organization_id,id),
 FOREIGN KEY(organization_id,sale_id) REFERENCES sales(organization_id,id),
 CHECK ((status='COMPLETED')=(sale_id IS NOT NULL))
);
CREATE INDEX online_orders_list ON online_orders(organization_id,branch_id,created_at DESC,id);
CREATE TABLE online_order_items (
 organization_id uuid NOT NULL,
 order_id uuid NOT NULL,
 variant_id uuid NOT NULL,
 product_name text NOT NULL,
 variant_name text NOT NULL,
 sku text NOT NULL,
 unit text NOT NULL,
 quantity numeric(18,3) NOT NULL CHECK(quantity>0),
 unit_price numeric(18,2) NOT NULL CHECK(unit_price>0),
 line_total numeric(18,2) NOT NULL CHECK(line_total=round(quantity*unit_price,2)),
 PRIMARY KEY(organization_id,order_id,variant_id),
 FOREIGN KEY(organization_id,order_id) REFERENCES online_orders(organization_id,id),
 FOREIGN KEY(organization_id,variant_id) REFERENCES product_variants(organization_id,id)
);
CREATE TABLE online_order_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 organization_id uuid NOT NULL,
 order_id uuid NOT NULL,
 status text NOT NULL,
 message text NOT NULL DEFAULT '' CHECK(length(message)<=1000),
 actor_id uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,order_id) REFERENCES online_orders(organization_id,id)
);

DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['storefronts','storefront_products','online_orders','online_order_items','online_order_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY storefront_scope ON %I USING (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',table_name);
 END LOOP;
END $$;

CREATE FUNCTION storefront_resolve(requested_slug text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=off AS $$
 SELECT shop.organization_id FROM public.storefronts shop JOIN public.organizations org ON org.id=shop.organization_id
 WHERE shop.slug=requested_slug AND shop.published AND org.status='ACTIVE';
$$;
CREATE FUNCTION storefront_directory() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=off AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('slug',slug,'name',name,'accepting_orders',accepting_orders) ORDER BY name,slug),'[]'::jsonb)
 FROM (SELECT shop.slug,shop.name,shop.accepting_orders FROM public.storefronts shop JOIN public.organizations org ON org.id=shop.organization_id WHERE shop.published AND org.status='ACTIVE' ORDER BY shop.name,shop.slug LIMIT 100) visible;
$$;
REVOKE ALL ON FUNCTION storefront_resolve(text),storefront_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION storefront_resolve(text),storefront_directory() TO smartpos_runtime;

CREATE FUNCTION storefront_tracking_resolve(requested_slug text, requested_order uuid, requested_hash text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=off AS $$
 SELECT doc.organization_id FROM public.online_orders doc JOIN public.storefronts shop ON shop.organization_id=doc.organization_id JOIN public.organizations org ON org.id=doc.organization_id
 WHERE shop.slug=requested_slug AND doc.id=requested_order AND doc.access_hash=requested_hash AND org.status='ACTIVE';
$$;
REVOKE ALL ON FUNCTION storefront_tracking_resolve(text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION storefront_tracking_resolve(text,uuid,text) TO smartpos_runtime;

CREATE FUNCTION online_order_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.id,NEW.organization_id,NEW.branch_id,NEW.terminal_id,NEW.stock_location_id,NEW.customer_name,NEW.contact_phone,NEW.customer_note,NEW.estimated_total,NEW.access_hash,NEW.request_fingerprint,NEW.created_at,NEW.expires_at,NEW.pickup_instructions,NEW.store_name,NEW.store_phone,NEW.number)
 IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.branch_id,OLD.terminal_id,OLD.stock_location_id,OLD.customer_name,OLD.contact_phone,OLD.customer_note,OLD.estimated_total,OLD.access_hash,OLD.request_fingerprint,OLD.created_at,OLD.expires_at,OLD.pickup_instructions,OLD.store_name,OLD.store_phone,OLD.number)
 OR OLD.status IN ('COMPLETED','REJECTED','CANCELLED','EXPIRED') OR NEW.revision<>OLD.revision+1 THEN
  RAISE EXCEPTION 'online order history is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.status<>OLD.status AND NOT (
  (OLD.status='PENDING' AND NEW.status IN ('PREPARING','REJECTED','CANCELLED')) OR
  (OLD.status='PREPARING' AND NEW.status IN ('READY','REJECTED','CANCELLED')) OR
  (OLD.status='READY' AND NEW.status IN ('COMPLETED','CANCELLED')) OR
  (NEW.status='EXPIRED' AND OLD.expires_at<=now() AND OLD.cart_id IS NULL)
 ) THEN RAISE EXCEPTION 'online order transition invalid' USING ERRCODE='23514'; END IF;
 IF OLD.cart_id IS NOT NULL AND NEW.status NOT IN ('READY','COMPLETED') THEN
  RAISE EXCEPTION 'linked cart must be reconciled first' USING ERRCODE='23514';
 END IF;
 IF NEW.cart_id IS DISTINCT FROM OLD.cart_id AND (NEW.status<>'READY' OR (OLD.cart_id IS NOT NULL AND NEW.cart_id IS NOT NULL)) THEN
  RAISE EXCEPTION 'online order cart transition invalid' USING ERRCODE='23514';
 END IF;
 IF NEW.sale_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sales WHERE organization_id=NEW.organization_id AND id=NEW.sale_id AND cart_id=NEW.cart_id AND branch_id=NEW.branch_id AND terminal_id=NEW.terminal_id) THEN
  RAISE EXCEPTION 'online order sale mismatch' USING ERRCODE='23514';
 END IF;
 IF NEW.cart_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pos_carts WHERE organization_id=NEW.organization_id AND id=NEW.cart_id AND terminal_id=NEW.terminal_id AND branch_id=NEW.branch_id) THEN
  RAISE EXCEPTION 'online order cart mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER online_order_history BEFORE UPDATE ON online_orders FOR EACH ROW EXECUTE FUNCTION online_order_guard();
REVOKE ALL ON FUNCTION online_order_guard() FROM PUBLIC;

CREATE FUNCTION online_order_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE doc online_orders; count_items integer; item_total numeric;
BEGIN
 SELECT * INTO doc FROM online_orders WHERE organization_id=NEW.organization_id AND id=NEW.id;
 SELECT count(*),sum(line_total) INTO count_items,item_total FROM online_order_items WHERE organization_id=doc.organization_id AND order_id=doc.id;
 IF count_items NOT BETWEEN 1 AND 100 OR item_total IS DISTINCT FROM doc.estimated_total THEN
  RAISE EXCEPTION 'online order snapshots inconsistent' USING ERRCODE='23514';
 END IF;
 IF doc.status='COMPLETED' THEN
  IF doc.cart_id IS NULL OR NOT EXISTS(SELECT 1 FROM sales WHERE organization_id=doc.organization_id AND id=doc.sale_id AND cart_id=doc.cart_id AND branch_id=doc.branch_id AND terminal_id=doc.terminal_id) OR EXISTS(
   (SELECT variant_id,quantity FROM online_order_items WHERE organization_id=doc.organization_id AND order_id=doc.id EXCEPT SELECT variant_id,quantity FROM sale_items WHERE organization_id=doc.organization_id AND sale_id=doc.sale_id)
   UNION ALL
   (SELECT variant_id,quantity FROM sale_items WHERE organization_id=doc.organization_id AND sale_id=doc.sale_id EXCEPT SELECT variant_id,quantity FROM online_order_items WHERE organization_id=doc.organization_id AND order_id=doc.id)
  ) THEN RAISE EXCEPTION 'online order sale inconsistent' USING ERRCODE='23514'; END IF;
 ELSIF doc.cart_id IS NOT NULL AND EXISTS(SELECT 1 FROM sales WHERE organization_id=doc.organization_id AND cart_id=doc.cart_id) THEN
  RAISE EXCEPTION 'linked sale must complete online order' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER online_order_consistent AFTER INSERT OR UPDATE ON online_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION online_order_consistency();
CREATE FUNCTION online_order_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM online_order_events WHERE organization_id=NEW.organization_id AND order_id=NEW.order_id) THEN
  RAISE EXCEPTION 'online order items frozen' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER online_order_item_frozen BEFORE INSERT ON online_order_items FOR EACH ROW EXECUTE FUNCTION online_order_item_guard();
REVOKE ALL ON FUNCTION online_order_consistency(),online_order_item_guard() FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON storefronts,storefront_products,online_orders TO smartpos_runtime;
GRANT SELECT,INSERT ON online_order_items,online_order_events TO smartpos_runtime;
GRANT USAGE,SELECT ON SEQUENCE online_order_events_id_seq TO smartpos_runtime;
COMMIT;
