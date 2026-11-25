package restaurant

import (
	"strconv"
	"strings"

	"smartpos/api/internal/modules/catalog"
	"smartpos/api/internal/modules/pricing"
)

type menuImportRow struct {
	Line       int
	Kind       string
	Ref        string
	ParentRef  string
	Name       string
	SaleStatus string
	PriceMinor *int64
	MinChoices *int32
	MaxChoices *int32
}

type menuImportIssue struct {
	Line  int
	Field string
	Code  string
}

// parseMenuImportTemplate validates the v1 file only. Parent resolution and
// validation of the resulting menu require the saved menu and are deferred.
func parseMenuImportTemplate(filename string, data []byte) ([]menuImportRow, []menuImportIssue, error) {
	fields := [...]string{"template_version", "row_kind", "ref", "parent_ref", "name", "price", "sale_status", "min_choices", "max_choices"}
	headers, records, err := catalog.ParseImportTable(filename, data)
	if err != nil || len(headers) != len(fields) {
		return nil, nil, ErrInput
	}
	columns := make(map[string]int, len(headers))
	for i, header := range headers {
		columns[header] = i
	}
	for _, field := range fields {
		if _, ok := columns[field]; !ok {
			return nil, nil, ErrInput
		}
	}

	type identity struct{ kind, ref string }
	seen := make(map[identity]bool, len(records))
	rows := make([]menuImportRow, 0, len(records))
	var issues []menuImportIssue
	for i, cells := range records {
		cell := func(field string) string { return cells[columns[field]] }
		row := menuImportRow{
			Line:       i + 2,
			Kind:       cell("row_kind"),
			Ref:        cell("ref"),
			ParentRef:  cell("parent_ref"),
			Name:       cell("name"),
			SaleStatus: cell("sale_status"),
		}
		issue := func(field, code string) {
			issues = append(issues, menuImportIssue{Line: row.Line, Field: field, Code: code})
		}
		if cell("template_version") != "1" {
			issue("template_version", "unsupported")
		}
		priced := row.Kind == "ITEM" || row.Kind == "OPTION"
		group := row.Kind == "GROUP"
		category := row.Kind == "CATEGORY"
		knownKind := priced || group || category
		if !knownKind {
			issue("row_kind", "invalid")
		}
		switch {
		case strings.TrimSpace(row.Ref) == "":
			issue("ref", "required")
		case strings.TrimSpace(row.Ref) != row.Ref:
			issue("ref", "invalid")
		case knownKind:
			key := identity{row.Kind, row.Ref}
			if seen[key] {
				issue("ref", "duplicate")
			}
			seen[key] = true
		}
		if !knownKind {
			continue
		}
		if row.ParentRef != "" {
			if category {
				issue("parent_ref", "not_applicable")
			} else if strings.TrimSpace(row.ParentRef) != row.ParentRef {
				issue("parent_ref", "invalid")
			}
		}
		if price := cell("price"); price != "" {
			if !priced {
				issue("price", "not_applicable")
			} else if amount, err := pricing.Decimal(price, 2); err != nil {
				issue("price", "invalid")
			} else {
				row.PriceMinor = &amount
			}
		}
		if row.SaleStatus != "" {
			if !priced {
				issue("sale_status", "not_applicable")
			} else if row.SaleStatus != "ACTIVE" && row.SaleStatus != "INACTIVE" {
				issue("sale_status", "invalid")
			}
		}
		choice := func(field string) *int32 {
			value := cell(field)
			if value == "" {
				return nil
			}
			if !group {
				issue(field, "not_applicable")
				return nil
			}
			amount, err := strconv.ParseUint(value, 10, 31)
			if err != nil {
				issue(field, "invalid")
				return nil
			}
			bound := int32(amount)
			return &bound
		}
		row.MinChoices = choice("min_choices")
		row.MaxChoices = choice("max_choices")
		if row.MinChoices != nil && row.MaxChoices != nil && *row.MinChoices > *row.MaxChoices {
			issue("max_choices", "less_than_min")
		}
		rows = append(rows, row)
	}
	if len(issues) != 0 {
		return nil, issues, nil
	}
	return rows, nil, nil
}
