BEGIN;

WITH paid_order_stats AS (
    SELECT
        customer_id,
        SUM(total_amount) AS total_amount,
        COUNT(*) AS order_count,
        MAX(created_at) AS last_order_at
    FROM orders
    WHERE status = 'paid'
    GROUP BY customer_id
)
UPDATE customers AS customer
SET
    total_spent = customer.total_spent + paid_order_stats.total_amount,
    order_count = customer.order_count + paid_order_stats.order_count,
    last_order_at = CASE
        WHEN customer.last_order_at IS NULL THEN paid_order_stats.last_order_at
        WHEN customer.last_order_at < paid_order_stats.last_order_at THEN paid_order_stats.last_order_at
        ELSE customer.last_order_at
    END
FROM paid_order_stats
WHERE customer.id = paid_order_stats.customer_id;

ALTER TABLE orders RENAME COLUMN shipped_at TO stock_out_at;
ALTER TABLE orders RENAME COLUMN shipped_by TO stock_out_by;
ALTER TABLE orders ADD COLUMN shipping_started_at timestamp without time zone;
ALTER TABLE orders ADD COLUMN shipping_started_by character varying(100);
ALTER TABLE orders ADD COLUMN delivered_at timestamp without time zone;
ALTER TABLE orders ADD COLUMN delivered_by character varying(100);
ALTER TABLE orders ADD COLUMN paid_by character varying(100);
ALTER TABLE orders ADD COLUMN cancelled_by character varying(100);

ALTER TABLE orders ALTER COLUMN status DROP DEFAULT;
ALTER TYPE order_status RENAME TO order_status_legacy;
ALTER TYPE order_from_status RENAME TO order_from_status_legacy;
ALTER TYPE order_to_status RENAME TO order_to_status_legacy;

CREATE TYPE order_status AS ENUM (
    'placed',
    'shipping',
    'stocked_out',
    'delivered_unpaid',
    'completed',
    'cancelled'
);
CREATE TYPE order_from_status AS ENUM (
    'placed',
    'shipping',
    'stocked_out',
    'delivered_unpaid',
    'completed',
    'cancelled'
);
CREATE TYPE order_to_status AS ENUM (
    'placed',
    'shipping',
    'stocked_out',
    'delivered_unpaid',
    'completed',
    'cancelled'
);

ALTER TABLE orders
    ALTER COLUMN status TYPE order_status
    USING (
        CASE status::text
            WHEN 'shipped' THEN 'stocked_out'
            WHEN 'paid' THEN 'completed'
            ELSE status::text
        END
    )::order_status;

ALTER TABLE order_status_logs
    ALTER COLUMN from_status TYPE order_from_status
    USING (
        CASE
            WHEN from_status IS NULL THEN NULL
            WHEN from_status::text = 'shipped' THEN 'stocked_out'
            WHEN from_status::text = 'paid' THEN 'completed'
            ELSE from_status::text
        END
    )::order_from_status,
    ALTER COLUMN to_status TYPE order_to_status
    USING (
        CASE to_status::text
            WHEN 'shipped' THEN 'stocked_out'
            WHEN 'paid' THEN 'completed'
            ELSE to_status::text
        END
    )::order_to_status;

ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'placed'::order_status;
DROP TYPE order_status_legacy;
DROP TYPE order_from_status_legacy;
DROP TYPE order_to_status_legacy;

ALTER TYPE movement_type ADD VALUE IF NOT EXISTS 'customer_return_in';
ALTER TYPE movement_type ADD VALUE IF NOT EXISTS 'customer_return_void_out';

CREATE TYPE return_order_status AS ENUM ('completed', 'voided');
CREATE TYPE return_product_condition AS ENUM ('normal', 'expired', 'damaged', 'other');

CREATE TABLE return_orders (
    id uuid PRIMARY KEY,
    return_no character varying(64) NOT NULL UNIQUE,
    customer_id uuid NOT NULL REFERENCES customers(id),
    total_amount numeric(12, 2) NOT NULL,
    status return_order_status NOT NULL DEFAULT 'completed',
    operator character varying(100) NOT NULL,
    completed_at timestamp without time zone NOT NULL,
    remark text,
    customer_spent_before numeric(12, 2) NOT NULL,
    customer_spent_after numeric(12, 2) NOT NULL,
    spend_deduction_amount numeric(12, 2) NOT NULL,
    voided_by character varying(100),
    voided_at timestamp without time zone,
    void_reason text,
    void_customer_spent_before numeric(12, 2),
    void_customer_spent_after numeric(12, 2),
    created_at timestamp without time zone NOT NULL DEFAULT now(),
    updated_at timestamp without time zone NOT NULL DEFAULT now(),
    CONSTRAINT ck_return_order_total_amount CHECK (total_amount > 0),
    CONSTRAINT ck_return_order_customer_spent CHECK (
        customer_spent_before >= 0
        AND customer_spent_after >= 0
        AND customer_spent_after <= customer_spent_before
        AND spend_deduction_amount = customer_spent_before - customer_spent_after
    )
);

CREATE INDEX ix_return_orders_customer_created_at
    ON return_orders(customer_id, created_at);
CREATE INDEX ix_return_orders_status_created_at
    ON return_orders(status, created_at);

CREATE TABLE return_order_items (
    id uuid PRIMARY KEY,
    return_order_id uuid NOT NULL REFERENCES return_orders(id),
    product_id uuid NOT NULL REFERENCES products(id),
    product_name character varying(200) NOT NULL,
    barcode character varying(50) NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(12, 2) NOT NULL,
    subtotal numeric(12, 2) NOT NULL,
    condition return_product_condition NOT NULL,
    return_reason character varying(255) NOT NULL,
    remark text,
    should_stock_in boolean NOT NULL DEFAULT false,
    warehouse_id uuid REFERENCES warehouses(id),
    created_at timestamp without time zone NOT NULL DEFAULT now(),
    updated_at timestamp without time zone NOT NULL DEFAULT now(),
    CONSTRAINT ck_return_order_item_quantity CHECK (quantity > 0),
    CONSTRAINT ck_return_order_item_unit_price CHECK (unit_price > 0),
    CONSTRAINT ck_return_order_item_subtotal CHECK (subtotal = unit_price * quantity),
    CONSTRAINT ck_return_order_item_stock_in_warehouse CHECK (
        (should_stock_in AND warehouse_id IS NOT NULL)
        OR (NOT should_stock_in AND warehouse_id IS NULL)
    )
);

CREATE INDEX ix_return_order_items_return_order_id
    ON return_order_items(return_order_id);
CREATE INDEX ix_return_order_items_product_id
    ON return_order_items(product_id);
CREATE INDEX ix_return_order_items_warehouse_id
    ON return_order_items(warehouse_id);

COMMENT ON TABLE return_orders IS '独立客户退货单';
COMMENT ON TABLE return_order_items IS '独立客户退货单明细';
COMMENT ON COLUMN return_orders.spend_deduction_amount IS '创建退货单时实际冲减的客户累计消费金额';
COMMENT ON COLUMN return_order_items.should_stock_in IS '该退货明细是否实际入库';

COMMIT;
