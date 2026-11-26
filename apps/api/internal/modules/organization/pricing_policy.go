package organization

var PricingPermissions = []string{"pricing.read", "pricing.manage", "pricing.approve", "promotions.read", "promotions.manage", "discount.request", "discount.read", "discount.approve"}

func init() { PermissionNames = append(PermissionNames, PricingPermissions...) }
