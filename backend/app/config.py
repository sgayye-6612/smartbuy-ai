"""App settings, read from environment variables (or the .env file)."""
import os

from dotenv import load_dotenv

load_dotenv()

# Falls back to a local SQLite file so the app runs even before PostgreSQL is set up.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./smartbuy.db")
# Always use the modern psycopg (v3) driver for PostgreSQL
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)

SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-secret-key-change-me-in-production-please")
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "1440"))

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")]

# Optional: if set, the shopping assistant uses Claude to understand requests.
# Without it, a built-in rule-based parser is used, so the app works offline.
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "claude-haiku-5-5")

# Set to "false" to skip loading sample data on startup.
SEED_SAMPLE_DATA = os.getenv("SEED_SAMPLE_DATA", "true").lower() == "true"
