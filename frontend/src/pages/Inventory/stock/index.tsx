import { ModalForm, PageContainer, ProFormDigit, ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Image, message } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import { listWarehouses, listInventoryItems } from '@/services/inventory';
import { updateProductWarningQuantity } from '@/services/product';

interface StockRecord {
  id: string;
  product_id: string;
  product_info?: string;
  product_image_url?: string;
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
  const actionRef = useRef<ActionType>(null);
  const [warehouseOptions, setWarehouseOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [warningRecord, setWarningRecord] = useState<StockRecord>();

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
    {
      title: '商品信息',
      dataIndex: 'product_info',
      width: 240,
      render: (_, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {record.product_image_url ? (
            <Image
              alt={record.product_info ?? '商品图片'}
              fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN88P/BfwAJhAPi5i8i7AAAAABJRU5ErkJggg=="
              height={40}
              preview={false}
              src={record.product_image_url}
              style={{ borderRadius: 4, objectFit: 'cover' }}
              width={40}
            />
          ) : (
            <div style={{ alignItems: 'center', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 4, color: '#999', display: 'flex', fontSize: 12, height: 40, justifyContent: 'center', width: 40 }}>
              暂无
            </div>
          )}
          <span>{record.product_info}</span>
        </div>
      ),
    },
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
    {
      title: '操作',
      valueType: 'option',
      width: 100,
      render: (_, record) => [
        <a key="warning" onClick={() => setWarningRecord(record)}>设置预警</a>,
      ],
    },
  ];

  return (
    <PageContainer>
      <ProTable<StockRecord>
        actionRef={actionRef}
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
      <ModalForm
        initialValues={{ warning_quantity: warningRecord?.warning_quantity }}
        onFinish={async (values) => {
          if (!warningRecord) return false;
          const response = await updateProductWarningQuantity(
            warningRecord.product_id,
            values.warning_quantity,
          );
          if (response.code !== 0) return false;
          message.success('预警数量已更新');
          setWarningRecord(undefined);
          await actionRef.current?.reload();
          return true;
        }}
        onOpenChange={(open) => {
          if (!open) setWarningRecord(undefined);
        }}
        open={Boolean(warningRecord)}
        title="设置库存预警"
      >
        <ProFormDigit
          fieldProps={{ min: 0, precision: 0 }}
          label="预警数量"
          name="warning_quantity"
          rules={[{ required: true, message: '请输入预警数量' }]}
        />
      </ModalForm>
    </PageContainer>
  );
};

export default Stock;
