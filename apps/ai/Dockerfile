FROM python:3.13-slim AS base
COPY --from=ghcr.io/astral-sh/uv:0.10.0 /uv /uvx /bin/
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY app ./app
COPY logging.json ./logging.json

FROM base AS check
RUN uv sync --frozen
COPY tests ./tests
CMD ["sh", "-c", "uv run --frozen ruff check . && uv run --frozen ruff format --check . && uv run --frozen pytest && uv run --frozen python -c 'from app.main import app; assert app.title'"]

FROM base AS runtime
RUN useradd --create-home --uid 10001 app
USER app
EXPOSE 8001
CMD ["/app/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--log-config", "/app/logging.json", "--no-access-log"]
