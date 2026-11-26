package storefront

func validateFoodCategories(codes []string) error {
	if len(codes) > 8 {
		return ErrInput
	}
	seen := make(map[string]bool, len(codes))
	for _, code := range codes {
		switch code {
		case "made-to-order", "noodles", "isan", "fried", "drinks", "desserts", "healthy", "snacks":
		default:
			return ErrInput
		}
		if seen[code] {
			return ErrInput
		}
		seen[code] = true
	}
	return nil
}
