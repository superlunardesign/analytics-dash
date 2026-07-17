"""Wrapper around Wix's Semantic Model API (site analytics + forms).

Model IDs below were confirmed live against a real Wix Studio site
(`List Semantic Models` returns the same IDs for every site -- these are
platform-wide model definitions, not per-site). If Wix ever changes
them, re-discover via `GET /semantic-models` and update here.

Reference: https://dev.wix.com/docs/api-reference/business-management/analytics/skills/query-site-analytics
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import httpx

GRAPH_BASE_URL = "https://www.wixapis.com"

TRAFFIC_MODEL_ID = "cad7fd34-2c8b-4dda-8296-3f9d47fb484d"
FORMS_MODEL_ID = "88cf0797-ea27-43e2-9901-3080deca1d66"

# 1,000 rows/query cap -- see WixAPIError docstring on query_model.
MAX_PAGE_SIZE = 1000

# Wix's own edge/gateway occasionally returns a transient 502/503/504 --
# these succeed on retry and shouldn't kill an entire sync run over one
# hiccup (see the matching constants in forms_client.py).
_RETRYABLE_STATUS_CODES = {502, 503, 504}
_MAX_ATTEMPTS = 3
_RETRY_BACKOFF_SECONDS = 2  # 2s, then 4s


def _safe_json(resp: httpx.Response) -> dict | None:
    try:
        return resp.json()
    except ValueError:
        return None


class WixAPIError(RuntimeError):
    def __init__(self, message: str, payload: dict | None = None):
        super().__init__(message)
        self.payload = payload or {}


@dataclass
class WixAnalyticsClient:
    access_token: str

    def _request(self, method: str, path: str, **kwargs: Any) -> dict:
        url = f"{GRAPH_BASE_URL}{path}"
        headers = {"Authorization": self.access_token}
        resp: httpx.Response | None = None
        for attempt in range(_MAX_ATTEMPTS):
            resp = httpx.request(method, url, headers=headers, timeout=30, **kwargs)
            if resp.status_code not in _RETRYABLE_STATUS_CODES or attempt == _MAX_ATTEMPTS - 1:
                break
            time.sleep(_RETRY_BACKOFF_SECONDS * (2**attempt))
        assert resp is not None

        if resp.status_code >= 400:
            raise WixAPIError(
                f"Wix API error on {method} {path} (status {resp.status_code}): {resp.text[:2000]}",
                payload=_safe_json(resp),
            )
        parsed = _safe_json(resp)
        if parsed is None:
            # A 2xx with an unparseable/empty body -- surface the
            # status/URL/raw text instead of letting a bare JSONDecodeError
            # bubble up with no indication of which call produced it.
            raise WixAPIError(
                f"Wix API returned a non-JSON 2xx body on {method} {path} "
                f"(status {resp.status_code}): {resp.text[:2000]!r}"
            )
        return parsed

    def get_site_timezone(self) -> str:
        """The site's IANA timezone, needed so day buckets in query_model
        match what the Wix dashboard shows (queries default to UTC
        otherwise, which shifts day boundaries)."""
        try:
            resp = self._request("GET", "/site-properties/v4/properties", params={"fields.paths": "timeZone"})
            return resp.get("properties", {}).get("timeZone") or "UTC"
        except WixAPIError:
            return "UTC"

    def query_model(
        self,
        model_id: str,
        fields: list[str],
        start: str,
        end: str,
        timezone: str,
        filters: list[dict] | None = None,
        sort_field: str | None = None,
        offset: int = 0,
        limit: int = MAX_PAGE_SIZE,
    ) -> dict:
        """One page of semantic-model query results.

        `start`/`end` are ISO datetimes; the range is start-inclusive,
        end-exclusive, so `end` should be the day *after* the last day
        you want (per Wix's docs).
        """
        body: dict[str, Any] = {
            "semanticModelId": model_id,
            "interval": {"start": start, "end": end, "timezone": timezone},
            "fields": fields,
            "paging": {"limit": limit, "offset": offset},
        }
        if filters:
            body["filters"] = filters
        if sort_field:
            body["sort"] = {"fieldName": sort_field, "order": "ASC"}
        return self._request("POST", "/analytics/semantic-model/v3/semantic-models/query-data", json=body)

    def iter_model_rows(
        self,
        model_id: str,
        fields: list[str],
        start: str,
        end: str,
        timezone: str,
        filters: list[dict] | None = None,
        sort_field: str | None = None,
    ) -> list[dict]:
        # Offset-based pagination is only stable if the underlying query
        # has a deterministic order -- without a sort_field, results exceeding
        # one page (MAX_PAGE_SIZE rows) can shuffle between fetches and the
        # same row can show up on two different pages. Callers should always
        # pass one of the queried fields here; see sync_wix_connection.
        rows: list[dict] = []
        offset = 0
        while True:
            page = self.query_model(
                model_id, fields, start, end, timezone, filters=filters, sort_field=sort_field, offset=offset
            )
            page_rows = page.get("results", [])
            rows.extend(page_rows)
            if len(page_rows) < MAX_PAGE_SIZE:
                break
            offset += MAX_PAGE_SIZE
        return rows


def cell_value(cell: dict[str, Any] | None) -> Any:
    """Extracts the typed value from one result cell (each cell has
    exactly one of numericValue/stringValue/booleanValue/timestampValue/
    arrayValue/objectValue set, per the query-data response shape)."""
    if not cell:
        return None
    for key in ("numericValue", "stringValue", "booleanValue", "timestampValue", "arrayValue", "objectValue"):
        if key in cell:
            return cell[key]
    return None
