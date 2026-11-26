package loyalty

import (
	"context"
	"github.com/jackc/pgx/v5"
	"math/big"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pricing"
)

func permission(actor organization.Member) error {
	for _, value := range actor.Permissions {
		if value == "loyalty.redeem" {
			return nil
		}
	}
	return organization.ErrDenied
}
func available(ctx context.Context, tx pgx.Tx, org, account, checkout string) (int64, error) {
	var points int64
	err := tx.QueryRow(ctx, `SELECT GREATEST(0,COALESCE((SELECT sum(points) FROM loyalty_ledger WHERE organization_id=$1 AND account_id=$2::uuid),0)-COALESCE((SELECT sum((pricing_snapshot->'loyalty'->>'points')::bigint) FROM pos_checkouts WHERE organization_id=$1 AND id::text<>$3 AND pricing_snapshot->'loyalty'->>'account_id'=$2::text AND status NOT IN ('COMPLETED','CANCELLED','RESOLVED')),0))::bigint`, org, account, checkout).Scan(&points)
	return points, err
}
func Quote(ctx context.Context, tx pgx.Tx, actor organization.Member, org string, customer *string, quote pricing.Quote, points int64) (pricing.Quote, error) {
	if points == 0 {
		return quote, nil
	}
	if err := permission(actor); err != nil {
		return quote, err
	}
	if customer == nil || points < 0 || points > MaximumPoints {
		return quote, ErrInput
	}
	reward := pricing.Reward{Points: points}
	err := tx.QueryRow(ctx, `SELECT account.id::text,program.id::text,program.revision,program.point_value::text FROM loyalty_accounts account JOIN loyalty_programs program ON program.organization_id=account.organization_id AND program.id=account.program_id JOIN customers customer ON customer.organization_id=account.organization_id AND customer.id=account.customer_id WHERE account.organization_id=$1 AND account.customer_id=$2 AND account.status='ACTIVE' AND program.status='ACTIVE' AND customer.status='ACTIVE' FOR UPDATE OF account FOR SHARE OF program,customer`, org, *customer).Scan(&reward.AccountID, &reward.ProgramID, &reward.ProgramRevision, &reward.PointValue)
	if err != nil {
		return quote, dbError(err)
	}
	balance, err := available(ctx, tx, org, reward.AccountID, "")
	if err != nil {
		return quote, err
	}
	if balance < points {
		return quote, ErrConflict
	}
	value, err := pricing.Decimal(reward.PointValue, 2)
	if err != nil {
		return quote, err
	}
	amount := new(big.Int).Mul(big.NewInt(points), big.NewInt(value))
	if !amount.IsInt64() || amount.Int64() > pricing.Maximum {
		return quote, ErrInput
	}
	reward.Amount = pricing.Money(amount.Int64())
	return pricing.ApplyReward(quote, reward)
}
func Validate(ctx context.Context, tx pgx.Tx, actor organization.Member, org, checkout string, customer *string, reward *pricing.Reward) error {
	if reward == nil {
		return nil
	}
	if err := permission(actor); err != nil {
		return err
	}
	if customer == nil {
		return ErrConflict
	}
	var valid bool
	err := tx.QueryRow(ctx, `SELECT account.status='ACTIVE' AND program.status='ACTIVE' AND customer.status='ACTIVE' FROM loyalty_accounts account JOIN loyalty_programs program ON program.organization_id=account.organization_id AND program.id=account.program_id JOIN customers customer ON customer.organization_id=account.organization_id AND customer.id=account.customer_id WHERE account.organization_id=$1 AND account.id=$2 AND account.customer_id=$3 AND account.program_id=$4 FOR UPDATE OF account FOR SHARE OF program,customer`, org, reward.AccountID, *customer, reward.ProgramID).Scan(&valid)
	if err != nil {
		return dbError(err)
	}
	if !valid {
		return ErrConflict
	}
	balance, err := available(ctx, tx, org, reward.AccountID, checkout)
	if err != nil {
		return err
	}
	if balance < reward.Points {
		return ErrConflict
	}
	return nil
}
