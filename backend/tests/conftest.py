import os
import sys
from pathlib import Path

# Use a throwaway SQLite database for tests (never touches your real PostgreSQL data)
TEST_DB = Path(__file__).parent / "test_smartbuy.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["GEO_OFFLINE"] = "true"  # tests never call real map services
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session")
def client():
    if TEST_DB.exists():
        TEST_DB.unlink()
    from app.main import app

    with TestClient(app) as c:
        yield c
    from app.database import engine

    engine.dispose()
    TEST_DB.unlink(missing_ok=True)


@pytest.fixture(scope="session")
def auth_headers(client):
    r = client.post("/api/auth/register", json={"email": "test@example.com", "name": "Tester", "password": "secret123"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}
