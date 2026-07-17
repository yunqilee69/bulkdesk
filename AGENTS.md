# 商品管理系统协作说明

本项目是面向批发贸易场景的商品管理系统，包含 FastAPI 后端与 Ant Design Pro 前端。后续协作、代码审查和实现变更默认遵循本文档。

## 项目结构

- `backend/`：后端 API 服务，基于 Python 3.12、FastAPI、SQLAlchemy async、Alembic。
- `frontend/`：前端管理后台，基于 React 19、Umi Max 4、Ant Design 6、ProComponents 3。
- `docs/`：架构、业务流程和模块说明。
- `FEATURES.md`：功能清单与接口概览。

前端目录下已有 `frontend/AGENTS.md` 与 `frontend/CLAUDE.md`，处理前端代码时必须同时遵循其中规则。

## 业务定位

系统用于管理商品从基础资料、入库、库存流转、订单销售到客户等级升级的完整流程。核心业务链路如下：

1. 维护基础数据：分类、品牌、规格、仓库、供应商。
2. 创建商品与 SKU，维护售价、成本价和价格变更记录。
3. 通过入库、出库、调拨、盘点维护库存。
4. 创建客户、客户等级和会员价。
5. 创建订单后锁定库存，发货时扣减库存，付款并完成订单后更新客户等级。

## 后端开发

后端位于 `backend/`。

常用命令：

```bash
uv run pytest
PYTHONPYCACHEPREFIX=.pycache python3 -m compileall app
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
alembic upgrade head
```

后端约定：

- API 路由位于 `backend/app/api/v1/`。
- 业务逻辑位于 `backend/app/services/`。
- SQLAlchemy 模型位于 `backend/app/models/`。
- Pydantic schema 位于 `backend/app/schemas/`。
- 数据库会话由 `backend/app/core/database.py` 提供。
- 写操作必须经过鉴权；管理员接口使用 `AdminUser`，普通登录用户接口使用 `CurrentUser`。
- 不要把业务逻辑堆在 API 层；API 层只做参数接收、错误映射和响应包装。
- 修改数据库表、字段、索引、约束或数据初始化结构时，必须生成增量 SQL 脚本，并按日期顺序归档至 `backend/migrations/incremental/`；文件名使用 `YYYY-MM-DD_简要说明.sql`。
- 表结构变更完成后，必须使用 DBX MCP 的 `postgres` 连接在当前开发库执行对应增量脚本，并通过查询或 schema 检查确认脚本已成功生效；不得只提交脚本而未执行验证。

## 前端开发

前端位于 `frontend/`。

常用命令：

```bash
npm run dev
npm run tsc
npm run biome:lint
npm run lint
npm run build
```

前端约定：

- 使用 Umi request，统一请求配置在 `frontend/src/requestErrorConfig.ts`。
- 业务请求封装在 `frontend/src/services/`。
- 页面位于 `frontend/src/pages/`。
- 路由配置位于 `frontend/config/routes.ts`。
- 菜单文案位于 `frontend/src/locales/zh-CN/menu.ts`。
- TypeScript 类型优先维护在 `frontend/src/typings.d.ts` 或页面局部类型中。
- 使用 Biome，不引入 ESLint 或 Prettier。
- 修改 Ant Design 组件用法前，优先参考现有页面模式；如需确认组件 API，使用项目约定的 antd 查询方式。

## 接口与数据契约

- 后端业务接口统一挂载在 `/api/v1` 下。
- 通用响应结构为：

```ts
{
  code: number;
  message: string;
  data: T;
}
```

- 前端服务层必须与后端 schema 保持字段一致，尤其是分页字段、枚举值、订单状态、库存流水类型。
- 不要在前端硬编码与后端不一致的状态流转。
- 当前订单主流程以代码实现为准：`placed -> shipped -> paid -> completed`，也可在终态前取消。

## 验证要求

### 测试优先

- 每次修改或新增功能，都必须先新增或调整对应测试用例；如果已有相关测试，必须先调整测试以准确表达目标行为，确认测试覆盖需求后再修改实现。
- 不允许以“没有测试”为由跳过测试；确实无法自动化验证时，必须说明原因、手工验证步骤和剩余风险。
- 完成功能修改后，必须确保项目全部测试用例均可正确执行；如存在与本次改动无关的既有失败，必须保留失败输出并明确说明其与本次改动的关系。

### 实施规模

- 小功能、局部修复或明确且低风险的调整，必须先使用 `grill-me` 技能确认预期实现效果；确认后可直接实施，无需额外编写计划，并遵循测试优先和验证要求。
- 大功能、跨模块重构、核心业务流程调整或存在明显实现方案分歧的需求，必须先提交可执行计划；仅在用户明确确认计划后，才能开始实施。

### 命令验证

完成任何实现或修复后，至少运行与改动相关的验证命令：

- 后端语法检查：`PYTHONPYCACHEPREFIX=.pycache python3 -m compileall app`
- 后端测试：`uv run pytest`
- 前端类型检查：`npm run tsc`
- 前端 lint：`npm run biome:lint` 或 `npm run lint`

如果某项验证无法运行，必须说明原因、实际输出和剩余风险。不能把“没有测试”表述为“测试通过”。

## 代码审查重点

审查当前实现时，优先关注：

- 前后端接口路径、字段名、枚举值是否一致。
- 库存数量、锁定库存、订单取消和发货逻辑是否守恒。
- 单号生成、唯一约束和并发写入是否存在冲突风险。
- 鉴权是否覆盖写操作。
- 价格变更是否记录日志。
- 分页、筛选和排序是否与前端交互匹配。
- 是否存在 lint、类型错误、未处理异常或缺少 migration。

## 编辑原则

- 改动保持小而明确，只触碰完成任务所需文件。
- 遵循现有目录结构和代码风格，不做无关重构。
- 修复问题时先定位根因，再修改实现。
- 不要覆盖或回退用户已有改动，除非用户明确要求。
- 新增功能优先补齐类型、服务封装、页面调用和必要验证。
- 涉及核心业务流程时，优先补充或更新测试。

## 环境默认值

开发环境默认服务：

- 后端 API：`http://localhost:8000`
- 前端页面：`http://localhost:8001`
- PostgreSQL：DBX MCP 连接 `postgres`（`43.142.121.125:15432`，数据库 `postgres`）
- Redis：DBX MCP 连接 `redis`（`43.142.121.125:16379`，默认 DB 0）
- MinIO：`192.168.88.2:9000`

敏感配置应通过 `.env` 或部署环境注入，不应在生产环境使用默认密钥、默认 MinIO 凭据或开放 CORS 配置。

后续需要查询或执行 SQL 时，优先使用 DBX MCP 的 `postgres` 连接；需要执行 Redis 命令时，优先使用 DBX MCP 的 `redis` 连接。
