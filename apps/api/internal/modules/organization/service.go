package organization

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type OrganizationInput struct {
	Name         string `json:"name"`
	Code         string `json:"code"`
	BusinessType string `json:"business_type"`
	ContactEmail string `json:"contact_email"`
	ContactPhone string `json:"contact_phone"`
	Address      string `json:"address"`
}
type Organization struct {
	ID string `json:"id"`
	OrganizationInput
	Currency string `json:"currency"`
	Status   string `json:"status"`
}
type BranchInput struct {
	Name    string `json:"name"`
	Code    string `json:"code"`
	Address string `json:"address"`
	Phone   string `json:"phone"`
	Email   string `json:"email"`
	Status  string `json:"status"`
}
type Branch struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organization_id"`
	BranchInput
	IsMain bool `json:"is_main"`
}
type Member struct {
	ID          string   `json:"id"`
	UserID      string   `json:"user_id"`
	Email       string   `json:"email"`
	DisplayName string   `json:"display_name"`
	Role        string   `json:"role"`
	Status      string   `json:"status"`
	BranchIDs   []string `json:"branch_ids"`
	Permissions []string `json:"permissions"`
}
type Context struct {
	Organization Organization `json:"organization"`
	Membership   Member       `json:"membership"`
	Branches     []Branch     `json:"branches"`
	Permissions  []string     `json:"permissions"`
}
type CreateInput struct {
	OrganizationInput
	Branch BranchInput `json:"branch"`
}
type MemberInput struct {
	Role      string   `json:"role"`
	Status    string   `json:"status"`
	BranchIDs []string `json:"branch_ids"`
}
type InvitationMailer interface {
	SendInvitation(context.Context, string, string) error
}
type Service struct {
	Pool                      *pgxpool.Pool
	Mailer                    InvitationMailer
	SingleStoreOrganizationID string
}
type auditKey struct{}

func (service *Service) Authorized(ctx context.Context, userID, orgID, permission string) (pgx.Tx, Member, error) {
	return service.authorized(ctx, userID, orgID, permission)
}

func RecordAudit(ctx context.Context, tx pgx.Tx, orgID, actor, event, object string) error {
	return audit(ctx, tx, orgID, actor, event, object, nil)
}

func WithRequestID(ctx context.Context, requestID string) context.Context {
	return context.WithValue(ctx, auditKey{}, requestID)
}
func newUUID() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	bytes[6] = (bytes[6] & 15) | 64
	bytes[8] = (bytes[8] & 63) | 128
	value := hex.EncodeToString(bytes)
	return value[:8] + "-" + value[8:12] + "-" + value[12:16] + "-" + value[16:20] + "-" + value[20:], nil
}
func dbError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	var problem *pgconn.PgError
	if errors.As(err, &problem) {
		switch problem.Code {
		case "23505", "23514":
			return ErrConflict
		case "23503", "22P02":
			return ErrInput
		}
	}
	return err
}
func (service *Service) transaction(ctx context.Context, userID, orgID string) (pgx.Tx, error) {
	if orgID != "" && !service.AllowsOrganization(orgID) {
		return nil, ErrNotFound
	}
	if !uuidPattern.MatchString(userID) || (orgID != "" && !uuidPattern.MatchString(orgID)) {
		return nil, ErrNotFound
	}
	tx, err := service.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	if _, err = tx.Exec(ctx, "SELECT set_config('app.user_id',$1,true),set_config('app.organization_id',$2,true)", userID, orgID); err != nil {
		tx.Rollback(ctx)
		return nil, err
	}
	return tx, nil
}
func memberBy(ctx context.Context, tx pgx.Tx, orgID, column, value string) (Member, error) {
	member := Member{BranchIDs: []string{}}
	err := tx.QueryRow(ctx, `SELECT m.id,m.user_id,u.email,u.display_name,m.role,m.status,
        ARRAY(SELECT b.branch_id::text FROM branch_memberships b WHERE b.organization_id=m.organization_id AND b.membership_id=m.id ORDER BY b.branch_id)
        FROM organization_memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND `+column+`=$2`, orgID, value).Scan(&member.ID, &member.UserID, &member.Email, &member.DisplayName, &member.Role, &member.Status, &member.BranchIDs)
	member.Permissions = Permissions(member.Role)
	if member.Status != "ACTIVE" {
		member.Permissions = []string{}
	}
	return member, dbError(err)
}
func (service *Service) authorized(ctx context.Context, userID, orgID, permission string) (pgx.Tx, Member, error) {
	tx, err := service.transaction(ctx, userID, orgID)
	if err != nil {
		return nil, Member{}, err
	}
	fail := func(problem error) (pgx.Tx, Member, error) { tx.Rollback(ctx); return nil, Member{}, problem }
	var identifier string
	err = tx.QueryRow(ctx, "SELECT id FROM organizations WHERE id=$1 AND status='ACTIVE' FOR UPDATE", orgID).Scan(&identifier)
	if err != nil {
		return fail(dbError(err))
	}
	actor, err := memberBy(ctx, tx, orgID, "m.user_id", userID)
	if errors.Is(err, ErrNotFound) {
		return fail(ErrNotFound)
	}
	if err != nil {
		return fail(err)
	}
	if actor.Status != "ACTIVE" {
		return fail(ErrNotFound)
	}
	if actor.Role != "OWNER" {
		allowed, err := branches(ctx, tx, orgID, actor, true)
		if err != nil {
			return fail(err)
		}
		actor.BranchIDs = []string{}
		for _, branch := range allowed {
			actor.BranchIDs = append(actor.BranchIDs, branch.ID)
		}
		if actor.Role == "MANAGER" && len(actor.BranchIDs) == 0 {
			actor.Permissions = []string{"organization.read", "branch.read"}
		}
		if actor.Role == "MANAGER" && len(actor.BranchIDs) == 0 && permission != "organization.read" && permission != "branch.read" {
			return fail(ErrDenied)
		}
	}
	if !hasPermission(actor.Role, permission) {
		return fail(ErrDenied)
	}
	return tx, actor, nil
}
func audit(ctx context.Context, tx pgx.Tx, orgID, actor, event, object string, branches []string) error {
	requestID, _ := ctx.Value(auditKey{}).(string)
	if branches == nil {
		branches = []string{}
	}
	_, err := tx.Exec(ctx, "INSERT INTO organization_audit_events(organization_id,actor_id,event_type,object_id,branch_ids,request_id) VALUES($1,$2,$3,$4,$5::uuid[],$6)", orgID, actor, event, object, branches, requestID)
	return err
}
func readOrganization(ctx context.Context, tx pgx.Tx, orgID string) (Organization, error) {
	var org Organization
	err := tx.QueryRow(ctx, "SELECT id,name,code,business_type,contact_email,contact_phone,address,currency,status FROM organizations WHERE id=$1", orgID).Scan(&org.ID, &org.Name, &org.Code, &org.BusinessType, &org.ContactEmail, &org.ContactPhone, &org.Address, &org.Currency, &org.Status)
	return org, dbError(err)
}
func branches(ctx context.Context, tx pgx.Tx, orgID string, actor Member, onlyActive bool) ([]Branch, error) {
	rows, err := tx.Query(ctx, `SELECT id,organization_id,name,code,address,phone,email,status,is_main FROM branches WHERE organization_id=$1 AND ($2 OR id=ANY($3::uuid[])) AND (NOT $4 OR status='ACTIVE') ORDER BY is_main DESC,code`, orgID, actor.Role == "OWNER", actor.BranchIDs, onlyActive)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Branch{}
	for rows.Next() {
		var branch Branch
		if err := rows.Scan(&branch.ID, &branch.OrganizationID, &branch.Name, &branch.Code, &branch.Address, &branch.Phone, &branch.Email, &branch.Status, &branch.IsMain); err != nil {
			return nil, err
		}
		result = append(result, branch)
	}
	return result, rows.Err()
}
func (service *Service) List(ctx context.Context, userID string) ([]Organization, error) {
	tx, err := service.transaction(ctx, userID, "")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	rows, err := tx.Query(ctx, `SELECT o.id,o.name,o.code,o.business_type,CASE WHEN m.role IN ('OWNER','MANAGER') THEN o.contact_email ELSE '' END,CASE WHEN m.role IN ('OWNER','MANAGER') THEN o.contact_phone ELSE '' END,CASE WHEN m.role IN ('OWNER','MANAGER') THEN o.address ELSE '' END,o.currency,o.status FROM organizations o JOIN organization_memberships m ON m.organization_id=o.id WHERE m.user_id=$1 AND m.status='ACTIVE' AND o.status='ACTIVE' AND ($2::uuid IS NULL OR o.id=$2) ORDER BY o.name`, userID, service.storeFilter())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Organization{}
	for rows.Next() {
		var org Organization
		if err := rows.Scan(&org.ID, &org.Name, &org.Code, &org.BusinessType, &org.ContactEmail, &org.ContactPhone, &org.Address, &org.Currency, &org.Status); err != nil {
			return nil, err
		}
		result = append(result, org)
	}
	return result, rows.Err()
}
func (service *Service) Context(ctx context.Context, userID, orgID string) (Context, error) {
	tx, actor, err := service.authorized(ctx, userID, orgID, "organization.read")
	if err != nil {
		return Context{}, err
	}
	defer tx.Rollback(ctx)
	org, err := readOrganization(ctx, tx, orgID)
	if err != nil {
		return Context{}, err
	}
	if subordinate(actor.Role) {
		org.ContactEmail = ""
		org.ContactPhone = ""
		org.Address = ""
	}
	allowed, err := branches(ctx, tx, orgID, actor, true)
	return Context{org, actor, allowed, actor.Permissions}, err
}
func (service *Service) Create(ctx context.Context, userID, key string, input CreateInput) (Context, error) {
	if service.SingleStoreOrganizationID != "" {
		return Context{}, ErrDenied
	}
	if !uuidPattern.MatchString(key) || input.validate() != nil || input.Branch.validate() != nil || input.Branch.Status != "ACTIVE" {
		return Context{}, ErrInput
	}
	encoded, _ := json.Marshal(input)
	fingerprint := sha256.Sum256(encoded)
	orgID, err := newUUID()
	if err != nil {
		return Context{}, err
	}
	tx, err := service.transaction(ctx, userID, orgID)
	if err != nil {
		return Context{}, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", userID+key); err != nil {
		return Context{}, err
	}
	var oldID string
	var oldHash []byte
	err = tx.QueryRow(ctx, "SELECT organization_id,fingerprint FROM organization_creation_requests WHERE user_id=$1 AND key=$2", userID, key).Scan(&oldID, &oldHash)
	if err == nil {
		if hex.EncodeToString(oldHash) != hex.EncodeToString(fingerprint[:]) {
			return Context{}, ErrConflict
		}
		tx.Rollback(ctx)
		return service.Context(ctx, userID, oldID)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return Context{}, err
	}
	_, err = tx.Exec(ctx, "INSERT INTO organizations(id,name,code,business_type,contact_email,contact_phone,address,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", orgID, input.Name, input.Code, input.BusinessType, input.ContactEmail, input.ContactPhone, input.Address, userID)
	if err != nil {
		return Context{}, dbError(err)
	}
	var memberID, branchID string
	err = tx.QueryRow(ctx, "INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'OWNER') RETURNING id", orgID, userID).Scan(&memberID)
	if err != nil {
		return Context{}, err
	}
	err = tx.QueryRow(ctx, "INSERT INTO branches(organization_id,name,code,address,phone,email,is_main) VALUES($1,$2,$3,$4,$5,$6,true) RETURNING id", orgID, input.Branch.Name, input.Branch.Code, input.Branch.Address, input.Branch.Phone, input.Branch.Email).Scan(&branchID)
	if err != nil {
		return Context{}, dbError(err)
	}
	if _, err = tx.Exec(ctx, "INSERT INTO organization_creation_requests(user_id,key,fingerprint,organization_id) VALUES($1,$2,$3,$4)", userID, key, fingerprint[:], orgID); err != nil {
		return Context{}, err
	}
	if err = audit(ctx, tx, orgID, userID, "ORGANIZATION_CREATED", orgID, []string{branchID}); err != nil {
		return Context{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Context{}, dbError(err)
	}
	return service.Context(ctx, userID, orgID)
}
func (service *Service) Update(ctx context.Context, userID, orgID string, input OrganizationInput) (Organization, error) {
	if input.validate() != nil {
		return Organization{}, ErrInput
	}
	tx, _, err := service.authorized(ctx, userID, orgID, "organization.update")
	if err != nil {
		return Organization{}, err
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, "UPDATE organizations SET name=$2,code=$3,business_type=$4,contact_email=$5,contact_phone=$6,address=$7,updated_at=now() WHERE id=$1", orgID, input.Name, input.Code, input.BusinessType, input.ContactEmail, input.ContactPhone, input.Address)
	if err != nil {
		return Organization{}, dbError(err)
	}
	if err = audit(ctx, tx, orgID, userID, "ORGANIZATION_UPDATED", orgID, nil); err != nil {
		return Organization{}, err
	}
	result, err := readOrganization(ctx, tx, orgID)
	if err != nil {
		return result, err
	}
	return result, dbError(tx.Commit(ctx))
}
