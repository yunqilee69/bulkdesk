# 商品管理模块

商品是系统唯一可交易对象。商品直接关联分类、品牌、库存、订单和会员价，不使用 SPU、SKU 或规格组合。

## 商品字段

- `id`：UUID 内部唯一标识
- `name`、`short_name`、`barcode`（全局唯一）
- `category_id`（单一平级分类）、`brand_id`、`specification`、`unit`
- `standard_price`、`cost_price`、图片、描述、销售状态

商品状态只影响新增销售订单：停售商品仍可入库、出库、调拨和盘点。

## 价格

标准售价、成本价和客户等级会员价均以商品为粒度维护。每次创建或调整价格必须填写原因，系统写入商品价格变更日志。未设置会员价时，订单使用标准售价。

## 接口

- `POST/GET/PUT /api/v1/products`
- `PUT /api/v1/products/{id}/standard-price`
- `PUT /api/v1/products/{id}/cost-price`
- `PUT /api/v1/products/{id}/member-prices/{level_id}`
- `GET /api/v1/products/{id}/price-change-logs`

分类为平级基础资料，不提供规格管理或 SKU 接口。
