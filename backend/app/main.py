import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import builder, instagram, posts, public_pages, tiktok, website, wix
from app.core.config import get_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

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
app.include_router(tiktok.router)
app.include_router(posts.router)
app.include_router(wix.router)
app.include_router(website.router)
app.include_router(builder.router)
app.include_router(public_pages.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
