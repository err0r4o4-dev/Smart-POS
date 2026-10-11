import json
import logging
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.observability import JSONFormatter


@pytest.mark.parametrize(
    "method,path,status,level",
    [
        ("GET", "/health/live", 200, "INFO"),
        ("GET", "/missing", 404, "WARNING"),
        ("POST", "/health/live", 405, "WARNING"),
    ],
)
def test_access_log(caplog, method, path, status, level):
    with caplog.at_level(logging.INFO, logger="smartpos.ai"), TestClient(app) as client:
        response = client.request(
            method,
            path + "?token=private-query",
            headers={"Authorization": "Bearer private-auth", "Cookie": "session=private-cookie"},
        )
    records = [record for record in caplog.records if record.getMessage() == "http_request"]
    assert len(records) == 1
    output = JSONFormatter().format(records[0])
    entry = json.loads(output)
    assert list(entry)[:4] == ["method", "status", "path", "request_id"]
    assert entry["method"] == method
    assert entry["status"] == status == response.status_code
    assert entry["path"] == path
    assert entry["request_id"] == response.headers["X-Request-ID"]
    assert entry["level"] == level
    assert entry["service"] == "ai"
    assert entry["latency_ms"] >= 0
    assert entry["time"].endswith("Z")
    assert "private-" not in output


def test_recovered_error_is_logged(caplog, monkeypatch):
    def fail():
        raise RuntimeError("private-exception")

    monkeypatch.setattr("app.main.get_settings", fail)
    with caplog.at_level(logging.INFO, logger="smartpos.ai"), TestClient(app) as client:
        response = client.get("/health/ready")
    records = [record for record in caplog.records if record.getMessage() == "http_request"]
    assert len(records) == 1
    assert records[0].status == response.status_code == 500
    assert records[0].levelname == "ERROR"
    output = "\n".join(JSONFormatter().format(record) for record in caplog.records)
    assert '"event":"request_panic"' in output
    assert "private-exception" not in output


def test_runtime_formatter_omits_exception_and_private_attributes():
    record = logging.LogRecord(
        "uvicorn.error", logging.ERROR, __file__, 1, "server failed", (), None
    )
    record.password = "private-password"
    record.exc_info = (RuntimeError, RuntimeError("private-exception"), None)
    entry = json.loads(JSONFormatter().format(record))
    assert entry["msg"] == "server failed"
    assert entry["service"] == "ai"
    assert "method" not in entry
    assert "request_id" not in entry
    assert "private-" not in json.dumps(entry)


def test_uvicorn_and_application_logging_config():
    script = """
import json
import logging
import logging.config
with open('logging.json') as config:
    logging.config.dictConfig(json.load(config))
logging.getLogger('uvicorn.error').info('server starting')
logging.getLogger('smartpos.ai').info('http_request', extra={
    'method': 'GET', 'status': 200, 'path': '/health/live',
    'request_id': 'test-id', 'latency_ms': 1,
})
logging.getLogger('uvicorn.access').info('duplicate access log')
"""
    result = subprocess.run(
        [sys.executable, "-c", script], capture_output=True, text=True, check=True
    )
    records = [json.loads(line) for line in result.stdout.splitlines()]
    assert len(records) == 2
    assert records[0]["msg"] == "server starting"
    assert records[0]["service"] == "ai"
    assert list(records[1])[:4] == ["method", "status", "path", "request_id"]
    assert not result.stderr
