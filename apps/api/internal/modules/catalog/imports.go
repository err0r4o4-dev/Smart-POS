package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/organization"
	"strings"
	"time"
)

type ImportRow struct {
	Line            int      `json:"line"`
	Name            string   `json:"product_name"`
	SKU             string   `json:"sku"`
	Barcode         string   `json:"barcode"`
	Symbology       string   `json:"symbology"`
	Category        string   `json:"category"`
	Brand           string   `json:"brand"`
	Unit            string   `json:"unit"`
	CostPrice       string   `json:"cost_price"`
	SellingPrice    string   `json:"selling_price"`
	Errors          []string `json:"errors"`
	ExistingID      string   `json:"existing_id"`
	VariantRevision int      `json:"variant_revision"`
	ProductRevision int      `json:"product_revision"`
}
type ImportJob struct {
	ID               string        `json:"id"`
	Status           string        `json:"status"`
	Headers          []string      `json:"headers"`
	Rows             []ImportRow   `json:"rows"`
	Total            int           `json:"total"`
	Valid            int           `json:"valid"`
	Invalid          int           `json:"invalid"`
	Duplicates       int           `json:"duplicates"`
	NewProducts      int           `json:"new_products"`
	ExistingProducts int           `json:"existing_products"`
	Result           *ImportResult `json:"result"`
}
type ImportResult struct {
	Total    int `json:"total"`
	Imported int `json:"imported"`
	Updated  int `json:"updated"`
	Skipped  int `json:"skipped"`
	Failed   int `json:"failed"`
}
type resolvedRow struct {
	Product  ProductInput
	Variant  VariantInput
	Existing *Variant
}

var importFields = []string{"product_name", "sku", "barcode", "symbology", "category", "brand", "unit", "cost_price", "selling_price"}

func mappedRows(table fileTable, mapping map[string]string) ([]ImportRow, error) {
	indices := map[string]int{}
	for index, header := range table.Headers {
		indices[strings.ToLower(header)] = index
	}
	for field, column := range mapping {
		valid := false
		for _, known := range importFields {
			valid = valid || field == known
		}
		if !valid {
			return nil, ErrInput
		}
		if column != "" {
			if _, exists := indices[strings.ToLower(column)]; !exists {
				return nil, ErrInput
			}
		}
	}
	rows := []ImportRow{}
	for index, values := range table.Rows {
		get := func(field string) string {
			column := field
			if value, exists := mapping[field]; exists {
				column = value
			}
			position, exists := indices[strings.ToLower(column)]
			if !exists || column == "" {
				return ""
			}
			return strings.TrimSpace(values[position])
		}
		rows = append(rows, ImportRow{Line: index + 2, Name: get("product_name"), SKU: strings.ToUpper(get("sku")), Barcode: get("barcode"), Symbology: get("symbology"), Category: get("category"), Brand: get("brand"), Unit: get("unit"), CostPrice: get("cost_price"), SellingPrice: get("selling_price"), Errors: []string{}})
	}
	return rows, nil
}
func namedReference(ctx context.Context, tx pgx.Tx, org, kind, name string) (*string, error) {
	if name == "" {
		return nil, nil
	}
	query := "SELECT id::text FROM " + kind + " WHERE organization_id=$1 AND lower(name)=lower($2) AND status='ACTIVE'"
	if kind == "units" {
		query = "SELECT id::text FROM units WHERE organization_id=$1 AND (lower(name)=lower($2) OR code=upper($2)) AND status='ACTIVE'"
	}
	rows, err := tx.Query(ctx, query, org, name)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	if len(ids) != 1 {
		return nil, ErrInput
	}
	return &ids[0], nil
}
func resolveImport(ctx context.Context, tx pgx.Tx, org string, row *ImportRow) (resolvedRow, error) {
	result := resolvedRow{Product: ProductInput{Name: row.Name, Status: "ACTIVE"}, Variant: VariantInput{SKU: row.SKU, Name: "Default", Attributes: map[string]string{}, CostPrice: row.CostPrice, SellingPrice: row.SellingPrice, Status: "ACTIVE"}}
	row.Errors = []string{}
	row.ExistingID = ""
	row.VariantRevision = 0
	row.ProductRevision = 0
	for _, item := range []struct {
		kind, name string
		target     **string
	}{{"categories", row.Category, &result.Product.CategoryID}, {"brands", row.Brand, &result.Product.BrandID}} {
		id, err := namedReference(ctx, tx, org, item.kind, item.name)
		if errors.Is(err, ErrInput) {
			row.Errors = append(row.Errors, "Unknown or inactive "+item.kind)
		} else if err != nil {
			return result, err
		}
		*item.target = id
	}
	unit, err := namedReference(ctx, tx, org, "units", row.Unit)
	if errors.Is(err, ErrInput) || unit == nil {
		row.Errors = append(row.Errors, "Unknown or inactive unit")
	} else if err != nil {
		return result, err
	} else {
		result.Variant.UnitID = *unit
	}
	if result.Product.validate() != nil {
		row.Errors = append(row.Errors, "Invalid product name")
	}
	if result.Variant.validate() != nil {
		row.Errors = append(row.Errors, "Invalid SKU, unit or decimal prices (selling price must be positive)")
	}
	if row.Barcode != "" {
		if row.Symbology == "" {
			row.Symbology = "CODE128"
		}
		if !validBarcode(row.Barcode, row.Symbology) {
			row.Errors = append(row.Errors, "Invalid barcode or checksum")
		}
	}
	existing, err := readVariant(tx.QueryRow(ctx, "SELECT "+variantColumns+" FROM product_variants WHERE organization_id=$1 AND sku=$2", org, row.SKU))
	if err == nil {
		result.Existing = &existing
		row.ExistingID = existing.ID
		row.VariantRevision = existing.Revision
		var productStatus string
		if err = tx.QueryRow(ctx, "SELECT revision,status FROM products WHERE organization_id=$1 AND id=$2", org, existing.ProductID).Scan(&row.ProductRevision, &productStatus); err != nil {
			return result, err
		}
		if productStatus == "ARCHIVED" || existing.Status == "ARCHIVED" {
			row.Errors = append(row.Errors, "Archived SKU remains reserved")
		}
	} else if !errors.Is(err, ErrNotFound) {
		return result, err
	}
	if row.Barcode != "" {
		var variant, symbology string
		err = tx.QueryRow(ctx, "SELECT variant_id::text,symbology FROM product_barcodes WHERE organization_id=$1 AND code=$2", org, row.Barcode).Scan(&variant, &symbology)
		if err == nil && (result.Existing == nil || variant != existing.ID || symbology != row.Symbology) {
			row.Errors = append(row.Errors, "Barcode conflicts with another SKU or symbology")
		} else if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return result, err
		}
	}
	return result, nil
}
func summarizeImport(id string, headers []string, rows []ImportRow) ImportJob {
	job := ImportJob{ID: id, Status: "PREVIEW", Headers: headers, Rows: rows, Total: len(rows)}
	for _, row := range rows {
		if len(row.Errors) == 0 {
			job.Valid++
		} else {
			job.Invalid++
		}
		if row.ExistingID != "" {
			job.Duplicates++
			job.ExistingProducts++
		} else {
			job.NewProducts++
		}
	}
	return job
}
func validateImportRows(ctx context.Context, tx pgx.Tx, org string, rows []ImportRow) ([]resolvedRow, error) {
	results := make([]resolvedRow, len(rows))
	seenSKU, seenBarcode := map[string]bool{}, map[string]bool{}
	for index := range rows {
		result, err := resolveImport(ctx, tx, org, &rows[index])
		if err != nil {
			return nil, err
		}
		results[index] = result
		if seenSKU[rows[index].SKU] {
			rows[index].Errors = append(rows[index].Errors, "Duplicate SKU within file")
		}
		seenSKU[rows[index].SKU] = true
		if rows[index].Barcode != "" {
			if seenBarcode[rows[index].Barcode] {
				rows[index].Errors = append(rows[index].Errors, "Duplicate barcode within file")
			}
			seenBarcode[rows[index].Barcode] = true
		}
	}
	return results, nil
}
func (service *Service) PreviewImport(ctx context.Context, user, org, filename string, data []byte, mapping map[string]string) (ImportJob, error) {
	tx, err := service.begin(ctx, user, org, "catalog.import")
	if err != nil {
		return ImportJob{}, err
	}
	defer tx.Rollback(ctx)
	table, err := parseFile(filename, data)
	if err != nil {
		return ImportJob{}, err
	}
	rows, err := mappedRows(table, mapping)
	if err != nil {
		return ImportJob{}, err
	}
	var count int
	if err = tx.QueryRow(ctx, "SELECT count(*) FROM product_import_jobs WHERE organization_id=$1 AND created_by=$2 AND created_at>now()-interval '1 hour'", org, user).Scan(&count); err != nil {
		return ImportJob{}, err
	}
	if count >= 30 {
		return ImportJob{}, ErrConflict
	}
	if _, err = validateImportRows(ctx, tx, org, rows); err != nil {
		return ImportJob{}, err
	}
	encoded, _ := json.Marshal(rows)
	var id string
	err = tx.QueryRow(ctx, "INSERT INTO product_import_jobs(organization_id,created_by,rows) VALUES($1,$2,$3) RETURNING id::text", org, user, encoded).Scan(&id)
	if err != nil {
		return ImportJob{}, databaseError(err)
	}
	job := summarizeImport(id, table.Headers, rows)
	err = finish(ctx, tx, org, user, "catalog.import.previewed", id)
	return job, err
}
func importJob(ctx context.Context, tx pgx.Tx, user, org, id string) (ImportJob, string, time.Time, error) {
	if !uuidPattern.MatchString(id) {
		return ImportJob{}, "", time.Time{}, ErrNotFound
	}
	var job ImportJob
	var stored, result []byte
	var mode *string
	var expiry time.Time
	err := tx.QueryRow(ctx, "SELECT id::text,status,rows,result,mode,expires_at FROM product_import_jobs WHERE organization_id=$1 AND id=$2 AND created_by=$3 FOR UPDATE", org, id, user).Scan(&job.ID, &job.Status, &stored, &result, &mode, &expiry)
	if err != nil {
		return job, "", expiry, databaseError(err)
	}
	if json.Unmarshal(stored, &job.Rows) != nil {
		return job, "", expiry, ErrConflict
	}
	currentMode := ""
	if mode != nil {
		currentMode = *mode
	}
	if result != nil {
		if json.Unmarshal(result, &job.Result) != nil {
			return job, currentMode, expiry, ErrConflict
		}
	}
	summary := summarizeImport(job.ID, []string{}, job.Rows)
	summary.Status = job.Status
	summary.Result = job.Result
	return summary, currentMode, expiry, nil
}
func (service *Service) ImportJob(ctx context.Context, user, org, id string) (ImportJob, error) {
	tx, err := service.begin(ctx, user, org, "catalog.import")
	if err != nil {
		return ImportJob{}, err
	}
	defer tx.Rollback(ctx)
	job, _, _, err := importJob(ctx, tx, user, org, id)
	return job, err
}
func (service *Service) ConfirmImport(ctx context.Context, user, org, id, mode string) (ImportJob, error) {
	tx, err := service.begin(ctx, user, org, "catalog.import")
	if err != nil {
		return ImportJob{}, err
	}
	defer tx.Rollback(ctx)
	if mode != "CREATE" && mode != "SKIP" && mode != "UPDATE" {
		return ImportJob{}, ErrInput
	}
	job, previous, expiry, err := importJob(ctx, tx, user, org, id)
	if err != nil {
		return job, err
	}
	if job.Status == "COMPLETED" {
		if previous != mode {
			return job, ErrConflict
		}
		return job, nil
	}
	if !time.Now().Before(expiry) {
		return job, ErrConflict
	}
	old := append([]ImportRow{}, job.Rows...)
	resolved, err := validateImportRows(ctx, tx, org, job.Rows)
	if err != nil {
		return job, err
	}
	for index, row := range job.Rows {
		if len(row.Errors) > 0 || row.ExistingID != old[index].ExistingID || row.VariantRevision != old[index].VariantRevision || row.ProductRevision != old[index].ProductRevision {
			return job, ErrConflict
		}
		if mode == "CREATE" && row.ExistingID != "" {
			return job, ErrConflict
		}
	}
	result := ImportResult{Total: len(job.Rows)}
	for index, row := range job.Rows {
		value := resolved[index]
		var variant Variant
		if value.Existing != nil && mode == "SKIP" {
			result.Skipped++
			continue
		}
		if value.Existing == nil {
			product, err := createProduct(ctx, tx, user, org, CreateInput{ProductInput: value.Product, Variants: []VariantInput{value.Variant}})
			if err != nil {
				return job, err
			}
			variant = product.Variants[0]
			result.Imported++
		} else {
			variant = *value.Existing
			value.Variant.Revision = variant.Revision
			value.Variant.Attributes = variant.Attributes
			value.Variant.Name = variant.Name
			value.Variant.Status = variant.Status
			variant, err = saveVariant(ctx, tx, org, variant.ProductID, variant.ID, value.Variant)
			if err != nil {
				return job, err
			}
			_, err = tx.Exec(ctx, "UPDATE products SET name=$3,category_id=COALESCE($4,category_id),brand_id=COALESCE($5,brand_id),revision=revision+1,updated_by=$6,updated_at=now() WHERE organization_id=$1 AND id=$2", org, variant.ProductID, row.Name, value.Product.CategoryID, value.Product.BrandID, user)
			if err != nil {
				return job, databaseError(err)
			}
			result.Updated++
		}
		if row.Barcode != "" {
			var exists bool
			if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM product_barcodes WHERE organization_id=$1 AND code=$2)", org, row.Barcode).Scan(&exists); err != nil {
				return job, err
			}
			if !exists {
				if _, err = registerBarcode(ctx, tx, org, variant.ID, BarcodeInput{Code: row.Barcode, Symbology: row.Symbology, Source: "MANUFACTURER"}); err != nil {
					return job, err
				}
			}
		}
	}
	encoded, _ := json.Marshal(result)
	_, err = tx.Exec(ctx, "UPDATE product_import_jobs SET status='COMPLETED',mode=$3,result=$4,confirmed_at=now() WHERE organization_id=$1 AND id=$2", org, id, mode, encoded)
	if err != nil {
		return job, err
	}
	if err = organization.RecordAudit(ctx, tx, org, user, "catalog.import.completed", id); err != nil {
		return job, err
	}
	if err = tx.Commit(ctx); err != nil {
		return job, databaseError(err)
	}
	job.Status = "COMPLETED"
	job.Result = &result
	return job, nil
}
