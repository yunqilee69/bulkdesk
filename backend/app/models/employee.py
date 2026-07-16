import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class EmployeeRole(str, enum.Enum):
    admin = "admin"
    normal = "normal"


class EmployeeStatus(str, enum.Enum):
    active = "active"
    disabled = "disabled"


class Employee(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "employees"

    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    role: Mapped[EmployeeRole] = mapped_column(
        Enum(EmployeeRole, name="employee_role", native_enum=True),
        default=EmployeeRole.normal,
        nullable=False,
    )
    status: Mapped[EmployeeStatus] = mapped_column(
        Enum(EmployeeStatus, name="employee_status", native_enum=True),
        default=EmployeeStatus.active,
        nullable=False,
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
