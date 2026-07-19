# 批掌柜 BulkDesk — 功能说明

## 系统概述

面向小微批发商的经营管理系统，用于管理下游超市/零售商客户、商品、库存和订单。

- **后端**: FastAPI + SQLAlchemy (async) + PostgreSQL + Redis + MinIO
- **前端**: Ant Design Pro v6 + Umi Max v4 + React 19 + antd 6
- **文件存储**: MinIO (S3 兼容)

---

## 模块与功能

### 1. 仪表盘

| 功能 | 说明 |
|------|------|
| 数据概览 | 客户总数、商品总数、订单总数、员工总数 |

---

### 2. 员工管理

> 仅管理员可访问

| 功能 | API | 说明 |
|------|-----|------|
| 员工列表 | `GET /api/v1/employees` | 分页、关键词搜索 |
| 创建员工 | `POST /api/v1/employees` | 用户名、密码、角色 |
| 编辑员工 | `PUT /api/v1/employees/{id}` | 修改名称、角色 |
| 禁用/启用 | `PUT /api/v1/employees/{id}/disable` | 切换员工状态 |
| 重置密码 | `PUT /api/v1/employees/{id}/reset-password` | 管理员重置 |
| 修改密码 | `PUT /api/v1/employees/me/password` | 员工自行修改 |

**角色**: `admin`（管理员）、`normal`（普通用户）

---

### 3. 客户管理

#### 3.1 客户列表

| 功能 | API | 说明 |
|------|-----|------|
| 客户列表 | `GET /api/v1/customers` | 分页、关键词搜索（名称/手机号） |
| 创建客户 | `POST /api/v1/customers` | 见下方字段说明 |
| 编辑客户 | `PUT /api/v1/customers/{id}` | 修改客户信息 |
| 客户详情 | `GET /api/v1/customers/{id}` | 获取单个客户 |

**客户字段**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | String(100) | ✅ | 客户名称（超市名称） |
| phone | String(20) | ✅ | 客户手机号（唯一） |
| contact_name | String(50) | ❌ | 联系人姓名 |
| contact_phone | String(20) | ❌ | 联系人电话 |
| address | Text | ❌ | 地址 |
| level_id | UUID | ✅ | 客户等级 |
| remark | Text | ❌ | 备注 |
| total_spent | Decimal | 自动 | 累计消费金额 |
| order_count | Integer | 自动 | 订单数 |
| last_order_at | DateTime | 自动 | 最后下单时间 |

#### 3.2 等级管理

> 仅管理员可访问

| 功能 | API | 说明 |
|------|-----|------|
| 等级列表 | `GET /api/v1/levels` | 分页 |
| 创建等级 | `POST /api/v1/levels` | 名称、最低消费 |
| 编辑等级 | `PUT /api/v1/levels/{id}` | 修改等级信息 |
| 删除等级 | `DELETE /api/v1/levels/{id}` | 删除等级 |
| 会员价格列表 | `GET /api/v1/levels/member-prices` | 按等级/商品筛选 |
| 设置会员价格 | `POST /api/v1/levels/member-prices` | 为商品+等级设定专属价格 |

**等级字段**: name、min_spent（最低消费门槛）、sort_order、is_default

会员价按 `商品 + 客户等级` 独立设置；未设置时使用商品标准售价。

---

### 4. 商品管理

#### 4.1 商品列表

| 功能 | API | 说明 |
|------|-----|------|
| 商品列表 | `GET /api/v1/products` | 分页、关键词搜索 |
| 创建商品 | `POST /api/v1/products` | 名称、分类、图片等 |
| 编辑商品 | `PUT /api/v1/products/{id}` | 修改商品信息 |
| 商品详情 | `GET /api/v1/products/{id}` | 含规格列表 |

**商品字段**: name、category_id、description、image_urls（JSON数组，MinIO公开URL）、status


| 功能 | API | 说明 |
|------|-----|------|

**规格字段**: name、barcode、price、cost_price、status（active/disabled）

> 价格变更自动记录到 PriceChangeLog

#### 4.3 分类管理

| 功能 | API | 说明 |
|------|-----|------|
| 分类列表 | `GET /api/v1/products/categories` | 分页 |
| 创建分类 | `POST /api/v1/products/categories` | 名称、排序、状态 |
| 编辑分类 | `PUT /api/v1/products/categories/{id}` | 修改分类 |

**分类字段**: name、sort_order、status（active/disabled）

#### 4.4 价格变更日志

| 功能 | API | 说明 |
|------|-----|------|
| 日志列表 | `GET /api/v1/products/price-change-logs` | 按商品/商品筛选 |

自动记录每次价格变更：旧价格、新价格、变更人、变更时间

---

### 5. 库存管理

#### 5.1 仓库管理

> 仅管理员可访问

| 功能 | API | 说明 |
|------|-----|------|
| 仓库列表 | `GET /api/v1/warehouses` | 分页 |
| 创建仓库 | `POST /api/v1/warehouses` | 名称、地址、状态 |
| 编辑仓库 | `PUT /api/v1/warehouses/{id}` | 修改仓库信息 |

#### 5.2 库存查看

| 功能 | API | 说明 |
|------|-----|------|
| 库存列表 | `GET /api/v1/inventory` | 按仓库/商品筛选 |

显示各仓库各商品的当前库存数量

#### 5.3 库存操作

| 操作 | API | 说明 |
|------|-----|------|
| 入库 | `POST /api/v1/stock-in` | 仓库 + 商品 + 数量 + 备注 |
| 出库 | `POST /api/v1/stock-out` | 仓库 + 商品 + 数量 + 备注 |
| 调拨 | `POST /api/v1/transfer` | 源仓库 → 目标仓库 + 商品 + 数量 |
| 盘点 | `POST /api/v1/stocktake` | 仓库 + 商品 + 实际数量（自动计算差异） |

#### 5.4 库存变动记录

| 功能 | API | 说明 |
|------|-----|------|
| 变动列表 | `GET /api/v1/movements` | 按仓库/类型/时间筛选 |

变动类型: stock_in、stock_out、transfer_in、transfer_out、stocktake_adjustment、order_deduction、order_return、customer_return_in、customer_return_void_out

---

### 6. 订单管理

| 功能 | API | 说明 |
|------|-----|------|
| 订单列表 | `GET /api/v1/orders` | 分页、按客户/状态筛选 |
| 创建订单 | `POST /api/v1/orders` | 客户 + 商品明细，系统自动跨仓锁定库存 |
| 订单详情 | `GET /api/v1/orders/{id}` | 含明细列表 |
| 开始发货 | `PUT /api/v1/orders/{id}/start-shipping` | 确认或调整每个商品的多仓预占分配 |
| 调整分仓 | `PUT /api/v1/orders/{id}/shipping-allocations` | 正在发货阶段重新分配仓库，不扣减实际库存 |
| 确认出库 | `PUT /api/v1/orders/{id}/stock-out` | 按最终分配扣减实际库存 |
| 确认送达 | `PUT /api/v1/orders/{id}/deliver` | 标记已送达未付款 |
| 确认收款 | `PUT /api/v1/orders/{id}/complete` | 完成订单并更新客户消费统计 |
| 取消 | `PUT /api/v1/orders/{id}/cancel` | 仅已下单、正在发货可取消并释放预占 |

**订单状态流转**: placed → shipping → stocked_out → delivered_unpaid → completed；placed、shipping 可转 cancelled。

**订单字段**: customer_id、total_amount、status、items[{product_id, quantity, unit_price, allocations}]

**履约审计字段**: shipping_started、stock_out、delivered、paid、cancelled 各阶段均记录时间与操作人。

> 下单时系统自动跨仓预占库存；开始发货和调整分仓只改变预占，确认出库时才扣减实际库存。出库后退回商品使用独立退货单。

### 6.1 退货单

| 功能 | API | 说明 |
|------|-----|------|
| 创建退货单 | `POST /api/v1/return-orders` | 独立退货，逐项选择是否入库，直接完成 |
| 退货单列表 | `GET /api/v1/return-orders` | 按客户、状态分页筛选 |
| 退货单详情 | `GET /api/v1/return-orders/{id}` | 查看库存与消费冲减审计 |
| 作废退货单 | `PUT /api/v1/return-orders/{id}/void` | 扣回原入库并恢复实际消费冲减 |

退货单不依赖原销售订单，不减少客户订单数，不自动调整客户等级。完整流程见 `docs/modules/return-order.md`。

---

### 7. 文件上传

| 功能 | API | 说明 |
|------|-----|------|
| 上传文件 | `POST /api/v1/upload` | multipart/form-data，返回公开URL |
| 删除文件 | `DELETE /api/v1/upload` | 按key删除 |
| 预签名URL | `GET /api/v1/upload/presign/{key}` | 获取临时访问URL |

文件存储在 MinIO `product-management` 存储桶，已配置公开读取策略，上传后返回永久公开URL。

---

### 8. 认证

| 功能 | API | 说明 |
|------|-----|------|
| 登录 | `POST /api/v1/auth/login` | 返回 access_token + refresh_token |
| 刷新令牌 | `POST /api/v1/auth/refresh` | 用 refresh_token 换新 access_token |
| 登出 | `POST /api/v1/auth/logout` | 失效当前令牌 |

JWT 认证，令牌存储在 Redis。所有业务 API 需在 Header 中携带 `Authorization: Bearer <token>`。

---

## 环境配置

| 服务 | 地址 | 说明 |
|------|------|------|
| PostgreSQL | DBX MCP: postgres | 43.142.121.125:15432，数据库: postgres，用户: postgres |
| Redis | DBX MCP: redis | 43.142.121.125:16379，令牌存储 |
| MinIO S3 | 192.168.88.2:9000 | 文件存储 |
| MinIO Console | 192.168.88.2:9001 | 管理界面 |
| 后端 API | localhost:8000 | FastAPI |
| 前端页面 | localhost:8001 | Ant Design Pro |

**默认账号**: admin / admin123

SQL 查询和变更优先通过 DBX MCP 执行：PostgreSQL 使用 `postgres` 连接，Redis 使用 `redis` 连接。DBX 中保存的敏感凭据不写入仓库，后端运行时可通过 `.env` 覆盖 `DATABASE_URL` / `REDIS_URL`。

---

## 前端页面路由

| 路由 | 页面 | 权限 |
|------|------|------|
| /dashboard | 仪表盘 | 所有用户 |
| /employee | 员工管理 | 仅管理员 |
| /customer/list | 客户列表 | 所有用户 |
| /customer/level | 等级管理 | 仅管理员 |
| /product/list | 商品列表 | 所有用户 |
| /product/categories | 分类管理 | 所有用户 |
| /product/price-logs | 价格日志 | 所有用户 |
| /inventory/stock | 库存查看 | 所有用户 |
| /inventory/warehouses | 仓库管理 | 仅管理员 |
| /inventory/movements | 变动记录 | 所有用户 |
| /order/list | 订单列表 | 所有用户 |
| /order/returns | 退货单 | 所有用户 |

---

## API 通用规范

- 统一响应格式: `{ code: 0, message: "success", data: ... }`
- 分页参数: `page`（默认1）、`page_size`（默认20，最大100）
- 分页响应: `{ items: [...], total: N, page: N, page_size: N }`
- 错误响应: `{ code: 非0, message: "错误描述" }`
- 认证: `Authorization: Bearer <token>`
