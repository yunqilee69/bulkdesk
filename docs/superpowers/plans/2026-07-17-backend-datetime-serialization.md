# Backend Datetime Serialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Format every backend API response `datetime` as UTC+8 in `YYYY-MM-DD HH:mm:ss` form.

**Architecture:** Add an `ApiSchema` base model in `app.schemas.common` with a Pydantic v2 field serializer for `datetime`. Make all application schemas inherit from it, so FastAPI response models, nested models, and paginated models share one serializer. The formatter treats naive database values as UTC before converting them to UTC+8; `date` is not customized.

**Tech Stack:** Python 3.12, FastAPI, Pydantic 2.10, pytest.

---

### Task 1: Specify the public serialization contract

**Files:**
- Create: `backend/tests/test_datetime_serialization.py`

- [x] **Step 1: Write the failing test**

```python
from datetime import datetime, timezone

from app.schemas.common import ApiSchema, PaginatedResponse, ResponseBase


class DatetimePayload(ApiSchema):
    created_at: datetime


def test_response_datetimes_are_converted_to_utc_plus_eight():
    response = ResponseBase(
        data=PaginatedResponse(
            items=[DatetimePayload(created_at=datetime(2026, 7, 17, 8, 30, 45, 123456, tzinfo=timezone.utc))],
            total=1,
            page=1,
            page_size=20,
        )
    )

    assert response.model_dump(mode="json")["data"]["items"][0]["created_at"] == "2026-07-17 16:30:45"
```

- [x] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/test_datetime_serialization.py::test_response_datetimes_are_converted_to_utc_plus_eight -q`

Expected: FAIL because `ApiSchema` does not yet exist.

- [x] **Step 3: Add naive-datetime and date regression cases**

```python
from datetime import date


class DatePayload(ApiSchema):
    occurred_on: date


def test_naive_response_datetime_is_interpreted_as_utc():
    payload = DatetimePayload(created_at=datetime(2026, 7, 17, 8, 30, 45, 123456))

    assert payload.model_dump(mode="json")["created_at"] == "2026-07-17 16:30:45"


def test_response_date_keeps_iso_date_format():
    payload = DatePayload(occurred_on=date(2026, 7, 17))

    assert payload.model_dump(mode="json")["occurred_on"] == "2026-07-17"
```

- [x] **Step 4: Run the full new test module and verify it fails**

Run: `uv run pytest tests/test_datetime_serialization.py -q`

Expected: FAIL because the common output serializer has not been implemented.

### Task 2: Implement the common Pydantic serializer

**Files:**
- Modify: `backend/app/schemas/common.py`

- [x] **Step 1: Add the formatter and schema base**

```python
from datetime import datetime, timezone

from pydantic import BaseModel, field_serializer

UTC_PLUS_EIGHT = timezone(timedelta(hours=8))


def format_response_datetime(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(UTC_PLUS_EIGHT).strftime("%Y-%m-%d %H:%M:%S")


class ApiSchema(BaseModel):
    @field_serializer("*", when_used="json", check_fields=False)
    def serialize_datetime(self, value):
        if isinstance(value, datetime):
            return format_response_datetime(value)
        return value
```

Import `timedelta` with `datetime` and keep the existing generic response types inheriting `ApiSchema`.

- [x] **Step 2: Run the new test module to verify it is green**

Run: `uv run pytest tests/test_datetime_serialization.py -q`

Expected: PASS with 3 passed tests.

### Task 3: Apply the schema base across API contracts

**Files:**
- Modify: `backend/app/schemas/auth.py`
- Modify: `backend/app/schemas/customer.py`
- Modify: `backend/app/schemas/dashboard.py`
- Modify: `backend/app/schemas/employee.py`
- Modify: `backend/app/schemas/inventory.py`
- Modify: `backend/app/schemas/order.py`
- Modify: `backend/app/schemas/product.py`
- Modify: `backend/app/schemas/upload.py`

- [x] **Step 1: Replace direct Pydantic bases with the application base**

```python
from app.schemas.common import ApiSchema


class ExampleSchema(ApiSchema):
    ...
```

Replace each `BaseModel` schema inheritance in these modules with `ApiSchema`; retain all existing Pydantic imports except `BaseModel`. Keep their `model_config = {"from_attributes": True}` declarations unchanged, since Pydantic merges them with the base configuration.

- [ ] **Step 2: Run focused serialization and business tests**

Run: `uv run pytest tests/test_datetime_serialization.py tests/test_business_logic.py -q`

Expected: PASS.

### Task 4: Verify integration and document completion

**Files:**
- Modify: `docs/superpowers/specs/2026-07-17-backend-datetime-serialization-design.md`
- Modify: `docs/superpowers/plans/2026-07-17-backend-datetime-serialization.md`

- [x] **Step 1: Mark the design and plan implementation status**

Add an implementation note stating that all API schemas share `ApiSchema`, and mark every plan checkbox complete after its associated command has passed.

- [ ] **Step 2: Run mandatory backend verification**

Run: `PYTHONPYCACHEPREFIX=.pycache python3 -m compileall app`

Expected: exit code 0.

Run: `uv run pytest`

Expected: exit code 0 with no test failures.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check && git diff -- backend/app/schemas backend/tests/test_datetime_serialization.py docs/superpowers`

Expected: no whitespace errors and only the planned files changed.
