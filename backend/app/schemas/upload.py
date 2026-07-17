from typing import Optional

from app.schemas.common import ApiSchema

class UploadResult(ApiSchema):
    key: str
    url: str
    filename: str
    content_type: str
    size: int


class FileDeleteRequest(ApiSchema):
    key: str
