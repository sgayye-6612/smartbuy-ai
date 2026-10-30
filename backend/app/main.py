"""SmartBuy AI API entry point.  Run:  python -m uvicorn app.main:app --reload"""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from .config import CORS_ORIGINS, DATABASE_URL, SEED_SAMPLE_DATA
from .database import Base, SessionLocal, engine, get_db
from .models import AppMeta
from .routers import addresses, assistant, auth, basket, dashboard, discover, platforms, products, rides, wishlist
from .seed import seed_if_empty

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("smartbuy")


SCHEMA_VERSION = "4"  # bump when tables or sample data change


def ensure_schema() -> None:
    """Create tables. If they were made by an older version of the app, rebuild them.
    (A real production app would use Alembic migrations instead.)"""
    tables = inspect(engine).get_table_names()
    current = None
    if "app_meta" in tables:
        with SessionLocal() as db:
            row = db.get(AppMeta, "schema_version")
            current = row.value if row else None
    if tables and current != SCHEMA_VERSION:
        log.warning("Database was created by an older version. Rebuilding tables and reloading sample data "
                    "(old accounts are cleared).")
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        db.merge(AppMeta(key="schema_version", value=SCHEMA_VERSION))
        db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_schema()
    if SEED_SAMPLE_DATA:
        with SessionLocal() as db:
            if seed_if_empty(db):
                log.info("Loaded sample data")
    log.info("Database: %s", DATABASE_URL.split("@")[-1])  # never log the password
    yield


app = FastAPI(
    title="SmartBuy AI API",
    description="Compare groceries, food delivery, rides and shopping (tech, fashion, beauty, home) across platforms. "
                "Uses official integrations where configured, otherwise clearly labelled SAMPLE data.",
    version="4.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    # Also accept the frontend on any local port (Vite moves to 5174, 5175... if 5173 is busy)
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth, addresses, platforms, products, rides, basket, assistant, wishlist, dashboard, discover):
    app.include_router(r.router)


@app.get("/api/health", tags=["System"])
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected", "engine": engine.dialect.name}


# ---------- Production: serve the built React app from the same server ----------
# The Dockerfile copies the frontend build into backend/static. Locally (npm run dev) this folder
# doesn't exist and the frontend runs separately on port 5173.
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

if (STATIC_DIR / "index.html").is_file():
    if (STATIC_DIR / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Not found")
        file = (STATIC_DIR / path).resolve()
        if path and file.is_file() and STATIC_DIR.resolve() in file.parents:
            return FileResponse(file)
        return FileResponse(STATIC_DIR / "index.html")  # React Router handles the page
