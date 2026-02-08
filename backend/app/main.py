from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.routers import auth, groups, join, users, availability, events


settings = get_settings()

app = FastAPI(title="DnD Scheduler API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(groups.router)
app.include_router(join.router)
app.include_router(users.router)
app.include_router(availability.router)
app.include_router(events.router)

uploads_dir = Path(__file__).resolve().parents[1] / "uploads"
uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
