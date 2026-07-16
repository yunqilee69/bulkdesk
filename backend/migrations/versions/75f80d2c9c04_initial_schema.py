"""initial_schema

Revision ID: 75f80d2c9c04
Revises: 
Create Date: 2026-07-04 18:13:54.057323

"""
from pathlib import Path
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "75f80d2c9c04"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _migration_sql() -> str:
    return (Path(__file__).resolve().parents[1] / "init.sql").read_text(
        encoding="utf-8"
    )


def _iter_statements(sql: str) -> list[str]:
    statements: list[str] = []
    current: list[str] = []

    for raw_line in sql.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("--"):
            continue

        current.append(raw_line)
        if line.endswith(";"):
            statement = "\n".join(current).strip().rstrip(";")
            if statement:
                statements.append(statement)
            current = []

    if current:
        statement = "\n".join(current).strip()
        if statement:
            statements.append(statement)

    return statements


def upgrade() -> None:
    for statement in _iter_statements(_migration_sql()):
        op.execute(statement)


def downgrade() -> None:
    for table in (
        "order_status_logs",
        "order_items",
        "orders",
        "inventory_movement_items",
        "inventory_movements",
        "inventory",
        "warehouses",
        "suppliers",
        "level_change_logs",
        "member_prices",
        "customers",
        "price_change_logs",
        "products",
        "brands",
        "categories",
        "customer_levels",
        "employees",
    ):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")

    for enum_type in (
        "order_to_status",
        "order_from_status",
        "order_status",
        "warehouse_status",
        "supplier_status",
        "movement_type",
        "employee_status",
        "employee_role",
        "brand_status",
        "price_type",
        "product_status",
        "category_status",
    ):
        op.execute(f"DROP TYPE IF EXISTS {enum_type} CASCADE")
