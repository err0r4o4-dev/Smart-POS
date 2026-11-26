BEGIN;

GRANT INSERT (organization_id, variant_id, label, min_choices, max_choices),
      UPDATE (label, min_choices, max_choices)
    ON restaurant_menu_modifier_groups TO smartpos_runtime;
GRANT INSERT (organization_id, variant_id, group_id, label, extra_price, saleable),
      UPDATE (label, extra_price, saleable)
    ON restaurant_menu_modifier_options TO smartpos_runtime;

COMMIT;
