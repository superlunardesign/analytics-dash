"""Client for Supabase Storage (creator page builder image uploads --
product photos, page photo blocks).

Uses Supabase's Storage REST API directly over httpx rather than the
official supabase-py SDK -- the SDK pulls in a realtime/postgrest client
this integration has no use for; an upload is a single authenticated
POST under the hood either way.

If supabase_url/supabase_service_role_key aren't set, upload() raises
RuntimeError -- this integration is entirely optional, same as every
other integration in this codebase.
"""

from __future__ import annotations

import uuid

import httpx

from app.core.config import get_settings


class StorageUploadError(RuntimeError):
    pass


def _object_path(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    return f"{uuid.uuid4()}.{ext}"


def upload(file_bytes: bytes, filename: str, content_type: str) -> str:
    """Uploads a file to the configured Supabase Storage bucket -- which
    must already exist and be set Public in the Supabase dashboard (see
    README.md) so the returned URL is directly viewable -- and returns
    that public URL."""
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError(
            "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set -- the image upload "
            "integration is optional and disabled until they're configured."
        )
    object_path = _object_path(filename)
    base = settings.supabase_url.rstrip("/")
    resp = httpx.post(
        f"{base}/storage/v1/object/{settings.supabase_storage_bucket}/{object_path}",
        content=file_bytes,
        headers={
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "apikey": settings.supabase_service_role_key,
            "Content-Type": content_type,
        },
        timeout=30,
    )
    if resp.status_code >= 400:
        raise StorageUploadError(f"Supabase Storage upload failed (status {resp.status_code}): {resp.text[:2000]}")
    return f"{base}/storage/v1/object/public/{settings.supabase_storage_bucket}/{object_path}"
