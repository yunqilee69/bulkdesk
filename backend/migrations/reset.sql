-- ============================================================
-- BulkDesk - 开发库重置脚本
-- 说明: 删除本系统的表、Alembic 版本记录和枚举类型。
-- 警告: 此操作会永久删除本系统的全部数据，请仅在确认后执行。
-- ============================================================

BEGIN;

DROP TABLE IF EXISTS alembic_version;
DROP TABLE IF EXISTS order_status_logs CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS inventory_movement_items CASCADE;
DROP TABLE IF EXISTS inventory_movements CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS warehouses CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS level_change_logs CASCADE;
DROP TABLE IF EXISTS member_prices CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS price_change_logs CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS brands CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS customer_levels CASCADE;
DROP TABLE IF EXISTS employees CASCADE;

DROP TYPE IF EXISTS order_to_status CASCADE;
DROP TYPE IF EXISTS order_from_status CASCADE;
DROP TYPE IF EXISTS order_status CASCADE;
DROP TYPE IF EXISTS warehouse_status CASCADE;
DROP TYPE IF EXISTS supplier_status CASCADE;
DROP TYPE IF EXISTS movement_type CASCADE;
DROP TYPE IF EXISTS employee_status CASCADE;
DROP TYPE IF EXISTS employee_role CASCADE;
DROP TYPE IF EXISTS brand_status CASCADE;
DROP TYPE IF EXISTS price_type CASCADE;
DROP TYPE IF EXISTS product_status CASCADE;
DROP TYPE IF EXISTS category_status CASCADE;

COMMIT;
