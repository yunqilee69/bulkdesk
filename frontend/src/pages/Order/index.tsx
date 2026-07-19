import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { Button, message, Tag, Descriptions, Drawer, Popconfirm, Table, Select, Input, InputNumber, Space, Modal } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import React, { useRef, useState, useEffect } from 'react';
import {
  cancelOrder,
  completeOrder,
  createOrder,
  deliverOrder,
  getOrder,
  getOrderShippingOptions,
  listOrders,
  startShippingOrder,
  stockOutOrder,
  updateShippingAllocations,
} from '@/services/order';
import { listAllCustomers } from '@/services/customer';
import ProductSelectModal from '@/components/ProductSelectModal';
import type { SelectableProduct } from '@/components/ProductSelectModal/productSelection';
import { buildShipmentDraft, getAvailableOrderActions, toShipmentRequest, toWarehouseSelectOptions, validateShipmentDraft } from './shipment';
import type { ShipmentAvailabilityMap, ShipmentItemDraft } from './shipment';

interface OrderRecord {
  id: string;
  order_no: string;
  customer_id: string;
  customer_name?: string;
  status: string;
  total_amount: number;
  cancel_reason?: string;
  remark?: string;
  shipping_started_at?: string;
  shipping_started_by?: string;
  stock_out_at?: string;
  stock_out_by?: string;
  delivered_at?: string;
  delivered_by?: string;
  paid_at?: string;
  paid_by?: string;
  cancelled_at?: string;
  cancelled_by?: string;
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
  allocations?: Array<{
    warehouse_id: string;
    warehouse_name?: string;
    quantity: number;
    status: string;
  }>;
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

interface OrderItemRow {
  product_id: string;
  barcode: string;
  product_name: string;
  default_price: number;
  unit_price: number;
  quantity: number;
}

const statusMap: Record<string, { color: string; text: string }> = {
  placed: { color: 'blue', text: '已下单' },
  shipping: { color: 'cyan', text: '正在发货' },
  stocked_out: { color: 'geekblue', text: '已出库' },
  delivered_unpaid: { color: 'orange', text: '已送达未付款' },
  completed: { color: 'green', text: '已完成' },
  cancelled: { color: 'red', text: '已取消' },
};

const OrderList: React.FC = () => {
  const actionRef = useRef<ActionType>(null);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<OrderRecord | null>(null);

  const [customerId, setCustomerId] = useState<string | undefined>();
  const [orderItems, setOrderItems] = useState<OrderItemRow[]>([]);
  const [remark, setRemark] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [shipOrderId, setShipOrderId] = useState<string>();
  const [shipmentMode, setShipmentMode] = useState<'start' | 'adjust'>('start');
  const [shipmentDraft, setShipmentDraft] = useState<ShipmentItemDraft[]>([]);
  const [shipmentAvailability, setShipmentAvailability] = useState<ShipmentAvailabilityMap>({});
  const [shipSubmitting, setShipSubmitting] = useState(false);
  const [selectedOrderKeys, setSelectedOrderKeys] = useState<React.Key[]>([]);
  const [selectedOrderRows, setSelectedOrderRows] = useState<OrderRecord[]>([]);
  const [cancelOrderId, setCancelOrderId] = useState<string>();
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const [productModalOpen, setSkuModalOpen] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<SelectableProduct[]>([]);

  useEffect(() => {
    listAllCustomers()
      .then((customerItems) => {
        setCustomers(customerItems as CustomerItem[]);
      })
      .catch(() => message.error('订单基础数据加载失败，请刷新页面'));
  }, []);

  const customerOptions = customers.map((c) => ({ label: c.name, value: c.id }));

  const handleProductConfirm = (products: SelectableProduct[]) => {
    const existingMap = new Map(orderItems.map((r) => [r.product_id, r]));
    const newRows = products.map((product) => existingMap.get(product.id) ?? ({
      product_id: product.id,
      barcode: product.barcode,
      product_name: product.short_name || product.name,
      default_price: product.standard_price,
      unit_price: product.standard_price,
      quantity: 1,
    }));
    setSelectedProducts(products);
    setOrderItems(newRows);
    setSkuModalOpen(false);
  };

  const resetCreateForm = () => {
    setCustomerId(undefined);
    setOrderItems([]);
    setSelectedProducts([]);
    setRemark('');
  };

  const handleSubmit = async () => {
    if (!customerId) { message.warning('请选择客户'); return; }
    if (orderItems.length === 0) { message.warning('请添加商品'); return; }
    if (orderItems.some((r) => !r.quantity || r.quantity < 1)) { message.warning('请填写所有商品的数量'); return; }

    if (createSubmitting) return;
    setCreateSubmitting(true);
    try {
      const res = await createOrder({
        customer_id: customerId,
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

  const openShipment = async (orderId: string, mode: 'start' | 'adjust' = 'start') => {
    try {
      const [orderResponse, optionsResponse] = await Promise.all([
        getOrder(orderId),
        getOrderShippingOptions(orderId),
      ]);
      if (orderResponse.code !== 0 || !orderResponse.data) {
        message.error(orderResponse.message || '获取订单详情失败');
        return;
      }
      if (optionsResponse.code !== 0 || !optionsResponse.data) {
        message.error(optionsResponse.message || '获取发货仓库库存失败');
        return;
      }
      const order = orderResponse.data as OrderRecord;
      setShipmentAvailability(Object.fromEntries(
        optionsResponse.data.items.map((item) => [
          item.order_item_id,
          Object.fromEntries(item.warehouses.map((warehouse) => [warehouse.warehouse_id, warehouse])),
        ]),
      ));
      setShipOrderId(orderId);
      setShipmentMode(mode);
      setShipmentDraft(buildShipmentDraft(order.items ?? []));
    } catch {
      message.error('获取发货信息失败，请稍后重试');
    }
  };

  const updateShipmentAllocation = (
    itemIndex: number,
    allocationIndex: number,
    patch: Partial<{ warehouse_id: string; quantity: number }>,
  ) => {
    setShipmentDraft((previous) =>
      previous.map((item, currentItemIndex) =>
        currentItemIndex === itemIndex
          ? {
              ...item,
              allocations: item.allocations.map((allocation, currentAllocationIndex) =>
                currentAllocationIndex === allocationIndex
                  ? { ...allocation, ...patch }
                  : allocation,
              ),
            }
          : item,
      ),
    );
  };

  const submitShipment = async () => {
    if (!shipOrderId) return;
    const error = validateShipmentDraft(shipmentDraft, shipmentAvailability);
    if (error) {
      message.warning(error);
      return;
    }
    setShipSubmitting(true);
    try {
      const request = toShipmentRequest(shipmentDraft);
      const res = shipmentMode === 'start'
        ? await startShippingOrder(shipOrderId, request)
        : await updateShippingAllocations(shipOrderId, request);
      if (res.code === 0) {
        message.success(shipmentMode === 'start' ? '已开始发货' : '分仓调整成功');
        setShipOrderId(undefined);
        setShipmentDraft([]);
        setShipmentAvailability({});
        setSelectedOrderKeys([]);
        setSelectedOrderRows([]);
        actionRef.current?.reload();
      } else {
        message.error(res.message || (shipmentMode === 'start' ? '开始发货失败' : '分仓调整失败'));
      }
    } finally {
      setShipSubmitting(false);
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
    const actions = getAvailableOrderActions(record.status);

    if (actions.includes('startShipping')) {
      buttons.push(
        <Button key="startShipping" type="link" onClick={() => openShipment(record.id)}>开始发货</Button>,
      );
    }

    if (actions.includes('adjustAllocations')) {
      buttons.push(
        <Button key="adjustAllocations" type="link" onClick={() => openShipment(record.id, 'adjust')}>调整分仓</Button>,
      );
    }

    if (actions.includes('stockOut')) {
      buttons.push(
        <Popconfirm
          key="stockOut"
          title="确认商品已出库？出库后不可取消订单"
          onConfirm={() => handleAction(() => stockOutOrder(record.id), '确认出库')}
        >
          <Button type="link">确认出库</Button>
        </Popconfirm>,
      );
    }

    if (actions.includes('deliver')) {
      buttons.push(
        <Popconfirm
          key="deliver"
          title="确认商品已送达客户？"
          onConfirm={() => handleAction(() => deliverOrder(record.id), '确认送达')}
        >
          <Button type="link">确认送达</Button>
        </Popconfirm>,
      );
    }

    if (actions.includes('complete')) {
      buttons.push(
        <Popconfirm
          key="complete"
          title="确认已收款并完成订单？"
          onConfirm={() => handleAction(() => completeOrder(record.id), '确认收款')}
        >
          <Button type="link">确认收款</Button>
        </Popconfirm>,
      );
    }

    if (actions.includes('cancel')) {
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
        shipping: { text: '正在发货', status: 'Processing' },
        stocked_out: { text: '已出库', status: 'Default' },
        delivered_unpaid: { text: '已送达未付款', status: 'Warning' },
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
  const canSubmit = !!customerId && orderItems.length > 0 && orderItems.every((r) => r.quantity >= 1);

  const itemColumns = [
    { title: '商品编码', dataIndex: 'barcode', width: 130 },
    { title: '商品名称', dataIndex: 'product_name', width: 140 },
    {
      title: '单价', dataIndex: 'unit_price', width: 100,
      render: (val: number) => `¥${val.toFixed(2)}`,
    },
    {
      title: '数量', dataIndex: 'quantity', width: 120,
      render: (_: unknown, record: OrderItemRow) => (
        <InputNumber min={1} precision={0} value={record.quantity}
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
          <Button
            key="ship"
            data-testid="toolbar-ship-order"
            disabled={selectedOrderRows.length !== 1 || ['completed', 'cancelled'].includes(selectedOrderRows[0]?.status)}
            onClick={() => {
              const selected = selectedOrderRows[0];
              if (selected.status === 'placed') openShipment(selected.id);
              if (selected.status === 'shipping') handleAction(() => stockOutOrder(selected.id), '确认出库');
              if (selected.status === 'stocked_out') handleAction(() => deliverOrder(selected.id), '确认送达');
              if (selected.status === 'delivered_unpaid') handleAction(() => completeOrder(selected.id), '确认收款');
            }}
          >
            {selectedOrderRows[0]?.status === 'shipping' ? '确认出库'
              : selectedOrderRows[0]?.status === 'stocked_out' ? '确认送达'
                : selectedOrderRows[0]?.status === 'delivered_unpaid' ? '确认收款'
                  : '开始发货'}
          </Button>,
        ]}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedOrderKeys,
          onChange: (keys, rows) => {
            setSelectedOrderKeys(keys);
            setSelectedOrderRows(rows);
          },
          getCheckboxProps: (record) => ({ disabled: ['completed', 'cancelled'].includes(record.status) }),
        }}
        columns={columns}
      />

      <Modal
        title="新建订单"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); resetCreateForm(); }}
        footer={null}
        width={900}
        destroyOnHidden
      >
        <Space size="large" wrap style={{ marginBottom: 16 }}>
          <div>
            <span style={{ marginRight: 8 }}>客户：</span>
            <Select showSearch={{ filterOption: (input, option) => (option?.label ?? '').includes(input) }} style={{ width: 260 }} placeholder="请选择客户"
              options={customerOptions} value={customerId} onChange={setCustomerId}
            />
          </div>
        </Space>

        <div style={{ marginBottom: 16 }}>
          <Button data-testid="open-product-select" type="primary" icon={<PlusOutlined />} onClick={() => setSkuModalOpen(true)}>选择商品</Button>
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
      </Modal>

      <ProductSelectModal
        open={productModalOpen}
        selectedProductIds={orderItems.map((item) => item.product_id)}
        selectedProducts={selectedProducts}
        onCancel={() => setSkuModalOpen(false)}
        onConfirm={handleProductConfirm}
      />

      <Modal
        title={shipmentMode === 'start' ? '开始发货' : '调整分仓'}
        open={Boolean(shipOrderId)}
        onCancel={() => {
          if (shipSubmitting) return;
          setShipOrderId(undefined);
          setShipmentDraft([]);
          setShipmentAvailability({});
        }}
        onOk={submitShipment}
        okText={shipmentMode === 'start' ? '开始发货' : '保存分仓'}
        cancelText="取消"
        confirmLoading={shipSubmitting}
        width={860}
        destroyOnHidden
      >
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          {shipmentDraft.map((item, itemIndex) => (
            <div key={item.order_item_id} style={{ borderBottom: '1px solid #f0f0f0', paddingBottom: 16 }}>
              <div style={{ marginBottom: 12, fontWeight: 600 }}>
                {item.barcode} - {item.product_name}（订单数量：{item.ordered_quantity}）
              </div>
              <Space orientation="vertical" style={{ width: '100%' }}>
                {item.allocations.map((allocation, allocationIndex) => (
                  <Space key={allocation.draft_id} wrap>
                    <Select
                      aria-label={`${item.product_name}发货仓库${allocationIndex + 1}`}
                      showSearch={{ filterOption: (input, option) => (option?.label ?? '').includes(input) }}
                      style={{ width: 360 }}
                      placeholder="请选择仓库"
                      options={toWarehouseSelectOptions(
                        Object.values(shipmentAvailability[item.order_item_id] ?? {}),
                      )}
                      value={allocation.warehouse_id}
                      onChange={(warehouse_id) => updateShipmentAllocation(itemIndex, allocationIndex, { warehouse_id })}
                    />
                    <InputNumber
                      aria-label={`${item.product_name}发货数量${allocationIndex + 1}`}
                      min={1}
                      precision={0}
                      value={allocation.quantity}
                      onChange={(quantity) => updateShipmentAllocation(itemIndex, allocationIndex, { quantity: quantity ?? 1 })}
                    />
                    <Button
                      danger
                      type="text"
                      icon={<MinusCircleOutlined />}
                      disabled={item.allocations.length === 1}
                      onClick={() => setShipmentDraft((previous) => previous.map((draftItem, currentItemIndex) => currentItemIndex === itemIndex ? { ...draftItem, allocations: draftItem.allocations.filter((_, currentAllocationIndex) => currentAllocationIndex !== allocationIndex) } : draftItem))}
                    >
                      删除
                    </Button>
                  </Space>
                ))}
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => setShipmentDraft((previous) => previous.map((draftItem, currentItemIndex) => currentItemIndex === itemIndex ? { ...draftItem, allocations: [...draftItem.allocations, { draft_id: crypto.randomUUID(), warehouse_id: undefined, quantity: 1 }] } : draftItem))}
                >
                  添加仓库
                </Button>
                <div>
                  已分配：{item.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0)} / {item.ordered_quantity}
                </div>
              </Space>
            </div>
          ))}
        </Space>
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
              <Descriptions.Item label="开始发货人">{currentOrder.shipping_started_by || '-'}</Descriptions.Item>
              <Descriptions.Item label="开始发货时间">{currentOrder.shipping_started_at || '-'}</Descriptions.Item>
              <Descriptions.Item label="出库人">{currentOrder.stock_out_by || '-'}</Descriptions.Item>
              <Descriptions.Item label="出库时间">{currentOrder.stock_out_at || '-'}</Descriptions.Item>
              <Descriptions.Item label="送达人">{currentOrder.delivered_by || '-'}</Descriptions.Item>
              <Descriptions.Item label="送达时间">{currentOrder.delivered_at || '-'}</Descriptions.Item>
              <Descriptions.Item label="收款人">{currentOrder.paid_by || '-'}</Descriptions.Item>
              <Descriptions.Item label="收款时间">{currentOrder.paid_at || '-'}</Descriptions.Item>
              <Descriptions.Item label="取消人">{currentOrder.cancelled_by || '-'}</Descriptions.Item>
              <Descriptions.Item label="取消时间">{currentOrder.cancelled_at || '-'}</Descriptions.Item>
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
                {
                  title: '库存分配',
                  key: 'allocations',
                  render: (_: unknown, item: OrderItemRecord) => (
                    <Space orientation="vertical" size={2}>
                      {(item.allocations ?? []).map((allocation) => (
                        <span key={`${allocation.warehouse_id}-${allocation.status}`}>
                          {allocation.warehouse_name || allocation.warehouse_id}：{allocation.quantity}
                        </span>
                      ))}
                    </Space>
                  ),
                },
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
