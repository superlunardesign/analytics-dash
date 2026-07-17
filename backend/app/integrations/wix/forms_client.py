"""Wrapper around Wix's Form Schema + Form Submission APIs.

Unlike the analytics semantic model (client.py), this is the authoritative
source for actual form data: real per-submission IDs, the raw answer to
every question, and each form's real question labels/options. It only
ever returns real submissions -- there's no "views"/"started" noise to
filter here, unlike the forms-actions semantic model.

Confirmed live against a real Wix Studio site's "Project Inquiry" form.
Requires the WIX_FORMS.FORM_SCHEMA_READ and WIX_FORMS.SUBMISSION_READ_ANY
permissions on the custom app (separate from whatever's granted for
analytics access) -- see README.md.

Reference:
https://dev.wix.com/docs/api-reference/crm/forms/form-schemas
https://dev.wix.com/docs/api-reference/crm/forms/form-submissions
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

FORMS_BASE_URL = "https://www.wixapis.com"

# The only namespace real (non-headless) Wix Forms submissions use --
# confirmed live; QuerySubmissionsByNamespace and ListForms both require
# it explicitly or they error.
FORMS_NAMESPACE = "wix.form_app.form"

# Field types that carry no question/answer -- decorative or structural,
# never appear as a key in a submission's answers.
_NON_QUESTION_FIELD_TYPES = {"SUBMIT_BUTTON", "HEADER", "RICH_TEXT"}


class WixFormsAPIError(RuntimeError):
    def __init__(self, message: str, payload: dict | None = None):
        super().__init__(message)
        self.payload = payload or {}


@dataclass
class WixFormsClient:
    access_token: str

    def _request(self, method: str, path: str, **kwargs: Any) -> dict:
        url = f"{FORMS_BASE_URL}{path}"
        headers = {"Authorization": self.access_token}
        resp = httpx.request(method, url, headers=headers, timeout=30, **kwargs)
        if resp.status_code >= 400:
            raise WixFormsAPIError(
                f"Wix Forms API error on {method} {path} (status {resp.status_code}): {resp.text[:2000]}",
                payload=resp.json() if resp.content else None,
            )
        try:
            return resp.json()
        except ValueError as exc:
            # A 2xx with an unparseable body -- surface the status/URL/raw
            # text instead of letting the bare JSONDecodeError bubble up
            # with no indication of which call or endpoint produced it.
            raise WixFormsAPIError(
                f"Wix Forms API returned a non-JSON 2xx body on {method} {path} "
                f"(status {resp.status_code}): {resp.text[:2000]!r}"
            ) from exc

    def iter_forms(self) -> list[dict]:
        forms: list[dict] = []
        cursor: str | None = None
        while True:
            params: dict[str, Any] = {"namespace": FORMS_NAMESPACE, "paging.limit": 100}
            if cursor:
                params["paging.cursor"] = cursor
            page = self._request("GET", "/form-schema-service/v4/forms", params=params)
            page_forms = page.get("forms", [])
            forms.extend(page_forms)
            paging_metadata = page.get("pagingMetadata", {})
            if not paging_metadata.get("hasNext") or not page_forms:
                break
            cursor = paging_metadata.get("cursors", {}).get("next")
            if not cursor:
                break
        return forms

    def get_form(self, form_id: str) -> dict:
        return self._request("GET", f"/form-schema-service/v4/forms/{form_id}").get("form", {})

    def iter_submissions(self, form_id: str) -> list[dict]:
        submissions: list[dict] = []
        cursor: str | None = None
        while True:
            cursor_paging: dict[str, Any] = {"limit": 100}
            if cursor:
                cursor_paging["cursor"] = cursor
            body = {
                "query": {
                    "filter": {"formId": form_id, "namespace": FORMS_NAMESPACE},
                    "cursorPaging": cursor_paging,
                },
                "onlyYourOwn": False,
            }
            page = self._request("POST", "/form-submission-service/v4/submissions/namespace/query", json=body)
            page_submissions = page.get("submissions", [])
            submissions.extend(page_submissions)
            metadata = page.get("metadata", {})
            if not metadata.get("hasNext") or not page_submissions:
                break
            cursor = metadata.get("cursors", {}).get("next")
            if not cursor:
                break
        return submissions


def extract_question_fields(form: dict) -> list[dict]:
    """Reduces a Get Form response's `fields` list down to the real
    questions (skipping headers/rich-text/submit buttons), each with its
    submission-answer key (`target`), human-readable `label`, `field_type`,
    and `options` (for choice fields) -- exactly what's needed to render an
    answer sensibly without guessing from the raw field key."""
    questions = []
    for field in form.get("fields", []):
        target = field.get("target")
        view = field.get("view", {})
        field_type = view.get("fieldType")
        if not target or field_type in _NON_QUESTION_FIELD_TYPES:
            continue
        label = view.get("label")
        # A rich-text label (used on some checkbox/agreement fields) is a
        # doc-node structure, not a plain string -- fall back to the field
        # key turned into a readable phrase rather than showing raw JSON.
        if not isinstance(label, str) or not label:
            label = target.replace("_", " ").strip().capitalize()
        options = [
            {"label": o.get("label"), "value": o.get("value")}
            for o in view.get("options", [])
            if isinstance(o, dict)
        ]
        questions.append({"target": target, "label": label, "field_type": field_type, "options": options})
    return questions
