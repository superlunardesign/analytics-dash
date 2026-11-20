"""Public, unauthenticated endpoints serving the actual visitor-facing
creator page -- a different trust boundary from app/api/builder.py (the
private dashboard's CRUD API), kept in its own router/file so what's
exposed to the open internet is obvious at a glance rather than mixed in
with authenticated-dashboard-only routes. This app has no auth layer at
all yet (see every other router), so "public" here specifically means
"intended to be hit by any visitor's browser," not "the only unprotected
routes" -- but it's still the one place a malicious/stale client payload
(a bogus element_id/product_id, a click for an unpublished page) is
expected and handled rather than assumed away.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, selectinload

from app.db.models import CreatorPage, ElementType, LinkClick, PageElement, PageVisit, Product
from app.db.session import get_db
from app.schemas.builder import LogClickIn, PageElementOut, PublicPageOut

router = APIRouter(prefix="/api/public", tags=["public"])


def _resolve_carousel_config(config: dict, db: Session) -> dict:
    """A CAROUSEL element's config only stores product_ids -- the
    catalog is shared across pages/carousels, so resolve the actual
    name/description/image for each one at serve time rather than
    duplicating product data into every element's stored config."""
    product_ids = config.get("product_ids") or []
    if not product_ids:
        return config
    products_by_id = {p.id: p for p in db.query(Product).filter(Product.id.in_(product_ids)).all()}
    # Preserves the creator's chosen order; silently drops any id for a
    # product that's since been deleted rather than erroring the whole page.
    ordered = [products_by_id[pid] for pid in product_ids if pid in products_by_id]
    return {
        **config,
        "products": [
            {
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "image_url": p.image_url,
                "source_url": p.source_url,
                "amazon_asin": p.amazon_asin,
            }
            for p in ordered
        ],
    }


@router.get("/pages/{slug}", response_model=PublicPageOut)
def get_public_page(slug: str, request: Request, db: Session = Depends(get_db)) -> PublicPageOut:
    page = (
        db.query(CreatorPage)
        .options(selectinload(CreatorPage.elements))
        .filter(CreatorPage.slug == slug, CreatorPage.is_published.is_(True))
        .one_or_none()
    )
    if page is None:
        raise HTTPException(status_code=404, detail="This page doesn't exist or isn't published")

    db.add(PageVisit(page_id=page.id, referrer=request.headers.get("referer")))
    db.commit()

    elements = [
        PageElementOut(
            id=el.id,
            page_id=el.page_id,
            element_type=el.element_type,
            position=el.position,
            config=_resolve_carousel_config(el.config, db) if el.element_type == ElementType.CAROUSEL else el.config,
            created_at=el.created_at,
            updated_at=el.updated_at,
        )
        for el in sorted(page.elements, key=lambda e: e.position)
    ]

    return PublicPageOut(
        slug=page.slug,
        title=page.title,
        handle=page.handle,
        avatar_url=page.avatar_url,
        theme=page.theme,
        social_links=page.social_links,
        amazon_associate_tag=page.amazon_associate_tag,
        og_title=page.og_title,
        og_description=page.og_description,
        og_image_url=page.og_image_url,
        elements=elements,
    )


@router.post("/pages/{slug}/click", status_code=204, response_model=None)
def log_click(slug: str, payload: LogClickIn, db: Session = Depends(get_db)) -> None:
    page = (
        db.query(CreatorPage)
        .filter(CreatorPage.slug == slug, CreatorPage.is_published.is_(True))
        .one_or_none()
    )
    if page is None:
        raise HTTPException(status_code=404, detail="This page doesn't exist or isn't published")

    # A public, unauthenticated endpoint -- validate referenced ids rather
    # than trusting them, so a stale or malicious element_id/product_id
    # degrades to "just not attributed to that element" instead of an FK
    # violation on insert (enforced on Postgres even though SQLite here
    # doesn't bother).
    element_id = payload.element_id
    if element_id and not db.query(PageElement.id).filter(
        PageElement.id == element_id, PageElement.page_id == page.id
    ).first():
        element_id = None
    product_id = payload.product_id
    if product_id and not db.query(Product.id).filter(Product.id == product_id).first():
        product_id = None

    db.add(
        LinkClick(
            page_id=page.id,
            element_id=element_id,
            product_id=product_id,
            link_url=payload.link_url,
        )
    )
    db.commit()
