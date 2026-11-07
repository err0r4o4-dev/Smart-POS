package restaurant

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"smartpos/api/internal/modules/pricing"
)

var ErrInput = errors.New("invalid restaurant input")
var ErrConflict = errors.New("restaurant state conflict")
var ErrNotFound = errors.New("restaurant resource not found")
var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
var codePattern = regexp.MustCompile(`^[A-Z0-9][A-Z0-9_-]{0,39}$`)
var timePattern = regexp.MustCompile(`^(?:[01][0-9]|2[0-3]):[0-5][0-9]$`)

type Settings struct {
	BranchID    string         `json:"branch_id"`
	ClosingTime string         `json:"closing_time"`
	Timezone    string         `json:"timezone"`
	Revision    int64          `json:"revision"`
	Period      BusinessPeriod `json:"period"`
}

type SettingsInput struct {
	BranchID    string `json:"branch_id"`
	ClosingTime string `json:"closing_time"`
	Timezone    string `json:"timezone"`
	Revision    int64  `json:"revision"`
}

type RecipeItem struct {
	IngredientVariantID string `json:"ingredient_variant_id"`
	IngredientName      string `json:"ingredient_name"`
	Unit                string `json:"unit"`
	Quantity            string `json:"quantity"`
}

type RecipeIngredientInput struct {
	IngredientVariantID string `json:"ingredient_variant_id"`
	Quantity            string `json:"quantity"`
}

type Recipe struct {
	ID            string       `json:"id"`
	BranchID      string       `json:"branch_id"`
	MenuVariantID string       `json:"menu_variant_id"`
	MenuName      string       `json:"menu_name"`
	Status        string       `json:"status"`
	Revision      int64        `json:"revision"`
	Items         []RecipeItem `json:"items"`
	CreatedAt     time.Time    `json:"created_at"`
	UpdatedAt     time.Time    `json:"updated_at"`
}

type RecipeInput struct {
	BranchID      string                  `json:"branch_id"`
	MenuVariantID string                  `json:"menu_variant_id"`
	Status        string                  `json:"status"`
	Revision      int64                   `json:"revision"`
	Items         []RecipeIngredientInput `json:"items"`
}

type Table struct {
	QRToken   string    `json:"qr_token,omitempty"`
	ID        string    `json:"id"`
	BranchID  string    `json:"branch_id"`
	Code      string    `json:"code"`
	Name      string    `json:"name"`
	Seats     int       `json:"seats"`
	Status    string    `json:"status"`
	Revision  int64     `json:"revision"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type TableInput struct {
	BranchID string `json:"branch_id"`
	Code     string `json:"code"`
	Name     string `json:"name"`
	Seats    int    `json:"seats"`
	Status   string `json:"status"`
	Revision int64  `json:"revision"`
}

type QueueItem struct {
	OrderID      string    `json:"order_id"`
	QueueNumber  string    `json:"queue_number"`
	Channel      string    `json:"channel"`
	Status       string    `json:"status"`
	CustomerName string    `json:"customer_name"`
	TableCode    string    `json:"table_code,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

type ForecastItem struct {
	MenuVariantID       string `json:"menu_variant_id"`
	MenuName            string `json:"menu_name"`
	ForecastQuantity    int    `json:"forecast_quantity"`
	IngredientVariantID string `json:"ingredient_variant_id"`
	IngredientName      string `json:"ingredient_name"`
	RequiredQuantity    string `json:"required_quantity"`
	CurrentStock        string `json:"current_stock"`
	SuggestedStockIn    string `json:"suggested_stock_in"`
	Unit                string `json:"unit"`
}

func (input *SettingsInput) normalize() error {
	input.BranchID = strings.ToLower(strings.TrimSpace(input.BranchID))
	input.ClosingTime = strings.TrimSpace(input.ClosingTime)
	input.Timezone = strings.TrimSpace(input.Timezone)
	if !uuidPattern.MatchString(input.BranchID) || !timePattern.MatchString(input.ClosingTime) || input.Timezone == "" || len(input.Timezone) > 80 || input.Revision < 0 {
		return ErrInput
	}
	if _, err := time.LoadLocation(input.Timezone); err != nil || input.Timezone == "Local" {
		return ErrInput
	}
	return nil
}

func (input *RecipeInput) normalize() error {
	input.BranchID = strings.ToLower(strings.TrimSpace(input.BranchID))
	input.MenuVariantID = strings.ToLower(strings.TrimSpace(input.MenuVariantID))
	if input.Status == "" {
		input.Status = "ACTIVE"
	}
	if !uuidPattern.MatchString(input.BranchID) || !uuidPattern.MatchString(input.MenuVariantID) || input.Status != "ACTIVE" && input.Status != "INACTIVE" || input.Revision < 0 || len(input.Items) == 0 || len(input.Items) > 100 {
		return ErrInput
	}
	seen := map[string]bool{}
	for index := range input.Items {
		item := &input.Items[index]
		item.IngredientVariantID = strings.ToLower(strings.TrimSpace(item.IngredientVariantID))
		item.Quantity = strings.TrimSpace(item.Quantity)
		amount, err := pricing.Decimal(item.Quantity, 3)
		if !uuidPattern.MatchString(item.IngredientVariantID) || seen[item.IngredientVariantID] || item.IngredientVariantID == input.MenuVariantID || err != nil || amount <= 0 {
			return ErrInput
		}
		item.Quantity = fmt.Sprintf("%d.%03d", amount/1000, amount%1000)
		seen[item.IngredientVariantID] = true
	}
	return nil
}

func (input *TableInput) normalize() error {
	input.BranchID = strings.ToLower(strings.TrimSpace(input.BranchID))
	input.Code = strings.ToUpper(strings.TrimSpace(input.Code))
	input.Name = strings.TrimSpace(input.Name)
	if input.Status == "" {
		input.Status = "ACTIVE"
	}
	if !uuidPattern.MatchString(input.BranchID) || !codePattern.MatchString(input.Code) || input.Name == "" || !utf8.ValidString(input.Name) || utf8.RuneCountInString(input.Name) > 100 || strings.IndexFunc(input.Name, unicode.IsControl) >= 0 || input.Seats < 1 || input.Seats > 100 || input.Status != "ACTIVE" && input.Status != "INACTIVE" || input.Revision < 0 {
		return ErrInput
	}
	return nil
}
