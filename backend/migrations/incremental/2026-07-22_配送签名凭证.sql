BEGIN;

ALTER TABLE order_deliveries
    ADD COLUMN IF NOT EXISTS signature_image_url character varying(1000);

COMMENT ON COLUMN order_deliveries.signature_image_url
    IS '客户手写签名PNG的公开URL；历史Web签收记录允许为空';

COMMIT;
