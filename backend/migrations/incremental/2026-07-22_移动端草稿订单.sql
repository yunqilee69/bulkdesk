BEGIN;

DO $$
BEGIN
    CREATE TYPE order_draft_status AS ENUM ('editing', 'submitted', 'abandoned');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE order_draft_event_type AS ENUM (
        'created',
        'saved',
        'taken_over',
        'abandoned',
        'submitted',
        'submit_failed'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS order_drafts (
    id uuid PRIMARY KEY,
    customer_id uuid NOT NULL REFERENCES customers(id),
    owner_employee_id uuid NOT NULL REFERENCES employees(id),
    status order_draft_status NOT NULL DEFAULT 'editing',
    remark character varying(255),
    version integer NOT NULL DEFAULT 1,
    submitted_order_id uuid REFERENCES orders(id),
    abandoned_at timestamp without time zone,
    created_at timestamp without time zone NOT NULL DEFAULT now(),
    updated_at timestamp without time zone NOT NULL DEFAULT now(),
    CONSTRAINT ck_order_drafts_version_positive CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS order_draft_items (
    id uuid PRIMARY KEY,
    draft_id uuid NOT NULL REFERENCES order_drafts(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id),
    quantity integer NOT NULL,
    remark character varying(255),
    created_at timestamp without time zone NOT NULL DEFAULT now(),
    updated_at timestamp without time zone NOT NULL DEFAULT now(),
    CONSTRAINT uq_order_draft_items_draft_product UNIQUE (draft_id, product_id),
    CONSTRAINT ck_order_draft_items_quantity_positive CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS order_draft_events (
    id uuid PRIMARY KEY,
    draft_id uuid NOT NULL REFERENCES order_drafts(id) ON DELETE CASCADE,
    event_type order_draft_event_type NOT NULL,
    actor_employee_id uuid NOT NULL REFERENCES employees(id),
    actor_employee_name character varying(100) NOT NULL,
    previous_owner_employee_id uuid REFERENCES employees(id),
    previous_owner_employee_name character varying(100),
    new_owner_employee_id uuid REFERENCES employees(id),
    new_owner_employee_name character varying(100),
    version integer NOT NULL,
    remark character varying(255),
    created_at timestamp without time zone NOT NULL DEFAULT now(),
    CONSTRAINT ck_order_draft_events_version_positive CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS order_draft_submissions (
    id uuid PRIMARY KEY,
    draft_id uuid NOT NULL REFERENCES order_drafts(id) ON DELETE CASCADE,
    idempotency_key character varying(100) NOT NULL,
    order_id uuid REFERENCES orders(id),
    created_at timestamp without time zone NOT NULL DEFAULT now(),
    CONSTRAINT uq_order_draft_submissions_draft_idempotency UNIQUE (draft_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_drafts_editing_owner_customer
    ON order_drafts(owner_employee_id, customer_id)
    WHERE status = 'editing';
CREATE INDEX IF NOT EXISTS ix_order_drafts_owner_status_updated_at
    ON order_drafts(owner_employee_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_order_drafts_customer_status_updated_at
    ON order_drafts(customer_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_order_draft_items_draft_id
    ON order_draft_items(draft_id);
CREATE INDEX IF NOT EXISTS ix_order_draft_events_draft_created_at
    ON order_draft_events(draft_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_order_draft_submissions_order_id
    ON order_draft_submissions(order_id);

COMMIT;
