import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class EmployeeRole(str, enum.Enum):
    admin = "admin"
    warehouse_manager = "warehouse_manager"
    delivery = "delivery"
    finance = "finance"


class EmployeeStatus(str, enum.Enum):
    active = "active"
    disabled = "disabled"


class Employee(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "employees"

    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    status: Mapped[EmployeeStatus] = mapped_column(
        Enum(EmployeeStatus, name="employee_status", native_enum=True),
        default=EmployeeStatus.active,
        nullable=False,
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    role_assignments: Mapped[list["EmployeeRoleAssignment"]] = relationship(
        back_populates="employee",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    @property
    def roles(self) -> list[EmployeeRole]:
        return [assignment.role for assignment in self.role_assignments]


class EmployeeRoleAssignment(UUIDMixin, Base):
    __tablename__ = "employee_roles"
    __table_args__ = (
        UniqueConstraint("employee_id", "role", name="uq_employee_roles_employee_role"),
    )

    employee_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[EmployeeRole] = mapped_column(
        Enum(EmployeeRole, name="employee_business_role", native_enum=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    employee: Mapped["Employee"] = relationship(back_populates="role_assignments")
