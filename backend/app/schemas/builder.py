from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.db.models import ElementType


def _validate_slug(v: str | None) -> str | None:
    # An empty slug produces a "/p/" live-page link that matches no
    # frontend route and silently bounces visitors to the dashboard --
    # reject it here too, not just in the editor UI, since this is the
    # one place that can't be bypassed.
    if v is not None and not v.strip():
        raise ValueError("slug can't be empty")
    return v


class UploadOut(BaseModel):
    url: str


class PageElementIn(BaseModel):
    element_type: ElementType
    position: int = 0
    # Shape depends on element_type -- see frontend/src/types.ts for what
    # each one expects (button: label/url/pdf_url/colors; card_link:
    # title/description/url/image_url; carousel: heading/product_ids;
    # social_links: {} (reads the page's own social_links); text:
    # heading/body; line: style/color; photo: image_url/link_url).
    config: dict = {}


class PageElementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    page_id: str
    element_type: ElementType
    position: int
    config: dict
    created_at: datetime
    updated_at: datetime


class ReorderElementsIn(BaseModel):
    # Full ordered list of this page's element ids -- simplest reorder
    # contract (rewrite every position in one call) given a builder drag
    # reorders the whole list at once anyway.
    element_ids: list[str]


class CreatorPageIn(BaseModel):
    slug: str
    title: str
    handle: str | None = None
    avatar_url: str | None = None
    is_published: bool = False
    theme: dict = {}
    social_links: dict = {}
    amazon_associate_tag: str | None = None
    og_title: str | None = None
    og_description: str | None = None
    og_image_url: str | None = None

    _validate_slug = field_validator("slug")(_validate_slug)


class CreatorPageUpdateIn(BaseModel):
    # All optional -- PATCH-style partial update.
    slug: str | None = None
    title: str | None = None
    handle: str | None = None
    avatar_url: str | None = None
    is_published: bool | None = None
    theme: dict | None = None
    social_links: dict | None = None
    amazon_associate_tag: str | None = None
    og_title: str | None = None
    og_description: str | None = None
    og_image_url: str | None = None

    _validate_slug = field_validator("slug")(_validate_slug)


class CreatorPageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    title: str
    handle: str | None = None
    avatar_url: str | None = None
    is_published: bool
    theme: dict
    social_links: dict
    amazon_associate_tag: str | None = None
    og_title: str | None = None
    og_description: str | None = None
    og_image_url: str | None = None
    created_at: datetime
    updated_at: datetime


class CreatorPageDetailOut(CreatorPageOut):
    elements: list[PageElementOut] = []


class ProductIn(BaseModel):
    source_url: str
    name: str
    description: str | None = None
    og_image_url: str | None = None
    custom_image_url: str | None = None
    image_url: str | None = None


class ProductUpdateIn(BaseModel):
    source_url: str | None = None
    name: str | None = None
    description: str | None = None
    og_image_url: str | None = None
    custom_image_url: str | None = None
    image_url: str | None = None


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_url: str
    name: str
    description: str | None = None
    og_image_url: str | None = None
    custom_image_url: str | None = None
    image_url: str | None = None
    # Auto-detected, not creator-set -- see app/integrations/amazon.py.
    amazon_asin: str | None = None
    created_at: datetime
    updated_at: datetime


class LinkPreviewOut(BaseModel):
    # ok=False means the fetch/parse failed (blocked, timed out, no OG
    # tags found, etc) -- the frontend falls back to plain manual entry
    # rather than treating this as a hard error.
    ok: bool
    name: str | None = None
    description: str | None = None
    image_url: str | None = None
    error: str | None = None


# -- Public (unauthenticated, serves the actual visitor-facing page) --


class PublicPageOut(BaseModel):
    slug: str
    title: str
    handle: str | None = None
    avatar_url: str | None = None
    theme: dict
    social_links: dict
    amazon_associate_tag: str | None = None
    og_title: str | None = None
    og_description: str | None = None
    og_image_url: str | None = None
    elements: list[PageElementOut]


class LogClickIn(BaseModel):
    link_url: str
    element_id: str | None = None
    product_id: str | None = None


# -- Analytics (private dashboard reads of the public page's traffic) --


class TopLinkClickOut(BaseModel):
    link_url: str
    clicks: int


class PageVisitPointOut(BaseModel):
    date: str
    visits: int


class TopProductOut(BaseModel):
    product: ProductOut
    clicks: int
