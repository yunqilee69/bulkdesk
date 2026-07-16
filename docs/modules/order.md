# 订单管理模块 (Order)

## 概述

订单模块是系统的核心业务模块，管理从下单到完成（或取消）的完整交易流程。订单与客户、商品 商品、库存深度关联，通过状态机驱动业务流转。

## 核心功能

| 功能 | 说明 | API |
|------|------|-----|
| 创建订单 | 选择客户、仓库、商品 和数量，锁定库存 | `POST /api/v1/orders` |
| 发货 | 扣减实际库存，状态从 placed → shipped | `PUT /api/v1/orders/{id}/ship` |
| 确认付款 | 记录付款时间，状态从 shipped → paid | `PUT /api/v1/orders/{id}/confirm-payment` |
| 完成订单 | 触发客户等级升级检查，状态从 paid → completed | `PUT /api/v1/orders/{id}/complete` |
| 取消订单 | 释放/恢复库存，状态 → cancelled | `PUT /api/v1/orders/{id}/cancel` |
| 订单列表 | 分页查询，支持状态和客户筛选 | `GET /api/v1/orders` |
| 订单详情 | 查看订单项和状态变更日志 | `GET /api/v1/orders/{id}` |

## 状态机

```
                    ┌──────────────┐
                    │   placed     │ ← 创建订单（锁定库存）
                    └──────┬───────┘
                     ┌─────┴─────┐
                     ▼           ▼
              ┌────────────┐  ┌────────────┐
              │  shipped   │  │  cancelled │ ← 从 placed 取消（仅释放锁定）
              └──────┬─────┘  └────────────┘
               ┌─────┴─────┐       ↑
               ▼           ▼       │
        ┌──────────┐  ┌───────────┘
        │   paid   │  │ 从 shipped 取消（恢复已扣减库存 + 释放锁定）
        └──────┬───┘  │
         ┌─────┴──┐   │
         ▼        ▼   │
  ┌───────────┐  ┌────┘
  │ completed │  │ 从 paid 取消（恢复已扣减库存 + 释放锁定）
  └───────────┘
```

**合法状态转换**:

| 当前状态 | 可转换到 |
|----------|----------|
| placed | shipped, cancelled |
| shipped | paid, cancelled |
| paid | completed, cancelled |
| completed | (终态) |
| cancelled | (终态) |

> **业务模型**: 本系统采用批发模式（先发货后收款），因此流程为 placed → shipped → paid → completed。

## 数据模型

### Order (订单)

```
Order
├── id: UUID
├── order_no: String(64) (订单号，格式: ORD20260704000001，唯一)
├── customer_id: FK → Customer
├── warehouse_id: FK → Warehouse
├── total_amount: Numeric(12,2) (订单总金额)
├── status: Enum[placed, shipped, paid, completed, cancelled]
├── remark: String(255) (可选)
├── shipped_at: DateTime (发货时间，可选)
├── paid_at: DateTime (付款时间，可选)
├── cancelled_at: DateTime (取消时间，可选)
├── cancel_reason: Text (取消原因，可选)
├── items: List[OrderItem]
├── created_at / updated_at
```

### OrderItem (订单明细)

```
OrderItem
├── id: UUID
├── order_id: FK → Order
├── product_id: FK → Product
├── barcode: String(100) (冗余存储，防止 商品 变更丢失)
├── product_name: String(200) (冗余存储)
├── quantity: int (购买数量)
├── unit_price: Numeric(12,2) (成交单价)
├── subtotal: Numeric(12,2) (小计 = unit_price × quantity)
```

### OrderStatusLog (状态变更日志)

```
OrderStatusLog
├── order_id: FK → Order
├── from_status: Enum[OrderStatus] (原状态，首次创建为空)
├── to_status: Enum[OrderStatus] (新状态)
├── operator: String(100) (操作人用户名)
├── remark: String(255) (备注，如取消原因)
├── created_at
```

## 库存与订单的交互

这是系统中最关键的业务逻辑，库存操作与订单状态紧密耦合：

| 订单操作 | 库存效果 | MovementType |
|----------|----------|--------------|
| 创建订单 (placed) | `locked += N` (锁定可用库存) | 无记录 |
| 发货 (shipped) | `quantity -= N, locked -= N` (扣减实际库存，释放锁定) | `order_deduction` |
| 从 placed 取消 | `locked -= N` (仅释放锁定，数量未扣减) | `stock_out` |
| 从 shipped/paid 取消 | `quantity += N, locked -= N` (恢复已扣减数量，释放锁定) | `order_return` |
| 完成 (completed) | 无库存操作 | 无记录 |

## 定价逻辑

创建订单时的价格确定优先级：

1. 查询该 商品 对应客户等级的独立 **会员价** (MemberPrice)
2. 若无会员价，使用 商品 的 **默认售价** (Product.price)，不再叠加等级折扣
3. 价格在创建订单时锁定到 OrderItem.unit_price，后续 商品 价格变更不影响已创建订单

## 订单号生成

格式: `ORD` + `YYYYMMDD` + 6位序号 (如 `ORD20260704000001`)

基于当日已有订单数计数，保证日期内递增。

## 业务规则

1. **库存校验**: 创建订单时检查可用库存 `quantity - locked >= 请求数量`，不足则拒绝
2. **状态校验**: 只允许合法的状态转换，非法转换抛出 ValueError
3. **冗余存储**: OrderItem 中 barcode 和 product_name 冗余存储，防止 商品 变更导致历史订单数据丢失
4. **等级升级**: 订单完成时自动检查客户累计消费是否达到更高等级
5. **取消可追溯**: 取消订单必须填写 cancel_reason

## 前端页面

- 订单列表: `/order/list`

## 关键文件

- `backend/app/models/order.py` — Order, OrderItem, OrderStatusLog, OrderStatus
- `backend/app/services/order_service.py` — 订单业务逻辑（含状态机、库存交互）
- `backend/app/api/v1/order.py` — 订单 REST 接口
- `backend/app/schemas/order.py` — 请求/响应 Schema
