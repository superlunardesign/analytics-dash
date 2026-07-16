from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DailyTrafficOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: datetime
    sessions: int
    views: int
    visitors: int
    form_submissions: int


class TopPageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    page_path: str | None
    sessions: int
    views: int


class FormSubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    submitted_at: datetime
    form_name: str | None
    contact_name: str | None
    contact_email: str | None
