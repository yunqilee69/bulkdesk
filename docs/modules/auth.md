# 认证模块 (Auth)

## 概述

认证模块负责系统的用户身份验证、令牌管理和权限控制。基于 JWT 双令牌机制实现无状态认证。

## 核心功能

| 功能 | 说明 | API |
|------|------|-----|
| 登录 | 用户名+密码验证，返回 access_token 和 refresh_token | `POST /api/v1/auth/login` |
| 登出 | 将当前 token 加入黑名单（Redis 存储） | `POST /api/v1/auth/logout` |
| 令牌刷新 | 使用 refresh_token 获取新的 access_token | `POST /api/v1/auth/refresh` |
| 获取当前用户 | 解析 token 返回用户信息 | `GET /api/v1/auth/me` |

## 令牌机制

- **Access Token**: 短期令牌（30分钟），用于 API 请求鉴权
- **Refresh Token**: 长期令牌（7天），仅用于刷新 access_token
- **黑名单**: 登出时将 token 的 jti 写入 Redis，过期时间与 token 剩余有效期一致

## 权限模型

| 角色 | 权限范围 |
|------|----------|
| `admin` (管理员) | 全部操作：创建/编辑/删除员工、禁用账号、重置密码 |
| `normal` (普通员工) | 基础业务操作：查看数据、处理订单、库存操作 |

前端通过 `access.ts` 中的 `canAdmin` 判断当前用户是否为管理员，控制操作按钮的显隐。

## 关键文件

- `backend/app/api/v1/auth.py` — 认证接口
- `backend/app/core/security.py` — JWT 编解码、密码哈希
- `backend/app/core/deps.py` — `CurrentUser`、`AdminUser` 依赖注入
- `backend/app/services/auth_service.py` — 认证业务逻辑
- `frontend/src/requestErrorConfig.ts` — 401 拦截、令牌清除与重定向

## 数据流

```
用户输入账号密码
  → 后端验证密码哈希 (bcrypt)
  → 签发 JWT (access_token + refresh_token)
  → 前端存入 localStorage
  → 后续请求携带 Authorization: Bearer <token>
  → 后端 FastAPI Depends 解析 token → 注入 current_user
```
