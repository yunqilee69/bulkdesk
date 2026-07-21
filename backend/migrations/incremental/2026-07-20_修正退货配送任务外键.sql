BEGIN;

ALTER TABLE return_orders
    DROP CONSTRAINT IF EXISTS return_orders_handling_delivery_id_fkey;

ALTER TABLE return_orders
    ADD CONSTRAINT return_orders_handling_delivery_id_fkey
    FOREIGN KEY (handling_delivery_id)
    REFERENCES order_deliveries(id);

COMMIT;
