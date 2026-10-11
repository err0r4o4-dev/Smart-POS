package organization

var StorefrontPermissions = []string{"storefront.manage", "online_orders.read", "online_orders.manage"}

func init() {
	PermissionNames = append(PermissionNames, StorefrontPermissions...)
}
