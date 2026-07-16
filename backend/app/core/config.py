from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "BulkDesk API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@43.142.121.125:15432/postgres"
    REDIS_URL: str = "redis://43.142.121.125:16379/0"
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7

    # MinIO Settings
    MINIO_ENDPOINT: str = "43.142.121.125:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "product-management"
    MINIO_SECURE: bool = False

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
