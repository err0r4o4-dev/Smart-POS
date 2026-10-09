set -eu

psql -v ON_ERROR_STOP=1 -f /checks/foundation.sql
wget -qO- http://api:8080/health/live | grep '"status":"ok"'
wget -qO- http://api:8080/health/ready | grep '"status":"ready"'
wget -qO- http://ai:8001/health/ready | grep '"status":"ready"'
wget -qO- http://caddy:8088/api/v1/system | grep '"authentication":"server_sessions"'
wget -qO- http://caddy:8088/dashboard | grep '<div id="root">'
if wget -qO- http://caddy:8088/internal/forecast; then
  echo 'FAIL: internal AI path was exposed'
  exit 1
fi
echo 'PASS: schema, constraints, RLS, service communication and gateway routing'
