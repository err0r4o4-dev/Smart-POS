package storefront

import (
	"context"
	"encoding/json"
	"math/big"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

type CatalogQuery struct {
	Search       string
	CategoryID   string
	MinPrice     string
	MaxPrice     string
	Availability string
	Sort         string
	Page         int
}

func catalogQuery(request *http.Request) (CatalogQuery, error) {
	number, err := page(request)
	if err != nil {
		return CatalogQuery{}, err
	}
	values, err := url.ParseQuery(request.URL.RawQuery)
	if err != nil {
		return CatalogQuery{}, ErrInput
	}
	for _, key := range []string{"search", "page", "category_id", "min_price", "max_price", "availability", "sort"} {
		if len(values[key]) > 1 {
			return CatalogQuery{}, ErrInput
		}
	}
	result := CatalogQuery{Search: strings.TrimSpace(values.Get("search")), CategoryID: strings.ToLower(values.Get("category_id")), MinPrice: values.Get("min_price"), MaxPrice: values.Get("max_price"), Availability: values.Get("availability"), Sort: values.Get("sort"), Page: number}
	return result, result.validate()
}

var catalogMoneyPattern = regexp.MustCompile(`^[0-9]{1,16}(\.[0-9]{1,2})?$`)

func (query *CatalogQuery) validate() error {
	query.Search = strings.TrimSpace(query.Search)
	if !text(query.Search, 100, false) || query.Page < 1 || query.Page > 10000 {
		return ErrInput
	}
	if query.CategoryID != "" && query.CategoryID != "uncategorized" && !uuidPattern.MatchString(query.CategoryID) {
		return ErrInput
	}
	query.CategoryID = strings.ToLower(query.CategoryID)
	for _, price := range []string{query.MinPrice, query.MaxPrice} {
		if price != "" && !catalogMoneyPattern.MatchString(price) {
			return ErrInput
		}
	}
	if query.MinPrice != "" && query.MaxPrice != "" {
		minimum, _ := new(big.Rat).SetString(query.MinPrice)
		maximum, _ := new(big.Rat).SetString(query.MaxPrice)
		if minimum.Cmp(maximum) > 0 {
			return ErrInput
		}
	}
	if query.Availability != "" && query.Availability != "available" && query.Availability != "unavailable" {
		return ErrInput
	}
	if query.Sort == "" {
		query.Sort = "name"
	}
	if query.Sort != "name" && query.Sort != "price_asc" && query.Sort != "price_desc" {
		return ErrInput
	}
	return nil
}

type CatalogProduct struct {
	Product
	CategoryID   string `json:"category_id"`
	CategoryName string `json:"category_name"`
	ImageURL     string `json:"image_url,omitempty"`
}
type CatalogCategory struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Count int    `json:"count"`
}
type CatalogPage struct {
	Page[CatalogProduct]
	Categories []CatalogCategory `json:"categories"`
}

func catalogImageURL(value string) string {
	if value == "" || len(value) > 2000 || strings.ContainsAny(value, "\\ \t\r\n#") || strings.HasPrefix(value, "//") {
		return ""
	}
	parsed, err := url.ParseRequestURI(value)
	if err != nil || parsed.User != nil || parsed.Fragment != "" {
		return ""
	}
	if strings.HasPrefix(value, "/") && parsed.Host == "" && parsed.Scheme == "" {
		return value
	}
	if parsed.Scheme == "https" && parsed.Hostname() != "" {
		return value
	}
	return ""
}

const catalogBrowseSQL = `WITH listed AS (
 SELECT variant.id::text AS variant_id, product.name AS product_name, variant.name AS variant_name, variant.sku,
 unit.name AS unit, unit.unit_type, COALESCE(category.id::text,'uncategorized') AS category_id,
 COALESCE(category.name,'ไม่มีหมวดหมู่') AS category_name, COALESCE(variant.attributes->>'storefront_image_url','') AS image_url,
 effective.price, greatest(0.000,storefront_sellable_quantity($1,$4,variant.id)-storefront_reserved_quantity($1,$4,variant.id)) AS available_quantity,
 (unit.status='ACTIVE' AND variant.currency='THB' AND effective.price>0) AS saleable
 FROM product_variants variant
 JOIN products product ON product.organization_id=variant.organization_id AND product.id=variant.product_id
 JOIN units unit ON unit.organization_id=variant.organization_id AND unit.id=variant.unit_id
 JOIN storefront_products publication ON publication.organization_id=variant.organization_id AND publication.variant_id=variant.id AND publication.published
 LEFT JOIN categories category ON category.organization_id=product.organization_id AND category.id=product.category_id
 LEFT JOIN LATERAL (
  SELECT (entry->>'unit_price')::numeric(18,2) AS price FROM price_lists list CROSS JOIN LATERAL jsonb_array_elements(list.items) entry
  WHERE list.organization_id=variant.organization_id AND (list.branch_id IS NULL OR list.branch_id=$3::uuid)
  AND list.status='ACTIVE' AND (list.starts_at IS NULL OR list.starts_at<=statement_timestamp())
  AND (list.ends_at IS NULL OR list.ends_at>statement_timestamp()) AND entry->>'variant_id'=variant.id::text
  ORDER BY (list.branch_id IS NOT NULL) DESC,list.priority DESC,list.id LIMIT 1
 ) price_list ON true
 CROSS JOIN LATERAL (SELECT COALESCE(price_list.price,variant.selling_price) AS price) effective
 WHERE variant.organization_id=$1 AND product.status='ACTIVE' AND variant.status='ACTIVE'
 AND ($2='' OR product.name ILIKE '%'||$2||'%' OR variant.name ILIKE '%'||$2||'%' OR variant.sku ILIKE '%'||$2||'%')
), matching AS (
 SELECT *, (saleable AND available_quantity>=CASE WHEN unit_type IN ('COUNT','PACKAGING') THEN 1.000 ELSE 0.001 END) AS ready
 FROM listed WHERE price>=COALESCE(nullif($5,'')::numeric,0) AND ($6='' OR price<=nullif($6,'')::numeric)
), filtered AS (
 SELECT * FROM matching WHERE ($7='' OR ($7='available' AND ready) OR ($7='unavailable' AND NOT ready))
), selected AS (
 SELECT * FROM filtered WHERE ($8='' OR category_id=$8)
), page_items AS (
 SELECT row_number() OVER (ORDER BY %s) AS ordinal,variant_id,product_name,variant_name,sku,unit,unit_type,price::text AS unit_price,
 available_quantity::text AS available,saleable,true AS published,category_id,category_name,image_url
 FROM selected ORDER BY %s LIMIT 24 OFFSET $9
), facets AS (
 SELECT category_id AS id,category_name AS name,count(*)::int AS count FROM filtered GROUP BY category_id,category_name
)
SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(to_jsonb(page_items)-'ordinal' ORDER BY ordinal) FROM page_items),'[]'::jsonb),
 'total',(SELECT count(*) FROM selected),'page',$10::int,'page_size',24,
 'categories',COALESCE((SELECT jsonb_agg(to_jsonb(facets) ORDER BY name,id) FROM facets),'[]'::jsonb))`

func catalogOrdering(value string) string {
	switch value {
	case "price_asc":
		return "price ASC,product_name,sku,variant_id"
	case "price_desc":
		return "price DESC,product_name,sku,variant_id"
	default:
		return "product_name,sku,variant_id"
	}
}

func (service *Service) BrowseProducts(ctx context.Context, slug string, query CatalogQuery) (CatalogPage, error) {
	result := CatalogPage{Page: Page[CatalogProduct]{Items: []CatalogProduct{}, Page: query.Page, PageSize: 24}, Categories: []CatalogCategory{}}
	if err := query.validate(); err != nil {
		return result, err
	}
	tx, org, err := service.public(ctx, slug, false)
	if err != nil {
		return result, err
	}
	defer tx.Rollback(ctx)
	shop, err := settings(ctx, tx, org)
	if err != nil {
		return result, err
	}
	if !shop.Published {
		return result, ErrNotFound
	}
	var encoded []byte
	statement := strings.ReplaceAll(catalogBrowseSQL, "%s", catalogOrdering(query.Sort))
	err = tx.QueryRow(ctx, statement, org, query.Search, shop.BranchID, shop.LocationID, query.MinPrice, query.MaxPrice, query.Availability, query.CategoryID, (query.Page-1)*24, query.Page).Scan(&encoded)
	if err != nil {
		return result, dbError(err)
	}
	if err = json.Unmarshal(encoded, &result); err != nil {
		return result, err
	}
	for index := range result.Items {
		result.Items[index].ImageURL = catalogImageURL(result.Items[index].ImageURL)
	}
	return result, nil
}
