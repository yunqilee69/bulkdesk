# 库存管理模块 (Inventory)

## 概述

库存模块管理商品的实物库存，包括库存记录、仓库、供应商和库存变动流水。是连接商品和订单的核心中间层。

## 核心功能

| 功能 | 说明 | API |
|------|------|-----|
| 入库 | 增加库存数量，记录 stock_in 变动 | `POST /api/v1/stock-in` |
| 出库 | 减少库存数量（需满足可用库存），记录 stock_out 变动 | `POST /api/v1/stock-out` |
| 调拨 | 从一个仓库转移到另一个仓库，记录 transfer_out + transfer_in | `POST /api/v1/transfer` |
| 盘点 | 校正库存为实际数量，记录 stocktake_adjustment 变动 | `POST /api/v1/stocktake` |
| 库存查询 | 按 商品/仓库查询当前库存 | `GET /api/v1/inventory` |
| 库存流水 | 查询库存变动历史 | `GET /api/v1/inventory-movements` |
| 仓库管理 | 仓库 CRUD | `/api/v1/warehouses` |
| 供应商管理 | 供应商 CRUD | `/api/v1/suppliers` |

## 数据模型

### Inventory (库存记录)

每个 商品 在每个仓库中只有一条记录，通过 `(product_id, warehouse_id)` 联合唯一约束保证。

```
Inventory
├── id: UUID
├── product_id: FK → Product (商品)
├── warehouse_id: FK → Warehouse (仓库)
├── quantity: int (实际库存数量)
├── locked: int (锁定数量，已被订单占用但未发货)
├── warning_quantity: int (预警数量，低于此值触发提醒)
├── supplier_id: FK → Supplier (供应商，可选)
├── production_date: Date (生产日期，可选)
├── expiry_date: Date (有效期，可选)
├── location: String(100) (库位，可选)
├── (product_id + warehouse_id 联合唯一)
```

**核心公式**: `可用库存 = quantity - locked`

### InventoryMovement (库存变动流水)

所有库存数量变更都通过 InventoryMovement 记录，保证完整审计追踪。

```
InventoryMovement
├── id: UUID
├── product_id: FK → Product
├── warehouse_id: FK → Warehouse
├── movement_type: Enum[MovementType]
├── quantity: int (变动数量，正数)
├── remark: String(255) (备注，可选)
├── created_at / updated_at
```

### MovementType (变动类型)

| 类型 | 说明 | 触发场景 |
|------|------|----------|
| `stock_in` | 入库 | 手动入库操作 |
| `stock_out` | 出库 | 手动出库操作；placed→cancelled 时释放锁定 |
| `transfer_in` | 调拨入库 | 从其他仓库调入 |
| `transfer_out` | 调拨出库 | 调出到其他仓库 |
| `stocktake_adjustment` | 盘点调整 | 盘点校正差异 |
| `order_deduction` | 订单扣减 | 销售订单确认出库时按仓库扣减实际库存 |
| `order_return` | 历史订单退回 | 保留的历史流水类型，新订单出库后不允许直接取消 |
| `customer_return_in` | 客户退货入库 | 退货单中选择入库的明细增加库存 |
| `customer_return_void_out` | 退货作废出库 | 作废退货单时扣回原入库库存 |

### Warehouse (仓库)

```
Warehouse
├── id: UUID
├── name: String(100)
├── address: String(255) (可选)
├── contact_person: String(100) (可选)
├── contact_phone: String(20) (可选)
├── is_default: bool (是否为默认仓库)
├── status: Enum[active, disabled]
├── remark: String(255) (可选)
```

### Supplier (供应商)

```
Supplier
├── id: UUID
├── name: String(100)
├── contact_person: String(100) (可选)
├── contact_phone: String(20) (可选)
├── address: String(255) (可选)
├── status: Enum[active, disabled]
├── remark: String(255) (可选)
```

## 业务规则

1. **库存锁定**: 创建订单时锁定库存；开始发货可调整分仓，确认出库时才执行 `quantity -= N, locked -= N`
2. **可用库存校验**: 入库/出库/调拨前必须检查 `quantity - locked >= 操作数量`
3. **盘点保护**: 盘点时 `actual_quantity >= locked`，不允许将可用库存盘为负数
4. **变动可追溯**: 每次库存变更必须记录 InventoryMovement，不可跳过
5. **仓库唯一性**: 同一 商品 在同一仓库只有一条库存记录

## 前端页面

- 库存查询: `/inventory/stock`
- 库存流水: `/inventory/movements`
- 仓库管理: `/inventory/warehouses`
- 供应商管理: `/inventory/suppliers`

## 关键文件

- `backend/app/models/inventory.py` — Inventory, InventoryMovement, Warehouse, Supplier
- `backend/app/services/inventory_service.py` — 库存业务逻辑
- `backend/app/api/v1/inventory.py` — 库存 REST 接口
