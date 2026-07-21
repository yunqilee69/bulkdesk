BEGIN;

DO $$
BEGIN
    IF (
        EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'employees'
              AND column_name = 'role'
        )
        OR NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'orders'
              AND column_name = 'returned_amount'
        )
        OR NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'return_orders'
              AND column_name = 'handling_delivery_id'
        )
        OR NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'return_order_items'
              AND column_name = 'source_order_item_id'
        )
    ) AND EXISTS (SELECT 1 FROM return_orders) THEN
        RAISE EXCEPTION
            'return_orders already contains data; map existing return orders before source tracking migration';
    END IF;
END
$$;

DO $$
DECLARE
    actual_labels text[];
BEGIN
    SELECT array_agg(enum_label.enumlabel ORDER BY enum_label.enumsortorder)
    INTO actual_labels
    FROM pg_type type_info
    JOIN pg_namespace type_namespace ON type_namespace.oid = type_info.typnamespace
    JOIN pg_enum enum_label ON enum_label.enumtypid = type_info.oid
    WHERE type_namespace.nspname = current_schema()
      AND type_info.typname = 'employee_business_role';

    IF actual_labels IS NULL THEN
        CREATE TYPE employee_business_role AS ENUM (
            'admin',
            'warehouse_manager',
            'delivery',
            'finance'
        );
    ELSIF actual_labels IS DISTINCT FROM ARRAY[
        'admin',
        'warehouse_manager',
        'delivery',
        'finance'
    ]::text[] THEN
        RAISE EXCEPTION
            'employee_business_role has incompatible labels: %', actual_labels;
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS employee_roles (
    id uuid PRIMARY KEY,
    employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    role employee_business_role NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT now(),
    CONSTRAINT uq_employee_roles_employee_role UNIQUE (employee_id, role)
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'employees'
          AND column_name = 'role'
    ) THEN
        INSERT INTO employee_roles (id, employee_id, role)
        SELECT
            md5(
                'employee-role:'
                || employee.id::text
                || ':'
                || employee.role::text
            )::uuid,
            employee.id,
            CASE employee.role::text
                WHEN 'admin' THEN 'admin'::employee_business_role
                WHEN 'normal' THEN 'warehouse_manager'::employee_business_role
                ELSE NULL
            END
        FROM employees AS employee
        WHERE employee.role::text IN ('admin', 'normal')
        ON CONFLICT (employee_id, role) DO NOTHING;

        IF EXISTS (
            SELECT 1
            FROM employees
            WHERE role::text NOT IN ('admin', 'normal')
        ) THEN
            RAISE EXCEPTION
                'employees.role contains an unsupported legacy role value';
        END IF;
    END IF;
END
$$;

ALTER TABLE employees DROP COLUMN IF EXISTS role;
DROP TYPE IF EXISTS employee_role;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS returned_amount numeric(12, 2) NOT NULL DEFAULT 0;

UPDATE orders
SET returned_amount = 0
WHERE returned_amount IS NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM orders
        WHERE returned_amount < 0 OR returned_amount > total_amount
    ) THEN
        RAISE EXCEPTION
            'orders.returned_amount must be between zero and total_amount';
    END IF;
END
$$;

ALTER TABLE orders
    ALTER COLUMN returned_amount SET DEFAULT 0,
    ALTER COLUMN returned_amount SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint constraint_info
        JOIN pg_class table_info ON table_info.oid = constraint_info.conrelid
        JOIN pg_namespace table_namespace ON table_namespace.oid = table_info.relnamespace
        WHERE table_namespace.nspname = current_schema()
          AND table_info.relname = 'orders'
          AND constraint_info.conname = 'ck_orders_returned_amount_range'
    ) THEN
        ALTER TABLE orders
            ADD CONSTRAINT ck_orders_returned_amount_range
            CHECK (returned_amount >= 0 AND returned_amount <= total_amount);
    END IF;
END
$$;

ALTER TABLE return_orders
    ADD COLUMN IF NOT EXISTS handling_delivery_id uuid NOT NULL REFERENCES order_deliveries(id);
ALTER TABLE return_orders
    ALTER COLUMN handling_delivery_id SET NOT NULL;

ALTER TABLE return_order_items
    ADD COLUMN IF NOT EXISTS source_order_item_id uuid NOT NULL REFERENCES order_items(id);
ALTER TABLE return_order_items
    ALTER COLUMN source_order_item_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS ix_employee_roles_employee_id
    ON employee_roles(employee_id);
CREATE INDEX IF NOT EXISTS ix_return_orders_handling_delivery_id
    ON return_orders(handling_delivery_id);
CREATE INDEX IF NOT EXISTS ix_return_order_items_source_order_item_id
    ON return_order_items(source_order_item_id);

COMMIT;
