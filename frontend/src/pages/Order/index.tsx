import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { Button, message, Tag, Form, Table, Select, Input, InputNumber, Space, Modal, Upload, type UploadFile, type UploadProps } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { history } from '@umijs/max';
import React, { useRef, useState, useEffect } from 'react';
import {
  cancelOrder,
  completeOrder,
  createOrder,
  getOrder,
  getOrderShippingOptions,
  listOrders,
  startShippingOrder,
  stockOutOrder,
  updateShippingAllocations,
} from '@/services/order';
import type { OrderDeliveryOrderSummary } from '@/services/order';
import { getCustomer, listAllCustomers } from '@/services/customer';
import { listDeliveryEmployeeOptions } from '@/services/delivery';
import { uploadFile } from '@/services/upload';
import ProductSelectModal from '@/components/ProductSelectModal';
import type { SelectableProduct } from '@/components/ProductSelectModal/productSelection';
import { buildShipmentDraft, getAvailableOrderActions, toShipmentRequest, toWarehouseSelectOptions, validateShipmentDraft } from './shipment';
import type { ShipmentAvailabilityMap, ShipmentItemDraft } from './shipment';

interface OrderRecord {
  id: string;
  order_no: string;
  customer_id: string;
  customer_name?: string | null;
  status: string;
  total_amount: number;
  cancel_reason?: string | null;
  remark?: string | null;
  shipping_started_at?: string | null;
  shipping_started_by?: string | null;
  stock_out_at?: string | null;
  stock_out_by?: string | null;
  delivered_at?: string | null;
  delivered_by?: string | null;
  paid_at?: string | null;
  paid_by?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  created_at: string;
  items?: OrderItemRecord[];
  status_logs?: StatusLogRecord[];
  delivery?: OrderDeliveryOrderSummary | null;
}

interface StockOutFormValues {
  delivery_employee_id: string;
  recipient_name: string;
  recipient_phone: string;
  delivery_address: string;
}

interface PaymentFormValues {
  paid_amount: number;
}

type UploadResponse = {
  url?: string;
  data?: { url?: string };
};

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
    warehouse_name?: string | null;
    quantity: number;
    status: string;
  }>;
}

interface StatusLogRecord {
  id: string;
  from_status?: string | null;
  to_status: string;
  operator: string | null;
  remark?: string | null;
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

function extractUploadUrls(fileList: UploadFile<UploadResponse>[]) {
  return fileList.flatMap((file) => {
    if (file.status !== 'done') return [];
    const url = file.response?.url ?? file.response?.data?.url ?? file.url;
    return url ? [url] : [];
  });
}

const OrderList: React.FC = () => {
  const actionRef = useRef<ActionType>(null);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
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
  const [stockOutOrderRecord, setStockOutOrderRecord] = useState<OrderRecord>();
  const [stockOutEmployeeOptions, setStockOutEmployeeOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [stockOutLoading, setStockOutLoading] = useState(false);
  const [stockOutLoadError, setStockOutLoadError] = useState(false);
  const [stockOutReady, setStockOutReady] = useState(false);
  const [stockOutSubmitting, setStockOutSubmitting] = useState(false);
  const [stockOutForm] = Form.useForm<StockOutFormValues>();
  const [paymentOrderRecord, setPaymentOrderRecord] = useState<OrderRecord>();
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentFiles, setPaymentFiles] = useState<UploadFile<UploadResponse>[]>([]);
  const [paymentForm] = Form.useForm<PaymentFormValues>();
  const stockOutRequestTokenRef = useRef(0);

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
      setShipmentDraft(buildShipmentDraft((order.items ?? []).map((item) => ({
        ...item,
        allocations: item.allocations?.map((allocation) => ({
          ...allocation,
          warehouse_name: allocation.warehouse_name ?? undefined,
        })),
      }))));
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

  const loadStockOut = async (record: OrderRecord) => {
    const requestToken = ++stockOutRequestTokenRef.current;
    setStockOutReady(false);
    setStockOutLoading(true);
    setStockOutLoadError(false);
    setStockOutEmployeeOptions([]);
    stockOutForm.resetFields();
    try {
      const [employeesResponse, customerResponse] = await Promise.all([
        listDeliveryEmployeeOptions(),
        getCustomer(record.customer_id),
      ]);
      if (requestToken !== stockOutRequestTokenRef.current) return;
      if (employeesResponse.code !== 0 || !employeesResponse.data) {
        setStockOutLoadError(true);
        return;
      }
      if (customerResponse.code !== 0 || !customerResponse.data) {
        setStockOutLoadError(true);
        return;
      }
      setStockOutEmployeeOptions(employeesResponse.data.map((employee) => ({
        label: employee.name,
        value: employee.id,
      })));
      stockOutForm.setFieldsValue({
        recipient_name: customerResponse.data.contact_name,
        recipient_phone: customerResponse.data.contact_phone,
        delivery_address: customerResponse.data.address ?? undefined,
      });
      setStockOutReady(true);
    } catch {
      if (requestToken === stockOutRequestTokenRef.current) {
        setStockOutLoadError(true);
      }
    } finally {
      if (requestToken === stockOutRequestTokenRef.current) {
        setStockOutLoading(false);
      }
    }
  };

  const closeStockOut = () => {
    stockOutRequestTokenRef.current += 1;
    setStockOutOrderRecord(undefined);
    setStockOutReady(false);
    setStockOutLoading(false);
    setStockOutLoadError(false);
    setStockOutEmployeeOptions([]);
    stockOutForm.resetFields();
  };

  const openStockOut = (record: OrderRecord) => {
    setStockOutOrderRecord(record);
    void loadStockOut(record);
  };

  const submitStockOut = async (values: StockOutFormValues) => {
    if (!stockOutOrderRecord || !stockOutReady || stockOutSubmitting) return;
    setStockOutSubmitting(true);
    try {
      const res = await stockOutOrder(stockOutOrderRecord.id, values);
      if (res.code === 0) {
        message.success('确认出库成功');
        closeStockOut();
        actionRef.current?.reload();
      } else {
        message.error(res.message || '确认出库失败');
      }
    } finally {
      setStockOutSubmitting(false);
    }
  };

  const paymentUpload: NonNullable<UploadProps['customRequest']> = async ({ file, onError, onSuccess }) => {
    try {
      const response = await uploadFile(file as File, 'payments');
      if (response.code !== 0 || !response.data?.url) throw new Error(response.message || '上传付款凭证失败');
      onSuccess?.(response.data);
    } catch (error) {
      onError?.(error as Error);
    }
  };

  const openPayment = (record: OrderRecord) => {
    setPaymentOrderRecord(record);
    setPaymentFiles([]);
    paymentForm.setFieldsValue({ paid_amount: record.total_amount });
  };

  const closePayment = (force = false) => {
    if (paymentSubmitting && !force) return;
    setPaymentOrderRecord(undefined);
    setPaymentFiles([]);
    paymentForm.resetFields();
  };

  const submitPayment = async () => {
    if (!paymentOrderRecord || paymentSubmitting) return;
    let values: PaymentFormValues;
    try {
      values = await paymentForm.validateFields();
    } catch {
      return;
    }
    if (values.paid_amount > paymentOrderRecord.total_amount) {
      message.warning('实收金额不能超过订单金额');
      return;
    }
    if (paymentFiles.some((file) => file.status !== 'done')) {
      message.warning('请等待付款凭证上传完成，或移除上传失败的文件');
      return;
    }
    const paymentProofUrls = extractUploadUrls(paymentFiles);
    if (paymentProofUrls.length === 0) {
      message.warning('请上传付款凭证');
      return;
    }
    setPaymentSubmitting(true);
    try {
      const response = await completeOrder(paymentOrderRecord.id, {
        paid_amount: values.paid_amount,
        payment_proof_image_urls: paymentProofUrls,
      });
      if (response.code !== 0) {
        message.error(response.message || '确认收款失败');
        return;
      }
      message.success('确认收款成功');
      closePayment(true);
      actionRef.current?.reload();
    } catch {
      message.error('确认收款失败');
    } finally {
      setPaymentSubmitting(false);
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
        <Button key="stockOut" type="link" onClick={() => openStockOut(record)}>确认出库</Button>,
      );
    }

    if (actions.includes('complete')) {
      buttons.push(
        <Button key="complete" type="link" onClick={() => openPayment(record)}>确认收款</Button>,
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

  const columns: ProColumns<OrderRecord>[] = [
    {
      title: '订单号',
      dataIndex: 'order_no',
      width: 180,
      render: (_, record) => (
        <Button type="link" onClick={() => history.push(`/order/detail/${record.id}`)}>
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
            disabled={selectedOrderRows.length !== 1 || ['completed', 'cancelled', 'stocked_out'].includes(selectedOrderRows[0]?.status)}
            onClick={() => {
              const selected = selectedOrderRows[0];
              if (selected.status === 'placed') openShipment(selected.id);
              if (selected.status === 'shipping') openStockOut(selected);
              if (selected.status === 'delivered_unpaid') openPayment(selected);
            }}
          >
            {selectedOrderRows[0]?.status === 'shipping' ? '确认出库'
              : selectedOrderRows[0]?.status === 'stocked_out' ? '配送处理中'
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
        title="确认出库"
        open={Boolean(stockOutOrderRecord)}
        onCancel={() => {
          if (stockOutSubmitting) return;
          closeStockOut();
        }}
        onOk={() => stockOutForm.submit()}
        okText="确认出库"
        cancelText="取消"
        confirmLoading={stockOutSubmitting}
        okButtonProps={{ disabled: !stockOutReady }}
        destroyOnHidden
      >
        <Form form={stockOutForm} layout="vertical" onFinish={submitStockOut}>
          {stockOutLoading && <div style={{ marginBottom: 16 }}>正在加载配送信息...</div>}
          {stockOutLoadError && (
            <Space style={{ marginBottom: 16 }}>
              <span>加载配送信息失败，请重试</span>
              <Button type="link" onClick={() => stockOutOrderRecord && void loadStockOut(stockOutOrderRecord)}>
                重试加载
              </Button>
            </Space>
          )}
          <Form.Item label="配送员" name="delivery_employee_id" rules={[{ required: true, message: '请选择配送员' }]}>
            <Select aria-label="配送员" placeholder="请选择配送员" options={stockOutEmployeeOptions} disabled={!stockOutReady} />
          </Form.Item>
          <Form.Item label="收货人" name="recipient_name" rules={[{ required: true, whitespace: true, message: '请填写收货人' }]}>
            <Input aria-label="收货人" disabled={!stockOutReady} />
          </Form.Item>
          <Form.Item label="收货电话" name="recipient_phone" rules={[{ required: true, whitespace: true, message: '请填写收货电话' }]}>
            <Input aria-label="收货电话" disabled={!stockOutReady} />
          </Form.Item>
          <Form.Item label="收货地址" name="delivery_address" rules={[{ required: true, whitespace: true, message: '请填写收货地址' }]}>
            <Input.TextArea aria-label="收货地址" rows={3} disabled={!stockOutReady} />
          </Form.Item>
        </Form>
      </Modal>

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

      <Modal
        title="确认收款"
        open={Boolean(paymentOrderRecord)}
        okText="确认收款"
        cancelText="返回"
        confirmLoading={paymentSubmitting}
        onOk={() => void submitPayment()}
        onCancel={() => closePayment()}
      >
        <Form form={paymentForm} layout="vertical">
          <Form.Item
            name="paid_amount"
            label="实收金额"
            rules={[{ required: true, message: '请填写实收金额' }]}
          >
            <InputNumber aria-label="实收金额" min={0.01} max={paymentOrderRecord?.total_amount} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="付款凭证" required>
            <Upload
              accept="image/*"
              listType="picture-card"
              multiple
              fileList={paymentFiles}
              customRequest={paymentUpload}
              onChange={({ fileList }) => setPaymentFiles(fileList as UploadFile<UploadResponse>[])}
            >
              <Button>上传凭证</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

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
