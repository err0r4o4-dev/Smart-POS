package storefront

import (
	"context"
	"slices"

	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/platform/stripe"
)

func (service *Service) authorizeStaffPayment(ctx context.Context, user, org, order string) (*organization.Authorization, PaymentAttempt, error) {
	if service.Organization == nil || service.Organization.Pool == nil {
		return nil, PaymentAttempt{}, stripe.ErrUnavailable
	}
	if !uuidPattern.MatchString(order) {
		return nil, PaymentAttempt{}, ErrNotFound
	}
	authorization, err := service.Organization.AuthorizeMFA(ctx, user, org, "storefront.manage")
	if err != nil {
		return nil, PaymentAttempt{}, paymentError(err)
	}
	tx, actor := authorization.Tx, authorization.Actor
	fail := func(problem error) (*organization.Authorization, PaymentAttempt, error) {
		tx.Rollback(ctx)
		return nil, PaymentAttempt{}, paymentError(problem)
	}
	recheck := func() error {
		if err := ctx.Err(); err != nil {
			return err
		}
		return authorization.Recheck(ctx)
	}
	if !slices.Contains(actor.Permissions, "online_orders.manage") {
		return fail(organization.ErrDenied)
	}
	var branch string
	err = tx.QueryRow(ctx, "SELECT branch_id::text FROM online_orders WHERE organization_id=$1 AND id=$2 FOR UPDATE", org, order).Scan(&branch)
	if failure := recheck(); failure != nil {
		return fail(failure)
	}
	if err != nil {
		return fail(err)
	}
	if !branchAllowed(actor, branch) {
		return fail(organization.ErrDenied)
	}
	attempt, err := readPayment(ctx, tx, org, order)
	if failure := recheck(); failure != nil {
		return fail(failure)
	}
	if err != nil {
		return fail(err)
	}
	return authorization, attempt, nil
}
