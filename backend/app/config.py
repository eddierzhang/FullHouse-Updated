import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./app.db")
    frontend_origins: list[str] = [
        origin.strip() for origin in os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").split(",") if origin.strip()
    ]
    anthropic_api_key: str | None = os.getenv("ANTHROPIC_API_KEY")


settings = Settings()
