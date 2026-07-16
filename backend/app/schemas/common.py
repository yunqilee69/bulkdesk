from typing import Generic, List, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int


class ResponseBase(BaseModel, Generic[T]):
    code: int = 0
    message: str = "success"
    data: Optional[T] = None
