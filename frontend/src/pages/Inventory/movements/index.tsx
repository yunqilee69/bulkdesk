import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { Descriptions, Modal, Table, Tag } from 'antd';
import React, { useState, useEffect } from 'react';
import { listMovements, listWarehouses, getMovement } from '@/services/inventory';

interface MovementItem {
  id: string;
  barcode: string;
  product_name: string;
  brand_name?: string;
  quantity: number;
  before_quantity: number;
  after_quantity: number;
  cost_price?: number;
  subtotal?: number;
}

interface MovementRecord {
  id: string;
  order_no: string;
  movement_type: string;
  warehouse_name?: string;
  from_warehouse_name?: string;
  to_warehouse_name?: string;
  supplier_name?: string;
  operator?: string;
  remark?: string;
  items: MovementItem[];
  created_at: string;
}

const movementTypeMap: Record<string, { color: string; text: string }> = {
  stock_in: { color: 'green', text: '入库' },
  stock_out: { color: 'orange', text: '出库' },
  transfer_out: { color: 'blue', text: '调拨' },
  stocktake_adjustment: { color: 'purple', text: '盘点' },
  order_deduction: { color: 'red', text: '订单扣减' },
  order_return: { color: 'cyan', text: '订单退货' },
};

const Movements: React.FC = () => {
  const [warehouseOptions, setWarehouseOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [currentMovement, setCurrentMovement] = useState<MovementRecord | null>(null);

  useEffect(() => {
    listWarehouses({ page: 1, page_size: 100 }).then((res) => {
      if (res.code === 0) {
        setWarehouseOptions(
          res.data.items.map((w: Record<string, string>) => ({ label: w.name, value: w.id })),
        );
      }
    });
  }, []);

  const handleViewDetail = async (id: string) => {
    const res = await getMovement(id);
    if (res.code === 0) {
      setCurrentMovement(res.data as MovementRecord);
      setDetailOpen(true);
    }
  };

  const getWarehouseDisplay = (record: MovementRecord) => {
    if (record.movement_type === 'transfer_out') {
      return `${record.from_warehouse_name || ''} → ${record.to_warehouse_name || ''}`;
    }
    return record.warehouse_name || '';
  };

  const columns: ProColumns<MovementRecord>[] = [
    { title: '单号', dataIndex: 'order_no', width: 180 },
    {
      title: '类型',
      dataIndex: 'movement_type',
      width: 100,
      valueType: 'select',
      valueEnum: {
        stock_in: { text: '入库', status: 'Success' },
        stock_out: { text: '出库', status: 'Warning' },
        transfer_out: { text: '调拨', status: 'Processing' },
        stocktake_adjustment: { text: '盘点', status: 'Default' },
        order_deduction: { text: '订单扣减', status: 'Error' },
        order_return: { text: '订单退货', status: 'Default' },
      },
      render: (_, record) => {
        const m = movementTypeMap[record.movement_type];
        return m ? <Tag color={m.color}>{m.text}</Tag> : record.movement_type;
      },
    },
    {
      title: '仓库',
      dataIndex: 'warehouse_id',
      hideInTable: true,
      valueType: 'select',
      fieldProps: { options: warehouseOptions },
    },
    { title: '仓库', width: 150, search: false, render: (_, record) => getWarehouseDisplay(record) },
    { title: '商品数', width: 80, search: false, render: (_, record) => record.items?.length ?? 0 },
    { title: '供应商', dataIndex: 'supplier_name', width: 120, search: false },
    { title: '操作人', dataIndex: 'operator', width: 100, search: false },
    { title: '备注', dataIndex: 'remark', width: 150, ellipsis: true, search: false },
    { title: '时间', dataIndex: 'created_at', width: 180, valueType: 'dateTime', search: false },
    {
      title: '操作',
      valueType: 'option',
      width: 80,
      render: (_, record) => [
        <a key="detail" onClick={() => handleViewDetail(record.id)}>详情</a>,
      ],
    },
  ];

  const itemColumns = [
    { title: '商品编码', dataIndex: 'barcode', width: 130 },
    { title: '商品名称', dataIndex: 'product_name', width: 140 },
    { title: '品牌', dataIndex: 'brand_name', width: 90 },
    { title: '变动前', dataIndex: 'before_quantity', width: 80 },
    { title: '变动后', dataIndex: 'after_quantity', width: 80 },
    { title: '数量', dataIndex: 'quantity', width: 70 },
    {
      title: '成本价', dataIndex: 'cost_price', width: 90,
      render: (v: number | undefined) => v != null ? `¥${Number(v).toFixed(2)}` : '-',
    },
    {
      title: '小计', dataIndex: 'subtotal', width: 90,
      render: (v: number | undefined) => v != null ? `¥${Number(v).toFixed(2)}` : '-',
    },
  ];

  return (
    <PageContainer>
      <ProTable<MovementRecord>
        rowKey="id"
        request={async (params) => {
          const res = await listMovements({
            movement_type: params?.movement_type,
            warehouse_id: params?.warehouse_id,
            page: params?.current,
            page_size: params?.pageSize,
          });
          return {
            data: res.data?.items ?? [],
            total: res.data?.total ?? 0,
            success: res.code === 0,
          };
        }}
        columns={columns}
        search={{ labelWidth: 80 }}
      />

      <Modal
        title={`流水详情 - ${currentMovement?.order_no || ''}`}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={900}
      >
        {currentMovement && (
          <>
            <Descriptions column={3} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="单号">{currentMovement.order_no}</Descriptions.Item>
              <Descriptions.Item label="类型">
                {(() => { const m = movementTypeMap[currentMovement.movement_type]; return m ? m.text : currentMovement.movement_type; })()}
              </Descriptions.Item>
              <Descriptions.Item label="仓库">{getWarehouseDisplay(currentMovement)}</Descriptions.Item>
              <Descriptions.Item label="供应商">{currentMovement.supplier_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="操作人">{currentMovement.operator || '-'}</Descriptions.Item>
              <Descriptions.Item label="备注">{currentMovement.remark || '-'}</Descriptions.Item>
            </Descriptions>
            <Table
              dataSource={currentMovement.items}
              columns={itemColumns}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </>
        )}
      </Modal>
    </PageContainer>
  );
};

export default Movements;
