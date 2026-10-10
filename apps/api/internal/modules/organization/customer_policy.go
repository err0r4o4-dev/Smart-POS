package organization

var CustomerPermissions = []string{"customers.read", "customers.manage", "customers.select", "customers.history.read", "customers.groups.read", "customers.groups.manage"}

func init() { PermissionNames = append(PermissionNames, CustomerPermissions...) }
