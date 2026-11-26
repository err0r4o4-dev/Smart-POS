package storefront_test

func stockAvailability(value *string) string {
	if value == nil {
		return "<untracked>"
	}
	return *value
}
