from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
