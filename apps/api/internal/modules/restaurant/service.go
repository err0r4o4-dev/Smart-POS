package restaurant

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"smartpos/api/internal/modules/organization"
)

type Service struct{ Organization *organization.Service }

func dbError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	var problem *pgconn.PgError
	if errors.As(err, &problem) {
		switch problem.Code {
		case "23505", "23514", "40001", "40P01":
			return ErrConflict
		case "23503", "22P02", "22003":
			return ErrInput
		case "42P01":
			return ErrSetupUnavailable
		case "42501":
			return organization.ErrDenied
		}
	}
	return err
}

func (service *Service) begin(ctx context.Context, user, org, permission string) (pgx.Tx, organization.Member, error) {
	return service.Organization.Authorized(ctx, user, org, permission)
}

func branchScope(actor organization.Member, branch string) error {
	if actor.Role != "OWNER" {
		for _, allowed := range actor.BranchIDs {
			if allowed == branch {
				return nil
			}
		}
		return organization.ErrDenied
	}
	return nil
}

func activeBranch(ctx context.Context, tx pgx.Tx, actor organization.Member, org, branch string) error {
	if err := branchScope(actor, branch); err != nil {
		return err
	}
	var status string
	if err := tx.QueryRow(ctx, "SELECT status FROM branches WHERE organization_id=$1 AND id=$2", org, branch).Scan(&status); err != nil {
		return dbError(err)
	}
	if status != "ACTIVE" {
		return ErrConflict
	}
	return nil
}

func finish(ctx context.Context, tx pgx.Tx, org, user, event, id string) error {
	if err := organization.RecordAudit(ctx, tx, org, user, event, id); err != nil {
		return err
	}
	return dbError(tx.Commit(ctx))
}

func readSettings(ctx context.Context, tx pgx.Tx, org, branch string) (Settings, error) {
	return readSettingsAt(ctx, tx, org, branch, time.Now())
}

func readSettingsAt(ctx context.Context, tx pgx.Tx, org, branch string, now time.Time) (Settings, error) {
	result := Settings{BranchID: branch, ClosingTime: "22:00", Timezone: "Asia/Bangkok", Revision: 0}
	err := tx.QueryRow(ctx, "SELECT to_char(closing_time,'HH24:MI'),timezone,revision FROM restaurant_settings WHERE organization_id=$1 AND branch_id=$2", org, branch).Scan(&result.ClosingTime, &result.Timezone, &result.Revision)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return result, dbError(err)
	}
	result.Period, err = businessPeriod(now, result)
	return result, err
}

func (service *Service) Settings(ctx context.Context, user, org, branch string) (Settings, error) {
	if !uuidPattern.MatchString(branch) {
		return Settings{}, ErrInput
	}
	tx, actor, err := service.begin(ctx, user, org, "storefront.manage")
	if err != nil {
		return Settings{}, err
	}
	defer tx.Rollback(ctx)
	if err = activeBranch(ctx, tx, actor, org, branch); err != nil {
		return Settings{}, err
	}
	return readSettings(ctx, tx, org, branch)
}

func (service *Service) SaveSettings(ctx context.Context, user, org string, input SettingsInput) (Settings, error) {
	if input.normalize() != nil {
		return Settings{}, ErrInput
	}
	tx, actor, err := service.begin(ctx, user, org, "storefront.manage")
	if err != nil {
		return Settings{}, err
	}
	defer tx.Rollback(ctx)
	if err = activeBranch(ctx, tx, actor, org, input.BranchID); err != nil {
		return Settings{}, err
	}
	if input.Revision == 0 {
		command, problem := tx.Exec(ctx, `INSERT INTO restaurant_settings(organization_id,branch_id,closing_time,timezone,revision,updated_by) VALUES($1,$2,$3::time,$4,1,$5) ON CONFLICT(organization_id,branch_id) DO NOTHING`, org, input.BranchID, input.ClosingTime, input.Timezone, user)
		if problem != nil {
			return Settings{}, dbError(problem)
		}
		if command.RowsAffected() != 1 {
			return Settings{}, ErrConflict
		}
	} else {
		command, problem := tx.Exec(ctx, `UPDATE restaurant_settings SET closing_time=$3::time,timezone=$4,revision=revision+1,updated_by=$5,updated_at=now() WHERE organization_id=$1 AND branch_id=$2 AND revision=$6`, org, input.BranchID, input.ClosingTime, input.Timezone, user, input.Revision)
		if problem != nil {
			return Settings{}, dbError(problem)
		}
		if command.RowsAffected() == 0 {
			return Settings{}, ErrConflict
		}
	}
	result, err := readSettings(ctx, tx, org, input.BranchID)
	if err != nil {
		return Settings{}, err
	}
	return result, finish(ctx, tx, org, user, "restaurant.settings.updated", input.BranchID)
}

func recipeQuery() string {
	return `SELECT recipe.id::text,recipe.branch_id::text,recipe.menu_variant_id::text,menu.name,recipe.status,recipe.revision,recipe.created_at,recipe.updated_at,COALESCE((SELECT jsonb_agg(jsonb_build_object('ingredient_variant_id',item.ingredient_variant_id::text,'ingredient_name',ingredient.name,'unit',COALESCE(unit.code,''),'quantity',item.quantity::text) ORDER BY ingredient.name) FROM restaurant_recipe_items item JOIN product_variants ingredient ON ingredient.organization_id=item.organization_id AND ingredient.id=item.ingredient_variant_id LEFT JOIN units unit ON unit.organization_id=ingredient.organization_id AND unit.id=item.unit_id WHERE item.organization_id=recipe.organization_id AND item.recipe_id=recipe.id),'[]'::jsonb) FROM restaurant_recipes recipe JOIN product_variants menu ON menu.organization_id=recipe.organization_id AND menu.id=recipe.menu_variant_id WHERE recipe.organization_id=$1 AND recipe.branch_id=$2`
}

func readRecipe(ctx context.Context, tx pgx.Tx, org, branch, id string) (Recipe, error) {
	var result Recipe
	var items []byte
	err := tx.QueryRow(ctx, recipeQuery()+" AND recipe.id=$3", org, branch, id).Scan(&result.ID, &result.BranchID, &result.MenuVariantID, &result.MenuName, &result.Status, &result.Revision, &result.CreatedAt, &result.UpdatedAt, &items)
	if err != nil {
		return result, dbError(err)
	}
	if err = json.Unmarshal(items, &result.Items); err != nil {
		return result, err
	}
	return result, nil
}

func (service *Service) Recipes(ctx context.Context, user, org, branch string) ([]Recipe, error) {
	if !uuidPattern.MatchString(branch) {
		return nil, ErrInput
	}
	tx, actor, err := service.begin(ctx, user, org, "catalog.read")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if err = activeBranch(ctx, tx, actor, org, branch); err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, recipeQuery()+" ORDER BY menu.name", org, branch)
	if err != nil {
		return nil, dbError(err)
	}
	defer rows.Close()
	result := []Recipe{}
	for rows.Next() {
		var item Recipe
		var raw []byte
		if err = rows.Scan(&item.ID, &item.BranchID, &item.MenuVariantID, &item.MenuName, &item.Status, &item.Revision, &item.CreatedAt, &item.UpdatedAt, &raw); err != nil {
			return nil, err
		}
		if err = json.Unmarshal(raw, &item.Items); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (service *Service) SaveRecipe(ctx context.Context, user, org, id, key string, input RecipeInput) (Recipe, error) {
	if input.normalize() != nil || id != "" && (!uuidPattern.MatchString(id) || input.Revision < 1) || id == "" && input.Revision != 0 {
		return Recipe{}, ErrInput
	}
	tx, actor, err := service.begin(ctx, user, org, "catalog.update")
	if err != nil {
		return Recipe{}, err
	}
	defer tx.Rollback(ctx)
	if err = activeBranch(ctx, tx, actor, org, input.BranchID); err != nil {
		return Recipe{}, err
	}
	commandID := ""
	if id == "" {
		var previous []byte
		commandID, previous, err = claimCommand(ctx, tx, org, user, "recipe.create", key, input)
		if err != nil {
			return Recipe{}, err
		}
		if previous != nil {
			var result Recipe
			err = json.Unmarshal(previous, &result)
			return result, err
		}
	}
	if err = validateRecipeVariants(ctx, tx, org, id, input); err != nil {
		return Recipe{}, err
	}
	if id == "" {
		err = tx.QueryRow(ctx, "INSERT INTO restaurant_recipes(organization_id,branch_id,menu_variant_id,status,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$5) RETURNING id::text", org, input.BranchID, input.MenuVariantID, input.Status, user).Scan(&id)
	} else {
		command, problem := tx.Exec(ctx, "UPDATE restaurant_recipes SET menu_variant_id=$3,status=$4,revision=revision+1,updated_by=$5,updated_at=now() WHERE organization_id=$1 AND id=$2 AND branch_id=$6 AND revision=$7", org, id, input.MenuVariantID, input.Status, user, input.BranchID, input.Revision)
		if problem != nil {
			return Recipe{}, dbError(problem)
		}
		if command.RowsAffected() != 1 {
			return Recipe{}, ErrConflict
		}
	}
	if err != nil {
		return Recipe{}, dbError(err)
	}
	if _, err = tx.Exec(ctx, "DELETE FROM restaurant_recipe_items WHERE organization_id=$1 AND recipe_id=$2", org, id); err != nil {
		return Recipe{}, dbError(err)
	}
	for _, item := range input.Items {
		if _, err = tx.Exec(ctx, "INSERT INTO restaurant_recipe_items(organization_id,recipe_id,ingredient_variant_id,quantity,unit_id) SELECT $1,$2,id,$4::numeric,unit_id FROM product_variants WHERE organization_id=$1 AND id=$3", org, id, item.IngredientVariantID, item.Quantity); err != nil {
			return Recipe{}, dbError(err)
		}
	}
	result, err := readRecipe(ctx, tx, org, input.BranchID, id)
	if err != nil {
		return Recipe{}, err
	}
	if err = saveCommand(ctx, tx, org, commandID, result); err != nil {
		return Recipe{}, err
	}
	return result, finish(ctx, tx, org, user, "restaurant.recipe.saved", id)
}

func newToken() (string, string, error) {
	data := make([]byte, 32)
	if _, err := rand.Read(data); err != nil {
		return "", "", err
	}
	token := hex.EncodeToString(data)
	hash := sha256.Sum256([]byte(token))
	return token, hex.EncodeToString(hash[:]), nil
}

func (service *Service) Tables(ctx context.Context, user, org, branch string) ([]Table, error) {
	if !uuidPattern.MatchString(branch) {
		return nil, ErrInput
	}
	tx, actor, err := service.begin(ctx, user, org, "online_orders.manage")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if err = activeBranch(ctx, tx, actor, org, branch); err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, "SELECT id::text,branch_id::text,code,name,seats,status,revision,created_at,updated_at FROM restaurant_tables WHERE organization_id=$1 AND branch_id=$2 ORDER BY code", org, branch)
	if err != nil {
		return nil, dbError(err)
	}
	defer rows.Close()
	result := []Table{}
	for rows.Next() {
		var item Table
		if err = rows.Scan(&item.ID, &item.BranchID, &item.Code, &item.Name, &item.Seats, &item.Status, &item.Revision, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (service *Service) SaveTable(ctx context.Context, user, org, id, key string, input TableInput) (Table, error) {
	if input.normalize() != nil || id != "" && (!uuidPattern.MatchString(id) || input.Revision < 1) || id == "" && input.Revision != 0 {
		return Table{}, ErrInput
	}
	tx, actor, err := service.begin(ctx, user, org, "online_orders.manage")
	if err != nil {
		return Table{}, err
	}
	defer tx.Rollback(ctx)
	if err = activeBranch(ctx, tx, actor, org, input.BranchID); err != nil {
		return Table{}, err
	}
	commandID := ""
	qrToken := ""
	if id == "" {
		var previous []byte
		commandID, previous, err = claimCommand(ctx, tx, org, user, "table.create", key, input)
		if err != nil {
			return Table{}, err
		}
		if previous != nil {
			var result Table
			err = json.Unmarshal(previous, &result)
			return result, err
		}
	}
	hash := ""
	if id == "" {
		qrToken, hash, err = newToken()
		if err != nil {
			return Table{}, err
		}
		err = tx.QueryRow(ctx, "INSERT INTO restaurant_tables(organization_id,branch_id,code,name,seats,status,qr_token_hash,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id::text", org, input.BranchID, input.Code, input.Name, input.Seats, input.Status, hash, user).Scan(&id)
	} else {
		command, problem := tx.Exec(ctx, "UPDATE restaurant_tables SET code=$3,name=$4,seats=$5,status=$6,revision=revision+1,updated_by=$7,updated_at=now() WHERE organization_id=$1 AND id=$2 AND branch_id=$8 AND revision=$9", org, id, input.Code, input.Name, input.Seats, input.Status, user, input.BranchID, input.Revision)
		if problem != nil {
			return Table{}, dbError(problem)
		}
		if command.RowsAffected() == 0 {
			return Table{}, ErrConflict
		}
	}
	if err != nil {
		return Table{}, dbError(err)
	}
	var result Table
	err = tx.QueryRow(ctx, "SELECT id::text,branch_id::text,code,name,seats,status,revision,created_at,updated_at FROM restaurant_tables WHERE organization_id=$1 AND id=$2", org, id).Scan(&result.ID, &result.BranchID, &result.Code, &result.Name, &result.Seats, &result.Status, &result.Revision, &result.CreatedAt, &result.UpdatedAt)
	if err != nil {
		return Table{}, dbError(err)
	}
	result.QRToken = qrToken
	if err = saveCommand(ctx, tx, org, commandID, result); err != nil {
		return Table{}, err
	}
	return result, finish(ctx, tx, org, user, "restaurant.table.saved", id)
}

func (service *Service) Queue(ctx context.Context, user, org, branch string) ([]QueueItem, error) {
	if !uuidPattern.MatchString(branch) {
		return nil, ErrInput
	}
	tx, actor, err := service.begin(ctx, user, org, "online_orders.read")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if err = activeBranch(ctx, tx, actor, org, branch); err != nil {
		return nil, err
	}
	var now time.Time
	if err = tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&now); err != nil {
		return nil, dbError(err)
	}
	settings, err := readSettingsAt(ctx, tx, org, branch, now)
	if err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, queueQuery, org, branch, settings.Period.Start, settings.Period.End, now)
	if err != nil {
		return nil, dbError(err)
	}
	defer rows.Close()
	result := []QueueItem{}
	for rows.Next() {
		var item QueueItem
		var number *int64
		var legacy string
		if err = rows.Scan(&item.OrderID, &number, &legacy, &item.Channel, &item.Status, &item.CustomerName, &item.TableCode, &item.CreatedAt); err != nil {
			return nil, err
		}
		item.QueueNumber = queueNumber(number, legacy)
		result = append(result, item)
	}
	return result, rows.Err()
}
