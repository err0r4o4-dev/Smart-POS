package restaurant

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pricing"
)

var ErrSetupUnavailable = errors.New("restaurant setup schema unavailable")

const (
	setupDefaultUnitCode      = "EA"
	setupDefaultUnitName      = "ชิ้น"
	setupDefaultUnitInsertSQL = `INSERT INTO units(organization_id,code,name,unit_type) VALUES($1,$2,$3,'COUNT') ON CONFLICT (organization_id,code) DO NOTHING`
)

var setupSKU = regexp.MustCompile(`^[A-Z0-9][A-Z0-9_.-]{0,79}$`)
var setupBranchCode = regexp.MustCompile(`^[A-Z0-9][A-Z0-9_-]{0,49}$`)

const setupMenuUnitLookupSQL = "SELECT id::text FROM units WHERE organization_id=$1 AND code=$2 AND unit_type='COUNT' AND status='ACTIVE'"

type SetupStep struct {
	Key         string   `json:"key"`
	Status      string   `json:"status"`
	Complete    bool     `json:"complete"`
	Ready       bool     `json:"ready"`
	Reasons     []string `json:"reasons"`
	Reason      string   `json:"reason,omitempty"`
	CompletedAt string   `json:"completed_at,omitempty"`
}

type SetupReadinessItem struct {
	Key    string `json:"key"`
	Label  string `json:"label"`
	Reason string `json:"reason"`
}

type SetupReadiness struct {
	Ready      bool                 `json:"ready"`
	Incomplete []SetupReadinessItem `json:"incomplete"`
}

type SetupCapabilities struct {
	CardPayments bool `json:"cardPayments"`
}

type SetupState struct {
	OrganizationID      string               `json:"organization_id"`
	BranchID            string               `json:"branch_id"`
	CurrentStep         string               `json:"current_step"`
	Complete            bool                 `json:"complete"`
	Ready               bool                 `json:"ready"`
	Completed           bool                 `json:"completed"`
	Readiness           SetupReadiness       `json:"readiness"`
	Capabilities        SetupCapabilities    `json:"capabilities"`
	Steps               []SetupStep          `json:"steps"`
	Profile             any                  `json:"profile,omitempty"`
	Services            ServiceModes         `json:"services"`
	Tables              any                  `json:"tables,omitempty"`
	Menu                any                  `json:"menu,omitempty"`
	Payments            any                  `json:"payments,omitempty"`
	Orders              any                  `json:"orders,omitempty"`
	IssuedTableQRTokens []IssuedTableQRToken `json:"issued_table_qr_tokens,omitempty"`
}

type IssuedTableQRToken struct {
	TableID string `json:"table_id"`
	Code    string `json:"code"`
	QRToken string `json:"qr_token"`
}

type ServiceModes struct {
	DineIn   bool `json:"dine_in"`
	Takeaway bool `json:"takeaway"`
	Delivery bool `json:"delivery"`
}

type SetupServicesInput struct {
	BranchID     string       `json:"branch_id"`
	ServiceModes ServiceModes `json:"service_modes"`
}

type SetupProfileInput struct {
	BranchID     string       `json:"branch_id"`
	Name         string       `json:"name"`
	Code         string       `json:"code,omitempty"`
	BusinessType string       `json:"business_type"`
	ContactEmail string       `json:"contact_email"`
	ContactPhone string       `json:"contact_phone"`
	Address      string       `json:"address"`
	ServiceModes ServiceModes `json:"service_modes"`
	Organization *struct {
		Name         string `json:"name"`
		Code         string `json:"code"`
		BusinessType string `json:"business_type"`
		ContactEmail string `json:"contact_email"`
		ContactPhone string `json:"contact_phone"`
		Address      string `json:"address"`
	} `json:"organization,omitempty"`
	Branch *struct {
		Name    string `json:"name"`
		Code    string `json:"code"`
		Address string `json:"address"`
		Phone   string `json:"phone"`
		Email   string `json:"email"`
		Status  string `json:"status,omitempty"`
	} `json:"branch,omitempty"`
}

type SetupZoneInput struct {
	Code string `json:"code,omitempty"`
	Name string `json:"name"`
}

type SetupTableInput struct {
	Code     string `json:"code"`
	Name     string `json:"name"`
	Seats    int    `json:"seats"`
	ZoneCode string `json:"zone_code,omitempty"`
	Zone     string `json:"zone,omitempty"`
}

type SetupTablesInput struct {
	BranchID   string            `json:"branch_id"`
	Zones      []SetupZoneInput  `json:"zones"`
	Tables     []SetupTableInput `json:"tables"`
	GenerateQR bool              `json:"generate_qr"`
	QREnabled  bool              `json:"qr_enabled,omitempty"`
}

type SetupCategoryInput struct {
	ID   string `json:"id,omitempty"`
	Name string `json:"name"`
}

type SetupMenuItemInput struct {
	ProductID  string `json:"product_id,omitempty"`
	VariantID  string `json:"variant_id,omitempty"`
	CategoryID string `json:"category_id,omitempty"`
	SKU        string `json:"sku,omitempty"`
	Category   string `json:"category"`
	Name       string `json:"name"`
	Price      string `json:"price"`
}

type SetupMenuInput struct {
	BranchID   string               `json:"branch_id"`
	Categories []SetupCategoryInput `json:"categories"`
	Items      []SetupMenuItemInput `json:"items"`
}

type SetupPaymentsInput struct {
	BranchID     string `json:"branch_id"`
	Cash         bool   `json:"cash"`
	PromptPay    bool   `json:"promptpay"`
	Card         bool   `json:"card"`
	BankTransfer bool   `json:"bank_transfer,omitempty"`
}

type SetupOrdersInput struct {
	BranchID             string `json:"branch_id"`
	QROrdering           bool   `json:"qr_ordering"`
	KitchenQueue         bool   `json:"kitchen_queue"`
	AutoConfirm          bool   `json:"auto_confirm"`
	VATRate              string `json:"vat_rate"`
	ServiceChargeRate    string `json:"service_charge_rate"`
	VATPercent           string `json:"vat_percent,omitempty"`
	ServiceChargePercent string `json:"service_charge_percent,omitempty"`
}

type SetupCompleteInput struct {
	BranchID string `json:"branch_id"`
}

func (input *SetupProfileInput) normalize(branch string) error {
	if input.Organization != nil {
		input.Name, input.Code, input.BusinessType = input.Organization.Name, input.Organization.Code, input.Organization.BusinessType
		input.ContactEmail, input.ContactPhone, input.Address = input.Organization.ContactEmail, input.Organization.ContactPhone, input.Organization.Address
	}
	if input.BranchID == "" {
		input.BranchID = branch
	}
	if input.Branch != nil {
		name := strings.TrimSpace(input.Branch.Name)
		code := strings.ToUpper(strings.TrimSpace(input.Branch.Code))
		if name == "" || utf8.RuneCountInString(name) > 200 || strings.ContainsAny(name, "\x00\r\n") || !setupBranchCode.MatchString(code) {
			return ErrInput
		}
	}
	input.BranchID, input.Name, input.Code, input.BusinessType, input.ContactEmail = strings.TrimSpace(input.BranchID), strings.TrimSpace(input.Name), strings.ToUpper(strings.TrimSpace(input.Code)), strings.TrimSpace(input.BusinessType), strings.TrimSpace(input.ContactEmail)
	if !uuidPattern.MatchString(input.BranchID) || (input.Code != "" && !codePattern.MatchString(input.Code)) || input.Name == "" || utf8.RuneCountInString(input.Name) > 200 || input.BusinessType != "RESTAURANT" {
		return ErrInput
	}
	if input.ContactEmail != "" {
		if _, err := identity.NormalizeEmail(input.ContactEmail); err != nil {
			return ErrInput
		}
	}
	return nil
}

func (input SetupProfileInput) Validate() error { return input.normalize(input.BranchID) }
func (modes ServiceModes) any() bool            { return modes.DineIn || modes.Takeaway || modes.Delivery }

func (input *SetupTablesInput) normalize(branch string) error {
	if input.BranchID == "" {
		input.BranchID = branch
	}
	input.BranchID = strings.TrimSpace(input.BranchID)
	if !uuidPattern.MatchString(input.BranchID) || len(input.Zones) > 100 || len(input.Tables) > 500 {
		return ErrInput
	}
	if (input.GenerateQR || input.QREnabled) && len(input.Tables) == 0 {
		return ErrInput
	}
	zoneCodes := map[string]string{}
	for index := range input.Zones {
		input.Zones[index].Code = strings.ToUpper(strings.TrimSpace(input.Zones[index].Code))
		if input.Zones[index].Code == "" {
			input.Zones[index].Code = fmt.Sprintf("ZONE_%d", index+1)
		}
		zoneCodes[strings.TrimSpace(input.Zones[index].Name)] = input.Zones[index].Code
	}
	zones := make(map[string]struct{}, len(input.Zones))
	for _, zone := range input.Zones {
		name := strings.TrimSpace(zone.Name)
		if !codePattern.MatchString(zone.Code) || name == "" || utf8.RuneCountInString(name) > 100 {
			return ErrInput
		}
		if _, ok := zones[zone.Code]; ok {
			return ErrInput
		}
		zones[zone.Code] = struct{}{}
	}
	seen := map[string]struct{}{}
	for index := range input.Tables {
		table := &input.Tables[index]
		table.Code = strings.ToUpper(strings.TrimSpace(table.Code))
		if table.Code == "" {
			table.Code = fmt.Sprintf("T%d", index+1)
		}
		if table.ZoneCode == "" {
			table.ZoneCode = zoneCodes[strings.TrimSpace(table.Zone)]
		}
		table.ZoneCode = strings.ToUpper(strings.TrimSpace(table.ZoneCode))
		if table.Seats == 0 {
			table.Seats = 2
		}
		if !codePattern.MatchString(table.Code) || strings.TrimSpace(table.Name) == "" || table.Seats < 1 || table.Seats > 100 {
			return ErrInput
		}
		if _, ok := zones[table.ZoneCode]; !ok {
			return ErrInput
		}
		if _, ok := seen[table.Code]; ok {
			return ErrInput
		}
		seen[table.Code] = struct{}{}
	}
	return nil
}
func (input SetupTablesInput) Validate() error { return input.normalize(input.BranchID) }

func (input *SetupMenuInput) normalize(branch string) error {
	if input.BranchID == "" {
		input.BranchID = branch
	}
	input.BranchID = strings.TrimSpace(input.BranchID)
	if !uuidPattern.MatchString(input.BranchID) || len(input.Categories) == 0 || len(input.Categories) > 100 || len(input.Items) == 0 || len(input.Items) > 500 {
		return ErrInput
	}
	categories := map[string]struct{}{}
	for index := range input.Categories {
		input.Categories[index].ID = strings.TrimSpace(input.Categories[index].ID)
		if input.Categories[index].ID != "" && !uuidPattern.MatchString(input.Categories[index].ID) {
			return ErrInput
		}
		input.Categories[index].Name = strings.TrimSpace(input.Categories[index].Name)
		if input.Categories[index].Name == "" || utf8.RuneCountInString(input.Categories[index].Name) > 100 {
			return ErrInput
		}
		if _, ok := categories[input.Categories[index].Name]; ok {
			return ErrInput
		}
		categories[input.Categories[index].Name] = struct{}{}
	}
	for index := range input.Items {
		item := &input.Items[index]
		item.ProductID, item.VariantID, item.CategoryID = strings.TrimSpace(item.ProductID), strings.TrimSpace(item.VariantID), strings.TrimSpace(item.CategoryID)
		item.SKU = strings.ToUpper(strings.TrimSpace(item.SKU))
		item.Name, item.Category, item.Price = strings.TrimSpace(item.Name), strings.TrimSpace(item.Category), strings.TrimSpace(item.Price)
		amount, decimalErr := pricing.Decimal(item.Price, 2)
		if (item.ProductID != "" && !uuidPattern.MatchString(item.ProductID)) || (item.ProductID != "" && item.VariantID == "") || (item.VariantID != "" && !uuidPattern.MatchString(item.VariantID)) || (item.CategoryID != "" && !uuidPattern.MatchString(item.CategoryID)) || (item.SKU != "" && !setupSKU.MatchString(item.SKU)) || item.Name == "" || decimalErr != nil || amount <= 0 {
			return ErrInput
		}
		if _, ok := categories[item.Category]; !ok {
			return ErrInput
		}
	}
	return nil
}
func (input SetupMenuInput) Validate() error { return input.normalize(input.BranchID) }
func (input SetupPaymentsInput) Validate() error {
	if !uuidPattern.MatchString(strings.TrimSpace(input.BranchID)) || (!input.Cash && !input.BankTransfer) || input.Card || input.PromptPay {
		return ErrInput
	}
	return nil
}
func (input *SetupOrdersInput) normalize(branch string) error {
	if input.BranchID == "" {
		input.BranchID = branch
	}
	if input.VATRate == "" {
		input.VATRate = input.VATPercent
	}
	if input.ServiceChargeRate == "" {
		input.ServiceChargeRate = input.ServiceChargePercent
	}
	input.VATRate, input.ServiceChargeRate = strings.TrimSpace(input.VATRate), strings.TrimSpace(input.ServiceChargeRate)
	vat, vatErr := pricing.Decimal(input.VATRate, 2)
	charge, chargeErr := pricing.Decimal(input.ServiceChargeRate, 2)
	if !uuidPattern.MatchString(strings.TrimSpace(input.BranchID)) || vatErr != nil || chargeErr != nil || vat > 10000 || charge > 10000 {
		return ErrInput
	}
	return nil
}
func (input SetupOrdersInput) Validate() error { return input.normalize(input.BranchID) }
func (input SetupCompleteInput) Validate() error {
	if !uuidPattern.MatchString(strings.TrimSpace(input.BranchID)) {
		return ErrInput
	}
	return nil
}
func validateSetupIdempotencyKey(key string) error {
	if !uuidPattern.MatchString(strings.TrimSpace(key)) {
		return ErrInput
	}
	return nil
}

func setupStepKey(step int) string {
	return map[int]string{1: "profile", 2: "services", 3: "tables", 4: "menu", 5: "payments", 6: "orders"}[step]
}
func setupStepLabel(step int) string {
	return map[int]string{1: "Restaurant profile", 2: "Services", 3: "Tables and zones", 4: "Menu", 5: "Payments", 6: "Orders"}[step]
}

func ensureSetupProgress(ctx context.Context, tx pgx.Tx, org, branch, user string) error {
	var existing, status string
	err := tx.QueryRow(ctx, "SELECT branch_id::text,status FROM restaurant_setup_progress WHERE organization_id=$1", org).Scan(&existing, &status)
	if err == nil && existing != branch {
		return ErrConflict
	}
	if err == nil && status == "COMPLETED" {
		return ErrConflict
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return dbError(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO restaurant_setup_progress(organization_id,branch_id,status,current_step,created_by,updated_by) VALUES($1,$2,'IN_PROGRESS',1,$3,$3) ON CONFLICT (organization_id) DO NOTHING`, org, branch, user)
	return dbError(err)
}

func markSetupStep(ctx context.Context, tx pgx.Tx, org, branch, user string, step int) error {
	if _, err := tx.Exec(ctx, `INSERT INTO restaurant_setup_steps(organization_id,branch_id,step,status,completed_at,updated_by) VALUES($1,$2,$3,'COMPLETED',now(),$4) ON CONFLICT (organization_id,branch_id,step) DO UPDATE SET status='COMPLETED',completed_at=COALESCE(restaurant_setup_steps.completed_at,now()),updated_by=$4,updated_at=now()`, org, branch, step, user); err != nil {
		return dbError(err)
	}
	next := step + 1
	if next > 6 {
		next = 6
	}
	_, err := tx.Exec(ctx, `UPDATE restaurant_setup_progress SET status='IN_PROGRESS',current_step=GREATEST(current_step,$3),updated_by=$2,updated_at=now() WHERE organization_id=$1 AND branch_id=$4 AND status<>'COMPLETED'`, org, user, next, branch)
	return dbError(err)
}

func readSetupState(ctx context.Context, tx pgx.Tx, org, branch string) (SetupState, error) {
	state := SetupState{OrganizationID: org, BranchID: branch, CurrentStep: "profile", Capabilities: SetupCapabilities{CardPayments: false}, Readiness: SetupReadiness{Incomplete: []SetupReadinessItem{}}}
	steps := make(map[int]bool, 6)
	var current int
	var status, progressBranch string
	err := tx.QueryRow(ctx, "SELECT current_step,status,branch_id::text FROM restaurant_setup_progress WHERE organization_id=$1", org).Scan(&current, &status, &progressBranch)
	if errors.Is(err, pgx.ErrNoRows) {
		current = 1
	} else if err != nil {
		return state, dbError(err)
	}
	if progressBranch != "" && progressBranch != branch {
		return state, ErrConflict
	}
	rows, err := tx.Query(ctx, "SELECT step,status FROM restaurant_setup_steps WHERE organization_id=$1 AND branch_id=$2", org, branch)
	if err != nil {
		return state, dbError(err)
	}
	defer rows.Close()
	for rows.Next() {
		var step int
		var stepStatus string
		if err := rows.Scan(&step, &stepStatus); err != nil {
			return state, err
		}
		steps[step] = stepStatus == "COMPLETED"
	}
	if err := rows.Err(); err != nil {
		return state, err
	}
	rows.Close()
	if err = populateSetupData(ctx, tx, &state); err != nil {
		return state, err
	}
	tables := state.Tables.(map[string]any)
	menu := state.Menu.(map[string]any)
	payments := state.Payments.(map[string]any)
	var ordersExist bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM restaurant_settings s JOIN restaurant_charge_settings c ON c.organization_id=s.organization_id AND c.branch_id=s.branch_id WHERE s.organization_id=$1 AND s.branch_id=$2)`, org, branch).Scan(&ordersExist); err != nil {
		return state, dbError(err)
	}
	live := []bool{setupProfileReady(state.Profile), state.Services.any(), !state.Services.DineIn || (len(tables["zones"].([]map[string]any)) > 0 && len(tables["tables"].([]map[string]any)) > 0), len(menu["items"].([]map[string]any)) > 0, payments["cash"].(bool) || payments["bank_transfer"].(bool), ordersExist}
	var posSource, shopReady, menuReady, autoConfirmReady, chargesReady bool
	err = tx.QueryRow(ctx, `SELECT
 EXISTS(SELECT 1 FROM pos_terminals t JOIN stock_locations l ON l.organization_id=t.organization_id AND l.id=t.stock_location_id AND l.branch_id=t.branch_id WHERE t.organization_id=$1 AND t.branch_id=$2 AND t.status='ACTIVE' AND l.status='ACTIVE' AND l.type IN ('WAREHOUSE','SALES_FLOOR','SHELF')),
 EXISTS(SELECT 1 FROM storefronts s JOIN pos_terminals t ON t.organization_id=s.organization_id AND t.id=COALESCE(s.online_terminal_id,s.terminal_id) JOIN stock_locations l ON l.organization_id=t.organization_id AND l.id=t.stock_location_id AND l.branch_id=t.branch_id WHERE s.organization_id=$1 AND t.branch_id=$2 AND s.published AND s.accepting_orders AND t.status='ACTIVE' AND l.status='ACTIVE' AND l.type IN ('WAREHOUSE','SALES_FLOOR','SHELF') AND (s.online_terminal_id IS NULL OR l.type='WAREHOUSE')),
 EXISTS(SELECT 1 FROM storefronts s JOIN pos_terminals t ON t.organization_id=s.organization_id AND t.id=COALESCE(s.online_terminal_id,s.terminal_id) JOIN stock_locations l ON l.organization_id=t.organization_id AND l.id=t.stock_location_id AND l.branch_id=t.branch_id JOIN storefront_products sp ON sp.organization_id=s.organization_id AND sp.published JOIN product_variants v ON v.organization_id=sp.organization_id AND v.id=sp.variant_id JOIN products p ON p.organization_id=v.organization_id AND p.id=v.product_id JOIN units u ON u.organization_id=v.organization_id AND u.id=v.unit_id LEFT JOIN LATERAL (SELECT (entry->>'unit_price')::numeric(18,2) AS price FROM price_lists list CROSS JOIN LATERAL jsonb_array_elements(list.items) entry WHERE list.organization_id=v.organization_id AND (list.branch_id IS NULL OR list.branch_id=$2::uuid) AND list.status='ACTIVE' AND (list.starts_at IS NULL OR list.starts_at<=statement_timestamp()) AND (list.ends_at IS NULL OR list.ends_at>statement_timestamp()) AND entry->>'variant_id'=v.id::text ORDER BY (list.branch_id IS NOT NULL) DESC,list.priority DESC,list.id LIMIT 1) price_list ON true WHERE s.organization_id=$1 AND t.branch_id=$2 AND s.published AND s.accepting_orders AND t.status='ACTIVE' AND l.status='ACTIVE' AND l.type IN ('WAREHOUSE','SALES_FLOOR','SHELF') AND (s.online_terminal_id IS NULL OR l.type='WAREHOUSE') AND p.status='ACTIVE' AND v.status='ACTIVE' AND u.status='ACTIVE' AND v.currency='THB' AND COALESCE(price_list.price,v.selling_price)>0 AND NOT EXISTS(SELECT 1 FROM restaurant_recipes r WHERE r.organization_id=v.organization_id AND r.branch_id=$2 AND r.menu_variant_id=v.id AND r.status='ACTIVE') AND greatest(0.000,storefront_sellable_quantity($1,l.id,v.id)-storefront_reserved_quantity($1,l.id,v.id))>=CASE WHEN u.unit_type IN ('COUNT','PACKAGING') THEN 1.000 ELSE 0.001 END),
 COALESCE((SELECT NOT auto_confirm_orders FROM restaurant_settings WHERE organization_id=$1 AND branch_id=$2),false),
 COALESCE((SELECT vat_rate=0 AND service_charge_rate=0 FROM restaurant_charge_settings WHERE organization_id=$1 AND branch_id=$2),false)`, org, branch).Scan(&posSource, &shopReady, &menuReady, &autoConfirmReady, &chargesReady)
	if err != nil {
		return state, dbError(err)
	}
	live = append(live, posSource, shopReady, menuReady, autoConfirmReady, chargesReady)
	applySetupReadiness(&state, steps, live)
	state.Complete = status == "COMPLETED"
	state.Completed = state.Complete
	return state, nil
}

func applySetupReadiness(state *SetupState, steps map[int]bool, live []bool) {
	state.CurrentStep = "review"
	state.Steps = nil
	state.Readiness.Incomplete = []SetupReadinessItem{}
	firstIncomplete := 0
	firstUnready := 0
	for step := 1; step <= 6; step++ {
		complete := steps[step]
		ready := live[step-1]
		if !complete && firstIncomplete == 0 {
			firstIncomplete = step
		}
		if !ready && firstUnready == 0 {
			firstUnready = step
		}
		entry := SetupStep{Key: setupStepKey(step), Status: "PENDING", Complete: complete, Ready: ready, Reasons: []string{}}
		if complete {
			entry.Status = "COMPLETE"
		}
		if !ready {
			reason := "Complete the " + setupStepLabel(step) + " step"
			entry.Reasons = []string{reason}
			entry.Reason = reason
			state.Readiness.Incomplete = append(state.Readiness.Incomplete, SetupReadinessItem{Key: entry.Key, Label: setupStepLabel(step), Reason: reason})
		}
		state.Steps = append(state.Steps, entry)
	}
	prerequisites := []SetupReadinessItem{
		{Key: "pos_source", Label: "POS source", Reason: "Activate a POS terminal and stock location for this branch"},
		{Key: "storefront", Label: "Storefront", Reason: "Configure and publish an accepting storefront with an active branch stock source"},
		{Key: "storefront_menu", Label: "Storefront menu", Reason: "Publish a directly stocked menu item with an active price and available stock; recipe-only saleability is not yet verified here"},
		{Key: "auto_confirm", Label: "Automatic confirmation", Reason: "Disable automatic confirmation until order lifecycle support is available"},
		{Key: "charges", Label: "VAT and service charge", Reason: "Set VAT and service charge to zero until order lifecycle support is available"},
	}
	orders, ordersKnown := state.Orders.(map[string]any)
	qrOrdering, qrKnown := orders["qr_ordering"].(bool)
	for index, item := range prerequisites {
		if (index == 1 || index == 2) && ordersKnown && qrKnown && !qrOrdering {
			continue
		}
		if len(live) > index+6 && !live[index+6] {
			state.Readiness.Incomplete = append(state.Readiness.Incomplete, item)
		}
	}
	if firstIncomplete != 0 {
		state.CurrentStep = setupStepKey(firstIncomplete)
	} else if firstUnready != 0 {
		state.CurrentStep = setupStepKey(firstUnready)
	}
	state.Ready = len(state.Readiness.Incomplete) == 0
	state.Readiness.Ready = state.Ready
}

func setupProfileReady(value any) bool {
	profile, ok := value.(map[string]any)
	if !ok {
		return false
	}
	textValue := func(values map[string]any, key string) string {
		text, _ := values[key].(string)
		return strings.TrimSpace(text)
	}
	organization, ok := profile["organization"].(map[string]any)
	if !ok || textValue(organization, "name") == "" || textValue(organization, "code") == "" || textValue(organization, "business_type") != "RESTAURANT" {
		return false
	}
	branch, ok := profile["branch"].(map[string]any)
	return ok && textValue(branch, "name") != "" && textValue(branch, "code") != ""
}

func populateSetupData(ctx context.Context, tx pgx.Tx, state *SetupState) error {
	profile := map[string]any{"organization": map[string]any{}, "branch": map[string]any{}, "service_modes": map[string]bool{"dine_in": false, "takeaway": false, "delivery": false}}
	var organizationName, code, businessType, email, phone, address string
	if err := tx.QueryRow(ctx, "SELECT name,code,business_type,contact_email,contact_phone,address FROM organizations WHERE id=$1", state.OrganizationID).Scan(&organizationName, &code, &businessType, &email, &phone, &address); err != nil {
		return dbError(err)
	}
	profile["organization"] = map[string]any{"name": organizationName, "code": code, "business_type": businessType, "contact_email": email, "contact_phone": phone, "address": address}
	var branchName, branchCode, branchAddress, branchPhone, branchEmail string
	if err := tx.QueryRow(ctx, "SELECT name,code,address,phone,email FROM branches WHERE organization_id=$1 AND id=$2", state.OrganizationID, state.BranchID).Scan(&branchName, &branchCode, &branchAddress, &branchPhone, &branchEmail); err != nil {
		return dbError(err)
	}
	profile["branch"] = map[string]any{"name": branchName, "code": branchCode, "address": branchAddress, "phone": branchPhone, "email": branchEmail}
	modeRows, err := tx.Query(ctx, "SELECT mode,enabled FROM restaurant_service_modes WHERE organization_id=$1 AND branch_id=$2", state.OrganizationID, state.BranchID)
	if err != nil {
		return dbError(err)
	}
	for modeRows.Next() {
		var mode string
		var enabled bool
		if err := modeRows.Scan(&mode, &enabled); err != nil {
			modeRows.Close()
			return err
		}
		switch mode {
		case "DINE_IN":
			profile["service_modes"].(map[string]bool)["dine_in"] = enabled
		case "TAKEAWAY":
			profile["service_modes"].(map[string]bool)["takeaway"] = enabled
		case "DELIVERY":
			profile["service_modes"].(map[string]bool)["delivery"] = enabled
		}
	}
	if err := modeRows.Err(); err != nil {
		modeRows.Close()
		return err
	}
	modeRows.Close()
	modes := profile["service_modes"].(map[string]bool)
	state.Services = ServiceModes{DineIn: modes["dine_in"], Takeaway: modes["takeaway"], Delivery: modes["delivery"]}
	state.Profile = profile

	tables := map[string]any{"zones": []map[string]any{}, "tables": []map[string]any{}, "qr_enabled": false}
	var qrEnabled bool
	err = tx.QueryRow(ctx, "SELECT table_qr_enabled FROM restaurant_settings WHERE organization_id=$1 AND branch_id=$2", state.OrganizationID, state.BranchID).Scan(&qrEnabled)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return dbError(err)
	}
	tables["qr_enabled"] = qrEnabled
	zoneRows, err := tx.Query(ctx, "SELECT code,name FROM restaurant_zones WHERE organization_id=$1 AND branch_id=$2 AND status='ACTIVE' ORDER BY sort_order,code", state.OrganizationID, state.BranchID)
	if err != nil {
		return dbError(err)
	}
	for zoneRows.Next() {
		var zoneCode, zoneName string
		if err := zoneRows.Scan(&zoneCode, &zoneName); err != nil {
			zoneRows.Close()
			return err
		}
		tables["zones"] = append(tables["zones"].([]map[string]any), map[string]any{"code": zoneCode, "name": zoneName})
	}
	if err := zoneRows.Err(); err != nil {
		zoneRows.Close()
		return err
	}
	zoneRows.Close()
	tableRows, err := tx.Query(ctx, `SELECT t.code,t.name,z.code,z.name,t.seats FROM restaurant_tables t JOIN restaurant_table_zones tz ON tz.organization_id=t.organization_id AND tz.branch_id=t.branch_id AND tz.table_id=t.id JOIN restaurant_zones z ON z.organization_id=tz.organization_id AND z.branch_id=tz.branch_id AND z.id=tz.zone_id AND z.status='ACTIVE' WHERE t.organization_id=$1 AND t.branch_id=$2 AND t.status='ACTIVE' ORDER BY t.code`, state.OrganizationID, state.BranchID)
	if err != nil {
		return dbError(err)
	}
	for tableRows.Next() {
		var code, name, zoneCode, zoneName string
		var seats int
		if err := tableRows.Scan(&code, &name, &zoneCode, &zoneName, &seats); err != nil {
			tableRows.Close()
			return err
		}
		tables["tables"] = append(tables["tables"].([]map[string]any), map[string]any{"code": code, "name": name, "zone_code": zoneCode, "zone": zoneName, "seats": seats})
	}
	if err := tableRows.Err(); err != nil {
		tableRows.Close()
		return err
	}
	tableRows.Close()
	state.Tables = tables

	menu := map[string]any{"categories": []map[string]any{}, "items": []map[string]any{}}
	categoryRows, err := tx.Query(ctx, "SELECT id::text,name FROM categories WHERE organization_id=$1 AND status='ACTIVE' ORDER BY name", state.OrganizationID)
	if err != nil {
		return dbError(err)
	}
	for categoryRows.Next() {
		var id, name string
		if err := categoryRows.Scan(&id, &name); err != nil {
			categoryRows.Close()
			return err
		}
		menu["categories"] = append(menu["categories"].([]map[string]any), map[string]any{"id": id, "name": name})
	}
	if err := categoryRows.Err(); err != nil {
		categoryRows.Close()
		return err
	}
	categoryRows.Close()
	itemRows, err := tx.Query(ctx, `SELECT product.id::text,variant.id::text,variant.sku,category.id::text,product.name,category.name,variant.selling_price::text FROM product_variants variant JOIN products product ON product.organization_id=variant.organization_id AND product.id=variant.product_id JOIN categories category ON category.organization_id=product.organization_id AND category.id=product.category_id AND category.status='ACTIVE' WHERE variant.organization_id=$1 AND product.status='ACTIVE' AND variant.status='ACTIVE' ORDER BY product.name,variant.id`, state.OrganizationID)
	if err != nil {
		return dbError(err)
	}
	for itemRows.Next() {
		var productID, variantID, sku, categoryID, name, category, price string
		if err := itemRows.Scan(&productID, &variantID, &sku, &categoryID, &name, &category, &price); err != nil {
			itemRows.Close()
			return err
		}
		menu["items"] = append(menu["items"].([]map[string]any), map[string]any{"product_id": productID, "variant_id": variantID, "sku": sku, "category_id": categoryID, "name": name, "category": category, "price": price})
	}
	if err := itemRows.Err(); err != nil {
		itemRows.Close()
		return err
	}
	itemRows.Close()
	state.Menu = menu

	payments := map[string]any{"cash": false, "promptpay": false, "qr_manual": false, "bank_transfer": false, "card": false}
	paymentRows, err := tx.Query(ctx, "SELECT method,enabled FROM restaurant_payment_settings WHERE organization_id=$1 AND branch_id=$2", state.OrganizationID, state.BranchID)
	if err != nil {
		return dbError(err)
	}
	for paymentRows.Next() {
		var method string
		var enabled bool
		if err := paymentRows.Scan(&method, &enabled); err != nil {
			paymentRows.Close()
			return err
		}
		if method == "CASH" {
			payments["cash"] = enabled
		}
		if method == "BANK_TRANSFER_MANUAL" {
			payments["bank_transfer"] = enabled
		}
		if method == "QR_MANUAL" {
			// Migration 000030 has no merchant identifier for QR_MANUAL. Keep
			// the method distinct in the response, but never report it as
			// configured until the identifier can be persisted and verified.
			payments["qr_manual"] = false
			payments["promptpay"] = false
		}
	}
	if err := paymentRows.Err(); err != nil {
		paymentRows.Close()
		return err
	}
	paymentRows.Close()
	state.Payments = payments

	orders := map[string]any{"qr_ordering": false, "kitchen_queue": false, "auto_confirm": false, "vat_percent": "0.00", "service_charge_percent": "0.00"}
	var vat, service string
	var qrOrdering, kitchenQueue, autoConfirm bool
	err = tx.QueryRow(ctx, `SELECT s.qr_ordering_enabled,s.kitchen_enabled,s.auto_confirm_orders,COALESCE(c.vat_rate,0)::text,COALESCE(c.service_charge_rate,0)::text FROM restaurant_settings s LEFT JOIN restaurant_charge_settings c ON c.organization_id=s.organization_id AND c.branch_id=s.branch_id WHERE s.organization_id=$1 AND s.branch_id=$2`, state.OrganizationID, state.BranchID).Scan(&qrOrdering, &kitchenQueue, &autoConfirm, &vat, &service)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return dbError(err)
	}
	if err == nil {
		orders["qr_ordering"], orders["kitchen_queue"], orders["auto_confirm"], orders["vat_percent"], orders["service_charge_percent"] = qrOrdering, kitchenQueue, autoConfirm, vat, service
	}
	state.Orders = orders
	return nil
}

func setupMenuUnit(ctx context.Context, tx pgx.Tx, org string) (string, error) {
	var unitID string
	err := tx.QueryRow(ctx, setupMenuUnitLookupSQL, org, setupDefaultUnitCode).Scan(&unitID)
	if err == nil {
		return unitID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", dbError(err)
	}
	if _, err = tx.Exec(ctx, setupDefaultUnitInsertSQL, org, setupDefaultUnitCode, setupDefaultUnitName); err != nil {
		return "", dbError(err)
	}
	if err = tx.QueryRow(ctx, setupMenuUnitLookupSQL, org, setupDefaultUnitCode).Scan(&unitID); errors.Is(err, pgx.ErrNoRows) {
		return "", ErrConflict
	} else if err != nil {
		return "", dbError(err)
	}
	return unitID, nil
}

func setupMenuSKU(item SetupMenuItemInput) string {
	if item.SKU != "" {
		return item.SKU
	}
	digest := sha256.Sum256([]byte(item.Category + "\x00" + item.Name))
	return "SETUP_" + strings.ToUpper(hex.EncodeToString(digest[:]))
}

func beginSetup(ctx context.Context, service *Service, user, org, branch string) (pgx.Tx, organization.Member, string, error) {
	if service.Organization == nil || service.Organization.Pool == nil {
		return nil, organization.Member{}, "", ErrSetupUnavailable
	}
	tx, actor, err := service.begin(ctx, user, org, "organization.update")
	if err != nil {
		return nil, organization.Member{}, "", err
	}
	if err = organization.RequireVerified(ctx, tx, user); err != nil {
		tx.Rollback(ctx)
		return nil, organization.Member{}, "", err
	}
	if branch == "" {
		if err = tx.QueryRow(ctx, "SELECT id::text FROM branches WHERE organization_id=$1 AND status='ACTIVE' ORDER BY is_main DESC,code LIMIT 1", org).Scan(&branch); err != nil {
			tx.Rollback(ctx)
			return nil, organization.Member{}, "", dbError(err)
		}
	}
	if !uuidPattern.MatchString(branch) {
		tx.Rollback(ctx)
		return nil, organization.Member{}, "", ErrInput
	}
	if err = activeBranch(ctx, tx, actor, org, branch); err != nil {
		tx.Rollback(ctx)
		return nil, organization.Member{}, "", err
	}
	return tx, actor, branch, nil
}

func finishSetup(ctx context.Context, tx pgx.Tx, org, user, event string, result SetupState) error {
	if err := organization.RecordAudit(ctx, tx, org, user, event, org); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return dbError(err)
	}
	return nil
}

func completeSetupProgressResult(rows int64) error {
	if rows != 1 {
		return ErrConflict
	}
	return nil
}

func (service *Service) Setup(ctx context.Context, user, org, branch string) (SetupState, error) {
	tx, _, branch, err := beginSetup(ctx, service, user, org, branch)
	if err != nil {
		return SetupState{}, err
	}
	defer tx.Rollback(ctx)
	return readSetupState(ctx, tx, org, branch)
}

func (service *Service) SaveProfile(ctx context.Context, user, org, key string, input SetupProfileInput) (SetupState, error) {
	if err := validateSetupIdempotencyKey(key); err != nil {
		return SetupState{}, err
	}
	tx, _, branch, err := beginSetup(ctx, service, user, org, input.BranchID)
	if err != nil {
		return SetupState{}, err
	}
	defer tx.Rollback(ctx)
	if err = input.normalize(branch); err != nil {
		return SetupState{}, err
	}
	command, previous, err := claimCommand(ctx, tx, org, user, "restaurant.setup.profile", key, input)
	if err != nil {
		return SetupState{}, err
	}
	if previous != nil {
		var state SetupState
		if json.Unmarshal(previous, &state) == nil {
			return state, nil
		}
		return SetupState{}, ErrConflict
	}
	if input.Branch != nil {
		if _, err = tx.Exec(ctx, "UPDATE branches SET name=$3,code=$4,address=$5,phone=$6,email=$7,status='ACTIVE' WHERE organization_id=$1 AND id=$2", org, branch, input.Branch.Name, input.Branch.Code, input.Branch.Address, input.Branch.Phone, input.Branch.Email); err != nil {
			return SetupState{}, dbError(err)
		}
	}
	if _, err = tx.Exec(ctx, "UPDATE organizations SET name=$2,code=COALESCE(NULLIF($3,''),code),business_type=$4,contact_email=$5,contact_phone=$6,address=$7,updated_at=now() WHERE id=$1", org, input.Name, input.Code, input.BusinessType, input.ContactEmail, input.ContactPhone, input.Address); err != nil {
		return SetupState{}, dbError(err)
	}
	if input.ServiceModes.any() {
		if err = saveServiceModes(ctx, tx, org, branch, user, input.ServiceModes); err != nil {
			return SetupState{}, err
		}
	}
	if err = ensureSetupProgress(ctx, tx, org, branch, user); err != nil {
		return SetupState{}, err
	}
	if err = markSetupStep(ctx, tx, org, branch, user, 1); err != nil {
		return SetupState{}, err
	}
	state, err := readSetupState(ctx, tx, org, branch)
	if err != nil {
		return SetupState{}, err
	}
	if err = saveCommand(ctx, tx, org, command, state); err != nil {
		return SetupState{}, err
	}
	if err = finishSetup(ctx, tx, org, user, "RESTAURANT_SETUP_PROFILE", state); err != nil {
		return SetupState{}, err
	}
	return state, nil
}

func saveServiceModes(ctx context.Context, tx pgx.Tx, org, branch, user string, input ServiceModes) error {
	modes := map[string]bool{"DINE_IN": input.DineIn, "TAKEAWAY": input.Takeaway, "DELIVERY": input.Delivery}
	for mode, enabled := range modes {
		if _, err := tx.Exec(ctx, `INSERT INTO restaurant_service_modes(organization_id,branch_id,mode,enabled,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,branch_id,mode) DO UPDATE SET enabled=$4,revision=restaurant_service_modes.revision+1,updated_by=$5,updated_at=now()`, org, branch, mode, enabled, user); err != nil {
			return dbError(err)
		}
	}
	return nil
}

func (service *Service) SaveServices(ctx context.Context, user, org, key string, input SetupServicesInput) (SetupState, error) {
	if err := validateSetupIdempotencyKey(key); err != nil {
		return SetupState{}, err
	}
	tx, _, branch, err := beginSetup(ctx, service, user, org, input.BranchID)
	if err != nil {
		return SetupState{}, err
	}
	defer tx.Rollback(ctx)
	input.BranchID = branch
	if !input.ServiceModes.any() {
		return SetupState{}, ErrInput
	}
	command, previous, err := claimCommand(ctx, tx, org, user, "restaurant.setup.services", key, input)
	if err != nil {
		return SetupState{}, err
	}
	if previous != nil {
		var state SetupState
		if json.Unmarshal(previous, &state) == nil {
			return state, nil
		}
		return SetupState{}, ErrConflict
	}
	if err = ensureSetupProgress(ctx, tx, org, branch, user); err != nil {
		return SetupState{}, err
	}
	if err = saveServiceModes(ctx, tx, org, branch, user, input.ServiceModes); err != nil {
		return SetupState{}, err
	}
	if err = markSetupStep(ctx, tx, org, branch, user, 2); err != nil {
		return SetupState{}, err
	}
	state, err := readSetupState(ctx, tx, org, branch)
	if err != nil {
		return SetupState{}, err
	}
	if err = saveCommand(ctx, tx, org, command, state); err != nil {
		return SetupState{}, err
	}
	if err = finishSetup(ctx, tx, org, user, "RESTAURANT_SETUP_SERVICES", state); err != nil {
		return SetupState{}, err
	}
	return state, nil
}

func (service *Service) SaveTables(ctx context.Context, user, org, key string, input SetupTablesInput) (SetupState, error) {
	if err := validateSetupIdempotencyKey(key); err != nil {
		return SetupState{}, err
	}
	tx, _, branch, err := beginSetup(ctx, service, user, org, input.BranchID)
	if err != nil {
		return SetupState{}, err
	}
	defer tx.Rollback(ctx)
	if err = input.normalize(branch); err != nil {
		return SetupState{}, err
	}
	command, previous, err := claimCommand(ctx, tx, org, user, "restaurant.setup.tables", key, input)
	if err != nil {
		return SetupState{}, err
	}
	if previous != nil {
		var state SetupState
		if json.Unmarshal(previous, &state) == nil {
			return state, nil
		}
		return SetupState{}, ErrConflict
	}
	if err = ensureSetupProgress(ctx, tx, org, branch, user); err != nil {
		return SetupState{}, err
	}
	var stateQR []IssuedTableQRToken
	for _, zone := range input.Zones {
		var zoneID string
		if err = tx.QueryRow(ctx, `INSERT INTO restaurant_zones(organization_id,branch_id,code,name,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$5) ON CONFLICT(organization_id,branch_id,code) DO UPDATE SET name=$4,updated_by=$5,updated_at=now() RETURNING id::text`, org, branch, zone.Code, zone.Name, user).Scan(&zoneID); err != nil {
			return SetupState{}, dbError(err)
		}
		for _, table := range input.Tables {
			if table.ZoneCode != zone.Code {
				continue
			}
			var tableID string
			var token, hash string
			token, hash, err = newToken()
			if err != nil {
				return SetupState{}, err
			}
			if err = tx.QueryRow(ctx, `INSERT INTO restaurant_tables(organization_id,branch_id,code,name,seats,status,qr_token_hash,created_by,updated_by) VALUES($1,$2,$3,$4,$5,'ACTIVE',$6,$7,$7) ON CONFLICT(organization_id,branch_id,code) DO UPDATE SET name=$4,seats=$5,status='ACTIVE',qr_token_hash=CASE WHEN $8 THEN excluded.qr_token_hash ELSE restaurant_tables.qr_token_hash END,updated_by=$7,updated_at=now() RETURNING id::text`, org, branch, table.Code, table.Name, table.Seats, hash, user, input.GenerateQR || input.QREnabled).Scan(&tableID); err != nil {
				return SetupState{}, dbError(err)
			}
			if input.GenerateQR || input.QREnabled {
				stateQR = append(stateQR, IssuedTableQRToken{TableID: tableID, Code: table.Code, QRToken: token})
			}
			if _, err = tx.Exec(ctx, `INSERT INTO restaurant_table_zones(organization_id,branch_id,table_id,zone_id) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id,branch_id,table_id) DO UPDATE SET zone_id=$4,assigned_at=now()`, org, branch, tableID, zoneID); err != nil {
				return SetupState{}, dbError(err)
			}
		}
	}
	if _, err = tx.Exec(ctx, `INSERT INTO restaurant_settings(organization_id,branch_id,closing_time,timezone,revision,updated_by,table_qr_enabled) VALUES($1,$2,'22:00','Asia/Bangkok',1,$3,$4) ON CONFLICT(organization_id,branch_id) DO UPDATE SET table_qr_enabled=$4,revision=restaurant_settings.revision+1,updated_by=$3,updated_at=now()`, org, branch, user, input.GenerateQR || input.QREnabled); err != nil {
		return SetupState{}, dbError(err)
	}
	if err = markSetupStep(ctx, tx, org, branch, user, 3); err != nil {
		return SetupState{}, err
	}
	state, err := readSetupState(ctx, tx, org, branch)
	if err != nil {
		return SetupState{}, err
	}
	state.IssuedTableQRTokens = stateQR
	if err = saveCommand(ctx, tx, org, command, state); err != nil {
		return SetupState{}, err
	}
	if err = finishSetup(ctx, tx, org, user, "RESTAURANT_SETUP_TABLES", state); err != nil {
		return SetupState{}, err
	}
	return state, nil
}

func (service *Service) SaveMenu(ctx context.Context, user, org, key string, input SetupMenuInput) (SetupState, error) {
	if err := validateSetupIdempotencyKey(key); err != nil {
		return SetupState{}, err
	}
	tx, _, branch, err := beginSetup(ctx, service, user, org, input.BranchID)
	if err != nil {
		return SetupState{}, err
	}
	defer tx.Rollback(ctx)
	if err = input.normalize(branch); err != nil {
		return SetupState{}, err
	}
	command, previous, err := claimCommand(ctx, tx, org, user, "restaurant.setup.menu", key, input)
	if err != nil {
		return SetupState{}, err
	}
	if previous != nil {
		var state SetupState
		if json.Unmarshal(previous, &state) == nil {
			return state, nil
		}
		return SetupState{}, ErrConflict
	}
	var currency string
	if err = tx.QueryRow(ctx, "SELECT currency FROM organizations WHERE id=$1", org).Scan(&currency); err != nil {
		return SetupState{}, dbError(err)
	}
	unitID, unitErr := setupMenuUnit(ctx, tx, org)
	if unitErr != nil {
		return SetupState{}, unitErr
	}
	categoryIDs := map[string]string{}
	for _, category := range input.Categories {
		var id string
		if category.ID != "" {
			err = tx.QueryRow(ctx, "SELECT id::text FROM categories WHERE organization_id=$1 AND id=$2 AND status='ACTIVE'", org, category.ID).Scan(&id)
			if errors.Is(err, pgx.ErrNoRows) {
				return SetupState{}, ErrInput
			}
			if err == nil {
				_, err = tx.Exec(ctx, "UPDATE categories SET name=$3,updated_at=now() WHERE organization_id=$1 AND id=$2", org, id, category.Name)
			}
		} else {
			err = tx.QueryRow(ctx, "SELECT id::text FROM categories WHERE organization_id=$1 AND lower(btrim(name))=lower($2) AND status='ACTIVE'", org, category.Name).Scan(&id)
			if errors.Is(err, pgx.ErrNoRows) {
				err = tx.QueryRow(ctx, "INSERT INTO categories(organization_id,name,status) VALUES($1,$2,'ACTIVE') RETURNING id::text", org, category.Name).Scan(&id)
			}
		}
		if err != nil {
			return SetupState{}, dbError(err)
		}
		categoryIDs[category.Name] = id
	}
	for _, item := range input.Items {
		categoryID := categoryIDs[item.Category]
		if item.CategoryID != "" {
			if _, ok := categoryIDs[item.Category]; !ok {
				return SetupState{}, ErrInput
			}
			categoryID = item.CategoryID
			var categoryExists string
			if err = tx.QueryRow(ctx, "SELECT id::text FROM categories WHERE organization_id=$1 AND id=$2 AND status='ACTIVE'", org, categoryID).Scan(&categoryExists); errors.Is(err, pgx.ErrNoRows) {
				return SetupState{}, ErrInput
			}
			if err != nil {
				return SetupState{}, dbError(err)
			}
		}
		var variantID, productID string
		if item.VariantID != "" {
			err = tx.QueryRow(ctx, "SELECT variant.id::text,product.id::text FROM product_variants variant JOIN products product ON product.organization_id=variant.organization_id AND product.id=variant.product_id WHERE variant.organization_id=$1 AND variant.id=$2", org, item.VariantID).Scan(&variantID, &productID)
			if errors.Is(err, pgx.ErrNoRows) {
				return SetupState{}, ErrInput
			}
			if err != nil {
				return SetupState{}, dbError(err)
			}
			if item.ProductID != "" && productID != item.ProductID {
				return SetupState{}, ErrInput
			}
		} else if item.SKU != "" {
			err = tx.QueryRow(ctx, "SELECT variant.id::text,product.id::text FROM product_variants variant JOIN products product ON product.organization_id=variant.organization_id AND product.id=variant.product_id WHERE variant.organization_id=$1 AND variant.sku=$2", org, item.SKU).Scan(&variantID, &productID)
			if errors.Is(err, pgx.ErrNoRows) {
				err = nil
			} else if err != nil {
				return SetupState{}, dbError(err)
			}
		}
		if variantID == "" {
			sku := setupMenuSKU(item)
			err = tx.QueryRow(ctx, "SELECT id::text,product_id::text FROM product_variants WHERE organization_id=$1 AND sku=$2", org, sku).Scan(&variantID, &productID)
		}
		if errors.Is(err, pgx.ErrNoRows) {
			err = tx.QueryRow(ctx, "INSERT INTO products(organization_id,name,category_id,status,created_by,updated_by) VALUES($1,$2,$3,'ACTIVE',$4,$4) RETURNING id::text", org, item.Name, categoryID, user).Scan(&productID)
			if err == nil {
				sku := setupMenuSKU(item)
				err = tx.QueryRow(ctx, `INSERT INTO product_variants(organization_id,product_id,sku,name,unit_id,cost_price,selling_price,currency,status) VALUES($1,$2,$3,$4,$5,0,$6::numeric,$7,'ACTIVE') RETURNING id::text`, org, productID, sku, item.Name, unitID, item.Price, currency).Scan(&variantID)
			}
		} else if err == nil {
			if _, err = tx.Exec(ctx, "UPDATE products SET name=$3,category_id=$4,updated_by=$5,updated_at=now() WHERE organization_id=$1 AND id=$2", org, productID, item.Name, categoryID, user); err == nil {
				_, err = tx.Exec(ctx, "UPDATE product_variants SET name=$3,selling_price=$4::numeric,updated_at=now() WHERE organization_id=$1 AND id=$2", org, variantID, item.Name, item.Price)
			}
		}
		if err != nil {
			return SetupState{}, dbError(err)
		}
	}
	if err = ensureSetupProgress(ctx, tx, org, branch, user); err != nil {
		return SetupState{}, err
	}
	if err = markSetupStep(ctx, tx, org, branch, user, 4); err != nil {
		return SetupState{}, err
	}
	state, err := readSetupState(ctx, tx, org, branch)
	if err != nil {
		return SetupState{}, err
	}
	if err = saveCommand(ctx, tx, org, command, state); err != nil {
		return SetupState{}, err
	}
	if err = finishSetup(ctx, tx, org, user, "RESTAURANT_SETUP_MENU", state); err != nil {
		return SetupState{}, err
	}
	return state, nil
}

func (service *Service) SavePayments(ctx context.Context, user, org, key string, input SetupPaymentsInput) (SetupState, error) {
	if err := validateSetupIdempotencyKey(key); err != nil {
		return SetupState{}, err
	}
	tx, _, branch, err := beginSetup(ctx, service, user, org, input.BranchID)
	if err != nil {
		return SetupState{}, err
	}
	defer tx.Rollback(ctx)
	input.BranchID = branch
	if err = input.Validate(); err != nil {
		return SetupState{}, err
	}
	command, previous, err := claimCommand(ctx, tx, org, user, "restaurant.setup.payments", key, input)
	if err != nil {
		return SetupState{}, err
	}
	if previous != nil {
		var state SetupState
		if json.Unmarshal(previous, &state) == nil {
			return state, nil
		}
		return SetupState{}, ErrConflict
	}
	methods := map[string]bool{"CASH": input.Cash, "QR_MANUAL": input.PromptPay, "BANK_TRANSFER_MANUAL": input.BankTransfer, "CARD": false}
	for method, enabled := range methods {
		if _, err = tx.Exec(ctx, `INSERT INTO restaurant_payment_settings(organization_id,branch_id,method,enabled,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,branch_id,method) DO UPDATE SET enabled=$4,revision=restaurant_payment_settings.revision+1,updated_by=$5,updated_at=now()`, org, branch, method, enabled, user); err != nil {
			return SetupState{}, dbError(err)
		}
	}
	if err = ensureSetupProgress(ctx, tx, org, branch, user); err != nil {
		return SetupState{}, err
	}
	if err = markSetupStep(ctx, tx, org, branch, user, 5); err != nil {
		return SetupState{}, err
	}
	state, err := readSetupState(ctx, tx, org, branch)
	if err != nil {
		return SetupState{}, err
	}
	if err = saveCommand(ctx, tx, org, command, state); err != nil {
		return SetupState{}, err
	}
	if err = finishSetup(ctx, tx, org, user, "RESTAURANT_SETUP_PAYMENTS", state); err != nil {
		return SetupState{}, err
	}
	return state, nil
}

func (service *Service) SaveOrders(ctx context.Context, user, org, key string, input SetupOrdersInput) (SetupState, error) {
	if err := validateSetupIdempotencyKey(key); err != nil {
		return SetupState{}, err
	}
	tx, _, branch, err := beginSetup(ctx, service, user, org, input.BranchID)
	if err != nil {
		return SetupState{}, err
	}
	defer tx.Rollback(ctx)
	if err = input.normalize(branch); err != nil {
		return SetupState{}, err
	}
	command, previous, err := claimCommand(ctx, tx, org, user, "restaurant.setup.orders", key, input)
	if err != nil {
		return SetupState{}, err
	}
	if previous != nil {
		var state SetupState
		if json.Unmarshal(previous, &state) == nil {
			return state, nil
		}
		return SetupState{}, ErrConflict
	}
	if _, err = tx.Exec(ctx, `INSERT INTO restaurant_settings(organization_id,branch_id,closing_time,timezone,revision,updated_by,qr_ordering_enabled,kitchen_enabled,auto_confirm_orders,table_qr_enabled) VALUES($1,$2,'22:00','Asia/Bangkok',1,$3,$4,$5,$6,false) ON CONFLICT(organization_id,branch_id) DO UPDATE SET qr_ordering_enabled=$4,kitchen_enabled=$5,auto_confirm_orders=$6,revision=restaurant_settings.revision+1,updated_by=$3,updated_at=now()`, org, branch, user, input.QROrdering, input.KitchenQueue, input.AutoConfirm); err != nil {
		return SetupState{}, dbError(err)
	}
	if _, err = tx.Exec(ctx, `INSERT INTO restaurant_charge_settings(organization_id,branch_id,vat_rate,service_charge_rate,charge_mode,updated_by) VALUES($1,$2,$3::numeric,$4::numeric,'ADDED_TO_SUBTOTAL',$5) ON CONFLICT(organization_id,branch_id) DO UPDATE SET vat_rate=$3::numeric,service_charge_rate=$4::numeric,revision=restaurant_charge_settings.revision+1,updated_by=$5,updated_at=now()`, org, branch, input.VATRate, input.ServiceChargeRate, user); err != nil {
		return SetupState{}, dbError(err)
	}
	if err = ensureSetupProgress(ctx, tx, org, branch, user); err != nil {
		return SetupState{}, err
	}
	if err = markSetupStep(ctx, tx, org, branch, user, 6); err != nil {
		return SetupState{}, err
	}
	state, err := readSetupState(ctx, tx, org, branch)
	if err != nil {
		return SetupState{}, err
	}
	if err = saveCommand(ctx, tx, org, command, state); err != nil {
		return SetupState{}, err
	}
	if err = finishSetup(ctx, tx, org, user, "RESTAURANT_SETUP_ORDERS", state); err != nil {
		return SetupState{}, err
	}
	return state, nil
}

func (service *Service) Complete(ctx context.Context, user, org, branch, key string) (SetupState, error) {
	if err := validateSetupIdempotencyKey(key); err != nil {
		return SetupState{}, err
	}
	tx, _, branch, err := beginSetup(ctx, service, user, org, branch)
	if err != nil {
		return SetupState{}, err
	}
	defer tx.Rollback(ctx)
	command, previous, err := claimCommand(ctx, tx, org, user, "restaurant.setup.complete", key, SetupCompleteInput{BranchID: branch})
	if err != nil {
		return SetupState{}, err
	}
	if previous != nil {
		var state SetupState
		if json.Unmarshal(previous, &state) == nil {
			return state, nil
		}
		return SetupState{}, ErrConflict
	}
	state, err := readSetupState(ctx, tx, org, branch)
	if err != nil {
		return SetupState{}, err
	}
	if state.Completed {
		if err = saveCommand(ctx, tx, org, command, state); err != nil {
			return SetupState{}, err
		}
		if err = tx.Commit(ctx); err != nil {
			return SetupState{}, dbError(err)
		}
		return state, nil
	}
	if !state.Ready {
		return SetupState{}, ErrConflict
	}
	if err = ensureSetupProgress(ctx, tx, org, branch, user); err != nil {
		return SetupState{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO restaurant_trials(organization_id,branch_id,status,trial_days,started_at,ends_at,updated_by) VALUES($1,$2,'ACTIVE',30,now(),now()+interval '30 days',$3) ON CONFLICT(organization_id) DO NOTHING`, org, branch, user); err != nil {
		return SetupState{}, dbError(err)
	}
	progressUpdate, err := tx.Exec(ctx, `UPDATE restaurant_setup_progress SET status='COMPLETED',current_step=6,completed_at=now(),updated_by=$3,updated_at=now() WHERE organization_id=$1 AND branch_id=$2 AND status<>'COMPLETED'`, org, branch, user)
	if err != nil {
		return SetupState{}, dbError(err)
	}
	if err = completeSetupProgressResult(progressUpdate.RowsAffected()); err != nil {
		return SetupState{}, err
	}
	state, err = readSetupState(ctx, tx, org, branch)
	if err != nil {
		return SetupState{}, err
	}
	if err = saveCommand(ctx, tx, org, command, state); err != nil {
		return SetupState{}, err
	}
	if err = finishSetup(ctx, tx, org, user, "RESTAURANT_SETUP_COMPLETED", state); err != nil {
		return SetupState{}, err
	}
	return state, nil
}
