from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator
import re

from app.models.employee import EmployeeRole, EmployeeStatus


def _validate_password(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not re.search(r"[a-zA-Z]", v):
        raise ValueError("Password must contain at least one letter")
    if not re.search(r"\d", v):
        raise ValueError("Password must contain at least one digit")
    return v


class EmployeeCreate(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=8)
    name: str = Field(..., min_length=1, max_length=100)
    phone: Optional[str] = None
    role: EmployeeRole = EmployeeRole.normal

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _validate_password(v)


class EmployeeUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = None
    role: Optional[EmployeeRole] = None
    status: Optional[EmployeeStatus] = None


class PasswordChange(BaseModel):
    old_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        return _validate_password(v)


class PasswordReset(BaseModel):
    new_password: str = Field(..., min_length=8)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        return _validate_password(v)


class EmployeeOut(BaseModel):
    id: str
    username: str
    name: str
    phone: Optional[str]
    role: EmployeeRole
    status: EmployeeStatus
    last_login_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def uuid_to_str(cls, v):
        return str(v)
