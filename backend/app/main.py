from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import instagram, posts
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(title="Analytics Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_base_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(instagram.router)
app.include_router(posts.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
