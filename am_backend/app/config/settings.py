from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Application configuration
    APP_NAME: str = "Area Manager API"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    # Database configuration (injected via .env or system environment variables)
    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_USER: str = "root"
    DB_PASSWORD: str = ""
    DB_NAME: str = "qr_digital_attendance"

    # CORS settings
    ALLOWED_ORIGINS: str = "http://localhost:8084,http://127.0.0.1:8084,http://localhost:8080,http://localhost:5173,http://localhost:3000,http://127.0.0.1:8080"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    @property
    def database_url(self) -> str:
        return f"mysql+pymysql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    @property
    def cors_origins(self) -> list[str]:
        if not self.ALLOWED_ORIGINS:
            return []
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

# Global settings instance
settings = Settings()

