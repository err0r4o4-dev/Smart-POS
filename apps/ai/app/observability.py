import json
import logging
from datetime import UTC, datetime


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {}
        for field in ("method", "status", "path", "request_id"):
            if hasattr(record, field):
                entry[field] = getattr(record, field)
        entry.update(level=record.levelname, service="ai")
        if hasattr(record, "event"):
            entry["event"] = record.event
        entry["msg"] = record.getMessage()
        if hasattr(record, "latency_ms"):
            entry["latency_ms"] = record.latency_ms
        entry["time"] = (
            datetime.fromtimestamp(record.created, UTC)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z")
        )
        return json.dumps(entry, ensure_ascii=False, separators=(",", ":"))


logger = logging.getLogger("smartpos.ai")
