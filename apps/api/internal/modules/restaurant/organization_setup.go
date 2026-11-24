package restaurant

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/organization"
)

func (service *Service) beginOrganizationSetup(ctx context.Context, user, org string) (*organization.Authorization, error) {
	if service.Organization == nil || service.Organization.Pool == nil {
		return nil, ErrSetupUnavailable
	}
	authorization, err := service.Organization.AuthorizeMFA(ctx, user, org, "organization.update")
	if err != nil {
		return nil, err
	}
	tx := authorization.Tx
	var businessType string
	err = tx.QueryRow(ctx, "SELECT business_type FROM organizations WHERE id=$1", org).Scan(&businessType)
	if err == nil && businessType != "RESTAURANT" {
		err = ErrConflict
	}
	if err == nil {
		err = authorization.Recheck(ctx)
	}
	if err != nil {
		tx.Rollback(ctx)
		return nil, dbError(err)
	}
	return authorization, nil
}

func (service *Service) organizationSetup(ctx context.Context, user, org string) (SetupState, error) {
	authorization, err := service.beginOrganizationSetup(ctx, user, org)
	if err != nil {
		return SetupState{}, err
	}
	tx := authorization.Tx
	defer tx.Rollback(ctx)
	state, err := readOrganizationSetup(ctx, tx, org)
	if err != nil {
		return SetupState{}, err
	}
	if err = authorization.Recheck(ctx); err != nil {
		return SetupState{}, err
	}
	return state, nil
}

func readOrganizationSetup(ctx context.Context, tx pgx.Tx, org string) (SetupState, error) {
	state := SetupState{OrganizationID: org, Capabilities: SetupCapabilities{CardPayments: false}}
	var name, code, businessType, email, phone, address string
	err := tx.QueryRow(ctx, "SELECT name,code,business_type,contact_email,contact_phone,address FROM organizations WHERE id=$1", org).Scan(&name, &code, &businessType, &email, &phone, &address)
	if err != nil {
		return state, dbError(err)
	}
	var profileSaved, servicesSaved, tablesSaved, paymentsSaved, ordersSaved bool
	var cash, bank, tableQR, orderQR, kitchen, autoConfirm, pickup bool
	state.Services.Pickup = &pickup
	var location []byte
	vat, serviceCharge := "0.00", "0.00"
	err = tx.QueryRow(ctx, `SELECT profile_saved,services_saved,tables_saved,payments_saved,orders_saved,
	 dine_in,takeaway,delivery,pickup,cash_enabled,bank_transfer_enabled,table_qr_enabled,
	 qr_ordering_enabled,kitchen_enabled,auto_confirm_orders,vat_rate::text,service_charge_rate::text,
	 location,completed_at IS NOT NULL FROM restaurant_profiles WHERE organization_id=$1`, org).Scan(
		&profileSaved, &servicesSaved, &tablesSaved, &paymentsSaved, &ordersSaved,
		&state.Services.DineIn, &state.Services.Takeaway, &state.Services.Delivery, &pickup, &cash, &bank, &tableQR,
		&orderQR, &kitchen, &autoConfirm, &vat, &serviceCharge, &location, &state.Completed)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return state, dbError(err)
	}
	if len(location) > 0 {
		state.Location = &SetupLocationInput{}
		if err = json.Unmarshal(location, state.Location); err != nil {
			return state, err
		}
		if err = state.Location.Validate(); err != nil {
			return state, err
		}
	}
	state.Profile = map[string]any{
		"organization":  map[string]any{"name": name, "code": code, "business_type": businessType, "contact_email": email, "contact_phone": phone, "address": address},
		"service_modes": state.Services,
	}
	zones, tables := []map[string]any{}, []map[string]any{}
	rows, err := tx.Query(ctx, "SELECT id::text,code,name FROM restaurant_dining_zones WHERE organization_id=$1 AND status='ACTIVE' ORDER BY code", org)
	if err != nil {
		return state, dbError(err)
	}
	for rows.Next() {
		var id, zoneCode, zoneName string
		if err = rows.Scan(&id, &zoneCode, &zoneName); err != nil {
			rows.Close()
			return state, err
		}
		zones = append(zones, map[string]any{"id": id, "code": zoneCode, "name": zoneName})
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return state, err
	}
	rows.Close()
	rows, err = tx.Query(ctx, `SELECT t.id::text,t.code,t.name,t.seats,z.code,z.name
	 FROM restaurant_dining_tables t JOIN restaurant_dining_zones z ON z.organization_id=t.organization_id AND z.id=t.zone_id
	 WHERE t.organization_id=$1 AND t.status='ACTIVE' AND z.status='ACTIVE' ORDER BY t.code`, org)
	if err != nil {
		return state, dbError(err)
	}
	for rows.Next() {
		var id, tableCode, tableName, zoneCode, zoneName string
		var seats int
		if err = rows.Scan(&id, &tableCode, &tableName, &seats, &zoneCode, &zoneName); err != nil {
			rows.Close()
			return state, err
		}
		tables = append(tables, map[string]any{"id": id, "code": tableCode, "name": tableName, "seats": seats, "zone_code": zoneCode, "zone": zoneName})
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return state, err
	}
	rows.Close()
	state.Tables = map[string]any{"zones": zones, "tables": tables, "qr_enabled": tableQR}
	state.Payments = map[string]any{"cash": cash, "bank_transfer": bank, "promptpay": false, "card": false}
	state.Orders = map[string]any{"qr_ordering": orderQR, "kitchen_queue": kitchen, "auto_confirm": autoConfirm, "vat_percent": vat, "service_charge_percent": serviceCharge}
	menuSaved, menuItems, err := readOrganizationMenu(ctx, tx, org, &state)
	if err != nil {
		return state, err
	}
	steps := map[int]bool{1: profileSaved, 2: servicesSaved, 3: tablesSaved, 4: menuSaved, 5: paymentsSaved, 6: ordersSaved}
	live := []bool{
		profileSaved && strings.TrimSpace(name) != "" && strings.TrimSpace(code) != "" && businessType == "RESTAURANT",
		servicesSaved && state.Services.any(),
		tablesSaved && (!state.Services.DineIn || (len(zones) > 0 && len(tables) > 0)),
		menuSaved && menuItems > 0,
		paymentsSaved && (cash || bank),
		ordersSaved,
	}
	applySetupReadiness(&state, steps, live)
	state.Complete = state.Completed
	return state, nil
}

func claimOrganizationSetup(ctx context.Context, authorization *organization.Authorization, org, user, operation, key string, input any) ([]byte, error) {
	tx := authorization.Tx
	encoded, err := json.Marshal(input)
	if err != nil {
		return nil, ErrInput
	}
	digest := sha256.Sum256(encoded)
	fingerprint := hex.EncodeToString(digest[:])
	var savedFingerprint string
	var previous []byte
	err = tx.QueryRow(ctx, `SELECT fingerprint,result FROM restaurant_setup_commands
	 WHERE organization_id=$1 AND actor_id=$2 AND operation=$3 AND idempotency_key=$4`, org, user, operation, key).Scan(&savedFingerprint, &previous)
	if err == nil || errors.Is(err, pgx.ErrNoRows) {
		if failure := authorization.Recheck(ctx); failure != nil {
			return nil, failure
		}
	}
	if err == nil {
		if fingerprint != savedFingerprint || len(previous) == 0 {
			return nil, ErrConflict
		}
		return previous, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, dbError(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO restaurant_setup_commands(organization_id,actor_id,operation,idempotency_key,fingerprint)
	 VALUES($1,$2,$3,$4,$5)`, org, user, operation, key, fingerprint)
	return nil, dbError(err)
}

func (service *Service) saveOrganizationSetup(ctx context.Context, user, org, key, operation string, input any) (SetupState, error) {
	if err := validateSetupIdempotencyKey(key); err != nil {
		return SetupState{}, err
	}
	authorization, err := service.beginOrganizationSetup(ctx, user, org)
	if err != nil {
		return SetupState{}, err
	}
	tx := authorization.Tx
	defer tx.Rollback(ctx)
	previous, err := claimOrganizationSetup(ctx, authorization, org, user, operation, key, input)
	if err != nil {
		return SetupState{}, err
	}
	if previous != nil {
		var state SetupState
		if err = json.Unmarshal(previous, &state); err != nil {
			return SetupState{}, ErrConflict
		}
		if err = authorization.Recheck(ctx); err != nil {
			return SetupState{}, err
		}
		return state, nil
	}
	if err = authorization.Recheck(ctx); err != nil {
		return SetupState{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO restaurant_profiles(organization_id,created_by,updated_by)
	 VALUES($1,$2,$2) ON CONFLICT(organization_id) DO NOTHING`, org, user); err != nil {
		return SetupState{}, dbError(err)
	}
	state, err := readOrganizationSetup(ctx, tx, org)
	if err != nil {
		return SetupState{}, err
	}
	if err = authorization.Recheck(ctx); err != nil {
		return SetupState{}, err
	}
	if state.Completed && operation != "complete" {
		return SetupState{}, ErrConflict
	}
	var tokens []IssuedTableQRToken
	if !state.Completed {
		beforeMenu := state.Menu
		beforeModes := state.Services
		switch operation {
		case "profile":
			profile := input.(SetupProfileInput)
			_, err = tx.Exec(ctx, `UPDATE organizations SET name=$2,code=COALESCE(NULLIF($3,''),code),business_type=$4,
			 contact_email=$5,contact_phone=$6,address=$7,updated_at=now() WHERE id=$1`, org, profile.Name, profile.Code, profile.BusinessType, profile.ContactEmail, profile.ContactPhone, profile.Address)
			if err == nil {
				err = authorization.Recheck(ctx)
			}
			if err == nil {
				var location any
				if profile.Location != nil {
					location, err = json.Marshal(profile.Location)
				}
				if err == nil {
					_, err = tx.Exec(ctx, `UPDATE restaurant_profiles SET profile_saved=true,
					 location=CASE WHEN $2::jsonb IS NOT NULL THEN $2::jsonb WHEN location->>'address' IS DISTINCT FROM $3 THEN NULL ELSE location END
					 WHERE organization_id=$1`, org, location, profile.Address)
				}
			}
			if err == nil && (profile.ServiceModes.any() || profile.ServiceModes.Pickup != nil) {
				err = saveOrganizationServiceModes(ctx, authorization, org, profile.ServiceModes, state.Services)
			}
		case "services":
			err = saveOrganizationServiceModes(ctx, authorization, org, input.(SetupServicesInput).ServiceModes, state.Services)
		case "tables":
			tokens, err = saveOrganizationTables(ctx, authorization, org, user, input.(SetupTablesInput))
		case "menu":
			err = saveOrganizationMenu(ctx, authorization, org, user, input.(SetupMenuInput))
		case "payments":
			payments := input.(SetupPaymentsInput)
			_, err = tx.Exec(ctx, "UPDATE restaurant_profiles SET payments_saved=true,cash_enabled=$2,bank_transfer_enabled=$3 WHERE organization_id=$1", org, payments.Cash, payments.BankTransfer)
		case "orders":
			orders := input.(SetupOrdersInput)
			_, err = tx.Exec(ctx, `UPDATE restaurant_profiles SET orders_saved=true,qr_ordering_enabled=$2,kitchen_enabled=$3,
			 auto_confirm_orders=$4,vat_rate=$5::numeric,service_charge_rate=$6::numeric WHERE organization_id=$1`, org, orders.QROrdering, orders.KitchenQueue, orders.AutoConfirm, orders.VATRate, orders.ServiceChargeRate)
		case "complete":
			if !state.Ready {
				return SetupState{}, ErrConflict
			}
			_, err = tx.Exec(ctx, "UPDATE restaurant_profiles SET completed_at=now(),trial_ends_at=now()+interval '30 days' WHERE organization_id=$1 AND completed_at IS NULL", org)
		default:
			return SetupState{}, ErrInput
		}
		if err != nil {
			return SetupState{}, dbError(err)
		}
		if err = authorization.Recheck(ctx); err != nil {
			return SetupState{}, err
		}
		if _, err = tx.Exec(ctx, "UPDATE restaurant_profiles SET revision=revision+1,updated_by=$2,updated_at=now() WHERE organization_id=$1", org, user); err != nil {
			return SetupState{}, dbError(err)
		}
		state, err = readOrganizationSetup(ctx, tx, org)
		if err != nil {
			return SetupState{}, err
		}
		if err = authorization.Recheck(ctx); err != nil {
			return SetupState{}, err
		}
		if operation == "menu" {
			if err = appendSetupMenuRevision(ctx, tx, org, user, beforeMenu, state.Menu); err != nil {
				return SetupState{}, err
			}
			if err = authorization.Recheck(ctx); err != nil {
				return SetupState{}, err
			}
		}
		if operation == "profile" || operation == "services" {
			type snapshot struct {
				Modes ServiceModes `json:"service_modes"`
			}
			if err = appendSetupMenuRevision(ctx, tx, org, user, snapshot{beforeModes}, snapshot{state.Services}); err != nil {
				return SetupState{}, err
			}
			if err = authorization.Recheck(ctx); err != nil {
				return SetupState{}, err
			}
		}
		state.IssuedTableQRTokens = tokens
		if err = organization.RecordAudit(ctx, tx, org, user, "RESTAURANT_SETUP_"+strings.ToUpper(operation), org); err != nil {
			return SetupState{}, err
		}
	}
	encoded, err := json.Marshal(state)
	if err != nil {
		return SetupState{}, err
	}
	if err = authorization.Recheck(ctx); err != nil {
		return SetupState{}, err
	}
	result, err := tx.Exec(ctx, `UPDATE restaurant_setup_commands SET result=$5
	 WHERE organization_id=$1 AND actor_id=$2 AND operation=$3 AND idempotency_key=$4 AND result IS NULL`, org, user, operation, key, encoded)
	if err != nil {
		return SetupState{}, dbError(err)
	}
	if result.RowsAffected() != 1 {
		return SetupState{}, ErrConflict
	}
	if err = authorization.Recheck(ctx); err != nil {
		return SetupState{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return SetupState{}, dbError(err)
	}
	return state, nil
}

func saveOrganizationServiceModes(ctx context.Context, authorization *organization.Authorization, org string, modes, current ServiceModes) error {
	// Resolve omission only after fingerprinting and replay, under the organization lock.
	if modes.Pickup == nil {
		modes.Pickup = current.Pickup
	}
	if !modes.any() {
		return ErrInput
	}
	if err := authorization.Recheck(ctx); err != nil {
		return err
	}
	_, err := authorization.Tx.Exec(ctx, "UPDATE restaurant_profiles SET services_saved=true,dine_in=$2,takeaway=$3,delivery=$4,pickup=$5 WHERE organization_id=$1", org, modes.DineIn, modes.Takeaway, modes.Delivery, modes.Pickup)
	return dbError(err)
}

func saveOrganizationTables(ctx context.Context, authorization *organization.Authorization, org, user string, input SetupTablesInput) ([]IssuedTableQRToken, error) {
	tx := authorization.Tx
	if err := authorization.Recheck(ctx); err != nil {
		return nil, err
	}
	preserveQR := map[string]bool{}
	if input.QREnabled && !input.GenerateQR {
		rows, err := tx.Query(ctx, `SELECT t.code FROM restaurant_dining_tables t
			JOIN restaurant_profiles p ON p.organization_id=t.organization_id
			WHERE t.organization_id=$1 AND t.status='ACTIVE' AND p.table_qr_enabled`, org)
		if err != nil {
			return nil, dbError(err)
		}
		codes, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			return nil, dbError(err)
		}
		for _, code := range codes {
			preserveQR[code] = true
		}
		if err = authorization.Recheck(ctx); err != nil {
			return nil, err
		}
	}
	if _, err := tx.Exec(ctx, "UPDATE restaurant_dining_tables SET status='INACTIVE',updated_by=$2,updated_at=now() WHERE organization_id=$1 AND status='ACTIVE'", org, user); err != nil {
		return nil, dbError(err)
	}
	if err := authorization.Recheck(ctx); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, "UPDATE restaurant_dining_zones SET status='INACTIVE',updated_by=$2,updated_at=now() WHERE organization_id=$1 AND status='ACTIVE'", org, user); err != nil {
		return nil, dbError(err)
	}
	tokens := []IssuedTableQRToken{}
	enableQR := input.GenerateQR || input.QREnabled
	for _, zone := range input.Zones {
		if err := authorization.Recheck(ctx); err != nil {
			return nil, err
		}
		var zoneID string
		if err := tx.QueryRow(ctx, `INSERT INTO restaurant_dining_zones(organization_id,code,name,created_by,updated_by)
		 VALUES($1,$2,$3,$4,$4) ON CONFLICT(organization_id,code) DO UPDATE SET name=$3,status='ACTIVE',updated_by=$4,updated_at=now() RETURNING id::text`, org, zone.Code, zone.Name, user).Scan(&zoneID); err != nil {
			return nil, dbError(err)
		}
		for _, table := range input.Tables {
			if table.ZoneCode != zone.Code {
				continue
			}
			if err := authorization.Recheck(ctx); err != nil {
				return nil, err
			}
			token, hash, err := newToken()
			if err != nil {
				return nil, err
			}
			var tableID string
			issueQR := enableQR && !preserveQR[table.Code]
			err = tx.QueryRow(ctx, `INSERT INTO restaurant_dining_tables(organization_id,zone_id,code,name,seats,qr_token_hash,created_by,updated_by)
			 VALUES($1,$2,$3,$4,$5,$6,$7,$7) ON CONFLICT(organization_id,code) DO UPDATE SET zone_id=$2,name=$4,seats=$5,status='ACTIVE',
			 qr_token_hash=CASE WHEN $8 THEN excluded.qr_token_hash ELSE restaurant_dining_tables.qr_token_hash END,
			 updated_by=$7,updated_at=now() RETURNING id::text`, org, zoneID, table.Code, table.Name, table.Seats, hash, user, issueQR).Scan(&tableID)
			if err != nil {
				return nil, dbError(err)
			}
			if issueQR {
				tokens = append(tokens, IssuedTableQRToken{TableID: tableID, Code: table.Code, QRToken: token})
			}
		}
	}
	if err := authorization.Recheck(ctx); err != nil {
		return nil, err
	}
	_, err := tx.Exec(ctx, "UPDATE restaurant_profiles SET tables_saved=true,table_qr_enabled=$2 WHERE organization_id=$1", org, enableQR)
	return tokens, dbError(err)
}
