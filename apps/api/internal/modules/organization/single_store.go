package organization

import "strings"

func (service *Service) StoreMode() string {
	if service.SingleStoreOrganizationID != "" {
		return "single"
	}
	return "multi"
}

func (service *Service) AllowsOrganization(id string) bool {
	return service.SingleStoreOrganizationID == "" || strings.EqualFold(service.SingleStoreOrganizationID, id)
}

func (service *Service) storeFilter() any {
	if service.SingleStoreOrganizationID == "" {
		return nil
	}
	return service.SingleStoreOrganizationID
}
