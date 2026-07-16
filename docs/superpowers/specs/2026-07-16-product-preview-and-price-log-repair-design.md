# 商品图片预览与价格日志创建修复设计

## 目标

让商品图片在当前页面以全屏预览方式展示，并修复商品创建时写入价格变更日志导致的 `500`。

## 已确认根因

- 商品创建请求、分类和价格数据均有效；失败发生在插入 `price_change_logs`。
- 当前数据库中 `price_change_logs.price_type` 为 `varchar`，且不存在 PostgreSQL 枚举类型 `price_type`。
- 后端模型将该字段声明为原生 PostgreSQL 枚举，SQLAlchemy 绑定参数时生成 `::price_type` 类型转换，从而触发 `UndefinedObjectError`。
- 商品图片上传控件没有配置 `onPreview`；上传文件也未将上传响应 URL 映射到 `file.url`，导致默认预览退回到 base64 数据 URL 并打开新标签页。

## 设计

### 后端

- 保持 `price_change_logs.price_type` 的现有 `varchar(30)` 数据契约。
- 将 `PriceChangeLog.price_type` 映射为非原生枚举，以便在 Python 侧继续使用 `PriceType`，但不会在 SQL 中引用不存在的 PostgreSQL 枚举类型。
- 不修改数据库表，不新增迁移；模型改动与现有 `migrations/init.sql` 的 `VARCHAR(30)` 定义一致。
- 增加回归测试，验证创建商品能写入标准售价和成本价两条日志，且日志值为字符串枚举值。

### 前端

- 为商品 `Upload` 增加 `onPreview`，优先使用上传响应中的公开 URL，其次使用已有 `file.url`。
- 使用受控的 `Image.PreviewGroup` 管理 `visible` 和 `current`，在当前页面显示全屏预览并支持多张商品图切换。
- 上传成功时将响应 URL 同步到上传文件的 `url` 字段，消除默认 base64 预览回退。
- 图片未完成上传或没有 URL 时不打开预览，并给予明确提示。

## 验收标准

1. 新建商品的有效请求返回成功，且价格变更日志中包含标准售价、成本价两条记录。
2. 商品图片点击预览图标后不打开新标签页，而是在当前页面显示 Ant Design 全屏预览层。
3. 多张图片可在全屏预览层中前后切换。
4. 上传中或上传失败的图片不会尝试预览。
5. 后端测试、语法检查、前端测试、类型检查和 Biome lint 均可执行。

## 验证方式

- 单元/服务测试覆盖创建商品价格日志与预览数据选择。
- 浏览器自动化使用唯一条码创建商品，检查 API 返回成功，并触发上传图预览确认没有新标签页。
