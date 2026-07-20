from pydantic import Field

from app.schemas.common import ApiSchema

class LoginRequest(ApiSchema):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class TokenResponse(ApiSchema):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class CurrentUserResponse(ApiSchema):
    id: str
    username: str
    role: str


class RefreshRequest(ApiSchema):
    refresh_token: str
