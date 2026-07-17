import { DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Divider, Input, List, message, Modal, Select, Space, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { listAllBrands, listAllCategories, listProducts } from '@/services/product';
import {
  mergeSelectedProducts,
  toProductSelectQuery,
  toSelectedProducts,
  type SelectableProduct,
} from './productSelection';

interface CategoryOption {
  id: string;
  name: string;
  status: string;
}

interface BrandOption {
  id: string;
  name: string;
  status: string;
}

interface ProductSelectModalProps {
  open: boolean;
  selectedProductIds: string[];
  selectedProducts: SelectableProduct[];
  onCancel: () => void;
  onConfirm: (products: SelectableProduct[]) => void | Promise<void>;
}

function toSelectableProduct(product: Record<string, unknown>): SelectableProduct {
  return {
    id: String(product.id),
    name: String(product.name),
    short_name: product.short_name ? String(product.short_name) : undefined,
    barcode: String(product.barcode),
    category_id: String(product.category_id),
    category_name: product.category_name ? String(product.category_name) : undefined,
    brand_id: product.brand_id ? String(product.brand_id) : undefined,
    brand_name: product.brand_name ? String(product.brand_name) : undefined,
    unit: String(product.unit),
    cost_price: Number(product.cost_price),
    standard_price: Number(product.standard_price),
    status: String(product.status),
  };
}

function toCategoryOption(category: Record<string, unknown>): CategoryOption {
  return {
    id: String(category.id),
    name: String(category.name),
    status: String(category.status),
  };
}

function toBrandOption(brand: Record<string, unknown>): BrandOption {
  return {
    id: String(brand.id),
    name: String(brand.name),
    status: String(brand.status),
  };
}

export default function ProductSelectModal({
  open,
  selectedProductIds,
  selectedProducts: initialSelectedProducts,
  onCancel,
  onConfirm,
}: ProductSelectModalProps) {
  const [products, setProducts] = useState<SelectableProduct[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [categoryId, setCategoryId] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const [barcode, setBarcode] = useState('');
  const [brandId, setBrandId] = useState<string>();
  const [current, setCurrent] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedProductCache, setSelectedProductCache] = useState<SelectableProduct[]>([]);

  useEffect(() => {
    if (!open) return;

    setSelectedIds(selectedProductIds);
    setSelectedProductCache(initialSelectedProducts);
    setCategoryId(undefined);
    setKeyword('');
    setBarcode('');
    setBrandId(undefined);
    setCurrent(1);

    Promise.all([listAllCategories(), listAllBrands()])
      .then(([categoryItems, brandItems]) => {
        setCategories(categoryItems.map((item) => toCategoryOption(item as Record<string, unknown>)));
        setBrands(brandItems.map((item) => toBrandOption(item as Record<string, unknown>)));
      })
      .catch(() => message.error('商品加载失败，请重试'))
  }, [initialSelectedProducts, open, selectedProductIds]);

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    listProducts(toProductSelectQuery({ keyword, barcode, categoryId, brandId, current }))
      .then((response) => {
        if (response.code !== 0 || !response.data) throw new Error(response.message || '商品加载失败');
        setProducts(response.data.items.map((item) => toSelectableProduct(item as Record<string, unknown>)));
        setTotal(response.data.total);
      })
      .catch(() => message.error('商品加载失败，请重试'))
      .finally(() => setLoading(false));
  }, [barcode, brandId, categoryId, current, keyword, open]);

  const selectedProducts = useMemo(
    () => toSelectedProducts(selectedProductCache, selectedIds),
    [selectedIds, selectedProductCache],
  );

  const resetCurrentPage = () => setCurrent(1);

  const handleSelectionChange = (keys: React.Key[]) => {
    const nextSelectedIds = keys.map(String);
    const pageProductIds = new Set(products.map((product) => product.id));
    const selectedProductIdsSet = new Set(nextSelectedIds);
    const retainedProducts = selectedProductCache.filter(
      (product) => !pageProductIds.has(product.id) && selectedProductIdsSet.has(product.id),
    );
    const selectedPageProducts = products.filter((product) => selectedProductIdsSet.has(product.id));

    setSelectedIds(nextSelectedIds);
    setSelectedProductCache(mergeSelectedProducts(retainedProducts, selectedPageProducts));
  };

  const productColumns: TableColumnsType<SelectableProduct> = [
    { title: '商品名称', dataIndex: 'name', width: 180 },
    { title: '简称', dataIndex: 'short_name', width: 120, render: (value) => value || '-' },
    { title: '条形码', dataIndex: 'barcode', width: 150 },
    { title: '品牌', dataIndex: 'brand_name', width: 120, render: (value) => value || '-' },
    { title: '分类', dataIndex: 'category_name', width: 120, render: (value) => value || '-' },
    { title: '单位', dataIndex: 'unit', width: 80 },
    { title: '成本价', dataIndex: 'cost_price', width: 100, render: (value) => `¥${value.toFixed(2)}` },
  ];

  const selectedColumns: TableColumnsType<SelectableProduct> = [
    { title: '商品名称', dataIndex: 'name', width: 180 },
    { title: '条形码', dataIndex: 'barcode', width: 150 },
    { title: '品牌', dataIndex: 'brand_name', width: 120, render: (value) => value || '-' },
    {
      title: '操作',
      width: 80,
      render: (_, product) => (
        <Button
          type="link"
          danger
          icon={<DeleteOutlined />}
          onClick={() => setSelectedIds((current) => current.filter((id) => id !== product.id))}
        >
          移除
        </Button>
      ),
    },
  ];

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm(selectedProducts);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Modal
      title="选择商品"
      open={open}
      onCancel={onCancel}
      onOk={handleConfirm}
      okText={`确认选择（${selectedProducts.length}）`}
      cancelText="取消"
      okButtonProps={{ loading: confirming }}
      width={1100}
      destroyOnHidden
    >
      <div style={{ display: 'flex', gap: 16, minHeight: 430 }}>
        <div style={{ width: 180, borderRight: '1px solid #f0f0f0', paddingRight: 12 }}>
          <Typography.Text strong>商品分类</Typography.Text>
          <List
            size="small"
            style={{ marginTop: 8 }}
            dataSource={[{ id: '', name: '全部分类', status: 'active' }, ...categories.filter((item) => item.status === 'active')]}
            renderItem={(category) => (
              <List.Item
                style={{ cursor: 'pointer', paddingInline: 8, borderRadius: 4, background: categoryId === (category.id || undefined) ? '#e6f4ff' : undefined }}
                onClick={() => {
                  setCategoryId(category.id || undefined);
                  resetCurrentPage();
                }}
              >
                {category.name}
              </List.Item>
            )}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Space wrap style={{ marginBottom: 12 }}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value);
                resetCurrentPage();
              }}
              placeholder="搜索商品名称或简称"
              style={{ width: 220 }}
            />
            <Input
              allowClear
              placeholder="搜索条形码"
              value={barcode}
              onChange={(event) => {
                setBarcode(event.target.value);
                resetCurrentPage();
              }}
              style={{ width: 180 }}
            />
            <Select
              allowClear
              placeholder="全部品牌"
              value={brandId}
              options={brands.filter((brand) => brand.status === 'active').map((brand) => ({ label: brand.name, value: brand.id }))}
              onChange={(value) => {
                setBrandId(value);
                resetCurrentPage();
              }}
              style={{ width: 180 }}
            />
          </Space>
          <Table<SelectableProduct>
            rowKey="id"
            size="small"
            loading={loading}
            dataSource={products}
            columns={productColumns}
            scroll={{ x: 900, y: 260 }}
            pagination={{ current, pageSize: 10, total, showSizeChanger: false, showTotal: (value) => `共 ${value} 项`, onChange: setCurrent }}
            rowSelection={{
              selectedRowKeys: selectedIds,
              preserveSelectedRowKeys: true,
              onChange: handleSelectionChange,
            }}
          />
        </div>
      </div>
      <Divider style={{ marginBlock: 16 }} />
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
        <Typography.Text strong>已选商品（{selectedProducts.length}）</Typography.Text>
        <Button type="link" danger disabled={!selectedProducts.length} onClick={() => setSelectedIds([])}>清空</Button>
      </Space>
      <Table<SelectableProduct>
        rowKey="id"
        size="small"
        dataSource={selectedProducts}
        columns={selectedColumns}
        pagination={false}
        scroll={{ y: 150 }}
        locale={{ emptyText: '暂未选择商品' }}
      />
    </Modal>
  );
}

export type { SelectableProduct } from './productSelection';
