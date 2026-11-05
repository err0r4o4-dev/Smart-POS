package organization

import (
	"context"
	"smartpos/api/internal/modules/identity"
	"time"
)

type Invitation struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	BranchIDs []string  `json:"branch_ids"`
	ExpiresAt time.Time `json:"expires_at"`
	Status    string    `json:"status"`
}
type InviteInput struct {
	Email     string   `json:"email"`
	Role      string   `json:"role"`
	BranchIDs []string `json:"branch_ids"`
}

func (service *Service) Invite(ctx context.Context, userID, orgID string, input InviteInput) (Invitation, error) {
	return Invitation{}, ErrNotFound
}
func (service *Service) Invitations(ctx context.Context, userID, orgID string) ([]Invitation, error) {
	return nil, ErrNotFound
}
func (service *Service) RevokeInvitation(ctx context.Context, userID, orgID, invitationID string) error {
	return ErrNotFound
}
func (service *Service) Accept(ctx context.Context, user identity.Profile, token string) (Context, error) {
	return Context{}, ErrNotFound
}
