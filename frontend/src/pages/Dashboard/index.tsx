import { PageContainer, StatisticCard } from '@ant-design/pro-components';
import { Mix, Bar } from '@ant-design/charts';
import { Row, Col, Card, Segmented, Empty, Spin, Table, Tag } from 'antd';
import {
  TeamOutlined,
  ShoppingOutlined,
  InboxOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useRequest, history } from '@umijs/max';
import { useState } from 'react';
import { getDashboardStats } from '@/services/dashboard';
import { getDashboardTotals } from './totals';

const Dashboard: React.FC = () => {
  const [period, setPeriod] = useState<string>('week');

  const { data: statsData, loading: statsLoading } = useRequest(
    () => getDashboardStats({ period }),
    { refreshDeps: [period] },
  );

  const stats = statsData as unknown as API.DashboardStats | undefined;
  const { customerTotal, productTotal, orderTotal, employeeTotal } =
    getDashboardTotals(stats);
  const trendData = stats?.order_trend ?? [];
  const rankingData = stats?.customer_ranking ?? [];
  const alertData = stats?.inventory_alerts ?? [];
  const productSalesData = stats?.product_sales ?? [];

  const rankingChartData = rankingData.map((item) => ({
    customer_name: item.customer_name,
    total_amount: item.total_amount,
    order_count: item.order_count,
  })).reverse();

  const salesChartData = productSalesData.map((item) => ({
    product_label: `${item.product_name}`,
    total_quantity: item.total_quantity,
    total_amount: item.total_amount,
  })).reverse();

  const trendChartConfig = {
    data: trendData,
    xField: 'date',
    height: 360,
    children: [
      {
        type: 'interval',
        yField: 'order_count',
        axis: { y: { title: '订单数量 (笔)' } },
        scale: { color: { relations: [['order_count', '#1677ff']] } },
        style: { fill: '#1677ff', fillOpacity: 0.7 },
      },
      {
        type: 'line',
        yField: 'order_amount',
        axis: { y: { position: 'right', title: '订单金额 (元)' } },
        scale: { y: { independent: true }, color: { relations: [['order_amount', '#f5222d']] } },
        style: { stroke: '#f5222d', lineWidth: 2 },
        shapeField: 'smooth',
      },
    ],
    legend: { color: { position: 'top' } },
  };

  const alertColumns = [
    { title: '商品', dataIndex: 'product_info', key: 'product_info', ellipsis: true },
    { title: '涉及仓库', dataIndex: 'warehouse_count', key: 'warehouse_count', width: 100 },
    {
      title: '当前库存',
      key: 'current',
      width: 100,
      render: (_: unknown, record: API.InventoryAlertItem) => {
        const available = record.quantity - record.locked;
        return <span style={{ color: '#ff4d4f' }}>{available}</span>;
      },
    },
    { title: '预警线', dataIndex: 'warning_quantity', key: 'warning_quantity', width: 80 },
    {
      title: '状态',
      key: 'status',
      width: 80,
      render: (_: unknown, record: API.InventoryAlertItem) => {
        const available = record.quantity - record.locked;
        if (available <= 0) return <Tag color="red">缺货</Tag>;
        return <Tag color="orange">偏低</Tag>;
      },
    },
  ];

  return (
    <PageContainer>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatisticCard
            statistic={{
              title: '客户总数',
              value: customerTotal,
              icon: <TeamOutlined style={{ fontSize: 24 }} />,
            }}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatisticCard
            statistic={{
              title: '商品总数',
              value: productTotal,
              icon: <InboxOutlined style={{ fontSize: 24 }} />,
            }}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatisticCard
            statistic={{
              title: '订单总数',
              value: orderTotal,
              icon: <ShoppingOutlined style={{ fontSize: 24 }} />,
            }}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatisticCard
            statistic={{
              title: '员工总数',
              value: employeeTotal,
              icon: <UserOutlined style={{ fontSize: 24 }} />,
            }}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={16}>
          <Card
            title="订单趋势"
            extra={
              <Segmented
                value={period}
                onChange={(v) => setPeriod(v as string)}
                options={[
                  { label: '近一周', value: 'week' },
                  { label: '近一月', value: 'month' },
                  { label: '近一年', value: 'year' },
                ]}
              />
            }
          >
            {statsLoading ? (
              <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
            ) : trendData.length === 0 ? (
              <Empty description="暂无订单数据" />
            ) : (
              <Mix {...trendChartConfig} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="客户消费排行 (Top 10)">
            {statsLoading ? (
              <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
            ) : rankingData.length === 0 ? (
              <Empty description="暂无客户数据" />
            ) : (
              <Bar
                data={rankingChartData}
                xField="total_amount"
                yField="customer_name"
                height={360}
                colorField="total_amount"
                scale={{ color: { range: ['#69b1ff', '#1677ff'] } }}
                label={{
                  text: (d: any) => `¥${d.total_amount.toLocaleString()}`,
                  position: 'right',
                  style: { fontSize: 11 },
                }}
                axis={{
                  x: { title: '消费金额 (元)' },
                  y: { title: false },
                }}
                tooltip={{
                  title: 'customer_name',
                  items: [
                    { field: 'total_amount', name: '消费金额' },
                    { field: 'order_count', name: '订单数' },
                  ],
                }}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={8}>
          <Card
            title={
              <span>
                <WarningOutlined style={{ color: '#faad14', marginRight: 8 }} />
                库存预警
                {alertData.length > 0 && (
                  <Tag color="red" style={{ marginLeft: 8 }}>{alertData.length}</Tag>
                )}
              </span>
            }
            extra={<a onClick={() => history.push('/inventory/stock')}>查看全部</a>}
          >
            {statsLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
            ) : alertData.length === 0 ? (
              <Empty description="暂无库存预警" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Table
                dataSource={alertData}
                columns={alertColumns}
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ y: 300 }}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={16}>
          <Card title="近期商品售卖排行 (Top 10)">
            {statsLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
            ) : salesChartData.length === 0 ? (
              <Empty description="暂无售卖数据" />
            ) : (
              <Bar
                data={salesChartData}
                xField="total_quantity"
                yField="product_label"
                height={360}
                colorField="total_quantity"
                scale={{ color: { range: ['#95de64', '#52c41a'] } }}
                label={{
                  text: (d: any) => `${d.total_quantity}件 / ¥${d.total_amount.toLocaleString()}`,
                  position: 'right',
                  style: { fontSize: 11 },
                }}
                axis={{
                  x: { title: '售卖数量 (件)' },
                  y: { title: false },
                }}
                tooltip={{
                  title: 'product_label',
                  items: [
                    { field: 'total_quantity', name: '售卖数量' },
                    { field: 'total_amount', name: '售卖金额', valueFormatter: (v: number) => `¥${v.toLocaleString()}` },
                  ],
                }}
              />
            )}
          </Card>
        </Col>
      </Row>
    </PageContainer>
  );
};

export default Dashboard;
