BEGIN;

ALTER TABLE orders
    ADD COLUMN shipped_by character varying(100);

COMMENT ON COLUMN orders.shipped_by IS '实际发货操作人用户名';

COMMIT;
