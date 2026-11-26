import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as instance:
        yield instance


@pytest.mark.parametrize("path,status", [("/health/live", "ok"), ("/health/ready", "ready")])
def test_health(client, path, status):
    response = client.get(path, headers={"X-Request-ID": "untrusted"})
    assert response.status_code == 200
    assert response.json() == {"status": status, "service": "smartpos-ai"}
    assert len(response.headers["X-Request-ID"]) == 32
    assert response.headers["X-Request-ID"] != "untrusted"
    assert response.headers["X-Content-Type-Options"] == "nosniff"


@pytest.mark.parametrize("path", ["/forecast", "/docs", "/openapi.json"])
def test_no_fake_predictions_or_public_docs(client, path):
    response = client.get(path)
    assert response.status_code == 404
    assert response.json()["error"]["request_id"] == response.headers["X-Request-ID"]


def test_wrong_method(client):
    assert client.post("/health/live").status_code == 405


def test_unexpected_error_is_generic(client, monkeypatch):
    def fail():
        raise RuntimeError("sensitive internal value")

    monkeypatch.setattr("app.main.get_settings", fail)
    response = client.get("/health/ready")
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"
    assert "sensitive" not in response.text
    assert response.json()["error"]["request_id"] == response.headers["X-Request-ID"]
