package organization

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"testing"
)

func TestLegacyCreationFingerprintCompatibility(t *testing.T) {
	input := CreateInput{OrganizationInput: OrganizationInput{Name: "Cafe", BusinessType: "RESTAURANT"}}
	if err := input.validateCreate(); err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	fingerprint := sha256.Sum256(encoded)
	const expectedJSON = `{"name":"Cafe","code":"","business_type":"RESTAURANT","contact_email":"","contact_phone":"","address":"","branch":{"name":"สาขาหลัก","code":"MAIN","address":"","phone":"","email":"","status":"ACTIVE"}}`
	expectedFingerprint := sha256.Sum256([]byte(expectedJSON))
	if string(encoded) != expectedJSON || hex.EncodeToString(fingerprint[:]) != hex.EncodeToString(expectedFingerprint[:]) {
		t.Fatal("legacy creation fingerprint changed")
	}
}
