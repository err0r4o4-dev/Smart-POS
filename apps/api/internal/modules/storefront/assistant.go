package storefront

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"math/big"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

var errAssistantUnavailable = errors.New("store assistant unavailable")

// The development pilot must not send tracking links, tokens, or common contact details.
var privateAssistantText = regexp.MustCompile(`(?i)https?[:/]|www\.|@|\b(?:bearer|token|password|otp)\b|[A-Za-z0-9_-]{32,}|\p{Nd}(?:[ +().-]*\p{Nd}){7}|\b(?:track(?:ing)?|(?:my|our) order|order (?:status|number)|payment|receipt|refund)\b|\x{e15}\x{e34}\x{e14}\x{e15}\x{e32}\x{e21}|\x{e2d}\x{e2d}\x{e40}\x{e14}\x{e2d}\x{e23}\x{e4c}\x{e02}\x{e2d}\x{e07}|\x{e40}\x{e25}\x{e02}\x{e2d}\x{e2d}\x{e40}\x{e14}\x{e2d}\x{e23}\x{e4c}|\x{e0a}\x{e33}\x{e23}\x{e30}\x{e40}\x{e07}\x{e34}\x{e19}|\x{e23}\x{e2b}\x{e31}\x{e2a}\x{e1c}\x{e48}\x{e32}\x{e19}|\x{e43}\x{e1a}\x{e40}\x{e2a}\x{e23}\x{e47}\x{e08}|\x{e04}\x{e37}\x{e19}\x{e40}\x{e07}\x{e34}\x{e19}`)

type AssistantPlan struct {
	Intent   string `json:"intent"`
	Search   string `json:"search"`
	MaxPrice string `json:"max_price"`
	Sort     string `json:"sort"`
}

type AssistantPlanner interface {
	Plan(context.Context, []string) (AssistantPlan, error)
}

type AssistantClient struct {
	endpoint string
	token    string
	client   *http.Client
}

func NewAssistantClient(baseURL, token string) *AssistantClient {
	return &AssistantClient{endpoint: baseURL + "/internal/store-assistant/plan", token: token, client: &http.Client{
		Timeout:       10 * time.Second,
		Transport:     &http.Transport{MaxIdleConnsPerHost: 2, IdleConnTimeout: 30 * time.Second},
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}}
}

func (client *AssistantClient) Plan(ctx context.Context, questions []string) (AssistantPlan, error) {
	var plan AssistantPlan
	body, err := json.Marshal(map[string][]string{"questions": questions})
	if err != nil {
		return plan, errAssistantUnavailable
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, client.endpoint, bytes.NewReader(body))
	if err != nil {
		return plan, errAssistantUnavailable
	}
	req.Header.Set("Authorization", "Bearer "+client.token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.client.Do(req)
	if err != nil {
		return plan, errAssistantUnavailable
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return plan, errAssistantUnavailable
	}
	const limit = 2048
	data, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil || len(data) > limit {
		return plan, errAssistantUnavailable
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&plan) != nil || decoder.Decode(&struct{}{}) != io.EOF {
		return AssistantPlan{}, errAssistantUnavailable
	}
	return plan, nil
}

type assistantMenuItem struct {
	ProductName string `json:"product_name"`
	VariantName string `json:"variant_name"`
	UnitPrice   string `json:"unit_price"`
}

type assistantAnswer struct {
	Intent string              `json:"intent"`
	Items  []assistantMenuItem `json:"items"`
}

func answerAssistant(ctx context.Context, planner AssistantPlanner, browse func(context.Context, string, CatalogQuery) (CatalogPage, error), slug string, questions []string, previousPrice string) (assistantAnswer, error) {
	if len(questions) < 1 || len(questions) > 4 || (previousPrice != "" && !catalogMoneyPattern.MatchString(previousPrice)) {
		return assistantAnswer{}, ErrInput
	}
	clean := make([]string, len(questions))
	for i, question := range questions {
		question = strings.TrimSpace(question)
		if question == "" || !utf8.ValidString(question) || utf8.RuneCountInString(question) > 240 || privateAssistantText.MatchString(question) {
			return assistantAnswer{}, ErrInput
		}
		clean[i] = question
	}
	plan, err := planner.Plan(ctx, clean)
	if err != nil {
		return assistantAnswer{}, errAssistantUnavailable
	}
	result := assistantAnswer{Intent: plan.Intent, Items: []assistantMenuItem{}}
	if plan.Intent == "clarify" {
		return result, nil
	}
	query, err := assistantCatalogQuery(plan, previousPrice)
	if err != nil {
		return assistantAnswer{}, err
	}
	catalog, err := browse(ctx, slug, query)
	if err != nil {
		return assistantAnswer{}, err
	}
	for _, item := range catalog.Items {
		if item.Saleable && !item.IsSoldOut {
			result.Items = append(result.Items, assistantMenuItem{item.ProductName, item.VariantName, item.UnitPrice})
			if len(result.Items) == 4 {
				break
			}
		}
	}
	return result, nil
}

func assistantCatalogQuery(plan AssistantPlan, previousPrice string) (CatalogQuery, error) {
	query := CatalogQuery{Page: 1, Availability: "available", Search: plan.Search, MaxPrice: plan.MaxPrice, Sort: plan.Sort}
	if query.Sort == "cheaper" {
		query.Sort = "price_asc"
	}
	if plan.Intent != "menu" || strings.ContainsAny(plan.Search, "%_\\") || query.validate() != nil {
		return CatalogQuery{}, errAssistantUnavailable
	}
	if plan.Sort == "cheaper" && catalogMoneyPattern.MatchString(previousPrice) {
		previous, _ := new(big.Rat).SetString(previousPrice)
		lower := previous.Sub(previous, big.NewRat(1, 100))
		if lower.Sign() < 0 {
			lower.SetInt64(0)
		}
		cap, hasCap := new(big.Rat).SetString(query.MaxPrice)
		if !hasCap || lower.Cmp(cap) < 0 {
			query.MaxPrice = lower.FloatString(2)
		}
	}
	return query, nil
}
