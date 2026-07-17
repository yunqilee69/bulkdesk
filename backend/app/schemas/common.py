from datetime import datetime, timedelta, timezone
from typing import Generic, List, Optional, TypeVar

from pydantic import BaseModel, field_serializer

T = TypeVar("T")
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


class PaginatedResponse(ApiSchema, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int


class ResponseBase(ApiSchema, Generic[T]):
    code: int = 0
    message: str = "success"
    data: Optional[T] = None
