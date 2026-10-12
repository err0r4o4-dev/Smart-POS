package organization

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
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
	email, err := identity.NormalizeEmail(input.Email)
	if err != nil || !validRole(input.Role) || input.Role == "OWNER" {
		return Invitation{}, ErrInput
	}
	tx, actor, err := service.authorized(ctx, userID, orgID, "employee.invite")
	if err != nil {
		return Invitation{}, err
	}
	defer tx.Rollback(ctx)
	if actor.Role != "OWNER" && (!subordinate(input.Role) || !subset(input.BranchIDs, actor.BranchIDs)) {
		return Invitation{}, ErrDenied
	}
	if err = validateAssignments(ctx, tx, orgID, input.BranchIDs); err != nil {
		return Invitation{}, err
	}
	var active bool
	err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM organization_memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND u.email_normalized=$2 AND m.status<>'REMOVED')", orgID, email).Scan(&active)
	if err != nil {
		return Invitation{}, err
	}
	if active {
		return Invitation{}, ErrConflict
	}
	if _, err = tx.Exec(ctx, "UPDATE organization_invitations SET revoked_at=now() WHERE organization_id=$1 AND email=$2 AND expires_at<=now() AND accepted_at IS NULL AND revoked_at IS NULL", orgID, email); err != nil {
		return Invitation{}, err
	}
	token, hash, err := identity.RandomToken()
	if err != nil {
		return Invitation{}, err
	}
	result := Invitation{Email: email, Role: input.Role, BranchIDs: input.BranchIDs, Status: "PENDING"}
	err = tx.QueryRow(ctx, "INSERT INTO organization_invitations(organization_id,email,role,branch_ids,token_hash,invited_by) VALUES($1,$2,$3,$4::uuid[],$5,$6) RETURNING id,expires_at", orgID, email, input.Role, input.BranchIDs, hash[:], userID).Scan(&result.ID, &result.ExpiresAt)
	if err != nil {
		return result, dbError(err)
	}
	if err = audit(ctx, tx, orgID, userID, "INVITATION_CREATED", result.ID, input.BranchIDs); err != nil {
		return result, err
	}
	mailCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if service.Mailer == nil || service.Mailer.SendInvitation(mailCtx, email, token) != nil {
		return Invitation{}, errors.New("invitation delivery unavailable")
	}
	return result, dbError(tx.Commit(ctx))
}
func (service *Service) Invitations(ctx context.Context, userID, orgID string) ([]Invitation, error) {
	tx, actor, err := service.authorized(ctx, userID, orgID, "employee.invite")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	rows, err := tx.Query(ctx, `SELECT id,email,role,ARRAY(SELECT unnest(branch_ids)::text),expires_at,CASE WHEN revoked_at IS NOT NULL THEN 'REVOKED' WHEN accepted_at IS NOT NULL THEN 'ACCEPTED' WHEN expires_at<=now() THEN 'EXPIRED' ELSE 'PENDING' END FROM organization_invitations WHERE organization_id=$1 AND ($2 OR (role IN ('CASHIER','INVENTORY_STAFF','PURCHASING_STAFF') AND branch_ids <@ $3::uuid[])) ORDER BY created_at DESC LIMIT 200`, orgID, actor.Role == "OWNER", actor.BranchIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Invitation{}
	for rows.Next() {
		var invitation Invitation
		if err := rows.Scan(&invitation.ID, &invitation.Email, &invitation.Role, &invitation.BranchIDs, &invitation.ExpiresAt, &invitation.Status); err != nil {
			return nil, err
		}
		result = append(result, invitation)
	}
	return result, rows.Err()
}
func (service *Service) RevokeInvitation(ctx context.Context, userID, orgID, invitationID string) error {
	if !uuidPattern.MatchString(invitationID) {
		return ErrNotFound
	}
	tx, actor, err := service.authorized(ctx, userID, orgID, "employee.invite")
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var role string
	var branchIDs []string
	err = tx.QueryRow(ctx, "SELECT role,ARRAY(SELECT unnest(branch_ids)::text) FROM organization_invitations WHERE organization_id=$1 AND id=$2 AND accepted_at IS NULL AND revoked_at IS NULL", orgID, invitationID).Scan(&role, &branchIDs)
	if err != nil {
		return dbError(err)
	}
	if actor.Role != "OWNER" && (!subordinate(role) || !subset(branchIDs, actor.BranchIDs)) {
		return ErrDenied
	}
	if _, err = tx.Exec(ctx, "UPDATE organization_invitations SET revoked_at=now() WHERE organization_id=$1 AND id=$2", orgID, invitationID); err != nil {
		return err
	}
	if err = audit(ctx, tx, orgID, userID, "INVITATION_REVOKED", invitationID, branchIDs); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func (service *Service) Accept(ctx context.Context, user identity.Profile, token string) (Context, error) {
	hash, err := identity.TokenHash(token)
	if err != nil {
		return Context{}, ErrNotFound
	}
	var orgID string
	err = service.Pool.QueryRow(ctx, "SELECT organization_id FROM organization_invitations WHERE token_hash=$1 AND email=$2 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()", hash[:], user.Email).Scan(&orgID)
	if err != nil {
		return Context{}, dbError(err)
	}
	if !service.AllowsOrganization(orgID) {
		return Context{}, ErrNotFound
	}
	tx, err := service.transaction(ctx, user.ID, orgID)
	if err != nil {
		return Context{}, err
	}
	defer tx.Rollback(ctx)
	var locked string
	err = tx.QueryRow(ctx, "SELECT id FROM organizations WHERE id=$1 AND status='ACTIVE' FOR UPDATE", orgID).Scan(&locked)
	if err != nil {
		return Context{}, dbError(err)
	}
	var invitationID, role, inviterID string
	var branchIDs []string
	err = tx.QueryRow(ctx, "SELECT id,role,invited_by,ARRAY(SELECT unnest(branch_ids)::text) FROM organization_invitations WHERE organization_id=$1 AND token_hash=$2 AND email=$3 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE", orgID, hash[:], user.Email).Scan(&invitationID, &role, &inviterID, &branchIDs)
	if err != nil {
		return Context{}, dbError(err)
	}
	inviter, err := memberBy(ctx, tx, orgID, "m.user_id", inviterID)
	if err != nil {
		return Context{}, err
	}
	if inviter.Status != "ACTIVE" || !hasPermission(inviter.Role, "employee.invite") || (inviter.Role != "OWNER" && (!subordinate(role) || !subset(branchIDs, inviter.BranchIDs))) {
		return Context{}, ErrDenied
	}
	if err = validateAssignments(ctx, tx, orgID, branchIDs); err != nil {
		return Context{}, err
	}
	var memberID string
	err = tx.QueryRow(ctx, `INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT (organization_id,user_id) DO UPDATE SET role=EXCLUDED.role,status='ACTIVE',updated_at=now() WHERE organization_memberships.status='REMOVED' RETURNING id`, orgID, user.ID, role).Scan(&memberID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Context{}, ErrConflict
	}
	if err != nil {
		return Context{}, dbError(err)
	}
	if _, err = tx.Exec(ctx, "DELETE FROM branch_memberships WHERE organization_id=$1 AND membership_id=$2", orgID, memberID); err != nil {
		return Context{}, err
	}
	for _, branchID := range branchIDs {
		if _, err = tx.Exec(ctx, "INSERT INTO branch_memberships(organization_id,membership_id,branch_id) VALUES($1,$2,$3)", orgID, memberID, branchID); err != nil {
			return Context{}, dbError(err)
		}
	}
	if _, err = tx.Exec(ctx, "UPDATE organization_invitations SET accepted_at=now() WHERE organization_id=$1 AND id=$2", orgID, invitationID); err != nil {
		return Context{}, err
	}
	if err = audit(ctx, tx, orgID, user.ID, "INVITATION_ACCEPTED", memberID, branchIDs); err != nil {
		return Context{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Context{}, dbError(err)
	}
	return service.Context(ctx, user.ID, orgID)
}
