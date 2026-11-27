import json
from asyncio import sleep

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(autouse=True)
def block_unmocked_router(monkeypatch):
    def unexpected_request(_request):
        pytest.fail("Assistant test attempted a router request without a fixture")

    monkeypatch.setattr("app.assistant.router_transport", httpx.MockTransport(unexpected_request))


def test_assistant_routes_model_and_bounds_result(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "9router")
    monkeypatch.setenv("LLM_MODEL", "LLM")
    monkeypatch.setenv("LLM_BASE_URL", "http://localhost:20128/v1")
    monkeypatch.setenv("AI_STORE_ASSISTANT_TOKEN", "a" * 40)
    calls = []

    async def router(request):
        assert str(request.url) == "http://localhost:20128/v1/chat/completions"
        body = json.loads(request.content)
        calls.append(body)
        assert body["model"] == "LLM"
        assert json.loads(body["messages"][1]["content"])[-1] == "Anything cheaper?"
        content = '{"intent":"menu","max_price":"150","sort":"price_asc"}'
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})

    with TestClient(app) as client:
        payload = {"questions": ["Anything under 150?", "Anything cheaper?"]}
        denied = client.post("/internal/store-assistant/plan", json=payload)
        assert denied.status_code == 401
        with monkeypatch.context() as patch:
            patch.setattr("app.assistant.router_transport", httpx.MockTransport(router))
            answer = client.post(
                "/internal/store-assistant/plan",
                json=payload,
                headers={"Authorization": "Bearer " + "a" * 40},
            )
    assert answer.status_code == 200
    assert answer.json()["max_price"] == "150"
    assert len(calls) == 1


def test_router_body_cannot_hold_capacity_past_deadline(monkeypatch):
    class SlowBody(httpx.AsyncByteStream):
        closed = False

        async def __aiter__(self):
            for _ in range(100):
                await sleep(0.005)
                yield b" "

        async def aclose(self):
            self.closed = True

    monkeypatch.setenv("LLM_PROVIDER", "9router")
    monkeypatch.setenv("LLM_MODEL", "LLM")
    monkeypatch.setenv("LLM_BASE_URL", "http://localhost:20128/v1")
    monkeypatch.setenv("AI_STORE_ASSISTANT_TOKEN", "a" * 40)
    monkeypatch.setattr("app.assistant.router_deadline_seconds", 0.05)
    slow = SlowBody()
    remaining = iter(
        [
            httpx.Response(200, stream=slow),
            httpx.Response(
                200,
                json={
                    "choices": [{"message": {"content": '{"intent":"clarify"}'}}],
                },
            ),
        ]
    )
    monkeypatch.setattr(
        "app.assistant.router_transport", httpx.MockTransport(lambda _: next(remaining))
    )
    headers = {"Authorization": "Bearer " + "a" * 40}
    with TestClient(app) as client:
        args = {"json": {"questions": ["What can I order?"]}, "headers": headers}
        assert client.post("/internal/store-assistant/plan", **args).status_code == 503
        assert slow.closed
        assert client.post("/internal/store-assistant/plan", **args).status_code == 200
