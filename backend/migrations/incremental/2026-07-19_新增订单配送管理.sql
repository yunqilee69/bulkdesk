BEGIN;

DO $$
BEGIN
    CREATE TYPE order_delivery_status AS ENUM ('delivering', 'signed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE order_delivery_event_type AS ENUM (
        'assigned',
        'reassigned',
        'exception',
        'signed'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE order_delivery_exception_type AS ENUM (
        'customer_absent',
        'customer_refused',
        'invalid_contact',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS order_deliveries (
    id uuid PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES orders(id),
    delivery_employee_id uuid NOT NULL REFERENCES employees(id),
    delivery_employee_name character varying(100) NOT NULL,
    status order_delivery_status NOT NULL DEFAULT 'delivering',
    recipient_name character varying(100) NOT NULL,
    recipient_phone character varying(20) NOT NULL,
    delivery_address character varying(500) NOT NULL,
    assigned_at timestamp without time zone NOT NULL DEFAULT now(),
    assigned_by_id uuid NOT NULL REFERENCES employees(id),
    assigned_by_name character varying(100) NOT NULL,
    signer_name character varying(100),
    proof_image_urls json,
    sign_remark text,
    signed_at timestamp without time zone,
    signed_by_id uuid REFERENCES employees(id),
    signed_by_name character varying(100),
    created_at timestamp without time zone NOT NULL DEFAULT now(),
    updated_at timestamp without time zone NOT NULL DEFAULT now(),
    CONSTRAINT uq_order_deliveries_order_id UNIQUE (order_id),
    CONSTRAINT ck_order_deliveries_signed_fields CHECK (
        status <> 'signed'
        OR (
            signer_name IS NOT NULL
            AND signed_at IS NOT NULL
            AND signed_by_id IS NOT NULL
            AND signed_by_name IS NOT NULL
        )
    ),
    CONSTRAINT ck_order_deliveries_delivering_fields CHECK (
        status <> 'delivering'
        OR (
            signer_name IS NULL
            AND proof_image_urls IS NULL
            AND sign_remark IS NULL
            AND signed_at IS NULL
            AND signed_by_id IS NULL
            AND signed_by_name IS NULL
        )
    ),
    CONSTRAINT ck_order_deliveries_proof_image_urls_array CHECK (
        proof_image_urls IS NULL
        OR json_typeof(proof_image_urls) = 'array'
    )
);

CREATE INDEX IF NOT EXISTS ix_order_deliveries_delivery_employee_status
    ON order_deliveries(delivery_employee_id, status);
CREATE INDEX IF NOT EXISTS ix_order_deliveries_status_signed_at
    ON order_deliveries(status, signed_at);

CREATE TABLE IF NOT EXISTS order_delivery_events (
    id uuid PRIMARY KEY,
    delivery_id uuid NOT NULL REFERENCES order_deliveries(id),
    event_type order_delivery_event_type NOT NULL,
    from_employee_id uuid REFERENCES employees(id),
    from_employee_name character varying(100),
    to_employee_id uuid REFERENCES employees(id),
    to_employee_name character varying(100),
    exception_type order_delivery_exception_type,
    remark text,
    operator_id uuid NOT NULL REFERENCES employees(id),
    operator_name character varying(100) NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_order_delivery_events_delivery_created_at
    ON order_delivery_events(delivery_id, created_at);
CREATE INDEX IF NOT EXISTS ix_order_delivery_events_event_type_delivery_created_at
    ON order_delivery_events(event_type, delivery_id, created_at);

COMMENT ON TABLE order_deliveries IS '订单配送记录';
COMMENT ON COLUMN order_deliveries.order_id IS '销售订单ID，一单一条配送记录';
COMMENT ON COLUMN order_deliveries.delivery_employee_id IS '当前配送员ID';
COMMENT ON COLUMN order_deliveries.delivery_employee_name IS '当前配送员姓名快照';
COMMENT ON COLUMN order_deliveries.status IS '配送状态';
COMMENT ON COLUMN order_deliveries.recipient_name IS '收货联系人快照';
COMMENT ON COLUMN order_deliveries.recipient_phone IS '联系电话快照';
COMMENT ON COLUMN order_deliveries.delivery_address IS '配送地址快照';
COMMENT ON COLUMN order_deliveries.assigned_at IS '首次分配时间';
COMMENT ON COLUMN order_deliveries.assigned_by_id IS '首次分配操作员工ID';
COMMENT ON COLUMN order_deliveries.signer_name IS '实际签收人姓名';
COMMENT ON COLUMN order_deliveries.proof_image_urls IS '签收凭证图片URL列表';
COMMENT ON COLUMN order_deliveries.sign_remark IS '签收备注';
COMMENT ON COLUMN order_deliveries.signed_at IS '签收时间';
COMMENT ON COLUMN order_deliveries.signed_by_id IS '签收登记操作员工ID';

COMMENT ON TABLE order_delivery_events IS '订单配送事件记录';
COMMENT ON COLUMN order_delivery_events.delivery_id IS '订单配送记录ID';
COMMENT ON COLUMN order_delivery_events.event_type IS '配送事件类型';
COMMENT ON COLUMN order_delivery_events.from_employee_id IS '改派前配送员ID';
COMMENT ON COLUMN order_delivery_events.to_employee_id IS '分配或改派后的配送员ID';
COMMENT ON COLUMN order_delivery_events.exception_type IS '配送异常类型';
COMMENT ON COLUMN order_delivery_events.remark IS '改派、异常或签收备注';
COMMENT ON COLUMN order_delivery_events.operator_id IS '事件操作员工ID';

DO $$
DECLARE
    actual_enum_labels text[];
    actual_constraint_type text;
    actual_index_columns text[];
    required_enum record;
    required_table text;
    required_constraint record;
    required_index record;
BEGIN
    FOR required_enum IN
        SELECT *
        FROM (
            VALUES
                (
                    'order_delivery_status',
                    ARRAY['delivering', 'signed']::text[]
                ),
                (
                    'order_delivery_event_type',
                    ARRAY['assigned', 'reassigned', 'exception', 'signed']::text[]
                ),
                (
                    'order_delivery_exception_type',
                    ARRAY[
                        'customer_absent',
                        'customer_refused',
                        'invalid_contact',
                        'other'
                    ]::text[]
                )
        ) AS expected(enum_name, enum_labels)
    LOOP
        SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
        INTO actual_enum_labels
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = current_schema()
          AND t.typname = required_enum.enum_name;

        IF actual_enum_labels IS DISTINCT FROM required_enum.enum_labels THEN
            RAISE EXCEPTION
                '枚举 % 标签不兼容，期望 %，实际 %',
                required_enum.enum_name,
                required_enum.enum_labels,
                actual_enum_labels;
        END IF;
    END LOOP;

    FOR required_table IN
        SELECT unnest(ARRAY['order_deliveries', 'order_delivery_events']::text[])
    LOOP
        IF to_regclass(format('%I.%I', current_schema(), required_table)) IS NULL THEN
            RAISE EXCEPTION '缺少配送管理数据表 %', required_table;
        END IF;
    END LOOP;

    FOR required_constraint IN
        SELECT *
        FROM (
            VALUES
                ('order_deliveries', 'uq_order_deliveries_order_id', 'u'),
                ('order_deliveries', 'ck_order_deliveries_signed_fields', 'c'),
                ('order_deliveries', 'ck_order_deliveries_delivering_fields', 'c'),
                (
                    'order_deliveries',
                    'ck_order_deliveries_proof_image_urls_array',
                    'c'
                ),
                ('order_deliveries', 'order_deliveries_order_id_fkey', 'f'),
                (
                    'order_deliveries',
                    'order_deliveries_delivery_employee_id_fkey',
                    'f'
                ),
                ('order_deliveries', 'order_deliveries_assigned_by_id_fkey', 'f'),
                ('order_deliveries', 'order_deliveries_signed_by_id_fkey', 'f'),
                (
                    'order_delivery_events',
                    'order_delivery_events_delivery_id_fkey',
                    'f'
                ),
                (
                    'order_delivery_events',
                    'order_delivery_events_from_employee_id_fkey',
                    'f'
                ),
                (
                    'order_delivery_events',
                    'order_delivery_events_to_employee_id_fkey',
                    'f'
                ),
                (
                    'order_delivery_events',
                    'order_delivery_events_operator_id_fkey',
                    'f'
                )
        ) AS expected(table_name, constraint_name, constraint_type)
    LOOP
        SELECT c.contype::text
        INTO actual_constraint_type
        FROM pg_constraint c
        JOIN pg_class r ON r.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = r.relnamespace
        WHERE n.nspname = current_schema()
          AND r.relname = required_constraint.table_name
          AND c.conname = required_constraint.constraint_name;

        IF actual_constraint_type IS DISTINCT FROM required_constraint.constraint_type THEN
            RAISE EXCEPTION
                '约束 %.% 缺失或类型不兼容，期望类型 %，实际类型 %',
                required_constraint.table_name,
                required_constraint.constraint_name,
                required_constraint.constraint_type,
                actual_constraint_type;
        END IF;
    END LOOP;

    FOR required_index IN
        SELECT *
        FROM (
            VALUES
                (
                    'order_deliveries',
                    'ix_order_deliveries_delivery_employee_status',
                    ARRAY['delivery_employee_id', 'status']::text[]
                ),
                (
                    'order_deliveries',
                    'ix_order_deliveries_status_signed_at',
                    ARRAY['status', 'signed_at']::text[]
                ),
                (
                    'order_delivery_events',
                    'ix_order_delivery_events_delivery_created_at',
                    ARRAY['delivery_id', 'created_at']::text[]
                ),
                (
                    'order_delivery_events',
                    'ix_order_delivery_events_event_type_delivery_created_at',
                    ARRAY['event_type', 'delivery_id', 'created_at']::text[]
                )
        ) AS expected(table_name, index_name, index_columns)
    LOOP
        SELECT array_agg(a.attname::text ORDER BY key.ordinality)
        INTO actual_index_columns
        FROM pg_index i
        JOIN pg_class r ON r.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = r.relnamespace
        JOIN pg_class index_relation ON index_relation.oid = i.indexrelid
        JOIN LATERAL unnest(i.indkey::smallint[]) WITH ORDINALITY
            AS key(attnum, ordinality) ON true
        JOIN pg_attribute a
            ON a.attrelid = r.oid
           AND a.attnum = key.attnum
        WHERE n.nspname = current_schema()
          AND r.relname = required_index.table_name
          AND index_relation.relname = required_index.index_name
          AND key.ordinality <= i.indnkeyatts
          AND i.indisvalid
          AND i.indisready;

        IF actual_index_columns IS DISTINCT FROM required_index.index_columns THEN
            RAISE EXCEPTION
                '索引 %.% 缺失或列顺序不兼容，期望 %，实际 %',
                required_index.table_name,
                required_index.index_name,
                required_index.index_columns,
                actual_index_columns;
        END IF;
    END LOOP;
END
$$;

COMMIT;
