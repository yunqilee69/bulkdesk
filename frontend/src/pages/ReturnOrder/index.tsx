import { PageContainer, ProTable, type ActionType, type ProColumns } from '@ant-design/pro-components';
import { useAccess } from '@umijs/max';
import { Button, Descriptions, Drawer, Input, message, Modal, Table, Tag } from 'antd';
import { useRef, useState } from 'react';

import { getReturnOrder, listReturnOrders, voidReturnOrder } from '@/services/returnOrder';

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
  items?: Array<{ id: string; product_name: string; barcode: string; quantity: number; unit_price: number; return_reason: string; should_stock_in: boolean; warehouse_name?: string }>;
}

const ReturnOrderList = () => {
  const access = useAccess();
  const actionRef = useRef<ActionType>(null);
  const [detail, setDetail] = useState<ReturnOrderRecord>();
  const [voidId, setVoidId] = useState<string>();
  const [voidReason, setVoidReason] = useState('');
  const [voidSubmitting, setVoidSubmitting] = useState(false);

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
      } else message.error(response.message || '作废失败');
    } finally {
      setVoidSubmitting(false);
    }
  };

  const columns: ProColumns<ReturnOrderRecord>[] = [
    { title: '退货单号', dataIndex: 'return_no', width: 190, render: (_, record) => <Button type="link" onClick={() => void showDetail(record.id)}>{record.return_no}</Button> },
    { title: '客户', dataIndex: 'customer_name', width: 140 },
    { title: '状态', dataIndex: 'status', width: 100, valueType: 'select', valueEnum: { completed: { text: '已完成', status: 'Success' }, voided: { text: '已作废', status: 'Error' } }, render: (_, record) => <Tag color={record.status === 'completed' ? 'green' : 'red'}>{record.status === 'completed' ? '已完成' : '已作废'}</Tag> },
    { title: '退货金额', dataIndex: 'total_amount', width: 120, valueType: 'money' },
    { title: '办理人', dataIndex: 'operator', width: 120, search: false },
    { title: '办理时间', dataIndex: 'completed_at', width: 180, valueType: 'dateTime', search: false },
    { title: '操作', valueType: 'option', width: 120, render: (_, record) => access.canAdmin && record.status === 'completed' ? <Button type="link" danger onClick={() => { setVoidId(record.id); setVoidReason(''); }}>作废</Button> : null },
  ];

  return <PageContainer>
    <ProTable<ReturnOrderRecord>
      actionRef={actionRef} rowKey="id" columns={columns} search={{ labelWidth: 80 }}
      request={async (params) => {
        const response = await listReturnOrders({ status: params.status, customer_id: params.customer_id, page: params.current, page_size: params.pageSize });
        return { data: response.data?.items ?? [], total: response.data?.total ?? 0, success: response.code === 0 };
      }}
      toolbar={{ title: '退货记录（退货请从配送任务发起）' }}
    />
    <Drawer title="退货单详情" open={Boolean(detail)} size="large" onClose={() => setDetail(undefined)}>
      {detail && <>
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="退货单号">{detail.return_no}</Descriptions.Item><Descriptions.Item label="客户">{detail.customer_name}</Descriptions.Item>
          <Descriptions.Item label="状态"><Tag color={detail.status === 'completed' ? 'green' : 'red'}>{detail.status === 'completed' ? '已完成' : '已作废'}</Tag></Descriptions.Item><Descriptions.Item label="退货金额">¥{Number(detail.total_amount).toFixed(2)}</Descriptions.Item>
          <Descriptions.Item label="办理人">{detail.operator}</Descriptions.Item><Descriptions.Item label="办理时间">{detail.completed_at}</Descriptions.Item>
          <Descriptions.Item label="累计消费冲减">¥{Number(detail.spend_deduction_amount).toFixed(2)}</Descriptions.Item><Descriptions.Item label="作废原因">{detail.void_reason || '-'}</Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>{detail.remark || '-'}</Descriptions.Item>
        </Descriptions>
        <Table dataSource={detail.items ?? []} rowKey="id" size="small" pagination={false} style={{ marginTop: 20 }} columns={[{ title: '商品', dataIndex: 'product_name' }, { title: '条码', dataIndex: 'barcode' }, { title: '数量', dataIndex: 'quantity' }, { title: '单价', dataIndex: 'unit_price' }, { title: '退货原因', dataIndex: 'return_reason' }, { title: '入库', dataIndex: 'should_stock_in', render: (value: boolean) => value ? '是' : '否' }, { title: '仓库', dataIndex: 'warehouse_name', render: (value: string) => value || '-' }]} />
      </>}
    </Drawer>
    <Modal title="作废退货单" open={Boolean(voidId)} okText="确认作废" okButtonProps={{ danger: true, disabled: !voidReason.trim() }} confirmLoading={voidSubmitting} onOk={() => void submitVoid()} onCancel={() => { if (!voidSubmitting) { setVoidId(undefined); setVoidReason(''); } }}>
      <Input.TextArea aria-label="作废原因" rows={4} maxLength={255} placeholder="请输入作废原因" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />
    </Modal>
  </PageContainer>;
};

export default ReturnOrderList;
