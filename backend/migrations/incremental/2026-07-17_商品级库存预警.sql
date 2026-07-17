BEGIN;

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS warning_quantity INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_products_warning_quantity_nonnegative'
    ) THEN
        ALTER TABLE products
            ADD CONSTRAINT ck_products_warning_quantity_nonnegative
            CHECK (warning_quantity >= 0);
    END IF;
END $$;

COMMENT ON COLUMN products.warning_quantity IS '商品库存预警阈值';

ALTER TABLE inventory
    DROP COLUMN IF EXISTS warning_quantity;

COMMIT;
