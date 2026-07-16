# 员工管理模块 (Employee)

## 概述

员工模块管理系统的操作人员账号，包括账号创建、信息编辑、禁用和密码重置。员工账号同时作为系统登录凭证。

## 核心功能

| 功能 | 说明 | API |
|------|------|-----|
| 创建员工 | 设置用户名、密码、姓名、手机号、角色 | `POST /api/v1/employees` |
| 员工列表 | 分页查询，支持用户名/姓名搜索 | `GET /api/v1/employees` |
| 编辑员工 | 修改姓名、手机号、角色（不可修改用户名） | `PUT /api/v1/employees/{id}` |
| 禁用员工 | 将状态从 active 切换为 disabled，阻止登录 | `PUT /api/v1/employees/{id}/disable` |
| 重置密码 | 管理员为员工设置新密码 | `PUT /api/v1/employees/{id}/reset-password` |

## 数据模型

```
Employee
├── id: UUID (主键)
├── username: String(50) (唯一，不可修改)
├── password_hash: String(255) (bcrypt 哈希)
├── name: String(100) (姓名)
├── phone: String(20) (手机号，可选)
├── role: Enum[admin, normal]
├── status: Enum[active, disabled]
├── last_login_at: DateTime (最后登录时间)
├── created_at / updated_at
```

## 业务规则

1. **用户名唯一**: 不允许重复的用户名
2. **禁用不可自伤**: 不能禁用自己的账号
3. **管理员专属操作**: 创建、禁用、重置密码仅 `admin` 角色可执行
4. **密码安全**: 使用 bcrypt 哈希存储，永不明文保存

## 前端页面

- 路径: `/employee`
- 组件: `frontend/src/pages/Employee/index.tsx`
- 功能: ProTable 列表 + ModalForm 新建/编辑 + Popconfirm 禁用确认

## 关键文件

- `backend/app/models/employee.py` — Employee ORM 模型
- `backend/app/services/employee_service.py` — 员工业务逻辑
- `backend/app/api/v1/employee.py` — REST 接口
- `backend/app/schemas/employee.py` — 请求/响应 Schema
