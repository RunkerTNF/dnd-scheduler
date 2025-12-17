from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import groups, join, users


settings = get_settings()

app = FastAPI(title="DnD Scheduler API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(groups.router)
app.include_router(join.router)
app.include_router(users.router)


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
