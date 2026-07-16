from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class WixStatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    connected: bool
    site_display_name: str | None = None
    connected_at: datetime | None = None


class WixSyncRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: str
    rows_synced: int
    started_at: datetime
    finished_at: datetime | None = None
    error_message: str | None = None
