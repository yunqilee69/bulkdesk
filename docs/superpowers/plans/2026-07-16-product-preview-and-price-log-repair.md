# 商品图片预览与价格日志创建修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复创建商品写入价格日志时的 `500`，并让商品图片在当前页以全屏方式预览。

**Architecture:** 后端使 SQLAlchemy 枚举映射与现有 `varchar` 列保持一致，不触碰数据库结构。前端在商品页使用 `Upload.onPreview` 驱动受控 `Image.PreviewGroup`，以已上传的公开 URL 进行多图预览。

**Tech Stack:** FastAPI、SQLAlchemy、pytest、React 19、Ant Design 6、Vitest、Chrome DevTools 浏览器自动化。

---

### Task 1: 修复价格日志枚举绑定

**Files:**
- Modify: `backend/tests/test_business_logic.py`
- Modify: `backend/app/models/product.py`

- [ ] **Step 1: 写出失败的模型映射测试**

```python
def test_price_change_log_uses_non_native_enum_for_varchar_column():
    assert PriceChangeLog.__table__.c.price_type.type.native_enum is False
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_business_logic.py::test_price_change_log_uses_non_native_enum_for_varchar_column -q`

Expected: FAIL，因为当前 `PriceChangeLog.price_type` 使用原生 PostgreSQL 枚举。

- [ ] **Step 3: 最小实现**

在 `PriceChangeLog.price_type` 的 `Enum(PriceType, ...)` 中增加 `native_enum=False`，保留 `PriceType`、字段名及所有其他列不变。

- [ ] **Step 4: 重新运行针对性测试**

Run: `cd backend && .venv/bin/python -m pytest tests/test_business_logic.py::test_price_change_log_uses_non_native_enum_for_varchar_column -q`

Expected: PASS。

### Task 2: 覆盖商品图片预览数据选择

**Files:**
- Modify: `frontend/src/pages/Product/form.test.ts`
- Modify: `frontend/src/pages/Product/form.ts`

- [ ] **Step 1: 写出失败的图片预览测试**

```ts
expect(getProductImagePreviewUrl(imageFile('done', { url: 'https://example.com/a.png' }))).toBe(
  'https://example.com/a.png',
);
expect(getProductImagePreviewUrl(imageFile('uploading', { url: 'https://example.com/a.png' }))).toBeUndefined();
expect(findProductImagePreviewIndex(files, files[1])).toBe(1);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npm test -- src/pages/Product/form.test.ts`

Expected: FAIL，因为预览 URL 与预览索引辅助函数尚不存在。

- [ ] **Step 3: 最小实现**

在 `form.ts` 增加：仅为 `done` 状态文件返回 `response.url` 或 `file.url` 的 `getProductImagePreviewUrl`；以及基于该公开 URL 计算当前图片位置的 `findProductImagePreviewIndex`。

- [ ] **Step 4: 重新运行针对性测试**

Run: `cd frontend && npm test -- src/pages/Product/form.test.ts`

Expected: PASS。

### Task 3: 接入当前页全屏预览

**Files:**
- Modify: `frontend/src/pages/Product/index.tsx`
- Test: `frontend/src/pages/Product/form.test.ts`

- [ ] **Step 1: 保持辅助测试通过**

Run: `cd frontend && npm test -- src/pages/Product/form.test.ts`

Expected: PASS，确保页面只消费已覆盖的 URL/索引逻辑。

- [ ] **Step 2: 接入受控预览组件**

- 在 `Upload.onChange` 中把成功上传响应的 `data.url` 写回上传文件的 `url`。
- 在 `Upload.onPreview` 中拒绝未完成上传的文件；否则记录 `current` 图片索引并开启预览。
- 在商品页面渲染受控 `Image.PreviewGroup`，由 `visible`、`current` 与 `onVisibleChange` 管理当前页的全屏多图预览。

- [ ] **Step 3: 运行前端类型检查**

Run: `cd frontend && npm run tsc`

Expected: PASS。

### Task 4: 完整验证与浏览器回归

**Files:**
- Verify: `backend/app/models/product.py`
- Verify: `backend/tests/test_business_logic.py`
- Verify: `frontend/src/pages/Product/form.ts`
- Verify: `frontend/src/pages/Product/form.test.ts`
- Verify: `frontend/src/pages/Product/index.tsx`

- [ ] **Step 1: 执行项目验证**

Run: `cd backend && .venv/bin/python -m pytest && PYTHONPYCACHEPREFIX=.pycache .venv/bin/python -m compileall app && cd ../frontend && npm test && npm run tsc && npm run biome:lint`

Expected: 所有命令以状态码 0 退出。

- [ ] **Step 2: 执行浏览器回归**

用管理员登录本地前端；提交一个唯一条形码的新商品，确认 `POST /api/v1/products` 返回成功。上传两张图片后点击预览图标，确认当前页面显示全屏预览层、浏览器页面数量不增加，并可切换图片。

- [ ] **Step 3: 检查改动范围**

Run: `git diff --check && git diff -- backend/app/models/product.py backend/tests/test_business_logic.py frontend/src/pages/Product/form.ts frontend/src/pages/Product/form.test.ts frontend/src/pages/Product/index.tsx`

Expected: 无空白错误，改动仅覆盖本设计。
