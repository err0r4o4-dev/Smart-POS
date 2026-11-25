package restaurant

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"
)

const menuImportTestHeader = "template_version,row_kind,ref,parent_ref,name,price,sale_status,min_choices,max_choices\n"

func TestMenuImportTemplateFormatParity(t *testing.T) {
	// Reordered columns, a child before its parents, and a reference reused across kinds.
	csv := []byte("\xef\xbb\xbfname,ref,price,row_kind,template_version,parent_ref,sale_status,max_choices,min_choices\n" +
		"ไก่,main,0.00,OPTION,1,protein,ACTIVE,,\n" +
		"ข้าวกะเพรา,basil,85.00,ITEM,1,main,ACTIVE,,\n" +
		"โปรตีน,protein,,GROUP,1,basil,,1,0\n" +
		"ข้าว,main,,CATEGORY,1,,,,\n" +
		",Dip,,OPTION,1,,,,\n" +
		",dip,,OPTION,1,,,,\n")
	sheet := [][]string{
		{"name", "ref", "price", "row_kind", "template_version", "parent_ref", "sale_status", "max_choices", "min_choices"},
		{"ไก่", "main", "0.00", "OPTION", "1", "protein", "ACTIVE", "", ""},
		{"ข้าวกะเพรา", "basil", "85.00", "ITEM", "1", "main", "ACTIVE", "", ""},
		{"โปรตีน", "protein", "", "GROUP", "1", "basil", "", "1", "0"},
		{"ข้าว", "main", "", "CATEGORY", "1", "", "", "", ""},
		{"", "Dip", "", "OPTION", "1", "", "", "", ""},
		{"", "dip", "", "OPTION", "1", "", "", "", ""},
	}
	zeroPrice, itemPrice := int64(0), int64(8500)
	min, max := int32(0), int32(1)
	want := []menuImportRow{
		{Line: 2, Kind: "OPTION", Ref: "main", ParentRef: "protein", Name: "ไก่", SaleStatus: "ACTIVE", PriceMinor: &zeroPrice},
		{Line: 3, Kind: "ITEM", Ref: "basil", ParentRef: "main", Name: "ข้าวกะเพรา", SaleStatus: "ACTIVE", PriceMinor: &itemPrice},
		{Line: 4, Kind: "GROUP", Ref: "protein", ParentRef: "basil", Name: "โปรตีน", MinChoices: &min, MaxChoices: &max},
		{Line: 5, Kind: "CATEGORY", Ref: "main", Name: "ข้าว"},
		{Line: 6, Kind: "OPTION", Ref: "Dip"},
		{Line: 7, Kind: "OPTION", Ref: "dip"},
	}
	for _, file := range []struct {
		name string
		data []byte
	}{
		{"menu.csv", csv},
		{"menu.xlsx", menuImportWorkbook(t, sheet, "")},
	} {
		t.Run(file.name, func(t *testing.T) {
			got, issues, err := parseMenuImportTemplate(file.name, file.data)
			if err != nil || len(issues) != 0 || !reflect.DeepEqual(got, want) {
				t.Fatalf("rows = %+v, issues = %+v, err = %v; want %+v", got, issues, err, want)
			}
		})
	}
}

func TestMenuImportTemplateRejectsInvalidFile(t *testing.T) {
	row := "1,ITEM,basil,rice,ข้าวกะเพรา,85.00,ACTIVE,,\n"
	for _, tc := range []struct {
		name string
		data string
	}{
		{"missing-header", strings.TrimSuffix(menuImportTestHeader, ",max_choices\n") + "\n" + strings.TrimSuffix(row, ",\n") + "\n"},
		{"duplicate-header", strings.Replace(menuImportTestHeader, "max_choices", "min_choices", 1) + row},
		{"unknown-header", strings.Replace(menuImportTestHeader, "max_choices", "quota", 1) + row},
		{"wrong-header-case", strings.Replace(menuImportTestHeader, "ref", "Ref", 1) + row},
		{"missing-cell", menuImportTestHeader + strings.TrimSuffix(row, ",\n") + "\n"},
		{"too-large", menuImportTestHeader + strings.Repeat("x", 5<<20)},
		{"too-many-rows", menuImportTestHeader + strings.Repeat(row, 2001)},
		{"invalid-utf8", menuImportTestHeader + "1,ITEM,basil,rice,\xff,85.00,ACTIVE,,\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rows, issues, err := parseMenuImportTemplate("menu.csv", []byte(tc.data))
			if !errors.Is(err, ErrInput) || len(rows) != 0 || len(issues) != 0 {
				t.Fatalf("rows = %d, issues = %d, err = %v; want only ErrInput", len(rows), len(issues), err)
			}
		})
	}
	t.Run("xlsx-formula", func(t *testing.T) {
		data := menuImportWorkbook(t, [][]string{
			strings.Split(strings.TrimSuffix(menuImportTestHeader, "\n"), ","),
			strings.Split(strings.TrimSuffix(row, "\n"), ","),
		}, "F2")
		rows, issues, err := parseMenuImportTemplate("menu.xlsx", data)
		if !errors.Is(err, ErrInput) || len(rows) != 0 || len(issues) != 0 {
			t.Fatalf("rows = %d, issues = %d, err = %v; want only ErrInput", len(rows), len(issues), err)
		}
	})
}

func TestMenuImportTemplateRowDiagnostics(t *testing.T) {
	const goodRow = "1,ITEM,basil,rice,ข้าวกะเพรา,85.00,ACTIVE,,\n"
	for _, tc := range []struct {
		name, row, field, code string
	}{
		{"mixed-version", "2,ITEM,noodles,rice,,,,,", "template_version", "unsupported"},
		{"unknown-kind", "1,EXTRA,noodles,,,,,,", "row_kind", "invalid"},
		{"missing-ref", "1,ITEM,,rice,,,,,", "ref", "required"},
		{"ref-whitespace", "1,ITEM, noodles,rice,,,,,", "ref", "invalid"},
		{"parent-ref-whitespace", "1,ITEM,noodles,rice ,,,,,", "parent_ref", "invalid"},
		{"duplicate-ref", "1,ITEM,basil,other-category,,,,,", "ref", "duplicate"},
		{"category-price", "1,CATEGORY,noodles,,,0.00,,,", "price", "not_applicable"},
		{"category-parent", "1,CATEGORY,noodles,rice,,,,,", "parent_ref", "not_applicable"},
		{"exponent-price", "1,ITEM,noodles,rice,,1e2,,,", "price", "invalid"},
		{"excess-precision", "1,OPTION,chicken,protein,,1.001,,,", "price", "invalid"},
		{"negative-price", "1,OPTION,chicken,protein,,-1,,,", "price", "invalid"},
		{"unsupported-status", "1,ITEM,noodles,rice,,,ARCHIVED,,", "sale_status", "invalid"},
		{"negative-choice", "1,GROUP,protein,basil,,,,-1,", "min_choices", "invalid"},
		{"fractional-choice", "1,GROUP,protein,basil,,,,,1.5", "max_choices", "invalid"},
		{"choice-overflow", "1,GROUP,protein,basil,,,,,2147483648", "max_choices", "invalid"},
		{"inverted-choice-range", "1,GROUP,protein,basil,,,,2,1", "max_choices", "less_than_min"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rows, issues, err := parseMenuImportTemplate("menu.csv", []byte(menuImportTestHeader+goodRow+tc.row+"\n"))
			want := []menuImportIssue{{Line: 3, Field: tc.field, Code: tc.code}}
			if err != nil || len(rows) != 0 || !reflect.DeepEqual(issues, want) {
				t.Fatalf("rows = %d, issues = %+v, err = %v; want only %+v", len(rows), issues, err, want)
			}
		})
	}
}

func menuImportWorkbook(t *testing.T, rows [][]string, formulaCell string) []byte {
	t.Helper()
	var sheet strings.Builder
	sheet.WriteString(`<worksheet><sheetData>`)
	for i, row := range rows {
		fmt.Fprintf(&sheet, `<row r="%d">`, i+1)
		for j, value := range row {
			if value == "" {
				continue
			}
			ref := fmt.Sprintf("%c%d", 'A'+j, i+1)
			switch {
			case ref == formulaCell:
				fmt.Fprintf(&sheet, `<c r="%s"><f>80+5</f><v>85.00</v></c>`, ref)
			case i > 0 && rowHasNumericColumn(rows[0][j]):
				fmt.Fprintf(&sheet, `<c r="%s" t="n"><v>%s</v></c>`, ref, value)
			default:
				fmt.Fprintf(&sheet, `<c r="%s" t="inlineStr"><is><t>`, ref)
				if err := xml.EscapeText(&sheet, []byte(value)); err != nil {
					t.Fatal(err)
				}
				sheet.WriteString(`</t></is></c>`)
			}
		}
		sheet.WriteString(`</row>`)
	}
	sheet.WriteString(`</sheetData></worksheet>`)
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	for name, content := range map[string]string{
		"[Content_Types].xml":      "<Types/>",
		"xl/workbook.xml":          "<workbook/>",
		"xl/worksheets/sheet1.xml": sheet.String(),
	} {
		file, err := writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := file.Write([]byte(content)); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func rowHasNumericColumn(header string) bool {
	switch header {
	case "price", "min_choices", "max_choices", "template_version":
		return true
	default:
		return false
	}
}
