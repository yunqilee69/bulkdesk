import { PageContainer } from '@ant-design/pro-components';
import { useParams } from '@umijs/max';
import { Alert, Card, Descriptions, Image, Space, Table, Tag } from 'antd';
import { useEffect, useState } from 'react';

import { getOrder, type OrderItemRecord, type OrderOut, type OrderStatus } from '@/services/order';

const orderStatusMap: Record<OrderStatus, { color: string; text: string }> = {
  placed: { color: 'blue', text: '已下单' },
  shipping: { color: 'cyan', text: '正在发货' },
  stocked_out: { color: 'geekblue', text: '已出库' },
  delivered_unpaid: { color: 'orange', text: '已送达未付款' },
  completed: { color: 'green', text: '已完成' },
  cancelled: { color: 'red', text: '已取消' },
};

const deliveryStatusMap = {
  delivering: { color: 'processing', text: '配送中' },
  signed: { color: 'success', text: '已签收' },
} as const;

const deliveryExceptionMap: Record<string, string> = {
  customer_absent: '客户不在',
  customer_refused: '客户拒收',
  invalid_contact: '地址或联系方式有误',
  other: '其他',
};

function formatAmount(amount: number) {
  return `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderProofImages(urls: string[], label: string) {
  if (urls.length === 0) return '无凭证';
  return (
    <Image.PreviewGroup>
      <Space wrap>
        {urls.map((url, index) => (
          <Image key={url} width={96} src={url} alt={`${label} ${index + 1}`} />
        ))}
      </Space>
    </Image.PreviewGroup>
  );
}

const OrderDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderOut>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    setOrder(undefined);

    if (!id) {
      setError('缺少订单编号');
      setLoading(false);
      return () => {
        active = false;
      };
    }

    void getOrder(id)
      .then((response) => {
        if (!active) return;
        if (response.code === 0 && response.data) setOrder(response.data);
        else setError(response.message || '获取订单详情失败');
      })
      .catch(() => {
        if (active) setError('获取订单详情失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  const status = order ? orderStatusMap[order.status] : undefined;
  const deliveryStatus = order?.delivery ? deliveryStatusMap[order.delivery.status] : undefined;
  const paidAmount = order?.paid_amount ?? undefined;
  const discountAmount = order && paidAmount !== undefined ? Math.max(order.total_amount - paidAmount, 0) : undefined;

  return (
    <PageContainer title="订单详情">
      {error && <Alert type="error" showIcon title={error} />}
      {loading && <Card loading />}
      {order && (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Card title="订单信息">
            <Descriptions
              bordered
              column={{ xs: 1, sm: 1, md: 2 }}
              size="small"
              items={[
                { key: 'order_no', label: '订单号', children: order.order_no },
                { key: 'customer', label: '客户', children: order.customer_name || '-' },
                { key: 'status', label: '订单状态', children: status ? <Tag color={status.color}>{status.text}</Tag> : order.status },
                { key: 'total_amount', label: '订单金额', children: formatAmount(order.total_amount) },
                { key: 'paid_amount', label: '实收金额', children: paidAmount !== undefined ? formatAmount(paidAmount) : '-' },
                { key: 'discount_amount', label: '优惠差额', children: discountAmount !== undefined ? formatAmount(discountAmount) : '-' },
                { key: 'payment_proofs', label: '付款凭证', children: `${order.payment_proof_image_urls.length} 张` },
                { key: 'created_at', label: '下单时间', children: order.created_at },
                { key: 'shipping_started', label: '开始发货', children: `${order.shipping_started_by || '-'} · ${order.shipping_started_at || '-'}` },
                { key: 'stock_out', label: '确认出库', children: `${order.stock_out_by || '-'} · ${order.stock_out_at || '-'}` },
                { key: 'delivered', label: '确认送达', children: `${order.delivered_by || '-'} · ${order.delivered_at || '-'}` },
                { key: 'paid', label: '确认收款', children: `${order.paid_by || '-'} · ${order.paid_at || '-'}` },
                { key: 'cancelled', label: '取消信息', children: order.cancelled_at ? `${order.cancelled_by || '-'} · ${order.cancelled_at} · ${order.cancel_reason || '-'}` : '-' },
                { key: 'remark', label: '备注', children: order.remark || '-', span: 'filled' },
              ]}
            />
          </Card>

          <Card title="付款凭证">
            {renderProofImages(order.payment_proof_image_urls, '付款凭证')}
          </Card>

          {order.delivery && deliveryStatus && (
            <>
              <Card title="配送信息">
                <Descriptions
                  bordered
                  column={{ xs: 1, sm: 1, md: 2 }}
                  size="small"
                  items={[
                    { key: 'employee', label: '配送员', children: order.delivery.delivery_employee_name },
                    { key: 'delivery_status', label: '配送状态', children: <Tag color={deliveryStatus.color}>{deliveryStatus.text}</Tag> },
                    { key: 'recipient', label: '收货人', children: `${order.delivery.recipient_name} ${order.delivery.recipient_phone}` },
                    { key: 'assigned_at', label: '出库绑定时间', children: order.delivery.assigned_at },
                    { key: 'address', label: '收货地址', children: order.delivery.delivery_address, span: 'filled' },
                    ...(order.delivery.latest_exception ? [{
                      key: 'exception',
                      label: '最新异常',
                      children: `${deliveryExceptionMap[order.delivery.latest_exception.exception_type] ?? order.delivery.latest_exception.exception_type}${order.delivery.latest_exception.remark ? `：${order.delivery.latest_exception.remark}` : ''} · ${order.delivery.latest_exception.occurred_at}`,
                      span: 'filled' as const,
                    }] : []),
                    ...(order.delivery.signed_at ? [
                      { key: 'signer', label: '签收人', children: order.delivery.signer_name || '-' },
                      { key: 'signed_at', label: '签收时间', children: order.delivery.signed_at },
                      { key: 'proofs', label: '签收凭证', children: `${order.delivery.proof_image_urls.length} 张` },
                      { key: 'sign_remark', label: '签收备注', children: order.delivery.sign_remark || '-' },
                    ] : []),
                  ]}
                />
              </Card>

              <Card title="签收凭证">
                {renderProofImages(order.delivery.proof_image_urls, '签收凭证')}
              </Card>
            </>
          )}

          <Card title="商品明细">
            <Table<OrderItemRecord>
              dataSource={order.items}
              rowKey="id"
              pagination={false}
              columns={[
                { title: '商品', dataIndex: 'product_name' },
                { title: '条码', dataIndex: 'barcode' },
                { title: '数量', dataIndex: 'quantity' },
                {
                  title: '库存分配',
                  key: 'allocations',
                  render: (_, item) => (
                    <Space orientation="vertical" size={2}>
                      {item.allocations.map((allocation) => (
                        <span key={allocation.id}>{allocation.warehouse_name || allocation.warehouse_id}：{allocation.quantity}</span>
                      ))}
                    </Space>
                  ),
                },
                { title: '单价', dataIndex: 'unit_price', render: (value: number) => formatAmount(value) },
                { title: '小计', dataIndex: 'subtotal', render: (value: number) => formatAmount(value) },
              ]}
            />
          </Card>

          <Card title="状态日志">
            <Table
              dataSource={order.status_logs}
              rowKey="id"
              pagination={false}
              columns={[
                {
                  title: '状态',
                  dataIndex: 'to_status',
                  render: (value: OrderStatus) => {
                    const mappedStatus = orderStatusMap[value];
                    return <Tag color={mappedStatus.color}>{mappedStatus.text}</Tag>;
                  },
                },
                { title: '操作人', dataIndex: 'operator', render: (value: string | null) => value || '-' },
                { title: '备注', dataIndex: 'remark', render: (value: string | null) => value || '-' },
                { title: '时间', dataIndex: 'created_at' },
              ]}
            />
          </Card>
        </Space>
      )}
    </PageContainer>
  );
};

export default OrderDetailPage;
