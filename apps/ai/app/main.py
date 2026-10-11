import logging
from time import perf_counter
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.observability import logger


class Health(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    status: Literal["ok", "ready"]
    service: str


class ErrorDetail(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    code: str
    message: str
    request_id: str


class ErrorEnvelope(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    error: ErrorDetail


app = FastAPI(
    title="SmartPOS Internal AI", version="0.0.0", docs_url=None, redoc_url=None, openapi_url=None
)


@app.middleware("http")
async def headers(request: Request, call_next):
    started = perf_counter()
    request.state.request_id = uuid4().hex
    try:
        response = await call_next(request)
    except Exception:
        logger.error(
            "request panic",
            extra={"event": "request_panic", "request_id": request.state.request_id},
        )
        response = error_response(request, 500, "INTERNAL_ERROR", "An unexpected error occurred")
    response.headers["X-Request-ID"] = request.state.request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    level = (
        logging.ERROR
        if response.status_code >= 500
        else (logging.WARNING if response.status_code >= 400 else logging.INFO)
    )
    logger.log(
        level,
        "http_request",
        extra={
            "method": request.method,
            "status": response.status_code,
            "path": request.url.path,
            "request_id": request.state.request_id,
            "latency_ms": int((perf_counter() - started) * 1000),
        },
    )
    return response


def error_response(request: Request, status: int, code: str, message: str) -> JSONResponse:
    body = ErrorEnvelope(
        error=ErrorDetail(code=code, message=message, request_id=request.state.request_id)
    )
    return JSONResponse(status_code=status, content=body.model_dump())


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exception: StarletteHTTPException):
    return error_response(request, exception.status_code, "HTTP_ERROR", "Endpoint unavailable")


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exception: RequestValidationError):
    return error_response(request, 422, "VALIDATION_ERROR", "Request validation failed")


@app.get("/health/live", response_model=Health)
def live() -> Health:
    return Health(status="ok", service=get_settings().service_name)


@app.get("/health/ready", response_model=Health)
def ready() -> Health:
    return Health(status="ready", service=get_settings().service_name)
