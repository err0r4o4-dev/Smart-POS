package storefront

import (
	"context"
	"errors"

	"smartpos/api/internal/modules/organization"
)

func saveOrganizationSettings(ctx context.Context, authorization *organization.Authorization, user, org string, input SettingsInput) (Settings, error) {
	tx := authorization.Tx
	var profileExists bool
	if err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM restaurant_profiles WHERE organization_id=$1)", org).Scan(&profileExists); err != nil {
		return Settings{}, err
	}
	if !profileExists {
		return Settings{}, ErrConflict
	}
	current, err := settings(ctx, tx, org)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return Settings{}, err
	}
	if err == nil && (current.TerminalID != "" || current.Revision != input.Revision) {
		return Settings{}, ErrConflict
	}
	if errors.Is(err, ErrNotFound) && input.Revision != 0 {
		return Settings{}, ErrConflict
	}
	if input.Slug == "" {
		if err == nil {
			input.Slug = current.Slug
		} else {
			input.Slug, err = uniqueAutoSlug(ctx, tx, autoSlug(input.Name))
			if err != nil {
				return Settings{}, dbError(err)
			}
		}
	}
	if err = authorization.Recheck(ctx); err != nil {
		return Settings{}, err
	}
	_, err = tx.Exec(ctx, `INSERT INTO storefronts(organization_id,source_kind,slug,name,description,contact_phone,pickup_instructions,delivery_enabled,shipping_fee,category_codes)
	 VALUES($1,'RESTAURANT',$2,$3,$4,$5,$6,$7,$8,COALESCE($9::text[],'{}'))
	 ON CONFLICT(organization_id) DO UPDATE SET slug=excluded.slug,name=excluded.name,description=excluded.description,
	 contact_phone=excluded.contact_phone,pickup_instructions=excluded.pickup_instructions,
	 delivery_enabled=excluded.delivery_enabled,shipping_fee=excluded.shipping_fee,category_codes=COALESCE($9::text[],storefronts.category_codes),revision=storefronts.revision+1,updated_at=now()`,
		org, input.Slug, input.Name, input.Description, input.ContactPhone, input.PickupInstructions, input.DeliveryEnabled, input.ShippingFee, input.CategoryCodes)
	if err != nil {
		return Settings{}, dbError(err)
	}
	if err = authorization.Recheck(ctx); err != nil {
		return Settings{}, err
	}
	if err = organization.RecordAudit(ctx, tx, org, user, "storefront.updated", org); err != nil {
		return Settings{}, err
	}
	result, err := settings(ctx, tx, org)
	if err != nil {
		return Settings{}, err
	}
	return result, nil
}
