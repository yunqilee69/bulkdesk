# 客户管理模块 (Customer)

## 概述

客户模块管理企业的下游客户信息，包括客户基本信息、等级体系和会员价机制。客户是订单业务的核心参与方。

## 核心功能

| 功能 | 说明 | API |
|------|------|-----|
| 创建客户 | 设置名称、等级、联系人、电话、地址、照片、备注 | `POST /api/v1/customers` |
| 客户列表 | 分页查询，支持名称搜索 | `GET /api/v1/customers` |
| 编辑客户 | 修改客户基本信息 | `PUT /api/v1/customers/{id}` |
| 客户详情 | 查看客户完整信息 | `GET /api/v1/customers/{id}` |

## 数据模型

```
Customer
├── id: UUID
├── name: String(100) (客户名称)
├── contact_name: String(50) (联系人)
├── contact_phone: String(20) (联系电话，唯一)
├── level_id: FK → CustomerLevel (客户等级)
├── address: Text (地址，可选)
├── remark: Text (备注，可选)
├── image_urls: JSON (客户照片，可选)
├── total_spent: Numeric(12,2) (累计完成订单金额)
├── order_count: int (已完成订单数)
├── last_order_at: DateTime (最后下单时间，可选)
├── created_at / updated_at
```

## 客户等级体系

### CustomerLevel (等级)

```
CustomerLevel
├── id: UUID
├── name: String(50) (等级名称，唯一)
├── min_spent: Numeric(12,2) (升级所需最低消费额)
├── sort_order: int (排序)
├── is_default: bool (是否为默认等级)
├── created_at
```

| 功能 | API |
|------|-----|
| 创建等级 | `POST /api/v1/levels` |
| 等级列表 | `GET /api/v1/levels` |
| 编辑等级 | `PUT /api/v1/levels/{id}` |
| 删除等级 | `DELETE /api/v1/levels/{id}` |

### MemberPrice (会员价)

为特定 商品 + 等级组合设置专属价格，覆盖 商品 默认售价。下单时优先使用会员价。

```
MemberPrice
├── id: UUID
├── product_id: FK → Product
├── level_id: FK → CustomerLevel
├── price: Numeric(12,2)
├── (product_id + level_id 联合唯一)
```

| 功能 | API |
|------|-----|
| 设置会员价 | `POST /api/v1/levels/member-prices` |
| 会员价列表 | `GET /api/v1/levels/member-prices` |

### LevelChangeLog (等级变更记录)

记录客户等级变更历史，包括自动升级和手动调整。

```
LevelChangeLog
├── customer_id: FK → Customer
├── from_level_id: FK → CustomerLevel (原等级，可为空)
├── to_level_id: FK → CustomerLevel (新等级)
├── reason: String(255) (变更原因)
├── created_at
```

## 业务规则

1. **默认等级**: 系统必须有一个 `is_default=True` 的等级，新建客户自动关联
2. **自动升级**: 订单完成时检查客户累计消费，若达到更高等级的 `min_spent` 则自动升级
3. **会员价优先**: 每个 商品 可按客户等级设置独立会员价；若无则使用 商品 默认售价
4. **联系电话唯一**: 不允许重复的电话号码

## 前端页面

- 客户列表: `/customer/list`
- 等级管理: `/customer/level` (含"等级管理"和"会员价管理"两个 Tab)

## 关键文件

- `backend/app/models/customer.py` — Customer, CustomerLevel, MemberPrice, LevelChangeLog
- `backend/app/services/customer_service.py` — 客户业务逻辑
- `backend/app/services/level_service.py` — 等级和会员价业务逻辑
- `backend/app/api/v1/customer.py` — 客户 REST 接口
- `backend/app/api/v1/level.py` — 等级 REST 接口
