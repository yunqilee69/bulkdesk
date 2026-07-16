# 批掌柜 BulkDesk — 整体架构与业务流程

## 系统定位

批掌柜 BulkDesk 是一个面向小微批发贸易场景的 B 端经营管理平台，核心业务是管理商品从入库到销售出库的全生命周期。系统采用"先发货后收款"的批发模式，支持多仓库、多客户等级的差异化定价。

## 技术栈

| 层次 | 技术选型 |
|------|----------|
| 前端 | React 19 + Umi Max 4 + Ant Design 6 + ProComponents 3 + Tailwind CSS v4 |
| 后端 | Python 3.12 + FastAPI + SQLAlchemy 2.0 (async) + Alembic |
| 数据库 | PostgreSQL (主存储) + Redis (JWT 黑名单) |
| 对象存储 | MinIO (S3 兼容，图片/文件) |
| 部署 | 前端 port 8001 (Umi dev server 代理 API)，后端 port 8000 |

## 数据库连接与 SQL 执行

当前开发数据库连接以 DBX MCP 为准：

| 服务 | DBX MCP 连接 | 地址 | 说明 |
|------|--------------|------|------|
| PostgreSQL | `postgres` | `43.142.121.125:15432` | 默认数据库 `postgres`，用户 `postgres` |
| Redis | `redis` | `43.142.121.125:16379` | 默认 DB 0，用于 JWT 黑名单 |

后续查询或执行 SQL 时，优先使用 DBX MCP 的 `postgres` 连接；Redis 命令使用 DBX MCP 的 `redis` 连接。仓库只保留默认连接示例，敏感凭据通过 DBX 本机配置或 `.env` 注入。

数据库 schema 已固化为一个初始化版本：`backend/migrations/init.sql` 与 `backend/migrations/versions/75f80d2c9c04_initial_schema.py`。历史增量 SQL 修正不再单独保留，新环境直接执行 `alembic upgrade head` 初始化。

## 系统架构

```
┌──────────────────────────────────────────────────────────┐
│                       前端 (React)                        │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ │
│  │ 仪表盘│ │ 员工  │ │ 客户  │ │ 商品  │ │ 库存  │ │ 订单  │ │
│  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ │
│     └────────┴────────┴────────┴────────┴────────┘      │
│                     Umi Request                           │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTP (REST API)
                       ▼
┌──────────────────────────────────────────────────────────┐
│                     后端 (FastAPI)                        │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                   API Layer (v1)                     │ │
│  │  auth | employee | customer | product | inventory   │ │
│  │  level | order | spec | upload                      │ │
│  └─────────────────────┬───────────────────────────────┘ │
│  ┌─────────────────────┴───────────────────────────────┐ │
│  │                  Service Layer                       │ │
│  │  认证 | 员工 | 客户 | 商品 | 库存 | 订单 | 等级      │ │
│  └─────────────────────┬───────────────────────────────┘ │
│  ┌─────────────────────┴───────────────────────────────┐ │
│  │                  Model Layer (SQLAlchemy)             │ │
│  │  Employee | Customer | Product | Inventory | Order   │ │
│  └─────────────────────┬───────────────────────────────┘ │
└────────────────────────┼─────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
     PostgreSQL        Redis          MinIO
     (业务数据)    (JWT 黑名单)    (图片/文件)
```

## 模块关系

```
                     ┌─────────┐
                     │  认证    │ (横切关注点，所有接口鉴权)
                     └─────────┘
                          │
         ┌────────────────┼────────────────────┐
         ▼                ▼                    ▼
   ┌──────────┐    ┌──────────┐         ┌──────────┐
   │  员工管理  │    │  客户管理  │         │  系统设置  │
   │          │    │          │         │          │
   │ Employee │    │ Customer │         │ Category │
   │          │    │ Level    │         │ Brand    │
   │          │    │ MemberP. │         │ Spec     │
   └──────────┘    └────┬─────┘         └────┬─────┘
                        │                    │
                        ▼                    ▼
                  ┌──────────────────────────────┐
                  │         商品管理              │
                  │                              │
                  │  Product ── ProductVariant   │
                  │  (商品)      (SKU)           │
                  └──────────┬───────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼                             ▼
     ┌──────────────┐              ┌──────────────┐
     │   库存管理    │◄────────────►│   订单管理    │
     │              │   库存锁定/   │              │
     │ Inventory    │   扣减/恢复   │ Order        │
     │ Warehouse    │              │ OrderItem    │
     │ Supplier     │              │ OrderStatus  │
     │ Movement     │              │ StatusLog    │
     └──────────────┘              └──────────────┘
```

**依赖方向**: 系统设置 → 商品 → 库存 ← 订单 → 客户

## 核心业务流程

### 流程一：从入库到销售完成（正向流程）

这是系统最核心的业务链路，描述了商品从进入仓库到最终完成销售的完整过程。

```
1. 基础数据准备
   ├── 创建分类 (Category): 如"电子产品"、"手机壳"
   ├── 创建品牌 (Brand): 如"华为"、"小米"
   ├── 创建规格 (Spec): 如"颜色=红色"、"尺寸=XL"
   └── 创建仓库 (Warehouse): 如"主仓库"

2. 商品录入
   ├── 创建商品 (Product): 填写名称、品牌、分类
   └── 添加 SKU (ProductVariant): 设置 SKU编码、售价、成本价、规格

3. 库存初始化
   └── 入库操作 (stock-in): SKU + 仓库 → Inventory 记录
       └── quantity += N, 记录 InventoryMovement(type=stock_in)

4. 客户管理
   ├── 创建客户等级 (CustomerLevel): 如"普通会员"、"黄金会员"
   ├── 创建客户 (Customer): 关联等级
   └── 设置会员价 (MemberPrice): 特定SKU + 等级 → 专属价格

5. 订单交易
   ├── 创建订单 (placed):  锁定库存 locked += N
   │   └── 定价: 会员价优先 → 默认售价
   ├── 发货 (shipped):     扣减库存 quantity -= N, locked -= N
   │   └── 记录 InventoryMovement(type=order_deduction)
   ├── 确认付款 (paid):    记录 paid_at
   └── 完成 (completed):   触发客户等级升级检查
       └── 若累计消费 >= 更高等级.min_spent → 自动升级

6. 订单完成后
   └── 客户等级可能自动升级，下次下单享受更低会员价
```

### 流程二：订单取消（逆向流程）

```
从 placed 取消（未发货）:
   └── locked -= N (释放锁定，库存从未扣减)
       └── InventoryMovement(type=stock_out)

从 shipped/paid 取消（已发货）:
   └── quantity += N, locked -= N (恢复已扣减库存 + 释放锁定)
       └── InventoryMovement(type=order_return)
```

### 流程三：库存日常操作

```
入库 (stock-in):      quantity += N          → Movement(stock_in)
出库 (stock-out):     quantity -= N (检查可用) → Movement(stock_out)
调拨 (transfer):      A仓库 quantity -= N    → Movement(transfer_out)
                      B仓库 quantity += N    → Movement(transfer_in)
盘点 (stocktake):     quantity = actual_qty  → Movement(stocktake_adjustment)
                      (要求 actual_qty >= locked)
```

## 数据流向图

```
                                    ┌─────────────┐
                                    │   分类/品牌   │
                                    │   规格/仓库   │
                                    └──────┬──────┘
                                           │ 创建时引用
                                           ▼
┌──────────┐    创建客户     ┌──────────┐    创建商品    ┌──────────┐
│ 客户等级  │──────────────►│   客户    │              │   商品    │
│(Level)   │               │(Customer) │              │(Product) │
│ 会员价   │◄─────────────┤           │              │   SKU    │
│(MemberP.)│   下单时查价   └─────┬─────┘              └─────┬─────┘
└──────────┘                      │                          │
                                  │ 下单                     │ SKU关联
                                  ▼                          ▼
                          ┌──────────────────────────────────────┐
                          │             订单 (Order)              │
                          │  ┌────────────────────────────────┐  │
                          │  │ 订单项 (OrderItem)              │  │
                          │  │  sku_id + quantity + unit_price │  │
                          │  └────────────────────────────────┘  │
                          │  ┌────────────────────────────────┐  │
                          │  │ 状态日志 (OrderStatusLog)       │  │
                          │  │  from → to + operator + time   │  │
                          │  └────────────────────────────────┘  │
                          └───────────────┬──────────────────────┘
                                          │
                          ┌───────────────┼───────────────┐
                          ▼                               ▼
                  创建时: locked += N          发货时: quantity -= N, locked -= N
                  取消(placed): locked -= N    取消(shipped): quantity += N, locked -= N
                                          │
                                          ▼
                               ┌──────────────────┐
                               │  库存 (Inventory)  │
                               │                   │
                               │  quantity (实际)   │
                               │  locked  (锁定)    │
                               │  可用 = qty - lock │
                               └────────┬──────────┘
                                        │ 所有变动
                                        ▼
                               ┌──────────────────┐
                               │  库存流水         │
                               │(InventoryMovement)│
                               │  type + quantity  │
                               │  + sku + warehouse│
                               └──────────────────┘
```

## API 鉴权模型

所有 API 请求需携带 `Authorization: Bearer <access_token>`。

| 权限级别 | 标识 | 可访问接口 |
|----------|------|-----------|
| 未认证 | — | `POST /auth/login`, `POST /auth/refresh` |
| 已认证 | `CurrentUser` | 查询类接口（列表、详情） |
| 管理员 | `AdminUser` | 写操作（创建、编辑、删除、禁用、重置密码） |

## 前端路由结构

```
/                          → 重定向到 /dashboard
/dashboard                 → 仪表盘
/employee                  → 员工管理
/customer/list             → 客户列表
/customer/level            → 等级管理 (含会员价管理 Tab)
/product/list              → 商品列表
/product/price-logs        → 价格变更记录
/inventory/suppliers       → 供应商管理
/inventory/warehouses      → 仓库管理
/inventory/stock           → 库存查询
/inventory/movements       → 库存流水
/order/list                → 订单列表
/system/categories         → 分类管理
/system/specs              → 规格管理
/system/brands             → 品牌管理
/user/login                → 登录页
```

## 各模块详细文档

| 模块 | 文档 |
|------|------|
| 认证 | [auth.md](./auth.md) |
| 员工管理 | [employee.md](./employee.md) |
| 客户管理 | [customer.md](./customer.md) |
| 商品管理 | [product.md](./product.md) |
| 库存管理 | [inventory.md](./inventory.md) |
| 订单管理 | [order.md](./order.md) |
