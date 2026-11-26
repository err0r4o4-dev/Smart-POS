package returns

import (
	"os"
	"strings"
	"testing"
)

func TestReturnableSaleProjectionIncludesStoredStockPolicy(t *testing.T) {
	source, err := os.ReadFile("queries.go")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(source), "'stock_policy',sale.stock_policy") {
		t.Fatal("returnable sale projection must expose persisted stock policy")
	}
}
