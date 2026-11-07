package organization

import (
	"context"
	"github.com/jackc/pgx/v5"
	"time"
)

func (service *Service) Branches(ctx context.Context, userID, orgID string) ([]Branch, error) {
	tx, actor, err := service.authorized(ctx, userID, orgID, "branch.read")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	return branches(ctx, tx, orgID, actor, actor.Role != "OWNER")
}
func (service *Service) SaveBranch(ctx context.Context, userID, orgID, branchID string, input BranchInput) (Branch, error) {
	if input.validate() != nil {
		return Branch{}, ErrInput
	}
	permission := "branch.create"
	if branchID != "" {
		permission = "branch.update"
		if !uuidPattern.MatchString(branchID) {
			return Branch{}, ErrNotFound
		}
	}
	tx, actor, err := service.authorized(ctx, userID, orgID, permission)
	if err != nil {
		return Branch{}, err
	}
	defer tx.Rollback(ctx)
	isMain := false
	if branchID == "" {
		err = tx.QueryRow(ctx, "INSERT INTO branches(organization_id,name,code,address,phone,email,status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", orgID, input.Name, input.Code, input.Address, input.Phone, input.Email, input.Status).Scan(&branchID)
	} else {
		if actor.Role != "OWNER" && (!contains(actor.BranchIDs, branchID) || input.Status != "ACTIVE") {
			return Branch{}, ErrDenied
		}
		var previousStatus string
		err = tx.QueryRow(ctx, "SELECT is_main,status FROM branches WHERE organization_id=$1 AND id=$2", orgID, branchID).Scan(&isMain, &previousStatus)
		if err != nil {
			return Branch{}, dbError(err)
		}
		if actor.Role != "OWNER" && previousStatus != "ACTIVE" {
			return Branch{}, ErrDenied
		}
		if input.Status == "INACTIVE" {
			var count int
			if err = tx.QueryRow(ctx, "SELECT count(*) FROM branches WHERE organization_id=$1 AND status='ACTIVE' AND id<>$2", orgID, branchID).Scan(&count); err != nil {
				return Branch{}, err
			}
			if count == 0 {
				return Branch{}, ErrConflict
			}
		}
		_, err = tx.Exec(ctx, "UPDATE branches SET name=$3,code=$4,address=$5,phone=$6,email=$7,status=$8,updated_at=now() WHERE organization_id=$1 AND id=$2", orgID, branchID, input.Name, input.Code, input.Address, input.Phone, input.Email, input.Status)
	}
	if err != nil {
		return Branch{}, dbError(err)
	}
	if err = audit(ctx, tx, orgID, userID, "BRANCH_SAVED", branchID, []string{branchID}); err != nil {
		return Branch{}, err
	}
	return Branch{branchID, orgID, input, isMain}, dbError(tx.Commit(ctx))
}
func (service *Service) Members(ctx context.Context, userID, orgID, memberID string) ([]Member, error) {
	return nil, ErrNotFound
}
func validateAssignments(ctx context.Context, tx pgx.Tx, orgID string, branchIDs []string) error {
	if len(branchIDs) == 0 || len(branchIDs) > 100 {
		return ErrInput
	}
	seen := map[string]bool{}
	for _, branchID := range branchIDs {
		if !uuidPattern.MatchString(branchID) || seen[branchID] {
			return ErrInput
		}
		seen[branchID] = true
		var exists bool
		if err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM branches WHERE organization_id=$1 AND id=$2 AND status='ACTIVE')", orgID, branchID).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return ErrDenied
		}
	}
	return nil
}
func (service *Service) UpdateMember(ctx context.Context, userID, orgID, memberID string, input MemberInput, remove bool) (Member, error) {
	return Member{}, ErrNotFound
}

type AuditEvent struct {
	ID        int64     `json:"id"`
	ActorID   string    `json:"actor_id"`
	Event     string    `json:"event_type"`
	ObjectID  string    `json:"object_id"`
	RequestID string    `json:"request_id"`
	CreatedAt time.Time `json:"created_at"`
}

func (service *Service) Audit(ctx context.Context, userID, orgID, objectID string) ([]AuditEvent, error) {
	tx, actor, err := service.authorized(ctx, userID, orgID, "audit.read")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if objectID != "" {
		if !uuidPattern.MatchString(objectID) {
			return nil, ErrNotFound
		}
		target, err := memberBy(ctx, tx, orgID, "m.id", objectID)
		if err != nil {
			return nil, err
		}
		if actor.Role != "OWNER" && target.ID != actor.ID && (!subordinate(target.Role) || len(target.BranchIDs) == 0 || !subset(target.BranchIDs, actor.BranchIDs)) {
			return nil, ErrNotFound
		}
	}
	rows, err := tx.Query(ctx, `SELECT id,actor_id,event_type,object_id,request_id,created_at FROM organization_audit_events WHERE organization_id=$1 AND ($2='' OR object_id::text=$2) AND ($3 OR (cardinality(branch_ids)>0 AND branch_ids <@ $4::uuid[])) ORDER BY id DESC LIMIT 100`, orgID, objectID, actor.Role == "OWNER", actor.BranchIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []AuditEvent{}
	for rows.Next() {
		var event AuditEvent
		if err = rows.Scan(&event.ID, &event.ActorID, &event.Event, &event.ObjectID, &event.RequestID, &event.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, event)
	}
	return result, rows.Err()
}
