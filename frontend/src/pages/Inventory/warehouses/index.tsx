import { PageContainer, ProTable, ModalForm, ProFormText, ProFormSwitch } from '@ant-design/pro-components';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { Button, message, Tag } from 'antd';
import React, { useRef, useState } from 'react';
import { useAccess } from '@umijs/max';
import { listWarehouses, createWarehouse, updateWarehouse } from '@/services/inventory';
import { normalizeWarehouseForm } from './form';

interface WarehouseRecord {
  id: string;
  name: string;
  address?: string;
  contact_person?: string;
  contact_phone?: string;
  is_default?: boolean;
  status: string;
}

const Warehouses: React.FC = () => {
  const actionRef = useRef<ActionType>(null);
  const access = useAccess();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [current, setCurrent] = useState<WarehouseRecord | null>(null);

  const columns: ProColumns<WarehouseRecord>[] = [
    { title: '仓库名称', dataIndex: 'name', width: 180 },
    { title: '地址', dataIndex: 'address', width: 200, ellipsis: true },
    { title: '联系人', dataIndex: 'contact_person', width: 100 },
    { title: '联系电话', dataIndex: 'contact_phone', width: 130 },
    {
      title: '默认仓库',
      dataIndex: 'is_default',
      width: 100,
      render: (_, record) => (record.is_default ? <Tag color="blue">是</Tag> : '否'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (_, record) => (
        <Tag color={record.status === 'active' ? 'green' : 'red'}>
          {record.status === 'active' ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '操作',
      valueType: 'option',
      width: 80,
      render: (_, record) => [
        access.canAdmin ? (
          <Button
            key="edit"
            type="link"
            onClick={() => {
              setCurrent(record);
              setEditOpen(true);
            }}
          >
            编辑
          </Button>
        ) : null,
      ],
    },
  ];

  return (
    <PageContainer>
      <ProTable<WarehouseRecord>
        actionRef={actionRef}
        rowKey="id"
        search={false}
        request={async (params) => {
          const res = await listWarehouses({
            page: params?.current,
            page_size: params?.pageSize,
          });
          return {
            data: res.data?.items ?? [],
            total: res.data?.total ?? 0,
            success: res.code === 0,
          };
        }}
        toolBarRender={() =>
          access.canAdmin
            ? [
                <Button key="create" type="primary" onClick={() => setCreateOpen(true)}>
                  新建仓库
                </Button>,
              ]
            : []
        }
        columns={columns}
      />

      <ModalForm
        title="新建仓库"
        open={createOpen}
        onOpenChange={setCreateOpen}
        modalProps={{ destroyOnHidden: true }}
        onFinish={async (values) => {
          const data = normalizeWarehouseForm(values as Parameters<typeof normalizeWarehouseForm>[0]);
          const res = await createWarehouse(data as Parameters<typeof createWarehouse>[0]);
          if (res.code === 0) {
            message.success('创建成功');
            actionRef.current?.reload();
            return true;
          }
          message.error(res.message || '创建失败');
          return false;
        }}
      >
        <ProFormText name="name" label="仓库名称" rules={[{ required: true }]} />
        <ProFormText name="address" label="地址" />
        <ProFormText name="contact_person" label="联系人" />
        <ProFormText name="contact_phone" label="联系电话" />
        <ProFormSwitch name="is_default" label="默认仓库" />
        <ProFormSwitch name="status" label="启用" initialValue={true} />
      </ModalForm>

      <ModalForm
        title="编辑仓库"
        open={editOpen}
        onOpenChange={setEditOpen}
        modalProps={{ destroyOnHidden: true }}
        initialValues={
          current
            ? {
                ...current,
                status: current.status === 'active',
              }
            : {}
        }
        onFinish={async (values) => {
          if (!current) return false;
          const data = normalizeWarehouseForm(values as Parameters<typeof normalizeWarehouseForm>[0]);
          const res = await updateWarehouse(current.id, data as Parameters<typeof updateWarehouse>[1]);
          if (res.code === 0) {
            message.success('更新成功');
            actionRef.current?.reload();
            return true;
          }
          message.error(res.message || '更新失败');
          return false;
        }}
      >
        <ProFormText name="name" label="仓库名称" rules={[{ required: true }]} />
        <ProFormText name="address" label="地址" />
        <ProFormText name="contact_person" label="联系人" />
        <ProFormText name="contact_phone" label="联系电话" />
        <ProFormSwitch name="is_default" label="默认仓库" />
        <ProFormSwitch name="status" label="启用" />
      </ModalForm>
    </PageContainer>
  );
};

export default Warehouses;
