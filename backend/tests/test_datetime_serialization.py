from datetime import date, datetime, timezone

from app.schemas.common import ApiSchema, PaginatedResponse, ResponseBase


class DatetimePayload(ApiSchema):
    created_at: datetime


class DatePayload(ApiSchema):
    occurred_on: date


def test_response_datetimes_are_converted_to_utc_plus_eight():
    response = ResponseBase(
        data=PaginatedResponse(
            items=[
                DatetimePayload(
                    created_at=datetime(
                        2026, 7, 17, 8, 30, 45, 123456, tzinfo=timezone.utc
                    )
                )
            ],
            total=1,
            page=1,
            page_size=20,
        )
    )

    assert (
        response.model_dump(mode="json")["data"]["items"][0]["created_at"]
        == "2026-07-17 16:30:45"
    )


def test_naive_response_datetime_is_interpreted_as_utc():
    payload = DatetimePayload(created_at=datetime(2026, 7, 17, 8, 30, 45, 123456))

    assert payload.model_dump(mode="json")["created_at"] == "2026-07-17 16:30:45"


def test_response_date_keeps_iso_date_format():
    payload = DatePayload(occurred_on=date(2026, 7, 17))

    assert payload.model_dump(mode="json")["occurred_on"] == "2026-07-17"
