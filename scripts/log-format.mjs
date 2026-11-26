const requestFields = ['method', 'status', 'path', 'request_id'];
const contextFields = [
  'address',
  'event',
  'error_code',
  'error_type',
  'exit_code',
  'migration',
  'logger',
  'err_id',
  'pid',
  'size',
];
const healthPaths = new Set(['/health/live', '/health/ready']);

export function sanitizeMessage(value) {
  return String(value)
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(
      /\b(?:STATEMENT|DETAIL|CONTEXT|parameters):[^\n]*/gi,
      '[redacted database detail]',
    )
    .replace(
      /\b(?:SELECT\s|INSERT\s+INTO\s|UPDATE\s+\S+\s+SET\s|DELETE\s+FROM\s)[^\n]*/gi,
      '[redacted SQL]',
    )
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/\?[^\s"'<>]*/g, '?[redacted]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(
      /\b(?:password|passwd|token|secret|authorization|cookie|csrf|database_url|smtp_password|api[_-]?key)\b["']?\s*[:=]\s*[^\n]+/gi,
      '[redacted credential]',
    )
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[redacted token]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[redacted email]');
}

function serviceName(prefix) {
  const name = prefix.replace(/-\d+$/, '');
  return name === 'caddy' ? 'gateway' : name;
}

function timestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value * 1000)) {
    const date = new Date(value * 1000);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  if (typeof value === 'string' && Number.isFinite(Date.parse(value)))
    return new Date(value).toISOString();
  return undefined;
}

function nativeEntry(message, service) {
  if (service === 'mailpit') {
    const fields = {};
    for (const match of message.matchAll(/(\w+)=("(?:\\.|[^"\\])*"|\S+)/g)) {
      if (!['time', 'level', 'msg', 'address'].includes(match[1])) continue;
      try {
        fields[match[1]] = match[2].startsWith('"')
          ? JSON.parse(match[2])
          : match[2];
      } catch {
        fields[match[1]] = match[2];
      }
    }
    if (typeof fields.msg === 'string') return fields;
  }
  const postgres = message.match(
    /^(\d{4}-\d\d-\d\d [\d:.]+) UTC \[(\d+)\] (LOG|INFO|WARNING|ERROR|FATAL|PANIC|DETAIL|STATEMENT|CONTEXT):\s*(.*)$/,
  );
  if (postgres) {
    const entry = {
      time: postgres[1].replace(' ', 'T') + 'Z',
      pid: Number(postgres[2]),
      level: ['ERROR', 'FATAL', 'PANIC'].includes(postgres[3])
        ? 'ERROR'
        : postgres[3] === 'WARNING'
          ? 'WARN'
          : 'INFO',
      msg: ['DETAIL', 'STATEMENT', 'CONTEXT'].includes(postgres[3])
        ? '[redacted database detail]'
        : postgres[4],
    };
    if (/ready to accept connections/i.test(postgres[4]))
      entry.event = 'database_ready';
    return entry;
  }
  const level =
    /\b(error|fatal|panic|failed|failure)\b|^FAIL\b|^not ok\b/i.test(message)
      ? 'ERROR'
      : /\b(warn|warning)\b/i.test(message)
        ? 'WARN'
        : 'INFO';
  const entry = { level, msg: message };
  if (service === 'migrate' && /^no change\s*$/i.test(message))
    entry.event = 'migration_no_change';
  if (service === 'migrate' && /^\d+\/[ud]\s/.test(message))
    entry.event = 'migration_applied';
  if (service === 'postgres' && /ready to accept connections/i.test(message))
    entry.event = 'database_ready';
  return entry;
}

export function normalizeComposeLine(line, { showHealth = false } = {}) {
  const cleaned = line.replace(/\x1b\[[0-9;]*m/g, '').trimEnd();
  if (!cleaned) return null;
  const match = cleaned.match(/^([^|]+?)\s+\|\s?(.*)$/);
  const prefix = match ? match[1].trim() : 'docker';
  const service = serviceName(prefix);
  let message = match ? match[2] : cleaned;
  const dockerTime = message.match(
    /^(\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d))\s+(.*)$/,
  );
  if (dockerTime) message = dockerTime[2];
  let source;
  try {
    source = JSON.parse(message);
  } catch {
    source = nativeEntry(message, service);
  }
  if (!source || typeof source !== 'object' || Array.isArray(source))
    source = nativeEntry(message, service);
  const isRequest =
    typeof source.method === 'string' &&
    Number.isInteger(source.status) &&
    typeof source.path === 'string';
  const path = isRequest ? source.path.split(/[?#]/, 1)[0] : undefined;
  if (
    !showHealth &&
    isRequest &&
    ['GET', 'HEAD'].includes(source.method) &&
    source.status >= 200 &&
    source.status < 300 &&
    healthPaths.has(path)
  )
    return null;
  const entry = {};
  if (isRequest) {
    const fields = {
      method: source.method,
      status: source.status,
      path,
      request_id: source.request_id || source.gateway_request_id || null,
    };
    for (const field of requestFields)
      entry[field] =
        typeof fields[field] === 'string'
          ? sanitizeMessage(fields[field])
          : fields[field];
  } else if (typeof source.request_id === 'string') {
    entry.request_id = sanitizeMessage(source.request_id);
  }
  entry.level = String(source.level || 'INFO')
    .toUpperCase()
    .replace(/^WARNING$/, 'WARN');
  if (isRequest)
    entry.level =
      source.status >= 500
        ? 'ERROR'
        : source.status >= 400
          ? 'WARN'
          : entry.level;
  entry.service = service;
  for (const field of contextFields) {
    if (field === 'event' && isRequest) continue;
    if (['string', 'number', 'boolean'].includes(typeof source[field]))
      entry[field] =
        typeof source[field] === 'string'
          ? sanitizeMessage(source[field])
          : source[field];
  }
  entry.msg = isRequest
    ? 'http_request'
    : sanitizeMessage(source.msg ?? source.message ?? 'runtime event');
  if (isRequest) {
    const latency =
      source.latency_ms ??
      source.duration_ms ??
      (typeof source.duration === 'number'
        ? source.duration * 1000
        : undefined);
    if (typeof latency === 'number' && Number.isFinite(latency))
      entry.latency_ms = Math.max(0, Math.round(latency));
  }
  const time =
    timestamp(source.time ?? source.ts) ?? timestamp(dockerTime?.[1]);
  if (time) entry.time = time;
  return `${prefix.padEnd(12)} | ${JSON.stringify(entry)}`;
}
