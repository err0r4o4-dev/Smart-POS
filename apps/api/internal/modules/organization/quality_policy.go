package organization

var QualityPermissions = []string{"quality.read", "quality.batch.create", "quality.batch.manage", "quality.recall.manage", "quality.write_off.create", "quality.write_off.approve", "quality.write_off.post"}

func init() { PermissionNames = append(PermissionNames, QualityPermissions...) }
