package catalog

import (
	"strings"
	"testing"
)

func TestProductValidation(t *testing.T) {
	for _, name := range []string{"", "\x00", strings.Repeat("x", 201), "bad\nname"} {
		input := ProductInput{Name: name}
		if input.validate() == nil {
			t.Fatalf("accepted %q", name)
		}
	}
	foreign := "not-uuid"
	input := ProductInput{Name: "สินค้า", CategoryID: &foreign}
	if input.validate() == nil {
		t.Fatal("invalid category")
	}
	input = ProductInput{Name: "  สินค้า  "}
	if input.validate() != nil || input.Name != "สินค้า" || input.Status != "ACTIVE" {
		t.Fatal(input)
	}
}
func TestExactMoneyAndVariant(t *testing.T) {
	for _, value := range []string{"-1", "0.001", "1e2", "NaN", " 1", "01", "10000000000000000"} {
		if positiveDecimal(value, moneyPattern, true) {
			t.Fatalf("accepted %s", value)
		}
	}
	for _, value := range []string{"0", "0.01", "9999999999999999.99"} {
		if !positiveDecimal(value, moneyPattern, true) {
			t.Fatalf("rejected %s", value)
		}
	}
	if positiveDecimal("0.00", moneyPattern, false) {
		t.Fatal("zero selling price")
	}
	input := VariantInput{SKU: " coke-325 ", Name: "Default", UnitID: "11111111-1111-4111-8111-111111111111", CostPrice: "0", SellingPrice: "18.00"}
	if input.validate() != nil || input.SKU != "COKE-325" {
		t.Fatal(input)
	}
	input.Attributes = map[string]string{"size": strings.Repeat("x", 201)}
	if input.validate() == nil {
		t.Fatal("large attribute")
	}
}
func TestUnitsAndPagination(t *testing.T) {
	input := TaxonomyInput{Name: "Can", Code: "can", UnitType: "COUNT"}
	if input.validate("units") != nil || input.Code != "CAN" {
		t.Fatal(input)
	}
	input.ConversionFactor = "6"
	if input.validate("units") == nil {
		t.Fatal("conversion without base")
	}
	input.ConversionFactor = "0"
	if input.validate("units") == nil {
		t.Fatal("zero conversion")
	}
	for _, filter := range []Filter{{Page: -1}, {PageSize: 101}, {Sort: "name;DROP TABLE products"}, {Status: "deleted"}} {
		if filter.validate() == nil {
			t.Fatal(filter)
		}
	}
}
func TestBarcodeStandards(t *testing.T) {
	for _, item := range [][2]string{{"4006381333931", "EAN13"}, {"96385074", "EAN8"}, {"036000291452", "UPCA"}, {"SP-ABC", "CODE128"}} {
		if !validBarcode(item[0], item[1]) {
			t.Fatal(item)
		}
	}
	for _, item := range [][2]string{{"4006381333932", "EAN13"}, {"12345678", "EAN8"}, {"036000291453", "UPCA"}, {"123", "EAN13"}, {"123\n", "CODE128"}, {"ไทย", "CODE128"}, {"123", "QR"}} {
		if validBarcode(item[0], item[1]) {
			t.Fatal(item)
		}
	}
	input := BarcodeInput{Code: "ABC", Symbology: "CODE128", Source: "INTERNAL"}
	if input.validate() == nil {
		t.Fatal("client internal source")
	}
}
