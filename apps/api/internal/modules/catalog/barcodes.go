package catalog

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"github.com/jackc/pgx/v5"
	"strings"
)

func validBarcode(code, symbology string) bool {
	if len(code) < 1 || len(code) > 80 {
		return false
	}
	for _, character := range code {
		if character < 32 || character > 126 {
			return false
		}
	}
	if symbology == "CODE128" {
		return true
	}
	lengths := map[string]int{"EAN13": 13, "EAN8": 8, "UPCA": 12}
	length, exists := lengths[symbology]
	if !exists || len(code) != length {
		return false
	}
	sum := 0
	for index := 0; index < len(code); index++ {
		if code[index] < '0' || code[index] > '9' {
			return false
		}
		if index == len(code)-1 {
			break
		}
		weight := 1
		if (len(code)-2-index)%2 == 0 {
			weight = 3
		}
		sum += int(code[index]-'0') * weight
	}
	return (10-sum%10)%10 == int(code[len(code)-1]-'0')
}
func (input *BarcodeInput) validate() error {
	if !validBarcode(input.Code, input.Symbology) || (input.Source != "MANUFACTURER" && input.Source != "ALIAS") {
		return ErrInput
	}
	return nil
}
func barcodes(ctx context.Context, tx pgx.Tx, org, variant string) ([]Barcode, error) {
	items := []Barcode{}
	rows, err := tx.Query(ctx, "SELECT id::text,variant_id::text,code,symbology,source,is_primary FROM product_barcodes WHERE organization_id=$1 AND variant_id=$2 ORDER BY is_primary DESC,created_at,id", org, variant)
	if err != nil {
		return items, err
	}
	defer rows.Close()
	for rows.Next() {
		var item Barcode
		if err := rows.Scan(&item.ID, &item.VariantID, &item.Code, &item.Symbology, &item.Source, &item.IsPrimary); err != nil {
			return items, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func registerBarcode(ctx context.Context, tx pgx.Tx, org, variant string, input BarcodeInput) (Barcode, error) {
	var count int
	if err := tx.QueryRow(ctx, "SELECT count(*) FROM product_barcodes WHERE organization_id=$1 AND variant_id=$2", org, variant).Scan(&count); err != nil {
		return Barcode{}, err
	}
	if count >= 20 {
		return Barcode{}, ErrConflict
	}
	if count == 0 {
		input.IsPrimary = true
	}
	if input.IsPrimary {
		if _, err := tx.Exec(ctx, "UPDATE product_barcodes SET is_primary=false WHERE organization_id=$1 AND variant_id=$2", org, variant); err != nil {
			return Barcode{}, err
		}
	}
	item := Barcode{VariantID: variant, BarcodeInput: input}
	err := tx.QueryRow(ctx, "INSERT INTO product_barcodes(organization_id,variant_id,code,symbology,source,is_primary) VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text", org, variant, input.Code, input.Symbology, input.Source, input.IsPrimary).Scan(&item.ID)
	return item, databaseError(err)
}
func (service *Service) RegisterBarcode(ctx context.Context, user, org, product, variant string, input BarcodeInput, generate bool) (Barcode, error) {
	tx, err := service.begin(ctx, user, org, "catalog.barcode.manage")
	if err != nil {
		return Barcode{}, err
	}
	defer tx.Rollback(ctx)
	if !uuidPattern.MatchString(product) || !uuidPattern.MatchString(variant) {
		return Barcode{}, ErrNotFound
	}
	var found string
	err = tx.QueryRow(ctx, "SELECT v.id FROM product_variants v JOIN products p ON p.organization_id=v.organization_id AND p.id=v.product_id WHERE v.organization_id=$1 AND v.product_id=$2 AND v.id=$3 AND p.status<>'ARCHIVED' AND v.status<>'ARCHIVED'", org, product, variant).Scan(&found)
	if err != nil {
		return Barcode{}, databaseError(err)
	}
	if generate {
		random := make([]byte, 16)
		if _, err = rand.Read(random); err != nil {
			return Barcode{}, err
		}
		input.Code = "SP-" + strings.ToUpper(hex.EncodeToString(random))
		input.Symbology = "CODE128"
		input.Source = "INTERNAL"
	} else if err = input.validate(); err != nil {
		return Barcode{}, err
	}
	item, err := registerBarcode(ctx, tx, org, variant, input)
	if err != nil {
		return item, err
	}
	err = finish(ctx, tx, org, user, "catalog.barcode.registered", item.ID)
	return item, err
}
func (service *Service) DeleteBarcode(ctx context.Context, user, org, product, variant, id string) (map[string]bool, error) {
	tx, err := service.begin(ctx, user, org, "catalog.barcode.manage")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if !uuidPattern.MatchString(product) || !uuidPattern.MatchString(variant) || !uuidPattern.MatchString(id) {
		return nil, ErrNotFound
	}
	command, err := tx.Exec(ctx, "DELETE FROM product_barcodes b USING product_variants v WHERE b.organization_id=$1 AND b.variant_id=$2 AND b.id=$3 AND v.organization_id=b.organization_id AND v.id=b.variant_id AND v.product_id=$4", org, variant, id, product)
	if err != nil {
		return nil, databaseError(err)
	}
	if command.RowsAffected() != 1 {
		return nil, ErrNotFound
	}
	_, err = tx.Exec(ctx, "UPDATE product_barcodes SET is_primary=true WHERE organization_id=$1 AND id=(SELECT id FROM product_barcodes WHERE organization_id=$1 AND variant_id=$2 ORDER BY is_primary DESC,created_at,id LIMIT 1)", org, variant)
	if err != nil {
		return nil, err
	}
	err = finish(ctx, tx, org, user, "catalog.barcode.removed", id)
	return map[string]bool{"removed": true}, err
}
func (service *Service) Lookup(ctx context.Context, user, org, code string) (Lookup, error) {
	tx, err := service.begin(ctx, user, org, "catalog.read")
	if err != nil {
		return Lookup{}, err
	}
	defer tx.Rollback(ctx)
	code = strings.TrimRight(code, "\r\n")
	if !validBarcode(code, "CODE128") {
		return Lookup{}, ErrInput
	}
	var product, variant string
	err = tx.QueryRow(ctx, "SELECT v.product_id::text,v.id::text FROM product_barcodes b JOIN product_variants v ON v.organization_id=b.organization_id AND v.id=b.variant_id WHERE b.organization_id=$1 AND b.code=$2", org, code).Scan(&product, &variant)
	if err != nil {
		return Lookup{}, databaseError(err)
	}
	item, err := productBy(ctx, tx, org, product)
	if err != nil {
		return Lookup{}, err
	}
	saleable := false
	for _, value := range item.Variants {
		if value.ID == variant {
			saleable = item.Status == "ACTIVE" && value.Status == "ACTIVE"
		}
	}
	return Lookup{Product: item, VariantID: variant, Saleable: saleable}, nil
}
