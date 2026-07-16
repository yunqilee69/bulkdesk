import { PageContainer } from '@ant-design/pro-components';
import { Button, Card, Input, InputNumber, message, Modal, Select, Space, Table, Tabs, Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { MinusCircleOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { listAllWarehouses, listAllSuppliers, listAllInventory, batchStockIn, batchStockOut, batchTransfer, batchStocktake } from '@/services/inventory';
import { listAllProducts } from '@/services/product';
import { loadInventoryQuantities } from './inventoryState';
import { runWithSubmissionLock } from './submission';

// --- Shared types ---

interface ProductWithVariants {
  id: string;
  name: string;
  brand_name?: string;
  status: string;
  variants: Array<{
    id: string;
    barcode: string;
    name: string;
    cost_price: number;
    status: string;
  }>;
}

interface StockInRow {
  product_id: string;
  barcode: string;
  product_name: string;
  brand_name: string;
  quantity: number;
  cost_price: number;
  original_cost_price: number;
}

interface StockOutRow {
  product_id: string;
  barcode: string;
  product_name: string;
  brand_name: string;
  quantity: number;
}

interface TransferRow {
  product_id: string;
  barcode: string;
  product_name: string;
  brand_name: string;
  quantity: number;
}

interface StocktakeRow {
  product_id: string;
  barcode: string;
  product_name: string;
  brand_name: string;
  current_quantity: number;
  actual_quantity: number;
}

// --- Shared helpers ---

function buildTreeData(products: ProductWithVariants[], keyword: string): DataNode[] {
  const filtered = keyword
    ? products.filter(
        (p) =>
          p.name.includes(keyword) ||
          p.variants.some((v) => v.barcode.includes(keyword) || v.name.includes(keyword)),
      )
    : products;

  return filtered
    .filter((p) => p.status === 'active')
    .map((p) => ({
      key: `product-${p.id}`,
      title: p.brand_name ? `${p.name} [${p.brand_name}]` : p.name,
      selectable: false,
      children: p.variants
        .filter((v) => v.status === 'active')
        .map((v) => ({
          key: `product-${v.id}`,
          title: `${v.barcode} - ${v.name}  成本价:¥${v.cost_price}`,
          isLeaf: true,
        })),
    }))
    .filter((n) => n.children && n.children.length > 0);
}

function buildVariantLookup(products: ProductWithVariants[]) {
  const lookup: Record<string, { barcode: string; name: string; cost_price: number; product_name: string; brand_name: string }> = {};
  for (const p of products) {
    for (const v of p.variants) {
      lookup[v.id] = {
        barcode: v.barcode,
        name: v.name,
        cost_price: v.cost_price,
        product_name: p.name,
        brand_name: p.brand_name || '',
      };
    }
  }
  return lookup;
}

// --- Main Component ---

const OperationsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('stock-in');

  // Shared warehouse/supplier options
  const [warehouseOptions, setWarehouseOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [supplierOptions, setSupplierOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [allProducts, setAllProducts] = useState<ProductWithVariants[]>([]);

  // Shared 商品 modal state
  const [productModalOpen, setSkuModalOpen] = useState(false);
  const [treeData, setTreeData] = useState<DataNode[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');

  // Stock-in tab state
  const [siWarehouseId, setSiWarehouseId] = useState<string | undefined>();
  const [siSupplierId, setSiSupplierId] = useState<string | undefined>();
  const [siRemark, setSiRemark] = useState('');
  const [siRows, setSiRows] = useState<StockInRow[]>([]);
  const [siConfirmOpen, setSiConfirmOpen] = useState(false);
  const [siPriceChanges, setSiPriceChanges] = useState<Array<{ barcode: string; product_name: string; old_price: number; new_price: number }>>([]);

  // Stock-out tab state
  const [soWarehouseId, setSoWarehouseId] = useState<string | undefined>();
  const [soRemark, setSoRemark] = useState('');
  const [soRows, setSoRows] = useState<StockOutRow[]>([]);

  // Transfer tab state
  const [trFromWarehouseId, setTrFromWarehouseId] = useState<string | undefined>();
  const [trToWarehouseId, setTrToWarehouseId] = useState<string | undefined>();
  const [trRemark, setTrRemark] = useState('');
  const [trRows, setTrRows] = useState<TransferRow[]>([]);

  // Stocktake tab state
  const [stWarehouseId, setStWarehouseId] = useState<string | undefined>();
  const [stRemark, setStRemark] = useState('');
  const [stRows, setStRows] = useState<StocktakeRow[]>([]);
  const [stInventoryLoadState, setStInventoryLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  // Load warehouses and suppliers
  useEffect(() => {
    Promise.all([listAllWarehouses(), listAllSuppliers()])
      .then(([warehouses, suppliers]) => {
        setWarehouseOptions(
          warehouses
            .filter((w: Record<string, unknown>) => w.status === 'active')
            .map((w: Record<string, string>) => ({ label: w.name, value: w.id })),
        );
        setSupplierOptions(
          suppliers
            .filter((s: Record<string, unknown>) => s.status === 'active')
            .map((s: Record<string, string>) => ({ label: s.name, value: s.id })),
        );
      })
      .catch(() => message.error('库存操作基础数据加载失败，请刷新页面'));
  }, []);

  // Load products for tree
  const loadProducts = useCallback(async () => {
    const raw = await listAllProducts();
    const products: ProductWithVariants[] = raw.map((p: Record<string, unknown>) => ({
      id: String(p.id),
      name: String(p.name),
      brand_name: p.brand_name ? String(p.brand_name) : '',
      status: String(p.status),
      variants: (p.variants as Record<string, unknown>[])?.map((v) => ({
        id: String(v.id),
        barcode: String(v.barcode),
        name: String(v.name),
        cost_price: Number(v.cost_price),
        status: String(v.status),
      })) ?? [],
    }));
    setAllProducts(products);
    setTreeData(buildTreeData(products, searchKeyword));
  }, [searchKeyword]);

  // Open 商品 modal
  const openSkuModal = async () => {
    if (activeTab === 'stocktake' && !stWarehouseId) {
      message.warning('请先选择仓库');
      return;
    }
    try {
      await loadProducts();
    } catch {
      message.error('商品 商品 加载失败，请重试');
      return;
    }
    const existingIds = getExistingSkuIds();
    setCheckedKeys(existingIds.map((id) => `product-${id}`));
    setSkuModalOpen(true);
  };

  const getExistingSkuIds = (): string[] => {
    switch (activeTab) {
      case 'stock-in': return siRows.map((r) => r.product_id);
      case 'stock-out': return soRows.map((r) => r.product_id);
      case 'transfer': return trRows.map((r) => r.product_id);
      case 'stocktake': return stRows.map((r) => r.product_id);
      default: return [];
    }
  };

  // Handle 商品 selection confirm
  const handleSkuConfirm = async () => {
    const selectedSkuIds = checkedKeys
      .filter((k) => k.startsWith('product-'))
      .map((k) => k.replace('product-', ''));

    const variantLookup = buildVariantLookup(allProducts);

    switch (activeTab) {
      case 'stock-in': {
        const existingMap = new Map(siRows.map((r) => [r.product_id, r]));
        const newRows: StockInRow[] = [];
        for (const id of selectedSkuIds) {
          const existing = existingMap.get(id);
          if (existing) {
            newRows.push(existing);
          } else if (variantLookup[id]) {
            const v = variantLookup[id];
            newRows.push({
              product_id: id, barcode: v.barcode, product_name: v.name,
              brand_name: v.brand_name,
              quantity: 1, cost_price: v.cost_price, original_cost_price: v.cost_price,
            });
          }
        }
        setSiRows(newRows);
        break;
      }
      case 'stock-out': {
        const existingMap = new Map(soRows.map((r) => [r.product_id, r]));
        const newRows: StockOutRow[] = [];
        for (const id of selectedSkuIds) {
          const existing = existingMap.get(id);
          if (existing) {
            newRows.push(existing);
          } else if (variantLookup[id]) {
            const v = variantLookup[id];
            newRows.push({
              product_id: id, barcode: v.barcode, product_name: v.name,
              brand_name: v.brand_name, quantity: 1,
            });
          }
        }
        setSoRows(newRows);
        break;
      }
      case 'transfer': {
        const existingMap = new Map(trRows.map((r) => [r.product_id, r]));
        const newRows: TransferRow[] = [];
        for (const id of selectedSkuIds) {
          const existing = existingMap.get(id);
          if (existing) {
            newRows.push(existing);
          } else if (variantLookup[id]) {
            const v = variantLookup[id];
            newRows.push({
              product_id: id, barcode: v.barcode, product_name: v.name,
              brand_name: v.brand_name, quantity: 1,
            });
          }
        }
        setTrRows(newRows);
        break;
      }
      case 'stocktake': {
        if (!stWarehouseId) return;
        setStInventoryLoadState('loading');
        let invMap: Record<string, number>;
        try {
          invMap = await loadInventoryQuantities(stWarehouseId, listAllInventory);
        } catch {
          setStInventoryLoadState('error');
          message.error('库存加载失败，请重试');
          return;
        }
        const existingMap = new Map(stRows.map((r) => [r.product_id, r]));
        const newRows: StocktakeRow[] = [];
        for (const id of selectedSkuIds) {
          const existing = existingMap.get(id);
          if (existing) {
            newRows.push(existing);
          } else if (variantLookup[id]) {
            const v = variantLookup[id];
            newRows.push({
              product_id: id, barcode: v.barcode, product_name: v.name,
              brand_name: v.brand_name,
              current_quantity: invMap[id] ?? 0, actual_quantity: invMap[id] ?? 0,
            });
          }
        }
        setStRows(newRows);
        setStInventoryLoadState('ready');
        break;
      }
    }
    setSkuModalOpen(false);
  };

  // --- Stock-in handlers ---

  const handleSiSubmit = () => {
    if (!siWarehouseId) { message.warning('请选择仓库'); return; }
    if (siRows.length === 0) { message.warning('请添加商品'); return; }
    if (siRows.some((r) => !r.quantity || r.quantity < 1)) { message.warning('请填写所有商品的入库数量'); return; }

    const changes = siRows.filter((r) => Math.abs(r.cost_price - r.original_cost_price) > 0.001)
      .map((r) => ({ barcode: r.barcode, product_name: r.product_name, old_price: r.original_cost_price, new_price: r.cost_price }));

    if (changes.length > 0) {
      setSiPriceChanges(changes);
      setSiConfirmOpen(true);
    } else {
      doSiSubmit();
    }
  };

  const doSiSubmit = async () => {
    const warehouseId = siWarehouseId;
    if (!warehouseId) {
      message.warning('请选择仓库');
      return;
    }
    try {
      await runWithSubmissionLock(submittingRef, async () => {
        const res = await batchStockIn({
          warehouse_id: warehouseId,
          supplier_id: siSupplierId,
          items: siRows.map((r) => ({ product_id: r.product_id, quantity: r.quantity, cost_price: r.cost_price })),
          remark: siRemark || undefined,
        });
        if (res.code === 0) {
          message.success(`入库成功，单号：${res.data?.order_no || ''}`);
          setSiRows([]);
          setSiRemark('');
          setSiConfirmOpen(false);
        } else {
          message.error(res.message || '入库失败');
        }
      }, setSubmitting);
    } catch {
      message.error('入库失败，请重试');
    }
  };

  // --- Stock-out handlers ---

  const handleSoSubmit = async () => {
    if (!soWarehouseId) { message.warning('请选择仓库'); return; }
    if (soRows.length === 0) { message.warning('请添加商品'); return; }
    if (soRows.some((r) => !r.quantity || r.quantity < 1)) { message.warning('请填写所有商品的出库数量'); return; }
    try {
      await runWithSubmissionLock(submittingRef, async () => {
        const res = await batchStockOut({
          warehouse_id: soWarehouseId,
          items: soRows.map((r) => ({ product_id: r.product_id, quantity: r.quantity })),
          remark: soRemark || undefined,
        });
        if (res.code === 0) {
          message.success('出库成功');
          setSoRows([]);
          setSoRemark('');
        } else {
          message.error(res.message || '出库失败');
        }
      }, setSubmitting);
    } catch {
      message.error('出库失败，请重试');
    }
  };

  // --- Transfer handlers ---

  const handleTrSubmit = async () => {
    if (!trFromWarehouseId || !trToWarehouseId) { message.warning('请选择源仓库和目标仓库'); return; }
    if (trFromWarehouseId === trToWarehouseId) { message.warning('源仓库和目标仓库不能相同'); return; }
    if (trRows.length === 0) { message.warning('请添加商品'); return; }
    if (trRows.some((r) => !r.quantity || r.quantity < 1)) { message.warning('请填写所有商品的调拨数量'); return; }
    try {
      await runWithSubmissionLock(submittingRef, async () => {
        const res = await batchTransfer({
          from_warehouse_id: trFromWarehouseId,
          to_warehouse_id: trToWarehouseId,
          items: trRows.map((r) => ({ product_id: r.product_id, quantity: r.quantity })),
          remark: trRemark || undefined,
        });
        if (res.code === 0) {
          message.success('调拨成功');
          setTrRows([]);
          setTrRemark('');
        } else {
          message.error(res.message || '调拨失败');
        }
      }, setSubmitting);
    } catch {
      message.error('调拨失败，请重试');
    }
  };

  // --- Stocktake handlers ---

  const handleStSubmit = async () => {
    if (!stWarehouseId) { message.warning('请选择仓库'); return; }
    if (stRows.length === 0) { message.warning('请添加商品'); return; }
    if (stRows.some((r) => r.actual_quantity === undefined || r.actual_quantity < 0)) { message.warning('请填写所有商品的实际数量'); return; }
    try {
      await runWithSubmissionLock(submittingRef, async () => {
        const res = await batchStocktake({
          warehouse_id: stWarehouseId,
          items: stRows.map((r) => ({ product_id: r.product_id, actual_quantity: r.actual_quantity })),
          remark: stRemark || undefined,
        });
        if (res.code === 0) {
          message.success('盘点成功');
          setStRows([]);
          setStRemark('');
        } else {
          message.error(res.message || '盘点失败');
        }
      }, setSubmitting);
    } catch {
      message.error('盘点失败，请重试');
    }
  };

  // --- Column definitions ---

  const siColumns = [
    { title: '商品', dataIndex: 'product_name', width: 130 },
    { title: '品牌', dataIndex: 'brand_name', width: 90 },
    { title: '商品编码', dataIndex: 'barcode', width: 130 },
    { title: '商品名称', dataIndex: 'product_name', width: 140 },
    {
      title: '成本价', dataIndex: 'cost_price', width: 130,
      render: (_: unknown, record: StockInRow) => (
        <Space size={4}>
          <InputNumber min={0} precision={2} value={record.cost_price}
            onChange={(val) => setSiRows((prev) => prev.map((r) => r.product_id === record.product_id ? { ...r, cost_price: val ?? 0 } : r))}
            style={{ width: 90 }} />
          {Math.abs(record.cost_price - record.original_cost_price) > 0.001 && (
            <span style={{ color: '#faad14', fontSize: 12 }}>已改</span>
          )}
        </Space>
      ),
    },
    {
      title: '入库数量', dataIndex: 'quantity', width: 120,
      render: (_: unknown, record: StockInRow) => (
        <InputNumber min={1} precision={0} value={record.quantity}
          onChange={(val) => setSiRows((prev) => prev.map((r) => r.product_id === record.product_id ? { ...r, quantity: val ?? 1 } : r))}
          style={{ width: 90 }} />
      ),
    },
    {
      title: '小计', width: 110,
      render: (_: unknown, record: StockInRow) => `¥${(record.cost_price * record.quantity).toFixed(2)}`,
    },
    {
      title: '操作', width: 50,
      render: (_: unknown, record: StockInRow) => (
        <MinusCircleOutlined style={{ color: '#ff4d4f', cursor: 'pointer' }}
          onClick={() => setSiRows((prev) => prev.filter((r) => r.product_id !== record.product_id))} />
      ),
    },
  ];

  const soColumns = [
    { title: '商品', dataIndex: 'product_name', width: 130 },
    { title: '品牌', dataIndex: 'brand_name', width: 90 },
    { title: '商品编码', dataIndex: 'barcode', width: 130 },
    { title: '商品名称', dataIndex: 'product_name', width: 140 },
    {
      title: '出库数量', dataIndex: 'quantity', width: 120,
      render: (_: unknown, record: StockOutRow) => (
        <InputNumber min={1} precision={0} value={record.quantity}
          onChange={(val) => setSoRows((prev) => prev.map((r) => r.product_id === record.product_id ? { ...r, quantity: val ?? 1 } : r))}
          style={{ width: 90 }} />
      ),
    },
    {
      title: '操作', width: 50,
      render: (_: unknown, record: StockOutRow) => (
        <MinusCircleOutlined style={{ color: '#ff4d4f', cursor: 'pointer' }}
          onClick={() => setSoRows((prev) => prev.filter((r) => r.product_id !== record.product_id))} />
      ),
    },
  ];

  const trColumns = [
    { title: '商品', dataIndex: 'product_name', width: 130 },
    { title: '品牌', dataIndex: 'brand_name', width: 90 },
    { title: '商品编码', dataIndex: 'barcode', width: 130 },
    { title: '商品名称', dataIndex: 'product_name', width: 140 },
    {
      title: '调拨数量', dataIndex: 'quantity', width: 120,
      render: (_: unknown, record: TransferRow) => (
        <InputNumber min={1} precision={0} value={record.quantity}
          onChange={(val) => setTrRows((prev) => prev.map((r) => r.product_id === record.product_id ? { ...r, quantity: val ?? 1 } : r))}
          style={{ width: 90 }} />
      ),
    },
    {
      title: '操作', width: 50,
      render: (_: unknown, record: TransferRow) => (
        <MinusCircleOutlined style={{ color: '#ff4d4f', cursor: 'pointer' }}
          onClick={() => setTrRows((prev) => prev.filter((r) => r.product_id !== record.product_id))} />
      ),
    },
  ];

  const stColumns = [
    { title: '商品', dataIndex: 'product_name', width: 130 },
    { title: '品牌', dataIndex: 'brand_name', width: 90 },
    { title: '商品编码', dataIndex: 'barcode', width: 130 },
    { title: '商品名称', dataIndex: 'product_name', width: 140 },
    { title: '当前数量', dataIndex: 'current_quantity', width: 100 },
    {
      title: '实际数量', dataIndex: 'actual_quantity', width: 120,
      render: (_: unknown, record: StocktakeRow) => (
        <InputNumber min={0} precision={0} value={record.actual_quantity}
          onChange={(val) => setStRows((prev) => prev.map((r) => r.product_id === record.product_id ? { ...r, actual_quantity: val ?? 0 } : r))}
          style={{ width: 90 }} />
      ),
    },
    {
      title: '差异', width: 80,
      render: (_: unknown, record: StocktakeRow) => {
        const diff = record.actual_quantity - record.current_quantity;
        if (diff === 0) return <span style={{ color: '#52c41a' }}>0</span>;
        return <span style={{ color: diff > 0 ? '#1890ff' : '#ff4d4f' }}>{diff > 0 ? `+${diff}` : diff}</span>;
      },
    },
    {
      title: '操作', width: 50,
      render: (_: unknown, record: StocktakeRow) => (
        <MinusCircleOutlined style={{ color: '#ff4d4f', cursor: 'pointer' }}
          onClick={() => setStRows((prev) => prev.filter((r) => r.product_id !== record.product_id))} />
      ),
    },
  ];

  // --- Clear handlers per tab ---

  const handleClear = () => {
    switch (activeTab) {
      case 'stock-in': setSiRows([]); setSiRemark(''); break;
      case 'stock-out': setSoRows([]); setSoRemark(''); break;
      case 'transfer': setTrRows([]); setTrRemark(''); break;
      case 'stocktake': setStRows([]); setStRemark(''); break;
    }
  };

  // --- Tab content renderers ---

  const renderStockInTab = () => {
    const totalAmount = siRows.reduce((sum, r) => sum + r.cost_price * r.quantity, 0);
    const canSubmit = siWarehouseId && siRows.length > 0 && siRows.every((r) => r.quantity >= 1);
    return (
      <>
        <Card style={{ marginBottom: 16 }}>
          <Space size="large" wrap>
            <div>
              <span style={{ marginRight: 8 }}>仓库：</span>
              <Select showSearch={{ filterOption: (input, option) => (option?.label ?? '').includes(input) }} style={{ width: 200 }} placeholder="请选择仓库"
                options={warehouseOptions} value={siWarehouseId} onChange={setSiWarehouseId}
              />
            </div>
            <div>
              <span style={{ marginRight: 8 }}>供应商：</span>
              <Select showSearch={{ filterOption: (input, option) => (option?.label ?? '').includes(input) }} allowClear style={{ width: 200 }} placeholder="请选择供应商"
                options={supplierOptions} value={siSupplierId} onChange={setSiSupplierId}
              />
            </div>
          </Space>
        </Card>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={openSkuModal}>选择商品</Button>
          </div>
          <Table<StockInRow> dataSource={siRows} columns={siColumns} rowKey="product_id" pagination={false}
            locale={{ emptyText: '暂无商品，请点击"选择商品"添加' }}
            footer={siRows.length > 0 ? () => (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>共 {siRows.length} 项</span>
                <span style={{ fontSize: 16, fontWeight: 500 }}>合计：¥{totalAmount.toFixed(2)}</span>
              </div>
            ) : undefined}
          />
        </Card>
        <Card style={{ marginTop: 16 }}>
          <Space orientation="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <span style={{ marginRight: 8 }}>备注：</span>
              <Input style={{ width: 400 }} placeholder="选填" maxLength={255} value={siRemark} onChange={(e) => setSiRemark(e.target.value)} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={handleClear}>清空</Button>
                <Button type="primary" onClick={handleSiSubmit} disabled={!canSubmit} loading={submitting}>确认入库</Button>
              </Space>
            </div>
          </Space>
        </Card>
      </>
    );
  };

  const renderStockOutTab = () => {
    const canSubmit = soWarehouseId && soRows.length > 0 && soRows.every((r) => r.quantity >= 1);
    return (
      <>
        <Card style={{ marginBottom: 16 }}>
          <Space size="large" wrap>
            <div>
              <span style={{ marginRight: 8 }}>仓库：</span>
              <Select showSearch={{ filterOption: (input, option) => (option?.label ?? '').includes(input) }} style={{ width: 200 }} placeholder="请选择仓库"
                options={warehouseOptions} value={soWarehouseId} onChange={setSoWarehouseId}
              />
            </div>
          </Space>
        </Card>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={openSkuModal}>选择商品</Button>
          </div>
          <Table<StockOutRow> dataSource={soRows} columns={soColumns} rowKey="product_id" pagination={false}
            locale={{ emptyText: '暂无商品，请点击"选择商品"添加' }}
            footer={soRows.length > 0 ? () => <span>共 {soRows.length} 项</span> : undefined}
          />
        </Card>
        <Card style={{ marginTop: 16 }}>
          <Space orientation="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <span style={{ marginRight: 8 }}>备注：</span>
              <Input style={{ width: 400 }} placeholder="选填" maxLength={255} value={soRemark} onChange={(e) => setSoRemark(e.target.value)} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={handleClear}>清空</Button>
                <Button type="primary" onClick={handleSoSubmit} disabled={!canSubmit} loading={submitting}>确认出库</Button>
              </Space>
            </div>
          </Space>
        </Card>
      </>
    );
  };

  const renderTransferTab = () => {
    const canSubmit = trFromWarehouseId && trToWarehouseId && trFromWarehouseId !== trToWarehouseId && trRows.length > 0 && trRows.every((r) => r.quantity >= 1);
    return (
      <>
        <Card style={{ marginBottom: 16 }}>
          <Space size="large" wrap>
            <div>
              <span style={{ marginRight: 8 }}>源仓库：</span>
              <Select showSearch={{ filterOption: (input, option) => (option?.label ?? '').includes(input) }} style={{ width: 200 }} placeholder="请选择源仓库"
                options={warehouseOptions} value={trFromWarehouseId} onChange={setTrFromWarehouseId}
              />
            </div>
            <div>
              <span style={{ marginRight: 8 }}>目标仓库：</span>
              <Select showSearch={{ filterOption: (input, option) => (option?.label ?? '').includes(input) }} style={{ width: 200 }} placeholder="请选择目标仓库"
                options={warehouseOptions} value={trToWarehouseId} onChange={setTrToWarehouseId}
                status={trFromWarehouseId && trToWarehouseId && trFromWarehouseId === trToWarehouseId ? 'error' : undefined}
              />
              {trFromWarehouseId && trToWarehouseId && trFromWarehouseId === trToWarehouseId && (
                <span style={{ color: '#ff4d4f', marginLeft: 8, fontSize: 12 }}>源仓库和目标仓库不能相同</span>
              )}
            </div>
          </Space>
        </Card>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={openSkuModal}>选择商品</Button>
          </div>
          <Table<TransferRow> dataSource={trRows} columns={trColumns} rowKey="product_id" pagination={false}
            locale={{ emptyText: '暂无商品，请点击"选择商品"添加' }}
            footer={trRows.length > 0 ? () => <span>共 {trRows.length} 项</span> : undefined}
          />
        </Card>
        <Card style={{ marginTop: 16 }}>
          <Space orientation="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <span style={{ marginRight: 8 }}>备注：</span>
              <Input style={{ width: 400 }} placeholder="选填" maxLength={255} value={trRemark} onChange={(e) => setTrRemark(e.target.value)} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={handleClear}>清空</Button>
                <Button type="primary" onClick={handleTrSubmit} disabled={!canSubmit} loading={submitting}>确认调拨</Button>
              </Space>
            </div>
          </Space>
        </Card>
      </>
    );
  };

  const renderStocktakeTab = () => {
    const canSubmit = stInventoryLoadState === 'ready' && stWarehouseId && stRows.length > 0 && stRows.every((r) => r.actual_quantity !== undefined && r.actual_quantity >= 0);
    return (
      <>
        <Card style={{ marginBottom: 16 }}>
          <Space size="large" wrap>
            <div>
              <span style={{ marginRight: 8 }}>仓库：</span>
              <Select showSearch={{ filterOption: (input, option) => (option?.label ?? '').includes(input) }} style={{ width: 200 }} placeholder="请选择仓库"
                options={warehouseOptions} value={stWarehouseId} onChange={(value) => {
                  setStWarehouseId(value);
                  setStRows([]);
                  setStInventoryLoadState('idle');
                }}
              />
            </div>
            {stInventoryLoadState === 'error' ? (
              <span style={{ color: '#ff4d4f' }}>库存加载失败</span>
            ) : null}
          </Space>
        </Card>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={openSkuModal}>选择商品</Button>
          </div>
          <Table<StocktakeRow> dataSource={stRows} columns={stColumns} rowKey="product_id" pagination={false}
            locale={{ emptyText: '暂无商品，请点击"选择商品"添加' }}
            footer={stRows.length > 0 ? () => <span>共 {stRows.length} 项</span> : undefined}
          />
        </Card>
        <Card style={{ marginTop: 16 }}>
          <Space orientation="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <span style={{ marginRight: 8 }}>备注：</span>
              <Input style={{ width: 400 }} placeholder="选填" maxLength={255} value={stRemark} onChange={(e) => setStRemark(e.target.value)} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={handleClear}>清空</Button>
                <Button type="primary" onClick={handleStSubmit} disabled={!canSubmit} loading={submitting}>确认盘点</Button>
              </Space>
            </div>
          </Space>
        </Card>
      </>
    );
  };

  return (
    <PageContainer>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'stock-in', label: '入库', children: renderStockInTab() },
          { key: 'stock-out', label: '出库', children: renderStockOutTab() },
          { key: 'transfer', label: '调拨', children: renderTransferTab() },
          { key: 'stocktake', label: '盘点', children: renderStocktakeTab() },
        ]}
      />

      <Modal title="选择商品" open={productModalOpen} onCancel={() => setSkuModalOpen(false)}
        onOk={handleSkuConfirm} okText="确认选择" cancelText="取消" width={600} destroyOnHidden>
        <div style={{ marginBottom: 12 }}>
          <Space>
            <SearchOutlined />
            <Input style={{ width: 300 }} placeholder="搜索商品或商品" value={searchKeyword}
              onChange={(e) => {
                setSearchKeyword(e.target.value);
                setTreeData(buildTreeData(allProducts, e.target.value));
                if (e.target.value) {
                  const nodes = buildTreeData(allProducts, e.target.value);
                  setExpandedKeys(nodes.map((n) => String(n.key)));
                }
              }}
            />
          </Space>
        </div>
        <Tree checkable checkedKeys={checkedKeys}
          onCheck={(checked) => {
            const keys = Array.isArray(checked) ? checked : checked.checked;
            setCheckedKeys(keys as string[]);
          }}
          expandedKeys={expandedKeys}
          onExpand={(keys) => setExpandedKeys(keys as string[])}
          treeData={treeData}
          defaultExpandAll
          style={{ maxHeight: 400, overflow: 'auto' }}
        />
      </Modal>

      <Modal title="成本价变动确认" open={siConfirmOpen} onCancel={() => setSiConfirmOpen(false)}
        onOk={doSiSubmit} okText="确认入库" cancelText="取消" width={500}>
        <p style={{ marginBottom: 12 }}>以下商品的成本价与系统记录不一致，确认后将同步更新商品成本价：</p>
        <Table dataSource={siPriceChanges}
          columns={[
            { title: '商品编码', dataIndex: 'barcode', width: 130 },
            { title: '商品名称', dataIndex: 'product_name', width: 130 },
            { title: '原成本价', dataIndex: 'old_price', width: 90, render: (v: number) => `¥${v.toFixed(2)}` },
            { title: '新成本价', dataIndex: 'new_price', width: 90, render: (v: number) => `¥${v.toFixed(2)}` },
          ]}
          rowKey="barcode" pagination={false} size="small"
        />
      </Modal>
    </PageContainer>
  );
};

export default OperationsPage;
