import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./app.db")
    frontend_origins: list[str] = [
        origin.strip() for origin in os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").split(",") if origin.strip()
    ]
    anthropic_api_key: str | None = os.getenv("ANTHROPIC_API_KEY")

    # Which backend runs the agents: "anthropic" (hosted) or "ollama" (local).
    llm_provider: str = os.getenv("LLM_PROVIDER", "anthropic").strip().lower()

    # Ollama. `ollama_model` replaces AgentDefinition.model for every run,
    # since definitions are seeded with Claude model ids. It must be a
    # tool-capable model -- check `ollama show <model>` for "tools".
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
    ollama_timeout_seconds: float = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "300"))

    # Cap on tool round-trips in one run, so a model that loops on the
    # same call fails loudly instead of running forever.
    agent_max_tool_rounds: int = int(os.getenv("AGENT_MAX_TOOL_ROUNDS", "12"))


settings = Settings()
