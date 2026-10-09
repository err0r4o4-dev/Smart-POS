set -eu
psql -v ON_ERROR_STOP=1 -f /checks/identity.sql
echo 'PASS: isolated identity schema, unique normalized email, token single-use and session revocation'
psql -v ON_ERROR_STOP=1 -f /checks/organization.sql
echo 'PASS: organization membership constraints, last owner protection and scoped runtime RLS'
psql -v ON_ERROR_STOP=1 -f /checks/catalog.sql
echo 'PASS: catalog composite tenant FKs, exact prices, uniqueness, RLS and runtime grants'
