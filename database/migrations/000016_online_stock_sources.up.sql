BEGIN;

ALTER TABLE storefronts ADD COLUMN online_terminal_id uuid;
ALTER TABLE storefronts ADD CONSTRAINT storefront_online_terminal
 FOREIGN KEY(organization_id,online_terminal_id) REFERENCES pos_terminals(organization_id,id);

CREATE FUNCTION storefront_source_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.organization_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid THEN
  RAISE EXCEPTION 'storefront source context mismatch' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 IF TG_OP='UPDATE' AND (NEW.terminal_id IS DISTINCT FROM OLD.terminal_id OR NEW.online_terminal_id IS DISTINCT FROM OLD.online_terminal_id)
 AND EXISTS(SELECT 1 FROM public.online_orders WHERE organization_id=NEW.organization_id AND status IN ('PENDING','PREPARING','READY') AND (expires_at>statement_timestamp() OR cart_id IS NOT NULL)) THEN
  RAISE EXCEPTION 'online source has live orders' USING ERRCODE='23514';
 END IF;
 IF NEW.online_terminal_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.pos_terminals front JOIN public.pos_terminals back ON back.organization_id=front.organization_id
  JOIN public.stock_locations location ON location.organization_id=back.organization_id AND location.id=back.stock_location_id
  WHERE front.organization_id=NEW.organization_id AND front.id=NEW.terminal_id AND back.id=NEW.online_terminal_id
  AND front.branch_id=back.branch_id AND front.stock_location_id<>back.stock_location_id
  AND location.branch_id=back.branch_id AND location.type='WAREHOUSE'
 ) THEN
  RAISE EXCEPTION 'online source must be a separate same-branch warehouse' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER storefront_source BEFORE INSERT OR UPDATE ON storefronts FOR EACH ROW EXECUTE FUNCTION storefront_source_guard();

CREATE FUNCTION storefront_terminal_source_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id AND NEW.stock_location_id IS NOT DISTINCT FROM OLD.stock_location_id THEN RETURN NEW; END IF;
 IF NEW.organization_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid THEN
  RAISE EXCEPTION 'terminal source context mismatch' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.storefronts WHERE organization_id=NEW.organization_id AND online_terminal_id IS NOT NULL AND (terminal_id=NEW.id OR online_terminal_id=NEW.id)) THEN
  RAISE EXCEPTION 'detach separate online source before moving a terminal' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER storefront_terminal_source BEFORE UPDATE OF branch_id,stock_location_id ON pos_terminals FOR EACH ROW EXECUTE FUNCTION storefront_terminal_source_guard();
REVOKE ALL ON FUNCTION storefront_source_guard(),storefront_terminal_source_guard() FROM PUBLIC;

COMMIT;
