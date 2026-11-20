from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.db.models import CreatorPage, PageElement, Product
from app.db.session import get_db
from app.integrations import link_preview
from app.integrations.storage import client as storage
from app.schemas.builder import (
    CreatorPageDetailOut,
    CreatorPageIn,
    CreatorPageOut,
    CreatorPageUpdateIn,
    LinkPreviewOut,
    PageElementIn,
    PageElementOut,
    ProductIn,
    ProductOut,
    ProductUpdateIn,
    ReorderElementsIn,
    UploadOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/builder", tags=["builder"])


def _resolve_product_image(custom_image_url: str | None, og_image_url: str | None) -> str | None:
    """A creator-picked/uploaded image always wins over whatever the OG
    fetch happened to find -- see Product.image_url in models.py."""
    return custom_image_url or og_image_url

# Generous enough for a phone photo straight off camera, small enough that
# one bad upload can't eat the whole request.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024


@router.post("/uploads", response_model=UploadOut)
async def upload_image(file: UploadFile = File(...)) -> UploadOut:
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported")
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Image is too large (10MB max)")
    try:
        url = storage.upload(data, file.filename or "upload", file.content_type)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return UploadOut(url=url)


@router.get("/products/preview", response_model=LinkPreviewOut)
def preview_link(url: str = Query(...)) -> LinkPreviewOut:
    """Best-effort link unfurl for the "paste a product link" flow --
    always returns 200 (ok=False on failure) so the frontend treats a
    failed fetch as "fall back to manual entry," not an error to surface."""
    result = link_preview.fetch_preview(url)
    if result is None:
        return LinkPreviewOut(ok=False, error="Couldn't fetch a preview for this link -- enter the details by hand.")
    return LinkPreviewOut(ok=True, name=result.name, description=result.description, image_url=result.image_url)


# -- Pages --


@router.get("/pages", response_model=list[CreatorPageOut])
def list_pages(db: Session = Depends(get_db)) -> list[CreatorPage]:
    return db.query(CreatorPage).order_by(CreatorPage.created_at).all()


@router.post("/pages", response_model=CreatorPageOut)
def create_page(payload: CreatorPageIn, db: Session = Depends(get_db)) -> CreatorPage:
    page = CreatorPage(**payload.model_dump())
    db.add(page)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=f"A page with slug '{payload.slug}' already exists") from exc
    db.refresh(page)
    return page


def _get_page_or_404(page_id: str, db: Session) -> CreatorPage:
    page = (
        db.query(CreatorPage)
        .options(selectinload(CreatorPage.elements))
        .filter(CreatorPage.id == page_id)
        .one_or_none()
    )
    if page is None:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@router.get("/pages/{page_id}", response_model=CreatorPageDetailOut)
def get_page(page_id: str, db: Session = Depends(get_db)) -> CreatorPage:
    return _get_page_or_404(page_id, db)


@router.patch("/pages/{page_id}", response_model=CreatorPageOut)
def update_page(page_id: str, payload: CreatorPageUpdateIn, db: Session = Depends(get_db)) -> CreatorPage:
    page = _get_page_or_404(page_id, db)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(page, key, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=f"A page with slug '{payload.slug}' already exists") from exc
    db.refresh(page)
    return page


@router.delete("/pages/{page_id}", status_code=204, response_model=None)
def delete_page(page_id: str, db: Session = Depends(get_db)) -> None:
    page = _get_page_or_404(page_id, db)
    db.delete(page)
    db.commit()


# -- Page elements --


@router.post("/pages/{page_id}/elements", response_model=PageElementOut)
def create_element(page_id: str, payload: PageElementIn, db: Session = Depends(get_db)) -> PageElement:
    page = _get_page_or_404(page_id, db)
    # Default to appending at the end rather than trusting a possibly-stale
    # position from the client -- the frontend reorders explicitly via
    # PUT .../elements/reorder afterward if it needs a specific spot.
    next_position = (max((e.position for e in page.elements), default=-1)) + 1
    element = PageElement(
        page_id=page_id,
        element_type=payload.element_type,
        position=next_position,
        config=payload.config,
    )
    db.add(element)
    db.commit()
    db.refresh(element)
    return element


def _get_element_or_404(page_id: str, element_id: str, db: Session) -> PageElement:
    element = (
        db.query(PageElement)
        .filter(PageElement.id == element_id, PageElement.page_id == page_id)
        .one_or_none()
    )
    if element is None:
        raise HTTPException(status_code=404, detail="Element not found")
    return element


@router.patch("/pages/{page_id}/elements/{element_id}", response_model=PageElementOut)
def update_element(page_id: str, element_id: str, payload: PageElementIn, db: Session = Depends(get_db)) -> PageElement:
    element = _get_element_or_404(page_id, element_id, db)
    element.element_type = payload.element_type
    element.config = payload.config
    db.commit()
    db.refresh(element)
    return element


@router.delete("/pages/{page_id}/elements/{element_id}", status_code=204, response_model=None)
def delete_element(page_id: str, element_id: str, db: Session = Depends(get_db)) -> None:
    element = _get_element_or_404(page_id, element_id, db)
    db.delete(element)
    db.commit()


@router.put("/pages/{page_id}/elements/reorder", response_model=list[PageElementOut])
def reorder_elements(page_id: str, payload: ReorderElementsIn, db: Session = Depends(get_db)) -> list[PageElement]:
    page = _get_page_or_404(page_id, db)
    elements_by_id = {e.id: e for e in page.elements}
    if set(payload.element_ids) != set(elements_by_id.keys()):
        raise HTTPException(status_code=400, detail="element_ids must list exactly this page's current elements")
    for position, element_id in enumerate(payload.element_ids):
        elements_by_id[element_id].position = position
    db.commit()
    return db.query(PageElement).filter(PageElement.page_id == page_id).order_by(PageElement.position).all()


# -- Products --


@router.get("/products", response_model=list[ProductOut])
def list_products(db: Session = Depends(get_db)) -> list[Product]:
    return db.query(Product).order_by(Product.created_at.desc()).all()


@router.post("/products", response_model=ProductOut)
def create_product(payload: ProductIn, db: Session = Depends(get_db)) -> Product:
    data = payload.model_dump()
    data["image_url"] = _resolve_product_image(data.get("custom_image_url"), data.get("og_image_url"))
    product = Product(**data)
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def _get_product_or_404(product_id: str, db: Session) -> Product:
    product = db.query(Product).filter(Product.id == product_id).one_or_none()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.get("/products/{product_id}", response_model=ProductOut)
def get_product(product_id: str, db: Session = Depends(get_db)) -> Product:
    return _get_product_or_404(product_id, db)


@router.patch("/products/{product_id}", response_model=ProductOut)
def update_product(product_id: str, payload: ProductUpdateIn, db: Session = Depends(get_db)) -> Product:
    product = _get_product_or_404(product_id, db)
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(product, key, value)
    if "custom_image_url" in updates or "og_image_url" in updates:
        product.image_url = _resolve_product_image(product.custom_image_url, product.og_image_url)
    db.commit()
    db.refresh(product)
    return product


@router.delete("/products/{product_id}", status_code=204, response_model=None)
def delete_product(product_id: str, db: Session = Depends(get_db)) -> None:
    product = _get_product_or_404(product_id, db)
    db.delete(product)
    db.commit()
