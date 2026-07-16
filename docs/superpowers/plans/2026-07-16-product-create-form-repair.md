# 商品新建表单修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复商品创建的未处理数据库异常，并为商品表单提供多图上传、人民币金额输入与双列布局。

**Architecture:** 后端在服务层预检条形码，路由层将数据库唯一约束冲突转换为客户端错误；不改变商品 schema 或数据表。前端在商品页面直接组合 Ant Design `Upload`、`InputNumber` 和 `ProForm.Group`，将上传完成的 URL 列表转换为现有 `image_urls` 契约。

**Tech Stack:** FastAPI、SQLAlchemy async、pytest、React 19、Ant Design 6、ProComponents 3、Vitest。

---

### Task 1: 覆盖商品创建的重复条码行为

**Files:**
- Modify: `backend/tests/test_business_logic.py`
- Modify: `backend/app/services/product_service.py`
- Modify: `backend/app/api/v1/product.py`

- [ ] **Step 1: 写出服务层失败测试**

在 `backend/tests/test_business_logic.py` 导入 `ProductCreate` 与 `product_service`，使用 `QueueDb` 模拟分类存在、条形码查询命中已有记录。测试调用 `create_product` 时抛出 `ValueError("条形码已存在")`，且不向会话加入 `Product` 或价格日志。

```python
@pytest.mark.asyncio
async def test_create_product_rejects_duplicate_barcode():
    request = ProductCreate(
        name="测试商品", barcode="6900000000001", category_id=str(uuid.uuid4()),
        unit="件", standard_price=12.34, cost_price=5.67, price_reason="首次建档",
    )
    db = QueueDb([FakeResult(one=request.category_id), FakeResult(one=uuid.uuid4())])

    with pytest.raises(ValueError, match="条形码已存在"):
        await product_service.create_product(db, request)

    assert db.added == []
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && uv run pytest tests/test_business_logic.py::test_create_product_rejects_duplicate_barcode -q`

Expected: FAIL，因为当前创建流程未查询同条形码商品。

- [ ] **Step 3: 实现最小重复条码检查和并发冲突映射**

在 `create_product` 中、构造 `Product` 前查询 `Product.id` 与 `req.barcode`；命中时抛出 `ValueError("条形码已存在")`。在 `create_product` API 路由捕获 `sqlalchemy.exc.IntegrityError`，转换成状态码 `409`、详情为“条形码已存在”的 `HTTPException`；保留已有 `ValueError` 到 `400` 的映射。

```python
if (await db.execute(select(Product.id).where(Product.barcode == req.barcode))).scalar_one_or_none():
    raise ValueError("条形码已存在")
```

- [ ] **Step 4: 重新运行针对性测试**

Run: `cd backend && uv run pytest tests/test_business_logic.py::test_create_product_rejects_duplicate_barcode -q`

Expected: PASS。

### Task 2: 为图片 URL 和上传前校验建立可测试的表单辅助函数

**Files:**
- Create: `frontend/src/pages/Product/form.ts`
- Create: `frontend/src/pages/Product/form.test.ts`
- Modify: `frontend/src/pages/Product/index.tsx`

- [ ] **Step 1: 写出前端失败测试**

在 `frontend/src/pages/Product/form.test.ts` 测试：

```ts
expect(extractUploadedImageUrls([
  { status: 'done', response: { url: 'https://example.com/a.png' } },
  { status: 'uploading' },
])).toEqual(['https://example.com/a.png']);

expect(validateProductImage({ type: 'application/pdf', size: 1024 } as File)).toBe(
  Upload.LIST_IGNORE,
);
expect(validateProductImage({ type: 'image/png', size: 10 * 1024 * 1024 + 1 } as File)).toBe(
  Upload.LIST_IGNORE,
);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npm test -- src/pages/Product/form.test.ts`

Expected: FAIL，因为辅助模块尚不存在。

- [ ] **Step 3: 实现最小辅助函数**

在 `form.ts` 导出 `MAX_PRODUCT_IMAGES = 9`、`validateProductImage` 和 `extractUploadedImageUrls`。校验仅接受 `image/*`、单文件不超过 `10 * 1024 * 1024` 字节；不通过时返回 `Upload.LIST_IGNORE`。URL 提取只保留状态为 `done`、接口成功且含 `data.url` 的文件。

- [ ] **Step 4: 重新运行针对性测试**

Run: `cd frontend && npm test -- src/pages/Product/form.test.ts`

Expected: PASS。

### Task 3: 接入商品表单上传、金额输入与双列布局

**Files:**
- Modify: `frontend/src/pages/Product/index.tsx`
- Modify: `frontend/src/services/product.ts`
- Test: `frontend/src/pages/Product/form.test.ts`

- [ ] **Step 1: 补充表单请求载荷失败测试**

为 `extractUploadedImageUrls` 增加覆盖：已移除文件、上传失败文件和没有 URL 的成功响应均不出现在结果中；金额值保留数值类型（例如 `12.34`）。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npm test -- src/pages/Product/form.test.ts`

Expected: FAIL，直到 URL 提取函数排除这些文件状态。

- [ ] **Step 3: 以现有服务契约接入页面**

- 使用 `ProForm.Group` 将名称/简称、条形码/分类、品牌/规格、单位/状态组织为两列；描述与图片字段单独占一行。
- 使用 `Upload` 的 `listType="picture-card"`、`multiple`、`maxCount={MAX_PRODUCT_IMAGES}`、`beforeUpload={validateProductImage}`；`customRequest` 调用 `frontend/src/services/upload.ts` 的 `uploadFile(file, "products")`，把成功响应的 `data` 传给 `onSuccess`，失败时调用 `onError`。这样上传沿用 Umi `request` 的鉴权拦截器。
- 新建与编辑提交前用 `extractUploadedImageUrls` 把 `fileList` 转为 `image_urls`；初始编辑值将已有 URL 映射为状态 `done` 的上传列表。
- 以 `InputNumber` 替换新建表单与价格抽屉的普通数字/文本输入，设置 `min={0}`、`precision={2}`、人民币前/后缀；价格管理提交仍发送 number。
- 在 `frontend/src/services/product.ts` 的创建、更新参数类型中保持 `image_urls?: string[]`，不更改路径或响应格式。

- [ ] **Step 4: 运行前端商品表单测试**

Run: `cd frontend && npm test -- src/pages/Product/form.test.ts`

Expected: PASS。

### Task 4: 完整验证

**Files:**
- Verify: `backend/app/api/v1/product.py`
- Verify: `backend/app/services/product_service.py`
- Verify: `backend/tests/test_business_logic.py`
- Verify: `frontend/src/pages/Product/index.tsx`
- Verify: `frontend/src/pages/Product/form.ts`
- Verify: `frontend/src/pages/Product/form.test.ts`

- [ ] **Step 1: 运行后端全量测试和语法检查**

Run: `cd backend && uv run pytest && PYTHONPYCACHEPREFIX=.pycache python3 -m compileall app`

Expected: 测试零失败，且编译命令以状态码 0 退出。

- [ ] **Step 2: 运行前端测试、类型检查和 lint**

Run: `cd frontend && npm test && npm run tsc && npm run biome:lint`

Expected: 所有命令以状态码 0 退出。

- [ ] **Step 3: 检查范围**

Run: `git diff --check && git diff -- backend/app/api/v1/product.py backend/app/services/product_service.py backend/tests/test_business_logic.py frontend/src/pages/Product/index.tsx frontend/src/pages/Product/form.ts frontend/src/pages/Product/form.test.ts frontend/src/services/product.ts`

Expected: 没有空白错误，且差异只包含本设计所述行为。
