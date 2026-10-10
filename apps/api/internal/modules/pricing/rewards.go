package pricing

import "math/big"

func ApplyReward(quote Quote, reward Reward) (Quote, error) {
	if quote.Loyalty != nil || quote.Discount != "0.00" || quote.ApprovalID != "" || !UUID.MatchString(reward.AccountID) || !UUID.MatchString(reward.ProgramID) || reward.ProgramRevision < 1 || reward.Points <= 0 || reward.Points > 1000000000000 {
		return quote, ErrConflict
	}
	value, err := Decimal(reward.PointValue, 2)
	if err != nil || value <= 0 {
		return quote, ErrInput
	}
	amount := new(big.Int).Mul(big.NewInt(value), big.NewInt(reward.Points))
	if !amount.IsInt64() || amount.Int64() > Maximum {
		return quote, ErrInput
	}
	if reward.Amount != Money(amount.Int64()) {
		return quote, ErrConflict
	}
	quote, err = Manual(quote, "", amount.Int64())
	if err != nil {
		return quote, err
	}
	quote.Loyalty = &reward
	quote.Revision = ""
	quote.Revision = Hash(quote)
	return quote, nil
}
