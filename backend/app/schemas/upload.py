from pydantic import BaseModel
from typing import Optional


class UploadResult(BaseModel):
    key: str
    url: str
    filename: str
    content_type: str
    size: int


class FileDeleteRequest(BaseModel):
    key: str
