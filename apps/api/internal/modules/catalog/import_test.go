package catalog

import (
	"archive/zip"
	"bytes"
	"fmt"
	"strings"
	"testing"
)

func workbook(sheet string, extras map[string]string) []byte {
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	files := map[string]string{"[Content_Types].xml": "<Types/>", "xl/workbook.xml": "<workbook/>", "xl/worksheets/sheet1.xml": sheet}
	for name, value := range extras {
		files[name] = value
	}
	for name, value := range files {
		file, _ := writer.Create(name)
		_, _ = file.Write([]byte(value))
	}
	_ = writer.Close()
	return buffer.Bytes()
}
func TestCSVImportBoundaries(t *testing.T) {
	table, err := parseFile("catalog.csv", []byte("\xef\xbb\xbfproduct_name,sku,barcode,unit,cost_price,selling_price\nสินค้า,coke,036000291452,Can,12.00,18.00\n"))
	if err != nil {
		t.Fatal(err)
	}
	rows, err := mappedRows(table, nil)
	if err != nil || rows[0].Barcode != "036000291452" || rows[0].SKU != "COKE" {
		t.Fatal(rows, err)
	}
	for _, data := range []string{"name,name\na,b", "name\n\"unfinished", "name\na,b", "name\n\x00"} {
		if _, err = parseFile("file.csv", []byte(data)); err == nil {
			t.Fatalf("accepted malformed %q", data)
		}
	}
	if _, err = parseFile("file.csv", bytes.Repeat([]byte("x"), MaxImportBytes+1)); err == nil {
		t.Fatal("large file")
	}
	if _, err = parseFile("file.csv", []byte("name\n"+strings.Repeat("a\n", MaxImportRows+1))); err == nil {
		t.Fatal("large row count")
	}
	table, err = parseFile("custom.csv", []byte("ชื่อ,รหัส\nชา,TEA"))
	if err != nil {
		t.Fatal(err)
	}
	rows, err = mappedRows(table, map[string]string{"product_name": "ชื่อ", "sku": "รหัส"})
	if err != nil || rows[0].Name != "ชา" || rows[0].SKU != "TEA" {
		t.Fatal(rows, err)
	}
	if _, err = mappedRows(table, map[string]string{"sku": "missing"}); err == nil {
		t.Fatal("missing mapping")
	}
}
func TestXLSXImportBoundaries(t *testing.T) {
	sheet := `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>barcode</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>036000291452</t></is></c></row></sheetData></worksheet>`
	table, err := parseFile("file.xlsx", workbook(sheet, nil))
	if err != nil || table.Rows[0][0] != "036000291452" {
		t.Fatal(table, err)
	}
	for _, invalid := range []string{strings.Replace(sheet, "<is><t>036000291452</t></is>", "<f>HYPERLINK(\"bad\")</f><v>1</v>", 1), strings.Replace(sheet, "A2", "ZZ2", 1), strings.Replace(sheet, `r="2"`, `r="900000"`, 1)} {
		if _, err = parseFile("file.xlsx", workbook(invalid, nil)); err == nil {
			t.Fatal("unsafe sheet")
		}
	}
	for _, extras := range []map[string]string{{"../evil": "x"}, {"xl/worksheets/sheet2.xml": sheet}, {"xl/sharedStrings.xml": strings.Repeat("x", maxExpandedBytes+1)}} {
		if _, err = parseFile("file.xlsx", workbook(sheet, extras)); err == nil {
			t.Fatal("unsafe archive")
		}
	}
	if _, err = parseFile("file.xlsx", []byte("not-a-zip")); err == nil {
		t.Fatal("malformed archive")
	}
	shared := `<sst><si><t>barcode</t></si><si><t>001234</t></si></sst>`
	sheet = fmt.Sprintf(`<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row></sheetData></worksheet>`)
	table, err = parseFile("file.xlsx", workbook(sheet, map[string]string{"xl/sharedStrings.xml": shared}))
	if err != nil || table.Rows[0][0] != "001234" {
		t.Fatal(table, err)
	}
}
