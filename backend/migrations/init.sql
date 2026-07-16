-- ============================================================
-- BulkDesk - 固化数据库初始化脚本
-- 生成时间: 2026-07-09
-- 说明: 基于当前 SQLAlchemy 模型固化的初始化版本，替代历史增量变更记录
-- 数据库: PostgreSQL
-- ============================================================

-- 枚举类型
CREATE TYPE category_status AS ENUM ('active', 'disabled');
CREATE TYPE product_status AS ENUM ('active', 'disabled');
CREATE TYPE variant_status AS ENUM ('active', 'disabled');
CREATE TYPE price_field_name AS ENUM ('price', 'cost_price');
CREATE TYPE spec_status AS ENUM ('active', 'disabled');
CREATE TYPE brand_status AS ENUM ('active', 'disabled');
CREATE TYPE employee_role AS ENUM ('admin', 'normal');
CREATE TYPE employee_status AS ENUM ('active', 'disabled');
CREATE TYPE movement_type AS ENUM (
    'stock_in',
    'stock_out',
    'transfer_in',
    'transfer_out',
    'stocktake_adjustment',
    'order_deduction',
    'order_return'
);
CREATE TYPE supplier_status AS ENUM ('active', 'disabled');
CREATE TYPE warehouse_status AS ENUM ('active', 'disabled');
CREATE TYPE order_status AS ENUM ('placed', 'shipped', 'paid', 'completed', 'cancelled');
CREATE TYPE order_from_status AS ENUM ('placed', 'shipped', 'paid', 'completed', 'cancelled');
CREATE TYPE order_to_status AS ENUM ('placed', 'shipped', 'paid', 'completed', 'cancelled');

-- ============================================================
-- 员工模块
-- ============================================================
CREATE TABLE employees (
    id UUID NOT NULL,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    role employee_role NOT NULL DEFAULT 'normal',
    status employee_status NOT NULL DEFAULT 'active',
    last_login_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    UNIQUE (username)
);

-- 默认管理员账号：admin / 123456
-- 密码使用 app.core.security 中一致的 bcrypt 算法哈希保存。
INSERT INTO employees (
    id,
    username,
    password_hash,
    name,
    role,
    status
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'admin',
    '$2b$12$sCT4bh7/rh.XIh8y29yUVu68meD3K/bt0qtLTyzTtx8yRn/8khegS',
    '系统管理员',
    'admin',
    'active'
) ON CONFLICT (username) DO NOTHING;

-- ============================================================
-- 客户模块
-- ============================================================
CREATE TABLE customer_levels (
    id UUID NOT NULL,
    name VARCHAR(50) NOT NULL,
    min_spent NUMERIC(12, 2) NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    UNIQUE (name)
);

CREATE TABLE customers (
    id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    contact_name VARCHAR(50) NOT NULL,
    contact_phone VARCHAR(20) NOT NULL,
    level_id UUID NOT NULL,
    address TEXT,
    remark TEXT,
    image_urls JSON,
    total_spent NUMERIC(12, 2) NOT NULL DEFAULT 0,
    order_count INTEGER NOT NULL DEFAULT 0,
    last_order_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    UNIQUE (contact_phone),
    FOREIGN KEY (level_id) REFERENCES customer_levels (id)
);

-- ============================================================
-- 商品模块
-- ============================================================
CREATE TABLE categories (
    id UUID NOT NULL,
    name VARCHAR(100) NOT NULL UNIQUE,
    status category_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id)
);

CREATE TABLE brands (
    id UUID NOT NULL,
    name VARCHAR(100) NOT NULL UNIQUE,
    logo_url VARCHAR(500),
    description VARCHAR(255),
    sort_order BIGINT NOT NULL DEFAULT 0,
    status brand_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id)
);

CREATE TABLE products (
    id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    short_name VARCHAR(100),
    barcode VARCHAR(50) NOT NULL UNIQUE,
    category_id UUID NOT NULL REFERENCES categories(id),
    brand_id UUID REFERENCES brands(id),
    specification VARCHAR(200),
    unit VARCHAR(20) NOT NULL,
    standard_price NUMERIC(12,2) NOT NULL,
    cost_price NUMERIC(12,2) NOT NULL,
    description TEXT,
    image_urls JSON,
    status product_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id)
);

CREATE TABLE price_change_logs (
    id UUID NOT NULL,
    product_id UUID NOT NULL REFERENCES products(id),
    price_type VARCHAR(30) NOT NULL,
    level_id UUID REFERENCES customer_levels(id),
    old_value NUMERIC(12,2),
    new_value NUMERIC(12,2) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    operator_id UUID REFERENCES employees(id),
    operator_name VARCHAR(100),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id)
);

CREATE TABLE member_prices (
    id UUID NOT NULL,
    product_id UUID NOT NULL REFERENCES products(id),
    level_id UUID NOT NULL REFERENCES customer_levels(id),
    price NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    UNIQUE (product_id, level_id)
);

CREATE TABLE level_change_logs (
    id UUID NOT NULL,
    customer_id UUID NOT NULL,
    from_level_id UUID,
    to_level_id UUID NOT NULL,
    reason VARCHAR(255),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    FOREIGN KEY (customer_id) REFERENCES customers (id),
    FOREIGN KEY (from_level_id) REFERENCES customer_levels (id),
    FOREIGN KEY (to_level_id) REFERENCES customer_levels (id)
);

-- ============================================================
-- 库存模块
-- ============================================================
CREATE TABLE suppliers (
    id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    contact_person VARCHAR(100),
    contact_phone VARCHAR(20),
    address VARCHAR(255),
    remark VARCHAR(255),
    status supplier_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id)
);

CREATE TABLE warehouses (
    id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    address VARCHAR(255),
    remark VARCHAR(255),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    contact_person VARCHAR(100),
    contact_phone VARCHAR(20),
    status warehouse_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id)
);

CREATE TABLE inventory (
    id UUID NOT NULL,
    product_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    locked INTEGER NOT NULL DEFAULT 0,
    warning_quantity INTEGER NOT NULL DEFAULT 0,
    supplier_id UUID,
    production_date DATE,
    expiry_date DATE,
    location VARCHAR(100),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    UNIQUE (product_id, warehouse_id),
    FOREIGN KEY (product_id) REFERENCES products (id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses (id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
);

CREATE TABLE inventory_movements (
    id UUID NOT NULL,
    order_no VARCHAR(64) NOT NULL,
    movement_type movement_type NOT NULL,
    warehouse_id UUID NOT NULL,
    from_warehouse_id UUID,
    to_warehouse_id UUID,
    supplier_id UUID,
    operator VARCHAR(100),
    remark VARCHAR(255),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    UNIQUE (order_no),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses (id),
    FOREIGN KEY (from_warehouse_id) REFERENCES warehouses (id),
    FOREIGN KEY (to_warehouse_id) REFERENCES warehouses (id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
);

CREATE TABLE inventory_movement_items (
    id UUID NOT NULL,
    movement_id UUID NOT NULL,
    product_id UUID NOT NULL,
    barcode VARCHAR(100) NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    brand_name VARCHAR(100),
    quantity INTEGER NOT NULL,
    before_quantity INTEGER NOT NULL DEFAULT 0,
    after_quantity INTEGER NOT NULL DEFAULT 0,
    cost_price NUMERIC(12, 2),
    subtotal NUMERIC(12, 2),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    FOREIGN KEY (movement_id) REFERENCES inventory_movements (id),
    FOREIGN KEY (product_id) REFERENCES products (id)
);

-- ============================================================
-- 订单模块
-- ============================================================
CREATE TABLE orders (
    id UUID NOT NULL,
    order_no VARCHAR(64) NOT NULL,
    customer_id UUID NOT NULL,
    warehouse_id UUID NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    status order_status NOT NULL DEFAULT 'placed',
    remark VARCHAR(255),
    shipped_at TIMESTAMP WITHOUT TIME ZONE,
    paid_at TIMESTAMP WITHOUT TIME ZONE,
    cancelled_at TIMESTAMP WITHOUT TIME ZONE,
    cancel_reason TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    UNIQUE (order_no),
    FOREIGN KEY (customer_id) REFERENCES customers (id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses (id)
);

CREATE TABLE order_items (
    id UUID NOT NULL,
    order_id UUID NOT NULL,
    product_id UUID NOT NULL,
    barcode VARCHAR(100) NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    FOREIGN KEY (order_id) REFERENCES orders (id),
    FOREIGN KEY (product_id) REFERENCES products (id)
);

CREATE TABLE order_status_logs (
    id UUID NOT NULL,
    order_id UUID NOT NULL,
    from_status order_from_status,
    to_status order_to_status NOT NULL,
    operator VARCHAR(100),
    remark VARCHAR(255),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id),
    FOREIGN KEY (order_id) REFERENCES orders (id)
);

-- ============================================================
-- 表与字段注释
-- ============================================================
COMMENT ON TABLE employees IS '员工账号与登录信息';
COMMENT ON COLUMN employees.id IS '主键';
COMMENT ON COLUMN employees.username IS '登录用户名';
COMMENT ON COLUMN employees.password_hash IS '密码哈希';
COMMENT ON COLUMN employees.name IS '员工姓名';
COMMENT ON COLUMN employees.phone IS '联系电话';
COMMENT ON COLUMN employees.role IS '员工角色：admin 管理员，normal 普通员工';
COMMENT ON COLUMN employees.status IS '账号状态：active 启用，disabled 停用';
COMMENT ON COLUMN employees.last_login_at IS '最后登录时间';
COMMENT ON COLUMN employees.created_at IS '创建时间';
COMMENT ON COLUMN employees.updated_at IS '更新时间';

COMMENT ON TABLE customer_levels IS '客户等级规则';
COMMENT ON COLUMN customer_levels.id IS '主键';
COMMENT ON COLUMN customer_levels.name IS '等级名称';
COMMENT ON COLUMN customer_levels.min_spent IS '升级所需最低累计消费金额';
COMMENT ON COLUMN customer_levels.sort_order IS '排序值，数值越小越靠前';
COMMENT ON COLUMN customer_levels.is_default IS '是否为新客户默认等级';
COMMENT ON COLUMN customer_levels.created_at IS '创建时间';

COMMENT ON TABLE customers IS '客户基础资料与消费汇总';
COMMENT ON COLUMN customers.id IS '主键';
COMMENT ON COLUMN customers.name IS '客户名称';
COMMENT ON COLUMN customers.contact_name IS '联系人姓名';
COMMENT ON COLUMN customers.contact_phone IS '联系人电话';
COMMENT ON COLUMN customers.level_id IS '客户等级 ID';
COMMENT ON COLUMN customers.address IS '联系地址';
COMMENT ON COLUMN customers.remark IS '备注';
COMMENT ON COLUMN customers.image_urls IS '客户图片 URL 列表';
COMMENT ON COLUMN customers.total_spent IS '累计消费金额';
COMMENT ON COLUMN customers.order_count IS '已完成订单数量';
COMMENT ON COLUMN customers.last_order_at IS '最近下单时间';
COMMENT ON COLUMN customers.created_at IS '创建时间';
COMMENT ON COLUMN customers.updated_at IS '更新时间';

COMMENT ON TABLE categories IS '商品分类';
COMMENT ON COLUMN categories.id IS '主键';
COMMENT ON COLUMN categories.name IS '分类名称';
COMMENT ON COLUMN categories.parent_id IS '父级分类 ID，空表示一级分类';
COMMENT ON COLUMN categories.sort_order IS '排序值，数值越小越靠前';
COMMENT ON COLUMN categories.status IS '状态：active 启用，disabled 停用';
COMMENT ON COLUMN categories.created_at IS '创建时间';
COMMENT ON COLUMN categories.updated_at IS '更新时间';

COMMENT ON TABLE brands IS '商品品牌';
COMMENT ON COLUMN brands.id IS '主键';
COMMENT ON COLUMN brands.name IS '品牌名称';
COMMENT ON COLUMN brands.logo_url IS '品牌 Logo 地址';
COMMENT ON COLUMN brands.description IS '品牌描述';
COMMENT ON COLUMN brands.sort_order IS '排序值，数值越小越靠前';
COMMENT ON COLUMN brands.status IS '状态：active 启用，disabled 停用';
COMMENT ON COLUMN brands.created_at IS '创建时间';
COMMENT ON COLUMN brands.updated_at IS '更新时间';

COMMENT ON TABLE products IS '商品 SPU 基础资料';
COMMENT ON COLUMN products.id IS '主键';
COMMENT ON COLUMN products.name IS '商品名称';
COMMENT ON COLUMN products.brand_id IS '品牌 ID';
COMMENT ON COLUMN products.unit IS '计量单位';
COMMENT ON COLUMN products.barcode IS '商品条码';
COMMENT ON COLUMN products.sort_order IS '排序值，数值越小越靠前';
COMMENT ON COLUMN products.description IS '商品描述';
COMMENT ON COLUMN products.image_urls IS '商品图片 URL 列表';
COMMENT ON COLUMN products.status IS '状态：active 启用，disabled 停用';
COMMENT ON COLUMN products.created_at IS '创建时间';
COMMENT ON COLUMN products.updated_at IS '更新时间';


COMMENT ON TABLE products IS '商品 商品';
COMMENT ON COLUMN products.id IS '主键';
COMMENT ON COLUMN products.product_id IS '所属商品 ID';
COMMENT ON COLUMN products.barcode IS '商品 编码';
COMMENT ON COLUMN products.name IS '商品 名称';
COMMENT ON COLUMN products.price IS '销售单价';
COMMENT ON COLUMN products.cost_price IS '成本单价';
COMMENT ON COLUMN products.barcode IS '商品 条码';
COMMENT ON COLUMN products.image_url IS '商品 图片地址';
COMMENT ON COLUMN products.compare_at_price IS '划线价';
COMMENT ON COLUMN products.status IS '状态：active 启用，disabled 停用';
COMMENT ON COLUMN products.created_at IS '创建时间';
COMMENT ON COLUMN products.updated_at IS '更新时间';



COMMENT ON TABLE price_change_logs IS '商品 价格变更记录';
COMMENT ON COLUMN price_change_logs.id IS '主键';
COMMENT ON COLUMN price_change_logs.product_id IS '商品 ID';
COMMENT ON COLUMN price_change_logs.field IS '变更字段：price 销售价，cost_price 成本价';
COMMENT ON COLUMN price_change_logs.old_value IS '变更前金额';
COMMENT ON COLUMN price_change_logs.new_value IS '变更后金额';
COMMENT ON COLUMN price_change_logs.reason IS '变更原因';
COMMENT ON COLUMN price_change_logs.operator IS '操作人';
COMMENT ON COLUMN price_change_logs.created_at IS '创建时间';

COMMENT ON TABLE member_prices IS '客户等级 商品 会员价';
COMMENT ON COLUMN member_prices.id IS '主键';
COMMENT ON COLUMN member_prices.product_id IS '商品 ID';
COMMENT ON COLUMN member_prices.level_id IS '客户等级 ID';
COMMENT ON COLUMN member_prices.price IS '会员销售单价';
COMMENT ON COLUMN member_prices.created_at IS '创建时间';
COMMENT ON COLUMN member_prices.updated_at IS '更新时间';

COMMENT ON TABLE level_change_logs IS '客户等级变更记录';
COMMENT ON COLUMN level_change_logs.id IS '主键';
COMMENT ON COLUMN level_change_logs.customer_id IS '客户 ID';
COMMENT ON COLUMN level_change_logs.from_level_id IS '变更前客户等级 ID';
COMMENT ON COLUMN level_change_logs.to_level_id IS '变更后客户等级 ID';
COMMENT ON COLUMN level_change_logs.reason IS '变更原因';
COMMENT ON COLUMN level_change_logs.created_at IS '创建时间';

COMMENT ON TABLE suppliers IS '供应商资料';
COMMENT ON COLUMN suppliers.id IS '主键';
COMMENT ON COLUMN suppliers.name IS '供应商名称';
COMMENT ON COLUMN suppliers.contact_person IS '联系人';
COMMENT ON COLUMN suppliers.contact_phone IS '联系电话';
COMMENT ON COLUMN suppliers.address IS '地址';
COMMENT ON COLUMN suppliers.remark IS '备注';
COMMENT ON COLUMN suppliers.status IS '状态：active 启用，disabled 停用';
COMMENT ON COLUMN suppliers.created_at IS '创建时间';
COMMENT ON COLUMN suppliers.updated_at IS '更新时间';

COMMENT ON TABLE warehouses IS '仓库资料';
COMMENT ON COLUMN warehouses.id IS '主键';
COMMENT ON COLUMN warehouses.name IS '仓库名称';
COMMENT ON COLUMN warehouses.address IS '仓库地址';
COMMENT ON COLUMN warehouses.remark IS '备注';
COMMENT ON COLUMN warehouses.is_default IS '是否为默认仓库';
COMMENT ON COLUMN warehouses.contact_person IS '仓库联系人';
COMMENT ON COLUMN warehouses.contact_phone IS '仓库联系电话';
COMMENT ON COLUMN warehouses.status IS '状态：active 启用，disabled 停用';
COMMENT ON COLUMN warehouses.created_at IS '创建时间';
COMMENT ON COLUMN warehouses.updated_at IS '更新时间';

COMMENT ON TABLE inventory IS '商品 仓库库存';
COMMENT ON COLUMN inventory.id IS '主键';
COMMENT ON COLUMN inventory.product_id IS '商品 ID';
COMMENT ON COLUMN inventory.warehouse_id IS '仓库 ID';
COMMENT ON COLUMN inventory.quantity IS '可用库存数量';
COMMENT ON COLUMN inventory.locked IS '订单锁定库存数量';
COMMENT ON COLUMN inventory.warning_quantity IS '库存预警阈值';
COMMENT ON COLUMN inventory.supplier_id IS '供应商 ID';
COMMENT ON COLUMN inventory.production_date IS '生产日期';
COMMENT ON COLUMN inventory.expiry_date IS '到期日期';
COMMENT ON COLUMN inventory.location IS '库位';
COMMENT ON COLUMN inventory.created_at IS '创建时间';
COMMENT ON COLUMN inventory.updated_at IS '更新时间';

COMMENT ON TABLE inventory_movements IS '库存出入库与调拨单据';
COMMENT ON COLUMN inventory_movements.id IS '主键';
COMMENT ON COLUMN inventory_movements.order_no IS '库存单号';
COMMENT ON COLUMN inventory_movements.movement_type IS '流水类型';
COMMENT ON COLUMN inventory_movements.warehouse_id IS '业务仓库 ID';
COMMENT ON COLUMN inventory_movements.from_warehouse_id IS '调出仓库 ID';
COMMENT ON COLUMN inventory_movements.to_warehouse_id IS '调入仓库 ID';
COMMENT ON COLUMN inventory_movements.supplier_id IS '供应商 ID';
COMMENT ON COLUMN inventory_movements.operator IS '操作人';
COMMENT ON COLUMN inventory_movements.remark IS '备注';
COMMENT ON COLUMN inventory_movements.created_at IS '创建时间';
COMMENT ON COLUMN inventory_movements.updated_at IS '更新时间';

COMMENT ON TABLE inventory_movement_items IS '库存单据明细';
COMMENT ON COLUMN inventory_movement_items.id IS '主键';
COMMENT ON COLUMN inventory_movement_items.movement_id IS '库存单据 ID';
COMMENT ON COLUMN inventory_movement_items.product_id IS '商品 ID';
COMMENT ON COLUMN inventory_movement_items.barcode IS '商品 编码快照';
COMMENT ON COLUMN inventory_movement_items.product_name IS '商品 名称快照';
COMMENT ON COLUMN inventory_movement_items.brand_name IS '品牌名称快照';
COMMENT ON COLUMN inventory_movement_items.quantity IS '变动数量';
COMMENT ON COLUMN inventory_movement_items.before_quantity IS '变动前库存数量';
COMMENT ON COLUMN inventory_movement_items.after_quantity IS '变动后库存数量';
COMMENT ON COLUMN inventory_movement_items.cost_price IS '成本单价快照';
COMMENT ON COLUMN inventory_movement_items.subtotal IS '成本小计';
COMMENT ON COLUMN inventory_movement_items.created_at IS '创建时间';
COMMENT ON COLUMN inventory_movement_items.updated_at IS '更新时间';

COMMENT ON TABLE orders IS '销售订单';
COMMENT ON COLUMN orders.id IS '主键';
COMMENT ON COLUMN orders.order_no IS '订单号';
COMMENT ON COLUMN orders.customer_id IS '客户 ID';
COMMENT ON COLUMN orders.warehouse_id IS '发货仓库 ID';
COMMENT ON COLUMN orders.total_amount IS '订单总金额';
COMMENT ON COLUMN orders.status IS '订单状态：placed、shipped、paid、completed、cancelled';
COMMENT ON COLUMN orders.remark IS '备注';
COMMENT ON COLUMN orders.shipped_at IS '发货时间';
COMMENT ON COLUMN orders.paid_at IS '付款时间';
COMMENT ON COLUMN orders.cancelled_at IS '取消时间';
COMMENT ON COLUMN orders.cancel_reason IS '取消原因';
COMMENT ON COLUMN orders.created_at IS '创建时间';
COMMENT ON COLUMN orders.updated_at IS '更新时间';

COMMENT ON TABLE order_items IS '销售订单明细';
COMMENT ON COLUMN order_items.id IS '主键';
COMMENT ON COLUMN order_items.order_id IS '订单 ID';
COMMENT ON COLUMN order_items.product_id IS '商品 ID';
COMMENT ON COLUMN order_items.barcode IS '商品 编码快照';
COMMENT ON COLUMN order_items.product_name IS '商品 名称快照';
COMMENT ON COLUMN order_items.quantity IS '购买数量';
COMMENT ON COLUMN order_items.unit_price IS '成交单价';
COMMENT ON COLUMN order_items.subtotal IS '明细小计';
COMMENT ON COLUMN order_items.created_at IS '创建时间';
COMMENT ON COLUMN order_items.updated_at IS '更新时间';

COMMENT ON TABLE order_status_logs IS '订单状态流转记录';
COMMENT ON COLUMN order_status_logs.id IS '主键';
COMMENT ON COLUMN order_status_logs.order_id IS '订单 ID';
COMMENT ON COLUMN order_status_logs.from_status IS '变更前订单状态';
COMMENT ON COLUMN order_status_logs.to_status IS '变更后订单状态';
COMMENT ON COLUMN order_status_logs.operator IS '操作人';
COMMENT ON COLUMN order_status_logs.remark IS '备注';
COMMENT ON COLUMN order_status_logs.created_at IS '创建时间';
