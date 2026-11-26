from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AI_", extra="ignore")
    service_name: str = Field(default="smartpos-ai", min_length=1, max_length=80)


@lru_cache
def get_settings() -> Settings:
    return Settings()
