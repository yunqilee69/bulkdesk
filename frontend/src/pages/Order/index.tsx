import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { Button, message, Tag, Descriptions, Drawer, Popconfirm, Table, Select, Input, InputNumber, Space, Modal, Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { MinusCircleOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { listOrders, getOrder, createOrder, shipOrder, confirmPayment, completeOrder, cancelOrder } from '@/services/order';
import { listAllCustomers } from '@/services/customer';
import { listAllInventory, listAllWarehouses } from '@/services/inventory';
import { listAllProducts } from '@/services/product';

interface OrderRecord {
  id: string;
  order_no: string;
  customer_id: string;
  customer_name?: string;
  warehouse_id: string;
  status: string;
  total_amount: number;
  cancel_reason?: string;
  remark?: string;
  created_at: string;
  items?: OrderItemRecord[];
  status_logs?: StatusLogRecord[];
}

interface OrderItemRecord {
  id: string;
  product_id: string;
  barcode: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface StatusLogRecord {
  id: string;
  from_status?: string;
  to_status: string;
  operator: string;
  remark?: string;
  created_at: string;
}

interface CustomerItem {
  id: string;
  name: string;
  level_id: string;
}

interface ProductWithVariants {
  id: string;
  name: string;
  brand_name?: string;
  status: string;
  variants: Array<{
    id: string;
    barcode: string;
    name: string;
    price: number;
    status: string;
  }>;
}

interface OrderItemRow {
  product_id: string;
  barcode: string;
  product_name: string;
  available_quantity: number;
  default_price: number;
  unit_price: number;
  quantity: number;
}

const statusMap: Record<string, { color: string; text: string }> = {
  placed: { color: 'blue', text: '已下单' },
  shipped: { color: 'cyan', text: '已发货' },
  paid: { color: 'orange', text: '已付款' },
  completed: { color: 'green', text: '已完成' },
  cancelled: { color: 'red', text: '已取消' },
};

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
          title: `${v.barcode} - ${v.name}  ¥${v.price}`,
          isLeaf: true,
        })),
    }))
    .filter((n) => n.children && n.children.length > 0);
}

function buildVariantLookup(products: ProductWithVariants[]) {
  const lookup: Record<string, { barcode: string; name: string; price: number }> = {};
  for (const p of products) {
    for (const v of p.variants) {
      lookup[v.id] = {
        barcode: v.barcode,
        name: v.name,
        price: v.price,
      };
    }
  }
  return lookup;
}

const OrderList: React.FC = () => {
  const actionRef = useRef<ActionType>(null);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<OrderRecord | null>(null);

  const [customerId, setCustomerId] = useState<string | undefined>();
  const [warehouseId, setWarehouseId] = useState<string | undefined>();
  const [orderItems, setOrderItems] = useState<OrderItemRow[]>([]);
  const [remark, setRemark] = useState('');
  const [warehouseOptions, setWarehouseOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [inventoryMap, setInventoryMap] = useState<Record<string, number>>({});
  const [inventoryLoadState, setInventoryLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [cancelOrderId, setCancelOrderId] = useState<string>();
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const [productModalOpen, setSkuModalOpen] = useState(false);
  const [treeData, setTreeData] = useState<DataNode[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [allProducts, setAllProducts] = useState<ProductWithVariants[]>([]);

  useEffect(() => {
    Promise.all([listAllCustomers(), listAllWarehouses()])
      .then(([customerItems, warehouses]) => {
        setCustomers(customerItems as CustomerItem[]);
        setWarehouseOptions(
          warehouses
            .filter((w: Record<string, unknown>) => w.status === 'active')
            .map((w: Record<string, string>) => ({ label: w.name, value: w.id })),
        );
      })
      .catch(() => message.error('订单基础数据加载失败，请刷新页面'));
  }, []);

  const loadInventory = useCallback(async (wid: string) => {
    setInventoryLoadState('loading');
    try {
      const inventoryItems = await listAllInventory(wid);
      const map: Record<string, number> = {};
      for (const item of inventoryItems) {
        map[item.product_id] = item.quantity - item.locked;
      }
      setInventoryMap(map);
      setOrderItems((prev) =>
        prev.map((row) => ({ ...row, available_quantity: map[row.product_id] ?? 0 })),
      );
      setInventoryLoadState('ready');
    } catch {
      setInventoryMap({});
      setOrderItems((prev) => prev.map((r) => ({ ...r, available_quantity: 0 })));
      setInventoryLoadState('error');
    }
  }, []);

  useEffect(() => {
    if (warehouseId) {
      loadInventory(warehouseId);
    } else {
      setInventoryMap({});
      setOrderItems((prev) => prev.map((r) => ({ ...r, available_quantity: 0 })));
      setInventoryLoadState('idle');
    }
  }, [warehouseId, loadInventory]);



  const customerOptions = customers.map((c) => ({ label: c.name, value: c.id }));

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
        price: Number(v.price),
        status: String(v.status),
      })) ?? [],
    }));
    setAllProducts(products);
    setTreeData(buildTreeData(products, ''));
  }, []);

  const openSkuModal = async () => {
    if (!warehouseId) {
      message.warning('请先选择仓库');
      return;
    }
    setSearchKeyword('');
    try {
      await loadProducts();
    } catch {
      message.error('商品 商品 加载失败，请重试');
      return;
    }
    setCheckedKeys(orderItems.map((r) => `product-${r.product_id}`));
    setSkuModalOpen(true);
  };

  const handleSkuConfirm = () => {
    const selectedSkuIds = checkedKeys
      .filter((k) => k.startsWith('product-'))
      .map((k) => k.replace('product-', ''));

    const variantLookup = buildVariantLookup(allProducts);

    const existingMap = new Map(orderItems.map((r) => [r.product_id, r]));
    const newRows: OrderItemRow[] = [];
    for (const id of selectedSkuIds) {
      const existing = existingMap.get(id);
      if (existing) {
        newRows.push(existing);
      } else if (variantLookup[id]) {
        const v = variantLookup[id];
        newRows.push({
          product_id: id,
          barcode: v.barcode,
          product_name: v.name,
          available_quantity: inventoryMap[id] ?? 0,
          default_price: v.price,
          unit_price: v.price,
          quantity: 1,
        });
      }
    }
    setOrderItems(newRows);
    setSkuModalOpen(false);
  };

  const resetCreateForm = () => {
    setCustomerId(undefined);
    setWarehouseId(undefined);
    setOrderItems([]);
    setRemark('');
    setInventoryMap({});
    setInventoryLoadState('idle');
  };

  const handleSubmit = async () => {
    if (!customerId) { message.warning('请选择客户'); return; }
    if (!warehouseId) { message.warning('请选择仓库'); return; }
    if (orderItems.length === 0) { message.warning('请添加商品'); return; }
    if (orderItems.some((r) => !r.quantity || r.quantity < 1)) { message.warning('请填写所有商品的数量'); return; }

    if (createSubmitting) return;
    setCreateSubmitting(true);
    try {
      const res = await createOrder({
        customer_id: customerId,
        warehouse_id: warehouseId,
        items: orderItems.map((r) => ({ product_id: r.product_id, quantity: r.quantity })),
        remark: remark || undefined,
      });
      if (res.code === 0) {
        message.success('创建成功');
        setCreateOpen(false);
        resetCreateForm();
        actionRef.current?.reload();
      } else {
        message.error(res.message || '创建失败');
      }
    } catch {
      // The global request handler displays the transport or business error.
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleAction = async (action: () => Promise<API.ResponseBase>, label: string) => {
    const res = await action();
    if (res.code === 0) {
      message.success(`${label}成功`);
      actionRef.current?.reload();
    } else {
      message.error(res.message || `${label}失败`);
    }
  };

  const handleCancelOrder = async () => {
    const reason = cancelReason.trim();
    if (!cancelOrderId || !reason) return;
    setCancelSubmitting(true);
    try {
      const res = await cancelOrder(cancelOrderId, { cancel_reason: reason });
      if (res.code === 0) {
        message.success('取消成功');
        setCancelOrderId(undefined);
        setCancelReason('');
        actionRef.current?.reload();
      } else {
        message.error(res.message || '取消失败');
      }
    } finally {
      setCancelSubmitting(false);
    }
  };

  const getActionButtons = (record: OrderRecord) => {
    const buttons: React.ReactNode[] = [];

    if (record.status === 'placed') {
      buttons.push(
        <Popconfirm
          key="ship"
          title="确认发货？"
          onConfirm={() => handleAction(() => shipOrder(record.id), '发货')}
        >
          <Button type="link">发货</Button>
        </Popconfirm>,
      );
    }

    if (record.status === 'shipped') {
      buttons.push(
        <Popconfirm
          key="confirmPayment"
          title="确认收款？"
          onConfirm={() => handleAction(() => confirmPayment(record.id), '确认收款')}
        >
          <Button type="link">确认收款</Button>
        </Popconfirm>,
      );
    }

    if (record.status === 'paid') {
      buttons.push(
        <Popconfirm
          key="complete"
          title="确认完成？"
          onConfirm={() => handleAction(() => completeOrder(record.id), '完成')}
        >
          <Button type="link">完成</Button>
        </Popconfirm>,
      );
    }

    if (record.status !== 'completed' && record.status !== 'cancelled') {
      buttons.push(
        <Button
          key="cancel"
          type="link"
          danger
          onClick={() => {
            setCancelOrderId(record.id);
            setCancelReason('');
          }}
        >
          取消
        </Button>,
      );
    }

    return buttons;
  };

  const showDetail = async (id: string) => {
    const res = await getOrder(id);
    if (res.code === 0) {
      setCurrentOrder(res.data);
      setDetailOpen(true);
    } else {
      message.error('获取订单详情失败');
    }
  };

  const columns: ProColumns<OrderRecord>[] = [
    {
      title: '订单号',
      dataIndex: 'order_no',
      width: 180,
      render: (_, record) => (
        <Button type="link" onClick={() => showDetail(record.id)}>
          {record.order_no}
        </Button>
      ),
    },
    { title: '客户', dataIndex: 'customer_name', width: 120 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      valueType: 'select',
      valueEnum: {
        placed: { text: '已下单', status: 'Processing' },
        shipped: { text: '已发货', status: 'Default' },
        paid: { text: '已付款', status: 'Warning' },
        completed: { text: '已完成', status: 'Success' },
        cancelled: { text: '已取消', status: 'Error' },
      },
      render: (_, record) => {
        const s = statusMap[record.status];
        return s ? <Tag color={s.color}>{s.text}</Tag> : record.status;
      },
    },
    { title: '总金额', dataIndex: 'total_amount', width: 100, valueType: 'money' },
    { title: '下单时间', dataIndex: 'created_at', width: 180, valueType: 'dateTime', search: false },
    {
      title: '操作',
      valueType: 'option',
      width: 200,
      render: (_, record) => getActionButtons(record),
    },
  ];

  const totalAmount = orderItems.reduce((sum, r) => sum + r.unit_price * r.quantity, 0);
  const canSubmit = inventoryLoadState === 'ready' && !!customerId && !!warehouseId && orderItems.length > 0 && orderItems.every((r) => r.quantity >= 1 && r.quantity <= r.available_quantity);

  const itemColumns = [
    { title: '商品编码', dataIndex: 'barcode', width: 130 },
    { title: '商品名称', dataIndex: 'product_name', width: 140 },
    {
      title: '可用库存', dataIndex: 'available_quantity', width: 100,
    },
    {
      title: '单价', dataIndex: 'unit_price', width: 100,
      render: (val: number) => `¥${val.toFixed(2)}`,
    },
    {
      title: '数量', dataIndex: 'quantity', width: 120,
      render: (_: unknown, record: OrderItemRow) => (
        <InputNumber min={1} max={record.available_quantity} precision={0} value={record.quantity}
          onChange={(val) => setOrderItems((prev) => prev.map((r) => r.product_id === record.product_id ? { ...r, quantity: val ?? 1 } : r))}
          style={{ width: 90 }} />
      ),
    },
    {
      title: '小计', width: 110,
      render: (_: unknown, record: OrderItemRow) => `¥${(record.unit_price * record.quantity).toFixed(2)}`,
    },
    {
      title: '操作', width: 50,
      render: (_: unknown, record: OrderItemRow) => (
        <MinusCircleOutlined style={{ color: '#ff4d4f', cursor: 'pointer' }}
          onClick={() => setOrderItems((prev) => prev.filter((r) => r.product_id !== record.product_id))} />
      ),
    },
  ];

  return (
    <PageContainer>
      <ProTable<OrderRecord>
        actionRef={actionRef}
        rowKey="id"
        search={{ labelWidth: 80 }}
        request={async (params) => {
          const res = await listOrders({
            keyword: params?.order_no,
            status: params?.status,
            customer_id: params?.customer_id,
            page: params?.current,
            page_size: params?.pageSize,
          });
          return {
            data: res.data?.items ?? [],
            total: res.data?.total ?? 0,
            success: res.code === 0,
          };
        }}
        toolBarRender={() => [
          <Button key="create" type="primary" onClick={() => setCreateOpen(true)}>
            新建订单
          </Button>,
        ]}
        columns={columns}
      />

      <Drawer
        title="新建订单"
        open={createOpen}
        onClose={() => { setCreateOpen(false); resetCreateForm(); }}
        size="large"
        destroyOnHidden
      >
        <Space size="large" wrap style={{ marginBottom: 16 }}>
          <div>
            <span style={{ marginRight: 8 }}>客户：</span>
            <Select showSearch={{ filterOption: (input, option) => (option?.label ?? '').includes(input) }} style={{ width: 260 }} placeholder="请选择客户"
              options={customerOptions} value={customerId} onChange={setCustomerId}
            />
          </div>
          <div>
            <span style={{ marginRight: 8 }}>仓库：</span>
            <Select showSearch={{ filterOption: (input, option) => (option?.label ?? '').includes(input) }} style={{ width: 260 }} placeholder="请选择仓库"
              options={warehouseOptions} value={warehouseId} onChange={setWarehouseId}
            />
          </div>
        </Space>

        {inventoryLoadState === 'error' ? (
          <div style={{ color: '#ff4d4f', marginBottom: 16 }}>
            库存加载失败
            <Button type="link" size="small" onClick={() => warehouseId && loadInventory(warehouseId)}>重试</Button>
          </div>
        ) : null}


        <div style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openSkuModal}>选择商品</Button>
        </div>

        <Table<OrderItemRow> dataSource={orderItems} columns={itemColumns} rowKey="product_id" pagination={false}
          locale={{ emptyText: '暂无商品，请点击"选择商品"添加' }}
          footer={orderItems.length > 0 ? () => (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>共 {orderItems.length} 项</span>
              <span style={{ fontSize: 16, fontWeight: 500 }}>合计：¥{totalAmount.toFixed(2)}</span>
            </div>
          ) : undefined}
        />

        <div style={{ marginTop: 24 }}>
          <Space orientation="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <span style={{ marginRight: 8 }}>备注：</span>
              <Input style={{ width: 400 }} placeholder="选填" maxLength={255} value={remark} onChange={(e) => setRemark(e.target.value)} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={() => { setCreateOpen(false); resetCreateForm(); }}>取消</Button>
                <Button type="primary" onClick={handleSubmit} disabled={!canSubmit} loading={createSubmitting}>提交订单</Button>
              </Space>
            </div>
          </Space>
        </div>
      </Drawer>

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

      <Drawer
        title="订单详情"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        size="large"
      >
        {currentOrder && (
          <>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="订单号">{currentOrder.order_no}</Descriptions.Item>
              <Descriptions.Item label="客户">{currentOrder.customer_name}</Descriptions.Item>
              <Descriptions.Item label="状态">
                {(() => {
                  const s = statusMap[currentOrder.status];
                  return s ? <Tag color={s.color}>{s.text}</Tag> : currentOrder.status;
                })()}
              </Descriptions.Item>
              <Descriptions.Item label="下单时间">{currentOrder.created_at}</Descriptions.Item>
              <Descriptions.Item label="总金额">{currentOrder.total_amount}</Descriptions.Item>
              <Descriptions.Item label="取消原因">{currentOrder.cancel_reason || '-'}</Descriptions.Item>
              <Descriptions.Item label="备注">{currentOrder.remark || '-'}</Descriptions.Item>
            </Descriptions>

            <div style={{ marginTop: 24, marginBottom: 8, fontWeight: 600 }}>订单明细</div>
            <Table
              dataSource={currentOrder.items ?? []}
              rowKey="id"
              size="small"
              pagination={false}
              columns={[
                { title: '商品编码', dataIndex: 'barcode', key: 'barcode' },
                { title: '商品名称', dataIndex: 'product_name', key: 'product_name' },
                { title: '数量', dataIndex: 'quantity', key: 'quantity' },
                { title: '单价', dataIndex: 'unit_price', key: 'unit_price' },
                { title: '小计', dataIndex: 'subtotal', key: 'subtotal' },
              ]}
            />

            {currentOrder.status_logs && currentOrder.status_logs.length > 0 && (
              <>
                <div style={{ marginTop: 24, marginBottom: 8, fontWeight: 600 }}>状态日志</div>
                <Table
                  dataSource={currentOrder.status_logs}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  columns={[
                    {
                      title: '状态',
                      dataIndex: 'to_status',
                      key: 'to_status',
                      render: (val: string) => {
                        const s = statusMap[val];
                        return s ? <Tag color={s.color}>{s.text}</Tag> : val;
                      },
                    },
                    { title: '操作人', dataIndex: 'operator', key: 'operator' },
                    { title: '备注', dataIndex: 'remark', key: 'remark' },
                    { title: '时间', dataIndex: 'created_at', key: 'created_at' },
                  ]}
                />
              </>
            )}
          </>
        )}
      </Drawer>

      <Modal
        title="取消订单"
        open={Boolean(cancelOrderId)}
        okText="确认取消"
        cancelText="返回"
        confirmLoading={cancelSubmitting}
        okButtonProps={{ disabled: !cancelReason.trim() }}
        onOk={handleCancelOrder}
        onCancel={() => {
          if (cancelSubmitting) return;
          setCancelOrderId(undefined);
          setCancelReason('');
        }}
      >
        <Input.TextArea
          aria-label="取消原因"
          value={cancelReason}
          maxLength={255}
          rows={4}
          placeholder="请输入取消原因"
          onChange={(event) => setCancelReason(event.target.value)}
        />
      </Modal>
    </PageContainer>
  );
};

export default OrderList;
