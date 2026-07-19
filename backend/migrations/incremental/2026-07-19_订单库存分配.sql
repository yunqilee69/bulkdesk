BEGIN;

CREATE TYPE order_inventory_allocation_status AS ENUM (
    'reserved',
    'shipped',
    'released',
    'returned'
);

CREATE TABLE order_inventory_allocations (
    id uuid PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES orders(id),
    order_item_id uuid NOT NULL REFERENCES order_items(id),
    product_id uuid NOT NULL REFERENCES products(id),
    warehouse_id uuid NOT NULL REFERENCES warehouses(id),
    quantity integer NOT NULL,
    status order_inventory_allocation_status NOT NULL DEFAULT 'reserved',
    created_at timestamp without time zone NOT NULL DEFAULT now(),
    updated_at timestamp without time zone NOT NULL DEFAULT now(),
    CONSTRAINT uq_order_inventory_allocation_item_warehouse
        UNIQUE (order_item_id, warehouse_id),
    CONSTRAINT ck_order_inventory_allocation_quantity CHECK (quantity > 0)
);

CREATE INDEX ix_order_inventory_allocations_order_id
    ON order_inventory_allocations(order_id);
CREATE INDEX ix_order_inventory_allocations_warehouse_id
    ON order_inventory_allocations(warehouse_id);

INSERT INTO order_inventory_allocations (
    id,
    order_id,
    order_item_id,
    product_id,
    warehouse_id,
    quantity,
    status,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid(),
    order_item.order_id,
    order_item.id,
    order_item.product_id,
    orders.warehouse_id,
    order_item.quantity,
    CASE
        WHEN orders.status = 'placed' THEN 'reserved'::order_inventory_allocation_status
        WHEN orders.status IN ('shipped', 'paid', 'completed') THEN 'shipped'::order_inventory_allocation_status
        WHEN EXISTS (
            SELECT 1
            FROM order_status_logs
            WHERE order_status_logs.order_id = orders.id
              AND order_status_logs.to_status = 'shipped'
        ) THEN 'returned'::order_inventory_allocation_status
        ELSE 'released'::order_inventory_allocation_status
    END,
    order_item.created_at,
    order_item.updated_at
FROM order_items AS order_item
JOIN orders ON orders.id = order_item.order_id;

ALTER TABLE orders DROP CONSTRAINT orders_warehouse_id_fkey;
ALTER TABLE orders DROP COLUMN warehouse_id;

COMMIT;
