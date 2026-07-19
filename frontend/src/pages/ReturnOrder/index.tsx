import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, Descriptions, Drawer, Input, InputNumber, message, Modal, Select, Space, Switch, Table, Tag } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import ProductSelectModal from '@/components/ProductSelectModal';
import type { SelectableProduct } from '@/components/ProductSelectModal/productSelection';
import { listAllCustomers } from '@/services/customer';
import { listAllWarehouses } from '@/services/inventory';
import { createReturnOrder, getReturnOrder, listReturnOrders, voidReturnOrder } from '@/services/returnOrder';
import {
  applyBatchCondition,
  applyBatchNoStockIn,
  applyBatchReason,
  applyBatchStockIn,
  buildReturnDraft,
  calculateReturnTotal,
  toReturnOrderRequest,
  validateReturnDraft,
} from './returnOrder';
import type { ReturnItemDraft, ReturnProductCondition } from './returnOrder';

interface ReturnOrderRecord {
  id: string;
  return_no: string;
  customer_id: string;
  customer_name?: string;
  total_amount: number;
  status: 'completed' | 'voided';
  operator: string;
  completed_at: string;
  remark?: string;
  spend_deduction_amount: number;
  customer_spent_before: number;
  customer_spent_after: number;
  voided_by?: string;
  voided_at?: string;
  void_reason?: string;
  void_customer_spent_before?: number;
  void_customer_spent_after?: number;
  created_at: string;
  items?: Array<ReturnItemDraft & { id: string; subtotal: number; warehouse_name?: string }>;
}

interface BasicOption {
  id: string;
  name: string;
  status?: string;
}

const conditionOptions = [
  { label: '正常', value: 'normal' },
  { label: '过期', value: 'expired' },
  { label: '损坏', value: 'damaged' },
  { label: '其他', value: 'other' },
];

const conditionText: Record<string, string> = Object.fromEntries(
  conditionOptions.map((option) => [option.value, option.label]),
);

const ReturnOrderList: React.FC = () => {
  const actionRef = useRef<ActionType>(null);
  const [customers, setCustomers] = useState<BasicOption[]>([]);
  const [warehouses, setWarehouses] = useState<BasicOption[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<SelectableProduct[]>([]);
  const [customerId, setCustomerId] = useState<string>();
  const [items, setItems] = useState<ReturnItemDraft[]>([]);
  const [selectedItemKeys, setSelectedItemKeys] = useState<React.Key[]>([]);
  const [batchWarehouseId, setBatchWarehouseId] = useState<string>();
  const [batchCondition, setBatchCondition] = useState<ReturnProductCondition>('normal');
  const [batchReason, setBatchReason] = useState('');
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<ReturnOrderRecord>();
  const [voidId, setVoidId] = useState<string>();
  const [voidReason, setVoidReason] = useState('');
  const [voidSubmitting, setVoidSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([listAllCustomers(), listAllWarehouses()])
      .then(([customerRows, warehouseRows]) => {
        setCustomers(customerRows as BasicOption[]);
        setWarehouses((warehouseRows as BasicOption[]).filter((warehouse) => warehouse.status === 'active'));
      })
      .catch(() => message.error('退货单基础数据加载失败'));
  }, []);

  const resetCreate = () => {
    setCustomerId(undefined);
    setItems([]);
    setSelectedProducts([]);
    setSelectedItemKeys([]);
    setBatchWarehouseId(undefined);
    setBatchCondition('normal');
    setBatchReason('');
    setRemark('');
  };

  const selectedProductIds = selectedItemKeys.map(String);
  const updateItem = (productId: string, patch: Partial<ReturnItemDraft>) => {
    setItems((current) => current.map((item) => item.product_id === productId ? { ...item, ...patch } : item));
  };

  const submitCreate = async () => {
    if (!customerId) {
      message.warning('请选择客户');
      return;
    }
    const validationError = validateReturnDraft(items);
    if (validationError) {
      message.warning(validationError);
      return;
    }
    setSubmitting(true);
    try {
      const response = await createReturnOrder(toReturnOrderRequest(customerId, items, remark));
      if (response.code === 0) {
        message.success('退货单已完成');
        setCreateOpen(false);
        resetCreate();
        actionRef.current?.reload();
      } else {
        message.error(response.message || '退货单创建失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const showDetail = async (id: string) => {
    const response = await getReturnOrder(id);
    if (response.code === 0 && response.data) setDetail(response.data as ReturnOrderRecord);
    else message.error(response.message || '退货单详情加载失败');
  };

  const submitVoid = async () => {
    const reason = voidReason.trim();
    if (!voidId || !reason) return;
    setVoidSubmitting(true);
    try {
      const response = await voidReturnOrder(voidId, { void_reason: reason });
      if (response.code === 0) {
        message.success('退货单已作废');
        setVoidId(undefined);
        setVoidReason('');
        actionRef.current?.reload();
      } else {
        message.error(response.message || '作废失败');
      }
    } finally {
      setVoidSubmitting(false);
    }
  };

  const columns: ProColumns<ReturnOrderRecord>[] = [
    {
      title: '退货单号', dataIndex: 'return_no', width: 190,
      render: (_, record) => <Button type="link" onClick={() => showDetail(record.id)}>{record.return_no}</Button>,
    },
    { title: '客户', dataIndex: 'customer_name', width: 140 },
    {
      title: '状态', dataIndex: 'status', width: 100, valueType: 'select',
      valueEnum: { completed: { text: '已完成', status: 'Success' }, voided: { text: '已作废', status: 'Error' } },
      render: (_, record) => <Tag color={record.status === 'completed' ? 'green' : 'red'}>{record.status === 'completed' ? '已完成' : '已作废'}</Tag>,
    },
    { title: '退货金额', dataIndex: 'total_amount', width: 120, valueType: 'money' },
    { title: '办理人', dataIndex: 'operator', width: 120, search: false },
    { title: '办理时间', dataIndex: 'completed_at', width: 180, valueType: 'dateTime', search: false },
    {
      title: '操作', valueType: 'option', width: 120,
      render: (_, record) => record.status === 'completed' ? (
        <Button type="link" danger onClick={() => { setVoidId(record.id); setVoidReason(''); }}>作废</Button>
      ) : null,
    },
  ];

  const itemColumns = [
    { title: '商品', dataIndex: 'product_name', width: 130 },
    { title: '条码', dataIndex: 'barcode', width: 130 },
    {
      title: '数量', width: 90,
      render: (_: unknown, item: ReturnItemDraft) => <InputNumber min={1} precision={0} value={item.quantity} onChange={(value) => updateItem(item.product_id, { quantity: value ?? 1 })} />,
    },
    {
      title: '退货单价', width: 110,
      render: (_: unknown, item: ReturnItemDraft) => <InputNumber min={0.01} precision={2} value={item.unit_price} onChange={(value) => updateItem(item.product_id, { unit_price: value ?? 0.01 })} />,
    },
    {
      title: '状况', width: 110,
      render: (_: unknown, item: ReturnItemDraft) => <Select style={{ width: 100 }} options={conditionOptions} value={item.condition} onChange={(condition) => updateItem(item.product_id, { condition })} />,
    },
    {
      title: '退货原因', width: 180,
      render: (_: unknown, item: ReturnItemDraft) => <Input value={item.return_reason} onChange={(event) => updateItem(item.product_id, { return_reason: event.target.value })} />,
    },
    {
      title: '入库', width: 80,
      render: (_: unknown, item: ReturnItemDraft) => <Switch checked={item.should_stock_in} checkedChildren="入库" unCheckedChildren="不入" onChange={(checked) => updateItem(item.product_id, { should_stock_in: checked, warehouse_id: checked ? item.warehouse_id : undefined })} />,
    },
    {
      title: '入库仓库', width: 150,
      render: (_: unknown, item: ReturnItemDraft) => <Select disabled={!item.should_stock_in} allowClear style={{ width: 140 }} options={warehouses.map((warehouse) => ({ label: warehouse.name, value: warehouse.id }))} value={item.warehouse_id} onChange={(warehouse_id) => updateItem(item.product_id, { warehouse_id })} />,
    },
    { title: '小计', width: 100, render: (_: unknown, item: ReturnItemDraft) => `¥${(item.quantity * item.unit_price).toFixed(2)}` },
    {
      title: '操作', width: 60,
      render: (_: unknown, item: ReturnItemDraft) => <Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => {
        setItems((current) => current.filter((row) => row.product_id !== item.product_id));
        setSelectedProducts((current) => current.filter((product) => product.id !== item.product_id));
        setSelectedItemKeys((current) => current.filter((key) => key !== item.product_id));
      }} />,
    },
  ];

  return (
    <PageContainer>
      <ProTable<ReturnOrderRecord>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        search={{ labelWidth: 80 }}
        request={async (params) => {
          const response = await listReturnOrders({ status: params.status, customer_id: params.customer_id, page: params.current, page_size: params.pageSize });
          return { data: response.data?.items ?? [], total: response.data?.total ?? 0, success: response.code === 0 };
        }}
        toolBarRender={() => [<Button key="create" type="primary" onClick={() => setCreateOpen(true)}>新建退货单</Button>]}
      />

      <Modal title="新建退货单" open={createOpen} width={1200} destroyOnHidden confirmLoading={submitting} okText="确认退货并完成" onOk={submitCreate} onCancel={() => { if (!submitting) { setCreateOpen(false); resetCreate(); } }}>
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Space wrap>
            <Select showSearch={{ filterOption: (input, option) => (option?.label ?? '').includes(input) }} style={{ width: 260 }} placeholder="请选择客户" options={customers.map((customer) => ({ label: customer.name, value: customer.id }))} value={customerId} onChange={setCustomerId} />
            <Button icon={<PlusOutlined />} type="primary" onClick={() => setProductOpen(true)}>选择商品</Button>
          </Space>
          {items.length > 0 && (
            <Space wrap>
              <Select placeholder="批量入库仓库" style={{ width: 180 }} options={warehouses.map((warehouse) => ({ label: warehouse.name, value: warehouse.id }))} value={batchWarehouseId} onChange={setBatchWarehouseId} />
              <Button disabled={!selectedItemKeys.length || !batchWarehouseId} onClick={() => setItems((current) => applyBatchStockIn(current, selectedProductIds, batchWarehouseId as string))}>批量入库</Button>
              <Button disabled={!selectedItemKeys.length} onClick={() => setItems((current) => applyBatchNoStockIn(current, selectedProductIds))}>批量不入库</Button>
              <Select style={{ width: 120 }} options={conditionOptions} value={batchCondition} onChange={setBatchCondition} />
              <Button disabled={!selectedItemKeys.length} onClick={() => setItems((current) => applyBatchCondition(current, selectedProductIds, batchCondition))}>批量设置状况</Button>
              <Input placeholder="批量退货原因" style={{ width: 180 }} value={batchReason} onChange={(event) => setBatchReason(event.target.value)} />
              <Button disabled={!selectedItemKeys.length || !batchReason.trim()} onClick={() => setItems((current) => applyBatchReason(current, selectedProductIds, batchReason))}>批量设置原因</Button>
            </Space>
          )}
          <Table<ReturnItemDraft>
            rowKey="product_id"
            dataSource={items}
            columns={itemColumns}
            pagination={false}
            scroll={{ x: 1200, y: 320 }}
            rowSelection={{ selectedRowKeys: selectedItemKeys, onChange: setSelectedItemKeys }}
            locale={{ emptyText: '请选择退货商品' }}
            footer={items.length ? () => <div style={{ textAlign: 'right', fontWeight: 600 }}>退货合计：¥{calculateReturnTotal(items).toFixed(2)}</div> : undefined}
          />
          <Input.TextArea placeholder="整单备注（选填）" value={remark} maxLength={255} rows={2} onChange={(event) => setRemark(event.target.value)} />
        </Space>
      </Modal>

      <ProductSelectModal
        open={productOpen}
        selectedProductIds={items.map((item) => item.product_id)}
        selectedProducts={selectedProducts}
        onCancel={() => setProductOpen(false)}
        onConfirm={(products) => {
          setSelectedProducts(products);
          const draft = buildReturnDraft(products, items);
          setItems(draft);
          setSelectedItemKeys(draft.map((item) => item.product_id));
          setProductOpen(false);
        }}
      />

      <Drawer title="退货单详情" open={Boolean(detail)} size="large" onClose={() => setDetail(undefined)}>
        {detail && <>
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="退货单号">{detail.return_no}</Descriptions.Item>
            <Descriptions.Item label="客户">{detail.customer_name}</Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={detail.status === 'completed' ? 'green' : 'red'}>{detail.status === 'completed' ? '已完成' : '已作废'}</Tag></Descriptions.Item>
            <Descriptions.Item label="退货金额">¥{Number(detail.total_amount).toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="办理人">{detail.operator}</Descriptions.Item>
            <Descriptions.Item label="办理时间">{detail.completed_at}</Descriptions.Item>
            <Descriptions.Item label="累计消费冲减">¥{Number(detail.spend_deduction_amount).toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="累计消费变化">¥{Number(detail.customer_spent_before).toFixed(2)} → ¥{Number(detail.customer_spent_after).toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="作废人">{detail.voided_by || '-'}</Descriptions.Item>
            <Descriptions.Item label="作废时间">{detail.voided_at || '-'}</Descriptions.Item>
            <Descriptions.Item label="作废原因" span={2}>{detail.void_reason || '-'}</Descriptions.Item>
            <Descriptions.Item label="备注" span={2}>{detail.remark || '-'}</Descriptions.Item>
          </Descriptions>
          <Table dataSource={detail.items ?? []} rowKey="id" size="small" pagination={false} style={{ marginTop: 20 }} columns={[
            { title: '商品', dataIndex: 'product_name' },
            { title: '数量', dataIndex: 'quantity' },
            { title: '单价', dataIndex: 'unit_price' },
            { title: '状况', dataIndex: 'condition', render: (value: string) => conditionText[value] || value },
            { title: '退货原因', dataIndex: 'return_reason' },
            { title: '入库', dataIndex: 'should_stock_in', render: (value: boolean) => value ? '是' : '否' },
            { title: '仓库', dataIndex: 'warehouse_name', render: (value: string) => value || '-' },
          ]} />
        </>}
      </Drawer>

      <Modal title="作废退货单" open={Boolean(voidId)} okText="确认作废" okButtonProps={{ danger: true, disabled: !voidReason.trim() }} confirmLoading={voidSubmitting} onOk={submitVoid} onCancel={() => { if (!voidSubmitting) { setVoidId(undefined); setVoidReason(''); } }}>
        <Input.TextArea aria-label="作废原因" rows={4} maxLength={255} placeholder="请输入作废原因" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />
      </Modal>
    </PageContainer>
  );
};

export default ReturnOrderList;
