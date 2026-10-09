package catalog

import (
	"errors"
	"math/big"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

var ErrInput = errors.New("invalid catalog input")
var ErrConflict = errors.New("catalog conflict or stale revision")
var ErrNotFound = errors.New("catalog resource not found")
var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
var skuPattern = regexp.MustCompile(`^[A-Z0-9][A-Z0-9_.-]{0,79}$`)
var unitCodePattern = regexp.MustCompile(`^[A-Z0-9][A-Z0-9_-]{0,49}$`)
var moneyPattern = regexp.MustCompile(`^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$`)
var factorPattern = regexp.MustCompile(`^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$`)

type ProductInput struct {
	Name        string  `json:"name"`
	Description string  `json:"description"`
	CategoryID  *string `json:"category_id"`
	BrandID     *string `json:"brand_id"`
	Status      string  `json:"status"`
	Revision    int     `json:"revision"`
}
type Product struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organization_id"`
	ProductInput
	CategoryName string    `json:"category_name"`
	BrandName    string    `json:"brand_name"`
	CreatedBy    string    `json:"created_by"`
	UpdatedBy    string    `json:"updated_by"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	Variants     []Variant `json:"variants"`
}
type TaxonomyInput struct {
	Name             string  `json:"name"`
	Description      string  `json:"description"`
	Status           string  `json:"status"`
	Revision         int     `json:"revision"`
	ParentID         *string `json:"parent_id,omitempty"`
	Code             string  `json:"code,omitempty"`
	UnitType         string  `json:"unit_type,omitempty"`
	BaseUnitID       *string `json:"base_unit_id,omitempty"`
	ConversionFactor string  `json:"conversion_factor,omitempty"`
}
type Taxonomy struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organization_id"`
	TaxonomyInput
}
type VariantInput struct {
	SKU          string            `json:"sku"`
	Name         string            `json:"name"`
	Attributes   map[string]string `json:"attributes"`
	UnitID       string            `json:"unit_id"`
	CostPrice    string            `json:"cost_price"`
	SellingPrice string            `json:"selling_price"`
	Status       string            `json:"status"`
	Revision     int               `json:"revision"`
}
type Variant struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organization_id"`
	ProductID      string `json:"product_id"`
	VariantInput
	Currency string    `json:"currency"`
	Barcodes []Barcode `json:"barcodes"`
}
type CreateInput struct {
	ProductInput
	Variants []VariantInput `json:"variants"`
}
type BarcodeInput struct {
	Code      string `json:"code"`
	Symbology string `json:"symbology"`
	Source    string `json:"source"`
	IsPrimary bool   `json:"is_primary"`
}
type Barcode struct {
	ID        string `json:"id"`
	VariantID string `json:"variant_id"`
	BarcodeInput
}
type Lookup struct {
	Product   Product `json:"product"`
	VariantID string  `json:"variant_id"`
	Saleable  bool    `json:"saleable"`
}
type Filter struct {
	Search     string `json:"search"`
	Status     string `json:"status"`
	CategoryID string `json:"category_id"`
	BrandID    string `json:"brand_id"`
	Sort       string `json:"sort"`
	Page       int    `json:"page"`
	PageSize   int    `json:"page_size"`
}
type Page[Item any] struct {
	Items    []Item `json:"items"`
	Total    int    `json:"total"`
	Page     int    `json:"page"`
	PageSize int    `json:"page_size"`
}

func text(value string, maximum int, required bool) bool {
	length := utf8.RuneCountInString(value)
	return utf8.ValidString(value) && length <= maximum && (!required || strings.TrimSpace(value) != "") && !strings.ContainsAny(value, "\x00\r")
}
func status(value string) bool {
	return value == "ACTIVE" || value == "INACTIVE" || value == "ARCHIVED"
}
func optionalID(value *string) bool { return value == nil || uuidPattern.MatchString(*value) }
func positiveDecimal(value string, pattern *regexp.Regexp, zero bool) bool {
	if !pattern.MatchString(value) {
		return false
	}
	amount, valid := new(big.Rat).SetString(value)
	return valid && (amount.Sign() > 0 || zero && amount.Sign() == 0)
}
func (input *ProductInput) validate() error {
	input.Name = strings.TrimSpace(input.Name)
	if input.Status == "" {
		input.Status = "ACTIVE"
	}
	if !text(input.Name, 200, true) || strings.Contains(input.Name, "\n") || !text(input.Description, 2000, false) || !optionalID(input.CategoryID) || !optionalID(input.BrandID) || !status(input.Status) {
		return ErrInput
	}
	return nil
}
func (input *VariantInput) validate() error {
	input.SKU = strings.ToUpper(strings.TrimSpace(input.SKU))
	input.Name = strings.TrimSpace(input.Name)
	if input.Status == "" {
		input.Status = "ACTIVE"
	}
	if input.Attributes == nil {
		input.Attributes = map[string]string{}
	}
	if !skuPattern.MatchString(input.SKU) || !text(input.Name, 200, true) || strings.Contains(input.Name, "\n") || !uuidPattern.MatchString(input.UnitID) || !positiveDecimal(input.CostPrice, moneyPattern, true) || !positiveDecimal(input.SellingPrice, moneyPattern, false) || !status(input.Status) || len(input.Attributes) > 12 {
		return ErrInput
	}
	for key, value := range input.Attributes {
		if !text(key, 40, true) || !text(value, 200, true) {
			return ErrInput
		}
	}
	return nil
}
func (input *TaxonomyInput) validate(kind string) error {
	input.Name = strings.TrimSpace(input.Name)
	if input.Status == "" {
		input.Status = "ACTIVE"
	}
	if !text(input.Name, 200, true) || strings.Contains(input.Name, "\n") || !text(input.Description, 2000, false) || !status(input.Status) || !optionalID(input.ParentID) || !optionalID(input.BaseUnitID) {
		return ErrInput
	}
	if kind != "categories" && input.ParentID != nil {
		return ErrInput
	}
	if kind != "units" {
		if input.Code != "" || input.UnitType != "" || input.BaseUnitID != nil || input.ConversionFactor != "" {
			return ErrInput
		}
		return nil
	}
	input.Code = strings.ToUpper(strings.TrimSpace(input.Code))
	if input.ConversionFactor == "" {
		input.ConversionFactor = "1"
	}
	if !unitCodePattern.MatchString(input.Code) || (input.UnitType != "COUNT" && input.UnitType != "WEIGHT" && input.UnitType != "VOLUME" && input.UnitType != "PACKAGING") || !positiveDecimal(input.ConversionFactor, factorPattern, false) {
		return ErrInput
	}
	amount, _ := new(big.Rat).SetString(input.ConversionFactor)
	if input.BaseUnitID == nil && amount.Cmp(big.NewRat(1, 1)) != 0 {
		return ErrInput
	}
	return nil
}
func (filter *Filter) validate() error {
	if filter.Page == 0 {
		filter.Page = 1
	}
	if filter.PageSize == 0 {
		filter.PageSize = 20
	}
	if filter.Sort == "" {
		filter.Sort = "name"
	}
	if filter.Page < 1 || filter.Page > 100000 || filter.PageSize < 1 || filter.PageSize > 100 || !text(filter.Search, 200, false) || (filter.Status != "" && !status(filter.Status)) || (filter.CategoryID != "" && !uuidPattern.MatchString(filter.CategoryID)) || (filter.BrandID != "" && !uuidPattern.MatchString(filter.BrandID)) {
		return ErrInput
	}
	switch filter.Sort {
	case "name", "-name", "updated", "-updated":
	default:
		return ErrInput
	}
	return nil
}
