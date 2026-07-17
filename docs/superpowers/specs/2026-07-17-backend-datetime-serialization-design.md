# 后端时间序列化统一设计

## 目标

后端 API 响应中的所有 `datetime` 值统一按 UTC+8 显示，并格式化为
`YYYY-MM-DD HH:mm:ss`，例如 `2026-07-17 16:30:00`。

## 范围

- 适用于所有继承公共响应 schema 的 API 输出，包括分页和嵌套响应。
- 带时区的 `datetime` 先转换为 UTC+8。
- 不带时区的 `datetime` 视为 UTC 后转换为 UTC+8，以匹配现有服务端 UTC
  写入语义。
- `date` 类型继续输出 `YYYY-MM-DD`，不作时区转换。
- 请求体解析和数据库字段定义不变。

## 方案

在 `app.schemas.common` 提供公共 Pydantic schema 基类，并使用 Pydantic v2
字段序列化器处理 `datetime`。所有应用 schema 均继承该基类，因此 FastAPI 的
响应模型、嵌套对象和分页模型都通过同一格式化逻辑输出，无需在各路由重复处理。

## 验证

先添加回归测试，覆盖：

1. UTC 感知时间转换到 UTC+8，并移除微秒和偏移后缀。
2. 无时区时间按 UTC 解释后转换到 UTC+8。
3. 分页响应内的输出 schema 使用相同格式。
4. `date` 值保持 ISO 日期格式。

随后运行后端完整测试与语法检查。

## 实施状态

已于 2026-07-17 实施 `ApiSchema` 公共基类并覆盖所有应用 schema。新增的时间
序列化回归测试和后端语法检查通过；完整测试收集仍受既有
`ProductWarningQuantityUpdate` 导入缺失影响。
