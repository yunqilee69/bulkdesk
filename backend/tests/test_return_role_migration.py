from pathlib import Path


MIGRATION = (
    Path(__file__).parents[1]
    / "migrations"
    / "incremental"
    / "2026-07-20_退货来源追踪与员工多角色.sql"
)


def test_return_role_migration_contains_required_schema_contract():
    sql = MIGRATION.read_text(encoding="utf-8").lower()

    assert "begin;" in sql
    assert "commit;" in sql
    assert "create type employee_business_role as enum" in sql
    for role in ("admin", "warehouse_manager", "delivery", "finance"):
        assert f"'{role}'" in sql

    assert "create table if not exists employee_roles" in sql
    assert "uq_employee_roles_employee_role" in sql
    assert "insert into employee_roles" in sql
    assert "when 'admin' then 'admin'::employee_business_role" in sql
    assert "when 'normal' then 'warehouse_manager'::employee_business_role" in sql
    assert "drop column if exists role" in sql
    assert "drop type if exists employee_role" in sql

    assert "returned_amount numeric(12, 2) not null default 0" in sql
    assert "ck_orders_returned_amount_range" in sql
    assert "returned_amount >= 0 and returned_amount <= total_amount" in sql

    assert "handling_delivery_id uuid not null references order_deliveries(id)" in sql
    assert "handling_delivery_id uuid not null references employees(id)" not in sql
    assert "source_order_item_id uuid not null references order_items(id)" in sql
    assert "ix_employee_roles_employee_id" in sql
    assert "ix_return_orders_handling_delivery_id" in sql
    assert "ix_return_order_items_source_order_item_id" in sql

    assert "return_orders already contains data" in sql
    assert "raise exception" in sql


def test_delivery_foreign_key_fix_targets_order_deliveries():
    fix = (
        MIGRATION.parent / "2026-07-20_修正退货配送任务外键.sql"
    ).read_text(encoding="utf-8").lower()

    assert "begin;" in fix
    assert "commit;" in fix
    assert "return_orders_handling_delivery_id_fkey" in fix
    assert "references order_deliveries(id)" in fix
    assert "handling_delivery_id" in fix
