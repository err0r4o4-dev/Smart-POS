package organization

var LoyaltyPermissions = []string{"loyalty.read", "loyalty.manage", "loyalty.enroll", "loyalty.redeem", "loyalty.adjust"}

func init() { PermissionNames = append(PermissionNames, LoyaltyPermissions...) }
