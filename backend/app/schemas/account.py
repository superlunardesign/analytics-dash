from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AccountStatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    connected: bool
    username: str | None = None
    display_name: str | None = None
    connected_at: datetime | None = None
    token_expires_at: datetime | None = None


class SyncRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: str
    posts_synced: int
    started_at: datetime
    finished_at: datetime | None = None
    error_message: str | None = None
