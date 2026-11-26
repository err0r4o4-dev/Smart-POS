package organization

import "context"

type storeStatus struct {
	HasStore       bool `json:"has_store"`
	CanCreateStore bool `json:"can_create_store"`
}

// storeStatus is a navigation hint for the authenticated user. Private reads and
// organization creation still authorize independently and require MFA.
func (service *Service) storeStatus(ctx context.Context, userID string) (storeStatus, error) {
	tx, err := service.transaction(ctx, userID, "")
	if err != nil {
		return storeStatus{}, err
	}
	defer tx.Rollback(ctx)
	if err = RequireVerified(ctx, tx, userID); err != nil {
		return storeStatus{}, err
	}
	var result storeStatus
	err = tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM organization_memberships m
			JOIN organizations o ON o.id=m.organization_id
			WHERE m.user_id=$1 AND m.role='OWNER' AND m.status='ACTIVE'
			  AND o.status='ACTIVE' AND ($2::uuid IS NULL OR o.id=$2)
		)`, userID, service.storeFilter()).Scan(&result.HasStore)
	if err != nil {
		return storeStatus{}, err
	}
	result.CanCreateStore = !result.HasStore && service.StoreMode() == "multi"
	return result, nil
}
