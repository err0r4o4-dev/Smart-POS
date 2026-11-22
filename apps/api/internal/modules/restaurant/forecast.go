package restaurant

import "context"

type ForecastStatus struct {
	Status string         `json:"status"`
	Reason string         `json:"reason"`
	Items  []ForecastItem `json:"items"`
}

func (service *Service) ForecastStatus(ctx context.Context, user, org, branch string) (ForecastStatus, error) {
	if !uuidPattern.MatchString(branch) {
		return ForecastStatus{}, ErrInput
	}
	authorization, err := service.begin(ctx, user, org, "sales.read")
	if err != nil {
		return ForecastStatus{}, err
	}
	tx := authorization.Tx
	defer tx.Rollback(ctx)
	if err = activeBranch(ctx, tx, authorization.Actor, org, branch); err != nil {
		return ForecastStatus{}, err
	}
	if err = authorization.Recheck(ctx); err != nil {
		return ForecastStatus{}, err
	}
	return ForecastStatus{Status: "unavailable", Reason: "FORECAST_NOT_CONFIGURED", Items: []ForecastItem{}}, nil
}
