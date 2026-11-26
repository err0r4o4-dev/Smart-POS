package storefront

import (
	"context"
	"testing"
)

type fakeAssistant func(context.Context, []string) (AssistantPlan, error)

func (f fakeAssistant) Plan(ctx context.Context, questions []string) (AssistantPlan, error) {
	return f(ctx, questions)
}

func TestAssistantDoesNotForwardPrivateQuestions(t *testing.T) {
	for _, private := range []string{"https://example.test/track?token=abc", "name@example.test", "081-234-5678", "track my order", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"} {
		assistant := fakeAssistant(func(context.Context, []string) (AssistantPlan, error) {
			t.Fatal("private conversation reached the model")
			return AssistantPlan{}, nil
		})
		_, err := answerAssistant(context.Background(), assistant, nil, "bistro", []string{private, "Anything cheaper?"}, "")
		if err != ErrInput {
			t.Errorf("expected rejected conversation, got %v", err)
		}
	}
}

func TestAssistantUsesPlanOnlyToReadSelectedStore(t *testing.T) {
	assistant := fakeAssistant(func(_ context.Context, questions []string) (AssistantPlan, error) {
		if len(questions) != 2 || questions[1] != "Anything cheaper?" {
			t.Fatalf("missing follow-up context: %v", questions)
		}
		return AssistantPlan{Intent: "menu", MaxPrice: "150.00", Sort: "price_asc"}, nil
	})
	browse := func(_ context.Context, slug string, query CatalogQuery) (CatalogPage, error) {
		if slug != "bistro" || query.Availability != "available" || query.MaxPrice != "150.00" || query.Sort != "price_asc" {
			t.Fatalf("wrong shop or filters: %s %+v", slug, query)
		}
		return CatalogPage{Page: Page[CatalogProduct]{Items: []CatalogProduct{
			{Product: Product{Saleable: true, ProductName: "Soup", UnitPrice: "79.00"}},
			{Product: Product{Saleable: true, IsSoldOut: true, ProductName: "Sold out"}},
		}}}, nil
	}
	answer, err := answerAssistant(context.Background(), assistant, browse, "bistro", []string{"Under 150", "Anything cheaper?"}, "")
	if err != nil || answer.Intent != "menu" || len(answer.Items) != 1 || answer.Items[0].UnitPrice != "79.00" {
		t.Fatalf("wrong answer: %+v %v", answer, err)
	}
}

func TestAssistantRejectsInvalidModelFilters(t *testing.T) {
	assistant := fakeAssistant(func(context.Context, []string) (AssistantPlan, error) {
		return AssistantPlan{Intent: "menu", MaxPrice: "1e9"}, nil
	})
	if _, err := answerAssistant(context.Background(), assistant, nil, "bistro", []string{"Any soup?"}, ""); err == nil {
		t.Fatal("invalid model price was accepted")
	}
}

func TestAssistantCheaperUsesStrictlyLowerPrice(t *testing.T) {
	plan := AssistantPlan{Intent: "menu", MaxPrice: "150", Sort: "cheaper"}
	query, err := assistantCatalogQuery(plan, "79.00")
	if err != nil || query.MaxPrice != "78.99" || query.Sort != "price_asc" {
		t.Fatalf("expected available meals strictly below the previous price: %+v %v", query, err)
	}
}
