package pos

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/customers"
	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/organization"
)

func cartHeader(ctx context.Context, tx pgx.Tx, actor organization.Member, user, org, id string) (Cart, error) {
	item := Cart{Items: []CartItem{}}
	if !uuidPattern.MatchString(id) {
		return item, ErrInput
	}
	err := tx.QueryRow(ctx, "SELECT id::text,branch_id::text,terminal_id::text,cashier_id::text,status,revision,pricing_revision,customer_id::text FROM pos_carts WHERE organization_id=$1 AND id=$2 FOR UPDATE", org, id).Scan(&item.ID, &item.BranchID, &item.TerminalID, &item.CashierID, &item.Status, &item.Revision, &item.StoredPricingRevision, &item.CustomerID)
	if err != nil {
		return item, dbError(err)
	}
	if item.CashierID != user {
		return item, organization.ErrDenied
	}
	return item, scope(ctx, tx, actor, org, item.BranchID, false)
}
func readCart(ctx context.Context, tx pgx.Tx, actor organization.Member, user, org, id string) (Cart, error) {
	item, err := cartHeader(ctx, tx, actor, user, org, id)
	if err != nil {
		return item, err
	}
	if item.CustomerID != nil {
		if !allowed(actor.Permissions, "customers.select") {
			return item, organization.ErrDenied
		}
		item.Customer, err = customers.ReadSelection(ctx, tx, org, *item.CustomerID)
		if err != nil {
			return item, dbError(err)
		}
	}
	value, err := terminal(ctx, tx, actor, org, item.TerminalID, false)
	if err != nil {
		return item, err
	}
	rows, err := tx.Query(ctx, "SELECT variant_id::text,quantity::text,unit_price::text,batch_id::text FROM pos_cart_items WHERE organization_id=$1 AND cart_id=$2 ORDER BY variant_id", org, id)
	if err != nil {
		return item, err
	}
	type stored struct {
		id, quantity, price string
		batch               *string
	}
	inputs := []stored{}
	for rows.Next() {
		var input stored
		if err = rows.Scan(&input.id, &input.quantity, &input.price, &input.batch); err != nil {
			rows.Close()
			return item, err
		}
		inputs = append(inputs, input)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return item, err
	}
	stockLocation := value.StockLocationID
	total := int64(0)
	for _, input := range inputs {
		value, err := variant(ctx, tx, org, value.StockLocationID, input.id, input.quantity, input.price)
		if err != nil {
			return item, err
		}
		value.BatchID = input.batch
		value.BatchVerified = input.batch != nil
		if err = inventory.QualityAvailability(ctx, tx, org, stockLocation, value.VariantID, input.batch, &value.Available, &value.Saleable); err != nil {
			return item, dbError(err)
		}
		amount, _ := scaled(value.LineTotal, 2)
		if total > maxDecimal-amount {
			return item, ErrInput
		}
		total += amount
		requested, _ := scaled(value.Quantity, 3)
		available, _ := scaled(value.Available, 3)
		if value.PriceChanged || !value.Saleable || available < requested {
			item.ReviewRequired = true
		}
		item.Items = append(item.Items, value)
	}
	item.Total = money(total)
	if err = priceCart(ctx, tx, org, &item, ""); err != nil {
		return item, err
	}
	if item.StoredPricingRevision != "" && item.StoredPricingRevision != item.Pricing.Revision {
		item.ReviewRequired = true
	}
	item.OnlineOrder, err = onlineOrderLink(ctx, tx, org, id)
	if err != nil {
		return item, err
	}
	return item, nil
}
func cartUnlocked(ctx context.Context, tx pgx.Tx, org, id string) error {
	var busy bool
	err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM pos_checkouts WHERE organization_id=$1 AND cart_id=$2 AND status NOT IN ('CANCELLED','RESOLVED'))", org, id).Scan(&busy)
	if err != nil {
		return err
	}
	if busy {
		return ErrPending
	}
	return nil
}
func (service *Service) Cart(ctx context.Context, user, org, id string) (Cart, error) {
	tx, actor, err := service.begin(ctx, user, org, "pos.cart.manage")
	if err != nil {
		return Cart{}, err
	}
	defer tx.Rollback(ctx)
	return readCart(ctx, tx, actor, user, org, id)
}
func (service *Service) CreateCart(ctx context.Context, user, org, key string, input CartInput) (Cart, error) {
	tx, actor, err := service.begin(ctx, user, org, "pos.cart.manage")
	if err != nil {
		return Cart{}, err
	}
	defer tx.Rollback(ctx)
	if !uuidPattern.MatchString(key) || len(input.Items) != 0 {
		return Cart{}, ErrInput
	}
	var id, previousTerminal string
	err = tx.QueryRow(ctx, "SELECT id::text,terminal_id::text FROM pos_carts WHERE organization_id=$1 AND cashier_id=$2 AND create_key=$3", org, user, key).Scan(&id, &previousTerminal)
	if err == nil {
		if previousTerminal != input.TerminalID {
			return Cart{}, ErrConflict
		}
		return readCart(ctx, tx, actor, user, org, id)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return Cart{}, err
	}
	value, err := terminal(ctx, tx, actor, org, input.TerminalID, true)
	if err != nil {
		return Cart{}, err
	}
	if _, err = ownShift(ctx, tx, org, value.ID, user); err != nil {
		return Cart{}, err
	}
	err = tx.QueryRow(ctx, "INSERT INTO pos_carts(organization_id,branch_id,terminal_id,cashier_id,create_key) VALUES($1,$2,$3,$4,$5) RETURNING id::text", org, value.BranchID, value.ID, user, key).Scan(&id)
	if err != nil {
		return Cart{}, dbError(err)
	}
	result, err := readCart(ctx, tx, actor, user, org, id)
	if err != nil {
		return result, err
	}
	return result, finish(ctx, tx, org, user, "pos.cart.created", id)
}
func (service *Service) UpdateCart(ctx context.Context, user, org, id, action string, input CartInput) (Cart, error) {
	tx, actor, err := service.begin(ctx, user, org, "pos.cart.manage")
	if err != nil {
		return Cart{}, err
	}
	defer tx.Rollback(ctx)
	current, err := cartHeader(ctx, tx, actor, user, org, id)
	if err != nil {
		return current, err
	}
	if current.Revision != input.Revision || allowed([]string{"COMPLETED", "CANCELLED"}, current.Status) {
		return current, ErrConflict
	}
	if err = cartUnlocked(ctx, tx, org, id); err != nil {
		return current, err
	}
	next := current.Status
	cleared := false
	switch action {
	case "update":
		if current.Status != "ACTIVE" || validateItems(input.Items) != nil {
			return current, ErrInput
		}
		if err = validateOnlineCart(ctx, tx, org, id, input.Items); err != nil {
			return current, err
		}
		value, err := terminal(ctx, tx, actor, org, current.TerminalID, true)
		if err != nil {
			return current, err
		}
		if _, err = ownShift(ctx, tx, org, value.ID, user); err != nil {
			return current, err
		}
		if _, err = tx.Exec(ctx, "DELETE FROM pos_cart_items WHERE organization_id=$1 AND cart_id=$2", org, id); err != nil {
			return current, err
		}
		for _, inputItem := range input.Items {
			if inputItem.BatchID != nil && (!uuidPattern.MatchString(*inputItem.BatchID) || !inputItem.BatchVerified) {
				return current, ErrInput
			}
			value, err := variant(ctx, tx, org, value.StockLocationID, inputItem.VariantID, inputItem.Quantity, "")
			if err != nil {
				return current, err
			}
			if !value.Saleable {
				return current, ErrConflict
			}
			_, err = tx.Exec(ctx, "INSERT INTO pos_cart_items(organization_id,cart_id,variant_id,quantity,unit_price,batch_id) VALUES($1,$2,$3,$4,$5,$6)", org, id, inputItem.VariantID, inputItem.Quantity, value.UnitPrice, inputItem.BatchID)
			if err != nil {
				return current, dbError(err)
			}
		}
	case "hold":
		if current.Status != "ACTIVE" {
			return current, ErrConflict
		}
		next = "HELD"
	case "resume":
		if current.Status != "HELD" {
			return current, ErrConflict
		}
		if input.TerminalID != "" && input.TerminalID != current.TerminalID {
			return current, ErrConflict
		}
		if _, err = terminal(ctx, tx, actor, org, current.TerminalID, true); err != nil {
			return current, err
		}
		if _, err = ownShift(ctx, tx, org, current.TerminalID, user); err != nil {
			return current, err
		}
		next = "ACTIVE"
		if current.CustomerID != nil {
			selected, problem := customers.ReadSelection(ctx, tx, org, *current.CustomerID)
			if problem != nil {
				return current, dbError(problem)
			}
			if selected.Status != "ACTIVE" {
				current.CustomerID = nil
				cleared = true
			}
		}
	case "cancel":
		next = "CANCELLED"
	default:
		return current, ErrInput
	}
	_, err = tx.Exec(ctx, "UPDATE pos_carts SET status=$3,revision=revision+1,updated_at=now(),customer_id=$4 WHERE organization_id=$1 AND id=$2", org, id, next, current.CustomerID)
	if err != nil {
		return current, dbError(err)
	}
	result, err := readCart(ctx, tx, actor, user, org, id)
	if err != nil {
		return result, err
	}
	if action == "update" {
		if _, err = tx.Exec(ctx, "UPDATE pos_carts SET pricing_revision=$3 WHERE organization_id=$1 AND id=$2", org, id, result.Pricing.Revision); err != nil {
			return result, dbError(err)
		}
		result.StoredPricingRevision = result.Pricing.Revision
		result.ReviewRequired = false
		for _, item := range result.Items {
			if item.PriceChanged || !item.Saleable {
				result.ReviewRequired = true
			}
		}
	}
	result.CustomerCleared = cleared
	if action == "cancel" {
		if err = releaseOnlineCart(ctx, tx, user, org, id); err != nil {
			return result, err
		}
	}
	if cleared {
		if err = organization.RecordAudit(ctx, tx, org, user, "pos.cart.customer_cleared", id); err != nil {
			return result, err
		}
	}
	return result, finish(ctx, tx, org, user, "pos.cart."+action, id)
}
