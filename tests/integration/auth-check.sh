set -eu
psql -v ON_ERROR_STOP=1 -f /checks/identity.sql
echo 'PASS: isolated identity schema, unique normalized email, token single-use and session revocation'
