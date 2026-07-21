import re
from datetime import datetime
from typing import Optional

from pydantic import Field, field_validator

from app.models.employee import EmployeeRole, EmployeeStatus
from app.schemas.common import ApiSchema


def _validate_password(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not re.search(r"[a-zA-Z]", v):
        raise ValueError("Password must contain at least one letter")
    if not re.search(r"\d", v):
        raise ValueError("Password must contain at least one digit")
    return v


def _validate_unique_roles(values: list[EmployeeRole]) -> list[EmployeeRole]:
    if len(values) != len(set(values)):
        raise ValueError("员工角色不能重复")
    return values


class EmployeeCreate(ApiSchema):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=8)
    name: str = Field(..., min_length=1, max_length=100)
    phone: Optional[str] = None
    roles: list[EmployeeRole] = Field(..., min_length=1)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _validate_password(v)

    @field_validator("roles")
    @classmethod
    def unique_roles(cls, values: list[EmployeeRole]) -> list[EmployeeRole]:
        return _validate_unique_roles(values)


class EmployeeUpdate(ApiSchema):
    name: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = None
    roles: Optional[list[EmployeeRole]] = Field(None, min_length=1)
    status: Optional[EmployeeStatus] = None

    @field_validator("roles")
    @classmethod
    def unique_roles(cls, values: Optional[list[EmployeeRole]]) -> Optional[list[EmployeeRole]]:
        if values is None:
            return None
        return _validate_unique_roles(values)


class PasswordChange(ApiSchema):
    old_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        return _validate_password(v)


class PasswordReset(ApiSchema):
    new_password: str = Field(..., min_length=8)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        return _validate_password(v)


class EmployeeOut(ApiSchema):
    id: str
    username: str
    name: str
    phone: Optional[str]
    roles: list[EmployeeRole] = Field(..., min_length=1)
    status: EmployeeStatus
    last_login_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def uuid_to_str(cls, v):
        return str(v)

    @field_validator("roles")
    @classmethod
    def unique_roles(cls, values: list[EmployeeRole]) -> list[EmployeeRole]:
        return _validate_unique_roles(values)
