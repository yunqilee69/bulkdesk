from pydantic import Field

from app.models.employee import EmployeeRole
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
    roles: list[EmployeeRole]


class RefreshRequest(ApiSchema):
    refresh_token: str
