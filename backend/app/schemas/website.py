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
    # Per-form breakdown of that day's submissions (e.g. {"Project Inquiry": 2,
    # "Brand Vibe Workbook": 1}) -- Wix's forms-actions model returns every
    # form on the site together, so which form(s) count as "applications" is
    # a client-side toggle rather than a fixed server-side filter.
    submissions_by_form: dict[str, int] = {}


class TopPageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    page_path: str | None
    sessions: int
    views: int


class TrafficSourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    referrer_category: str | None
    referrer_source: str | None
    utm_campaign_id: str | None
    sessions: int
    views: int
    visitors: int


class FormSubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    wix_form_id: str | None
    submitted_at: datetime
    form_name: str | None
    contact_name: str | None
    contact_email: str | None
    status: str | None
    # Raw question-answer map keyed by Wix's field target (e.g.
    # "how_d_you_hear_of_us") -- pair with GET /api/website/form-schema
    # for human-readable question labels.
    fields: dict = {}


class FormSchemaFieldOut(BaseModel):
    target: str
    label: str
    field_type: str
    options: list[dict] = []


class FormSchemaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    form_id: str
    form_name: str | None
    fields: list[FormSchemaFieldOut] = []
