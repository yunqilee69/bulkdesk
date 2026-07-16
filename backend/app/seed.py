import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.core.security import get_password_hash
from app.models.customer import CustomerLevel
from app.models.employee import Employee, EmployeeRole, EmployeeStatus
from app.models.inventory import Warehouse


async def seed() -> None:
    async with async_session_factory() as db:
        try:
            # Create admin user
            result = await db.execute(
                select(Employee).where(Employee.username == "admin")
            )
            if result.scalar_one_or_none() is None:
                admin = Employee(
                    username="admin",
                    password_hash=get_password_hash("123456"),
                    name="系统管理员",
                    role=EmployeeRole.admin,
                    status=EmployeeStatus.active,
                )
                db.add(admin)
                print("Created admin user (username=admin, password=123456)")
            else:
                print("Admin user already exists, skipping")

            # Create default customer level
            result = await db.execute(
                select(CustomerLevel).where(CustomerLevel.is_default == True)  # noqa: E712
            )
            if result.scalar_one_or_none() is None:
                default_level = CustomerLevel(
                    name="普通会员",
                    min_spent=0,
                    sort_order=0,
                    is_default=True,
                )
                db.add(default_level)
                print("Created default customer level: 普通会员")
            else:
                print("Default customer level already exists, skipping")

            # Create default warehouse
            result = await db.execute(
                select(Warehouse).where(Warehouse.is_default == True)  # noqa: E712
            )
            if result.scalar_one_or_none() is None:
                default_warehouse = Warehouse(
                    name="主仓库",
                    is_default=True,
                )
                db.add(default_warehouse)
                print("Created default warehouse: 主仓库")
            else:
                print("Default warehouse already exists, skipping")

            await db.commit()
            print("Seed completed successfully!")
        except Exception as e:
            await db.rollback()
            print(f"Seed failed: {e}")
            raise


if __name__ == "__main__":
    asyncio.run(seed())
