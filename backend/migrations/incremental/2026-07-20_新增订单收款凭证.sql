BEGIN;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS paid_amount numeric(12, 2);

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS payment_proof_image_urls json;

UPDATE orders
SET paid_amount = total_amount
WHERE status = 'completed'
  AND paid_amount IS NULL;

UPDATE orders
SET payment_proof_image_urls = '[]'::json
WHERE status = 'completed'
  AND payment_proof_image_urls IS NULL;

DO $$
BEGIN
    ALTER TABLE orders
        ADD CONSTRAINT ck_orders_paid_amount_range CHECK (
            paid_amount IS NULL
            OR (paid_amount > 0 AND paid_amount <= total_amount)
        );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE orders
        ADD CONSTRAINT ck_orders_payment_proof_image_urls_array CHECK (
            payment_proof_image_urls IS NULL
            OR json_typeof(payment_proof_image_urls) = 'array'
        );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

COMMENT ON COLUMN orders.paid_amount IS '实际收款金额，用于客户累计消费统计';
COMMENT ON COLUMN orders.payment_proof_image_urls IS '付款凭证图片URL列表';

COMMIT;
