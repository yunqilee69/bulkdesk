import { PageContainer, ProTable, type ActionType, type ProColumns } from '@ant-design/pro-components';
import { history, useAccess, useModel } from '@umijs/max';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Drawer,
  Form,
  Image,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Timeline,
  Upload,
  type TableColumnsType,
  type UploadFile,
  type UploadProps,
} from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  createDeliveryException,
  getDeliveryDetail,
  listCurrentDeliveries,
  listDeliveryArchive,
  listDeliveryEmployeeOptions,
  reassignDelivery,
  signDelivery,
  type OrderDeliveryArchiveRecord,
  type OrderDeliveryCurrentGroup,
  type OrderDeliveryCurrentRecord,
  type OrderDeliveryDetail,
  type OrderDeliveryEmployeeOption,
  type OrderDeliveryExceptionType,
} from '@/services/delivery';
import { listAllWarehouses } from '@/services/inventory';
import { uploadFile } from '@/services/upload';
import {
  createReturnOrder,
  listReturnableOrderItems,
  type ReturnableOrderItem,
} from '@/services/returnOrder';

import {
  canHandleDelivery,
  canReassignDelivery,
  extractDeliveryProofUrls,
  getDeliveryEventLabel,
  getDeliveryExceptionLabel,
  normalizeCurrentGroupMetrics,
  serializeArchiveFilters,
} from './delivery';

type ActiveModal = 'sign' | 'exception' | 'reassign' | 'return' | undefined;

interface SignFormValues {
  signer_name: string;
  remark?: string;
  collect_payment?: boolean;
  paid_amount?: number;
}

function formatAmount(amount: number) {
  return `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function openOrderDetail(orderId: string) {
  history.push(`/order/detail/${orderId}`);
}

function openCustomer(customerName: string) {
  history.push(`/customer?keyword=${encodeURIComponent(customerName)}`);
}

function getMessage(response: { message?: string } | undefined, fallback: string) {
  return response?.message || fallback;
}

const exceptionOptions: Array<{ label: string; value: OrderDeliveryExceptionType }> = [
  { label: '客户不在', value: 'customer_absent' },
  { label: '客户拒收', value: 'customer_refused' },
  { label: '地址或联系方式有误', value: 'invalid_contact' },
  { label: '其他', value: 'other' },
];

const DeliveryPage = () => {
  const access = useAccess();
  const { initialState } = useModel('@@initialState');
  const isAdmin = Boolean(access.canAdmin);
  const currentUserId = initialState?.currentUser?.id;
  const [activeTab, setActiveTab] = useState('current');
  const [groups, setGroups] = useState<OrderDeliveryCurrentGroup[]>([]);
  const [currentLoading, setCurrentLoading] = useState(true);
  const [currentError, setCurrentError] = useState<string>();
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());
  const [employeeOptions, setEmployeeOptions] = useState<OrderDeliveryEmployeeOption[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState<OrderDeliveryCurrentRecord>();
  const [activeModal, setActiveModal] = useState<ActiveModal>();
  const [submitting, setSubmitting] = useState(false);
  const [proofFiles, setProofFiles] = useState<UploadFile[]>([]);
  const [paymentProofFiles, setPaymentProofFiles] = useState<UploadFile[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<OrderDeliveryDetail>();
  const [returnableItems, setReturnableItems] = useState<ReturnableOrderItem[]>([]);
  const [returnDrafts, setReturnDrafts] = useState<Record<string, { quantity?: number; reason?: string; condition?: 'normal' | 'expired' | 'damaged' | 'other'; shouldStockIn?: boolean; warehouseId?: string }>>({});
  const [returnLoading, setReturnLoading] = useState(false);
  const [returnWarehouseOptions, setReturnWarehouseOptions] = useState<Array<{ id: string; name: string }>>([]);
  const archiveVisited = useRef(false);
  const currentRequestId = useRef(0);
  const currentInitialized = useRef(false);
  const detailRequestId = useRef(0);
  const archiveActionRef = useRef<ActionType>(undefined);
  const [signForm] = Form.useForm<SignFormValues>();
  const [exceptionForm] = Form.useForm<{ exception_type: OrderDeliveryExceptionType; remark?: string }>();
  const [reassignForm] = Form.useForm<{ delivery_employee_id: string; reason?: string }>();

  const loadCurrent = useCallback(async () => {
    const requestId = ++currentRequestId.current;
    setCurrentLoading(true);
    setCurrentError(undefined);
    try {
      const response = await listCurrentDeliveries(undefined);
      if (requestId !== currentRequestId.current) return;
      if (response.code !== 0) {
        setCurrentError(getMessage(response, '加载当前配送失败'));
        return;
      }
      const nextGroups = response.data ?? [];
      setGroups(nextGroups);
      if (!currentInitialized.current) {
        setExpandedEmployees(new Set(nextGroups
          .filter((group) => group.deliveries.length > 0)
          .map((group) => group.delivery_employee_id)));
        currentInitialized.current = true;
      }
    } catch {
      if (requestId !== currentRequestId.current) return;
      setCurrentError('加载当前配送失败，请稍后重试');
    } finally {
      if (requestId === currentRequestId.current) setCurrentLoading(false);
    }
  }, []);

  const loadEmployees = useCallback(async () => {
    if (employeesLoading || employeeOptions.length > 0) return;
    setEmployeesLoading(true);
    try {
      const response = await listDeliveryEmployeeOptions();
      if (response.code === 0) setEmployeeOptions(response.data ?? []);
      else message.error(getMessage(response, '加载员工选项失败'));
    } catch {
      message.error('加载员工选项失败');
    } finally {
      setEmployeesLoading(false);
    }
  }, [employeeOptions.length, employeesLoading]);

  const refreshAfterMutation = useCallback(async () => {
    await loadCurrent();
    if (archiveVisited.current) archiveActionRef.current?.reload();
  }, [loadCurrent]);

  useEffect(() => {
    void loadCurrent();
  }, [loadCurrent]);

  const currentColumns = useMemo<TableColumnsType<OrderDeliveryCurrentRecord>>(
    () => [
      {
        title: '订单号',
        dataIndex: 'order_no',
        width: 160,
        render: (value, record) => <Button type="link" onClick={() => openOrderDetail(record.order_id)}>{value as string}</Button>,
      },
      { title: '配送状态', dataIndex: 'status', width: 100, render: () => <Tag color="processing">配送中</Tag> },
      {
        title: '客户',
        dataIndex: 'customer_name',
        width: 120,
        render: (value) => <Button type="link" onClick={() => openCustomer(value as string)}>{value as string}</Button>,
      },
      {
        title: '收货信息',
        key: 'recipient',
        render: (_, record) => (
          <Space orientation="vertical" size={0}>
            <span>{record.recipient_name} {record.recipient_phone}</span>
            <span>{record.delivery_address}</span>
          </Space>
        ),
      },
      { title: '商品', key: 'products', render: (_, record) => `共 ${record.product_quantity} 件` },
      { title: '金额', dataIndex: 'total_amount', render: (value: number) => formatAmount(value) },
      { title: '出库时间', dataIndex: 'assigned_at', width: 180 },
      {
        title: '最新异常',
        dataIndex: 'latest_exception',
        render: (exception) => exception ? <Tag color="error">{getDeliveryExceptionLabel(exception.exception_type)} · {exception.remark || '无说明'} · {exception.occurred_at}</Tag> : '-',
      },
      {
        title: '操作',
        key: 'actions',
        width: 280,
        render: (_, record) => {
          const canHandle = canHandleDelivery(
            isAdmin,
            record.delivery_employee_id === currentUserId,
            record.status,
          );
          const canReassign = canReassignDelivery(isAdmin, record.status);
          return (
            <Space size="small">
              {canHandle && <Button type="link" onClick={() => openActionModal('sign', record)}>登记签收</Button>}
              {canHandle && <Button type="link" onClick={() => void openReturnModal(record)}>现场退货</Button>}
              {canHandle && <Button type="link" onClick={() => openActionModal('exception', record)}>登记异常</Button>}
              {canReassign && <Button type="link" onClick={() => openActionModal('reassign', record)}>改派</Button>}
            </Space>
          );
        },
      },
    ],
    [currentUserId, isAdmin],
  );

  const archiveColumns = useMemo<ProColumns<OrderDeliveryArchiveRecord>[]>(
    () => [
      { title: '配送员', dataIndex: 'employee_id', hideInTable: true, valueType: 'select', fieldProps: { options: employeeOptions.map((employee) => ({ label: employee.name, value: employee.id })) } },
      { title: '订单号', dataIndex: 'order_keyword', hideInTable: true },
      { title: '客户', dataIndex: 'customer_keyword', hideInTable: true },
      { title: '签收人', dataIndex: 'signer_keyword', hideInTable: true },
      { title: '签收日期', dataIndex: 'signed_range', hideInTable: true, valueType: 'dateRange' },
      { title: '订单号', dataIndex: 'order_no', render: (value, record) => <Button type="link" onClick={() => openOrderDetail(record.order_id)}>{value as string}</Button> },
      { title: '客户', dataIndex: 'customer_name', render: (value) => <Button type="link" onClick={() => openCustomer(value as string)}>{value as string}</Button> },
      { title: '配送员', dataIndex: 'delivery_employee_name' },
      { title: '签收人', dataIndex: 'signer_name', render: (value) => value || '-' },
      { title: '签收时间', dataIndex: 'signed_at', width: 180 },
      { title: '签收备注', dataIndex: 'sign_remark', render: (value) => value || '-' },
      {
        title: '操作',
        key: 'actions',
        render: (_, record) => <Button type="link" onClick={() => void openDetail(record.id)}>查看详情</Button>,
      },
    ],
    [employeeOptions],
  );

  function toggleEmployee(employeeId: string) {
    setExpandedEmployees((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

  function openActionModal(modal: ActiveModal, delivery: OrderDeliveryCurrentRecord) {
    setSelectedDelivery(delivery);
    setActiveModal(modal);
    if (modal === 'sign') {
      setProofFiles([]);
      setPaymentProofFiles([]);
      signForm.setFieldsValue({ collect_payment: false, paid_amount: delivery.total_amount });
    }
    if (modal === 'reassign') void loadEmployees();
  }

  async function openReturnModal(delivery: OrderDeliveryCurrentRecord) {
    setSelectedDelivery(delivery);
    setReturnLoading(true);
    setReturnDrafts({});
    try {
      const [response, warehouses] = await Promise.all([listReturnableOrderItems(delivery.id), listAllWarehouses()]);
      if (response.code !== 0) {
        message.error(getMessage(response, '加载可退商品失败'));
        return;
      }
      setReturnableItems(response.data ?? []);
      setReturnWarehouseOptions(warehouses.filter((warehouse) => warehouse.status === 'active'));
      setActiveModal('return');
    } catch {
      message.error('加载可退商品失败，请稍后重试');
    } finally {
      setReturnLoading(false);
    }
  }

  async function submitReturn() {
    if (!selectedDelivery) return;
    const items = returnableItems.flatMap((item) => {
      const draft = returnDrafts[item.source_order_item_id];
      if (!draft?.quantity) return [];
      if (!draft.reason?.trim()) {
        message.error(`请填写 ${item.product_name} 的退货原因`);
        return [];
      }
      if (draft.shouldStockIn && !draft.warehouseId) {
        message.error(`请选择 ${item.product_name} 的入库仓库`);
        return [];
      }
      return [{
        source_order_item_id: item.source_order_item_id,
        quantity: draft.quantity,
        condition: draft.condition ?? 'normal',
        return_reason: draft.reason.trim(),
        should_stock_in: Boolean(draft.shouldStockIn),
        warehouse_id: draft.shouldStockIn ? draft.warehouseId : undefined,
      }];
    });
    if (!items.length) {
      message.error('请至少填写一项退货数量和原因');
      return;
    }
    setSubmitting(true);
    try {
      const response = await createReturnOrder({ handling_delivery_id: selectedDelivery.id, items });
      if (response.code !== 0) {
        message.error(getMessage(response, '创建退货单失败'));
        return;
      }
      message.success('退货单已创建');
      closeActionModal(true);
      await loadCurrent();
    } finally {
      setSubmitting(false);
    }
  }

  async function openDetail(id: string) {
    const requestId = ++detailRequestId.current;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(undefined);
    try {
      const response = await getDeliveryDetail(id);
      if (requestId !== detailRequestId.current) return;
      if (response.code === 0) setDetail(response.data);
      else message.error(getMessage(response, '加载配送明细失败'));
    } catch {
      if (requestId !== detailRequestId.current) return;
      message.error('加载配送明细失败');
    } finally {
      if (requestId === detailRequestId.current) setDetailLoading(false);
    }
  }

  function closeActionModal(force = false) {
    if (submitting && !force) return;
    setActiveModal(undefined);
    setSelectedDelivery(undefined);
    setProofFiles([]);
    setPaymentProofFiles([]);
    signForm.resetFields();
    exceptionForm.resetFields();
    reassignForm.resetFields();
  }

  const proofUpload: NonNullable<UploadProps['customRequest']> = async ({ file, onError, onSuccess }) => {
    try {
      const response = await uploadFile(file as File, 'deliveries');
      if (response.code !== 0 || !response.data?.url) throw new Error(getMessage(response, '上传凭证失败'));
      onSuccess?.(response.data);
    } catch (error) {
      onError?.(error as Error);
    }
  };

  const paymentProofUpload: NonNullable<UploadProps['customRequest']> = async ({ file, onError, onSuccess }) => {
    try {
      const response = await uploadFile(file as File, 'payments');
      if (response.code !== 0 || !response.data?.url) throw new Error(getMessage(response, '上传付款凭证失败'));
      onSuccess?.(response.data);
    } catch (error) {
      onError?.(error as Error);
    }
  };

  async function submitSign() {
    if (!selectedDelivery) return;
    let values: SignFormValues;
    try {
      values = await signForm.validateFields();
    } catch {
      return;
    }
    if (proofFiles.some((file) => file.status !== 'done')) {
      message.warning('请等待凭证上传完成，或移除上传失败的文件');
      return;
    }
    if (values.collect_payment) {
      if (!values.paid_amount || values.paid_amount <= 0) {
        message.warning('请填写实收金额');
        return;
      }
      if (values.paid_amount > selectedDelivery.total_amount) {
        message.warning('实收金额不能超过订单金额');
        return;
      }
      if (paymentProofFiles.some((file) => file.status !== 'done')) {
        message.warning('请等待付款凭证上传完成，或移除上传失败的文件');
        return;
      }
      if (extractDeliveryProofUrls(paymentProofFiles).length === 0) {
        message.warning('请上传付款凭证');
        return;
      }
    }
    setSubmitting(true);
    try {
      const response = await signDelivery(selectedDelivery.id, {
        signer_name: values.signer_name.trim(),
        proof_image_urls: extractDeliveryProofUrls(proofFiles),
        remark: values.remark?.trim() || undefined,
        ...(values.collect_payment ? {
          collect_payment: true,
          paid_amount: values.paid_amount,
          payment_proof_image_urls: extractDeliveryProofUrls(paymentProofFiles),
        } : {}),
      });
      if (response.code !== 0) {
        message.error(getMessage(response, '登记签收失败'));
        return;
      }
      message.success('签收登记成功');
      closeActionModal(true);
      void refreshAfterMutation();
    } catch {
      message.error('登记签收失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitException() {
    if (!selectedDelivery) return;
    let values: { exception_type: OrderDeliveryExceptionType; remark?: string };
    try {
      values = await exceptionForm.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    try {
      const response = await createDeliveryException(selectedDelivery.id, {
        exception_type: values.exception_type,
        remark: values.remark?.trim() || undefined,
      });
      if (response.code !== 0) {
        message.error(getMessage(response, '登记异常失败'));
        return;
      }
      message.success('配送异常已登记');
      closeActionModal(true);
      void refreshAfterMutation();
    } catch {
      message.error('登记异常失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReassign() {
    if (!selectedDelivery) return;
    let values: { delivery_employee_id: string; reason?: string };
    try {
      values = await reassignForm.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    try {
      const response = await reassignDelivery(selectedDelivery.id, {
        delivery_employee_id: values.delivery_employee_id,
        reason: values.reason?.trim() || undefined,
      });
      if (response.code !== 0) {
        message.error(getMessage(response, '改派配送失败'));
        return;
      }
      message.success('配送改派成功');
      closeActionModal(true);
      void refreshAfterMutation();
    } catch {
      message.error('改派配送失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  function showArchive() {
    archiveVisited.current = true;
    void loadEmployees();
    archiveActionRef.current?.reload();
  }

  return (
    <PageContainer>
      <Tabs
        activeKey={activeTab}
        onChange={(key) => {
          setActiveTab(key);
          if (key === 'archive') showArchive();
        }}
        items={[
          {
            key: 'current',
            label: '当前配送',
            children: (
              <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                {currentError && <Alert type="error" showIcon title={currentError} action={<Button size="small" onClick={() => void loadCurrent()}>重试</Button>} />}
                {currentLoading && groups.length === 0 && <Card loading />}
                {!currentError && !currentLoading && groups.length === 0 && <Card>暂无当前配送订单</Card>}
                {groups.map((group) => {
                  const metrics = normalizeCurrentGroupMetrics(group);
                  const expanded = expandedEmployees.has(group.delivery_employee_id);
                  return (
                    <Card
                      key={group.delivery_employee_id}
                      loading={currentLoading && groups.length === 0}
                      title={<Button type="text" aria-label={`${expanded ? '收起' : '展开'}${group.delivery_employee_name}`} onClick={() => toggleEmployee(group.delivery_employee_id)}>{group.delivery_employee_name}</Button>}
                      extra={<Tag color={metrics.exception_order_count ? 'error' : 'default'}>{metrics.exception_order_count ? `${metrics.exception_order_count} 单异常` : '配送正常'}</Tag>}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(110px, 1fr))', gap: 16, marginBottom: expanded ? 16 : 0 }}>
                        <Statistic title="订单数" value={metrics.order_count} />
                        <Statistic title="客户数" value={metrics.customer_count} />
                        <Statistic title="商品件数" value={metrics.product_quantity} />
                        <Statistic title="配送金额" value={metrics.total_amount} formatter={() => formatAmount(metrics.total_amount)} />
                        <Statistic title="异常订单" value={metrics.exception_order_count} styles={metrics.exception_order_count ? { content: { color: '#cf1322' } } : undefined} />
                      </div>
                      {expanded && <Table rowKey="id" size="small" pagination={false} columns={currentColumns} dataSource={group.deliveries} />}
                    </Card>
                  );
                })}
              </Space>
            ),
          },
          {
            key: 'archive',
            label: '配送归档',
            children: (
              <ProTable<OrderDeliveryArchiveRecord>
                actionRef={archiveActionRef}
                rowKey="id"
                columns={archiveColumns}
                search={{ labelWidth: 'auto' }}
                request={async (params) => {
                  const response = await listDeliveryArchive(serializeArchiveFilters(params));
                  return { data: response.data?.items ?? [], total: response.data?.total ?? 0, success: response.code === 0 };
                }}
              />
            ),
          },
        ]}
      />

      <Modal title="登记签收" open={activeModal === 'sign'} onCancel={() => closeActionModal()} onOk={() => void submitSign()} okText="确认签收" confirmLoading={submitting}>
        <Form form={signForm} layout="vertical">
          <Form.Item name="signer_name" label="签收人" rules={[{ required: true, whitespace: true, message: '请填写签收人' }]}><Input aria-label="签收人" /></Form.Item>
          <Form.Item label="签收凭证"><Upload accept="image/*" listType="picture-card" multiple fileList={proofFiles} customRequest={proofUpload} onChange={({ fileList }) => setProofFiles(fileList)}><Button>上传照片</Button></Upload></Form.Item>
          <Form.Item name="collect_payment" valuePropName="checked">
            <Checkbox aria-label="同时确认收款">同时确认收款</Checkbox>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(previous, current) => previous.collect_payment !== current.collect_payment}>
            {({ getFieldValue }) => getFieldValue('collect_payment') ? (
              <>
                <Form.Item name="paid_amount" label="实收金额" rules={[{ required: true, message: '请填写实收金额' }]}>
                  <InputNumber aria-label="实收金额" min={0.01} max={selectedDelivery?.total_amount} precision={2} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item label="付款凭证" required>
                  <Upload accept="image/*" listType="picture-card" multiple fileList={paymentProofFiles} customRequest={paymentProofUpload} onChange={({ fileList }) => setPaymentProofFiles(fileList)}><Button>上传付款凭证</Button></Upload>
                </Form.Item>
              </>
            ) : null}
          </Form.Item>
          <Form.Item name="remark" label="签收备注"><Input.TextArea aria-label="签收备注" rows={3} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="登记配送异常" open={activeModal === 'exception'} onCancel={() => closeActionModal()} onOk={() => void submitException()} okText="确认登记" confirmLoading={submitting}>
        <Form form={exceptionForm} layout="vertical">
          <Form.Item name="exception_type" label="异常类型" rules={[{ required: true, message: '请选择异常类型' }]}><Select aria-label="异常类型" options={exceptionOptions} /></Form.Item>
          <Form.Item noStyle shouldUpdate={(previous, current) => previous.exception_type !== current.exception_type}>{({ getFieldValue }) => <Form.Item name="remark" label="异常说明" rules={getFieldValue('exception_type') === 'other' ? [{ required: true, whitespace: true, message: '其他异常必须填写说明' }] : []}><Input.TextArea aria-label="异常说明" rows={3} /></Form.Item>}</Form.Item>
        </Form>
      </Modal>

      <Modal title="改派配送" open={activeModal === 'reassign'} onCancel={() => closeActionModal()} onOk={() => void submitReassign()} okText="确认改派" confirmLoading={submitting}>
        <Form form={reassignForm} layout="vertical">
          <Form.Item name="delivery_employee_id" label="新配送员" rules={[{ required: true, message: '请选择新配送员' }]}><Select aria-label="新配送员" loading={employeesLoading} options={employeeOptions.filter((employee) => employee.id !== selectedDelivery?.delivery_employee_id).map((employee) => ({ label: employee.name, value: employee.id }))} /></Form.Item>
          <Form.Item name="reason" label="改派原因"><Input.TextArea aria-label="改派原因" rows={3} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="现场退货" open={activeModal === 'return'} onCancel={() => closeActionModal()} onOk={() => void submitReturn()} okText="创建退货单" confirmLoading={submitting} width={920} destroyOnHidden>
        <Alert type="info" showIcon title="可选择该客户的历史已出库/待收款/已完成订单商品；商品和价格由来源订单自动带入。" style={{ marginBottom: 16 }} />
        <Table rowKey="source_order_item_id" loading={returnLoading} pagination={false} size="small" dataSource={returnableItems} columns={[
          { title: '来源订单', dataIndex: 'order_no' },
          { title: '商品', dataIndex: 'product_name' },
          { title: '条码', dataIndex: 'barcode' },
          { title: '单价', dataIndex: 'unit_price', render: (value) => formatAmount(value) },
          { title: '可退', dataIndex: 'returnable_quantity' },
          { title: '退货数量', render: (_, item) => <InputNumber min={0} max={item.returnable_quantity} precision={0} value={returnDrafts[item.source_order_item_id]?.quantity} onChange={(quantity) => setReturnDrafts((drafts) => ({ ...drafts, [item.source_order_item_id]: { ...drafts[item.source_order_item_id], quantity: quantity ?? undefined } }))} /> },
          { title: '状况', render: (_, item) => <Select style={{ width: 96 }} disabled={!returnDrafts[item.source_order_item_id]?.quantity} value={returnDrafts[item.source_order_item_id]?.condition ?? 'normal'} options={[{ label: '正常', value: 'normal' }, { label: '过期', value: 'expired' }, { label: '损坏', value: 'damaged' }, { label: '其他', value: 'other' }]} onChange={(condition) => setReturnDrafts((drafts) => ({ ...drafts, [item.source_order_item_id]: { ...drafts[item.source_order_item_id], condition } }))} /> },
          { title: '退货原因', render: (_, item) => <Input value={returnDrafts[item.source_order_item_id]?.reason} disabled={!returnDrafts[item.source_order_item_id]?.quantity} onChange={(event) => setReturnDrafts((drafts) => ({ ...drafts, [item.source_order_item_id]: { ...drafts[item.source_order_item_id], reason: event.target.value } }))} /> },
          { title: '入库', render: (_, item) => <Checkbox disabled={!returnDrafts[item.source_order_item_id]?.quantity} checked={Boolean(returnDrafts[item.source_order_item_id]?.shouldStockIn)} onChange={(event) => setReturnDrafts((drafts) => ({ ...drafts, [item.source_order_item_id]: { ...drafts[item.source_order_item_id], shouldStockIn: event.target.checked, warehouseId: event.target.checked ? drafts[item.source_order_item_id]?.warehouseId : undefined } }))}>入库</Checkbox> },
          { title: '入库仓库', render: (_, item) => <Select style={{ width: 120 }} disabled={!returnDrafts[item.source_order_item_id]?.shouldStockIn} value={returnDrafts[item.source_order_item_id]?.warehouseId} options={returnWarehouseOptions.map((warehouse) => ({ label: warehouse.name, value: warehouse.id }))} onChange={(warehouseId) => setReturnDrafts((drafts) => ({ ...drafts, [item.source_order_item_id]: { ...drafts[item.source_order_item_id], warehouseId } }))} /> },
        ]} />
      </Modal>

      <Drawer title="配送明细" open={detailOpen} onClose={() => { detailRequestId.current += 1; setDetailOpen(false); setDetail(undefined); }} size="large" loading={detailLoading}>
        {detail && <>
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="订单号"><Button type="link" onClick={() => openOrderDetail(detail.order_id)}>{detail.order_no}</Button></Descriptions.Item>
            <Descriptions.Item label="客户"><Button type="link" onClick={() => openCustomer(detail.customer_name)}>{detail.customer_name}</Button></Descriptions.Item>
            <Descriptions.Item label="配送员">{detail.delivery_employee_name}</Descriptions.Item>
            <Descriptions.Item label="签收人">{detail.signer_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color="success">已签收</Tag></Descriptions.Item>
            <Descriptions.Item label="收货信息" span={2}>{detail.recipient_name} {detail.recipient_phone}，{detail.delivery_address}</Descriptions.Item>
            <Descriptions.Item label="签收备注" span={2}>{detail.sign_remark || '-'}</Descriptions.Item>
          </Descriptions>
          <Card size="small" title="签收凭证" style={{ marginTop: 16 }}>
            {detail.proof_image_urls.length || detail.signature_image_url ? (
              <Image.PreviewGroup>
                {detail.proof_image_urls.map((url, index) => <Image key={url} width={96} src={url} alt={`签收凭证 ${index + 1}`} />)}
                {detail.signature_image_url && <Image width={160} src={detail.signature_image_url} alt="手写签名" />}
              </Image.PreviewGroup>
            ) : '无签收凭证'}
          </Card>
          <Card size="small" title="配送商品" style={{ marginTop: 16 }}><Table rowKey="product_id" size="small" pagination={false} dataSource={detail.items} columns={[{ title: '商品', dataIndex: 'product_name' }, { title: '条码', dataIndex: 'barcode' }, { title: '数量', dataIndex: 'quantity' }]} /></Card>
          <Card size="small" title="配送轨迹" style={{ marginTop: 16 }}><Timeline items={detail.events.map((event) => ({ content: <span>{getDeliveryEventLabel(event.event_type)} · {event.operator_name} · {event.created_at}{event.exception_type ? ` · ${getDeliveryExceptionLabel(event.exception_type)}` : ''}{event.remark ? ` · ${event.remark}` : ''}</span> }))} /></Card>
        </>}
      </Drawer>
    </PageContainer>
  );
};

export default DeliveryPage;
