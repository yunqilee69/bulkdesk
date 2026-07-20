# 订单管理模块

## 概述

销售订单负责下单、库存预占、分仓发货、出库和收款。创建订单时只选择客户、商品和数量，不选择仓库；系统自动跨仓预占库存，进入发货阶段后允许重新调整每个商品的仓库分配。确认出库时必须指定配送员并提交收货人快照，系统同时创建与订单一对一的配送记录；后续签收在配送管理中完成。确认收款时记录实际收款金额和付款凭证，客户累计消费按实际收款金额计算。

## 状态流转

```mermaid
stateDiagram-v2
    [*] --> placed: 创建订单并预占库存
    placed --> shipping: 开始发货并确认分仓
    placed --> cancelled: 取消并释放预占
    shipping --> shipping: 调整仓库分配
    shipping --> stocked_out: 确认出库并扣减库存
    shipping --> cancelled: 取消并释放预占
    stocked_out --> delivered_unpaid: 配送签收
    delivered_unpaid --> completed: 确认收款
    completed --> [*]
    cancelled --> [*]
```

| 状态 | 文案 | 可执行操作 |
|---|---|---|
| `placed` | 已下单 | 开始发货、取消 |
| `shipping` | 正在发货 | 调整分仓、确认出库、取消 |
| `stocked_out` | 已出库 | 在配送管理中登记签收或异常 |
| `delivered_unpaid` | 已送达未付款 | 确认收款 |
| `completed` | 已完成 | 查看 |
| `cancelled` | 已取消 | 查看 |

出库后不允许取消销售订单；客户退回商品必须创建独立退货单。

## 库存规则

1. 创建订单时按启用仓库自动跨仓分配，执行 `locked += quantity`，实际库存 `quantity` 不变。
2. 开始发货或调整分仓时，先释放本订单旧预占，再按新分配重新锁定；同一商品允许多个仓库共同承担。
3. 确认出库时按当前 `reserved` 分配执行 `quantity -= quantity`、`locked -= quantity`，并按仓库生成 `order_deduction` 流水。
4. 出库请求必须提交 `delivery_employee_id`、`recipient_name`、`recipient_phone`、`delivery_address`。后端校验配送员处于启用状态，并把配送员姓名、收货人姓名、电话和地址保存为本次配送快照，不随员工或客户资料后续修改而变化。
5. 出库与创建配送记录在同一事务中完成；配送记录初始状态为 `delivering`，同时写入 `assigned` 事件。
6. `placed` 或 `shipping` 取消时仅释放预占，不生成库存流水。
7. 所有库存行按商品、仓库固定顺序加锁，避免并发超卖和死锁。

## 审计字段

| 动作 | 字段 |
|---|---|
| 开始发货 | `shipping_started_at`, `shipping_started_by` |
| 确认出库 | `stock_out_at`, `stock_out_by` |
| 配送签收 | `delivered_at`, `delivered_by` |
| 确认收款 | `paid_at`, `paid_by` |
| 取消订单 | `cancelled_at`, `cancelled_by`, `cancel_reason` |

操作人均由后端使用当前登录用户写入，前端不提交审计用户名。配送签收成功时，由签收接口把订单从 `stocked_out` 推进到 `delivered_unpaid`，并将实际登记签收的员工写入 `delivered_by`。每次状态变化同时写入 `order_status_logs`。

## 客户统计

只有 `delivered_unpaid -> completed` 时增加客户 `total_spent`、`order_count` 并更新 `last_order_at`。客户累计消费使用 `paid_amount`，不是订单原始 `total_amount`；例如订单金额 20,010 元、实际收款 20,000 元时，仅累计 20,000 元，差额作为议价优惠保留在订单详情中。订单流程不自动调整客户等级，等级由人工维护。

## API

- `POST /api/v1/orders`
- `GET /api/v1/orders`
- `GET /api/v1/orders/{id}`
- `GET /api/v1/orders/{id}/shipping-options`
- `PUT /api/v1/orders/{id}/start-shipping`
- `PUT /api/v1/orders/{id}/shipping-allocations`
- `PUT /api/v1/orders/{id}/stock-out`
- `PUT /api/v1/orders/{id}/complete`
- `PUT /api/v1/orders/{id}/cancel`

订单接口不提供直接送达操作；`stocked_out -> delivered_unpaid` 只由 `PUT /api/v1/deliveries/{delivery_id}/sign` 完成。配送接口、权限和查询规则见 [配送管理模块](./delivery.md)。

## 前端

订单列表位于 `/order/list`。新建订单使用 Modal 和公共 `ProductSelectModal`；列表工具栏与行内操作根据订单状态展示对应履约动作。确认出库弹窗要求选择启用员工并填写收货人姓名、电话和地址。订单进入 `stocked_out` 后不再显示直接签收动作，签收、异常和改派统一在 `/delivery` 页面处理。`delivered_unpaid` 订单通过“确认收款”弹窗录入实际收款金额并上传付款凭证后进入 `completed`。点击订单号或配送卡片中的“查看订单”进入 `/order/detail/{id}` 独立详情页，展示库存分配、配送摘要、状态日志、应收/实收/优惠差额和各阶段操作人/时间。
