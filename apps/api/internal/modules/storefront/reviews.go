package storefront

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

var ErrReviewNotReady = errors.New("storefront order is not completed")

type ReviewInput struct {
	TrackingInput
	Rating int `json:"rating"`
}

type CustomerReview struct {
	Rating int `json:"rating"`
}

func (service *Service) ReviewOrder(ctx context.Context, slug string, input ReviewInput) (CustomerReview, error) {
	if input.Rating < 1 || input.Rating > 5 {
		return CustomerReview{}, ErrInput
	}
	tx, org, err := service.openTrackingTx(ctx, slug, input.TrackingInput)
	if err != nil {
		return CustomerReview{}, err
	}
	defer tx.Rollback(ctx)

	// Recheck the proof in the write statement; the first successfully stored rating wins.
	const orderScope = `
		FROM public.online_orders doc
		WHERE doc.organization_id=$1 AND doc.id=$2
		  AND storefront_tracking_resolve($3,$2,$4)=doc.organization_id`
	hash := accessHash(input.AccessToken)
	var review CustomerReview
	err = tx.QueryRow(ctx, `INSERT INTO storefront_ratings (organization_id,order_id,rating)
		SELECT doc.organization_id,doc.id,$5`+orderScope+` AND doc.status='COMPLETED'
		ON CONFLICT (organization_id,order_id) DO NOTHING RETURNING rating`, org, input.OrderID, slug, hash, input.Rating).Scan(&review.Rating)
	if errors.Is(err, pgx.ErrNoRows) {
		// A new statement sees a rating committed by a concurrent request that won the insert.
		var status string
		var existing *int
		err = tx.QueryRow(ctx, `SELECT doc.status,(SELECT rating FROM storefront_ratings WHERE organization_id=doc.organization_id AND order_id=doc.id)`+orderScope,
			org, input.OrderID, slug, hash).Scan(&status, &existing)
		if errors.Is(err, pgx.ErrNoRows) {
			return CustomerReview{}, ErrNotFound
		}
		if err == nil {
			if status != "COMPLETED" || existing == nil {
				return CustomerReview{}, ErrReviewNotReady
			}
			review.Rating = *existing
		}
	}
	if err != nil {
		return CustomerReview{}, dbError(err)
	}
	if err := tx.Commit(ctx); err != nil {
		return CustomerReview{}, dbError(err)
	}
	return review, nil
}
