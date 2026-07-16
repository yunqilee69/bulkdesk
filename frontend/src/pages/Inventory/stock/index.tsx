import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import React, { useState, useEffect } from 'react';
import { listWarehouses, listInventoryItems } from '@/services/inventory';

interface StockRecord {
  id: string;
  product_id: string;
  product_info?: string;
  warehouse_id: string;
  warehouse_name?: string;
  quantity: number;
  locked: number;
  warning_quantity: number;
  supplier_id?: string;
  supplier_name?: string;
  production_date?: string;
  expiry_date?: string;
  location?: string;
}

const Stock: React.FC = () => {
  const [warehouseOptions, setWarehouseOptions] = useState<Array<{ label: string; value: string }>>([]);

  useEffect(() => {
    listWarehouses({ page: 1, page_size: 100 }).then((res) => {
      if (res.code === 0) {
        setWarehouseOptions(
          res.data.items
            .filter((w: Record<string, unknown>) => w.status === 'active')
            .map((w: Record<string, string>) => ({ label: w.name, value: w.id })),
        );
      }
    });
  }, []);

  const columns: ProColumns<StockRecord>[] = [
    { title: '商品信息', dataIndex: 'product_info', width: 180 },
    {
      title: '仓库',
      dataIndex: 'warehouse_id',
      width: 150,
      hideInTable: true,
      valueType: 'select',
      fieldProps: { options: warehouseOptions },
    },
    { title: '仓库', dataIndex: 'warehouse_name', width: 150, search: false },
    { title: '库存数量', dataIndex: 'quantity', width: 100, search: false },
    { title: '锁定数量', dataIndex: 'locked', width: 100, search: false },
    {
      title: '可用数量',
      width: 100,
      search: false,
      render: (_, record) => record.quantity - record.locked,
    },
    { title: '预警数量', dataIndex: 'warning_quantity', width: 100, search: false },
    { title: '供应商', dataIndex: 'supplier_name', width: 120, search: false },
    { title: '库位', dataIndex: 'location', width: 120, search: false },
    {
      title: '生产日期',
      dataIndex: 'production_date',
      width: 110,
      search: false,
      valueType: 'date',
    },
    {
      title: '有效期',
      dataIndex: 'expiry_date',
      width: 110,
      search: false,
      valueType: 'date',
    },
  ];

  return (
    <PageContainer>
      <ProTable<StockRecord>
        rowKey="id"
        request={async (params) => {
          const res = await listInventoryItems({
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
    </PageContainer>
  );
};

export default Stock;
