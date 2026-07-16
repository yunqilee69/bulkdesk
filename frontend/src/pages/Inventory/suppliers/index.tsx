import { PageContainer, ProTable, ModalForm, ProFormText, ProFormTextArea, ProFormSelect } from '@ant-design/pro-components';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { Button, message, Tag } from 'antd';
import React, { useRef, useState } from 'react';
import { useAccess } from '@umijs/max';
import { listSuppliers, createSupplier, updateSupplier } from '@/services/inventory';

interface SupplierRecord {
  id: string;
  name: string;
  contact_person?: string;
  contact_phone?: string;
  address?: string;
  remark?: string;
  status: string;
}

const Suppliers: React.FC = () => {
  const actionRef = useRef<ActionType>(null);
  const access = useAccess();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [current, setCurrent] = useState<SupplierRecord | null>(null);

  const columns: ProColumns<SupplierRecord>[] = [
    { title: '供应商名称', dataIndex: 'name', width: 180 },
    { title: '联系人', dataIndex: 'contact_person', width: 100 },
    { title: '联系电话', dataIndex: 'contact_phone', width: 130 },
    { title: '地址', dataIndex: 'address', width: 200, ellipsis: true },
    { title: '备注', dataIndex: 'remark', width: 150, ellipsis: true },
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

  const formFields = (
    <>
      <ProFormText name="name" label="供应商名称" rules={[{ required: true }]} />
      <ProFormText name="contact_person" label="联系人" />
      <ProFormText name="contact_phone" label="联系电话" />
      <ProFormText name="address" label="地址" />
      <ProFormTextArea name="remark" label="备注" />
      <ProFormSelect
        name="status"
        label="状态"
        options={[
          { label: '启用', value: 'active' },
          { label: '禁用', value: 'disabled' },
        ]}
        initialValue="active"
      />
    </>
  );

  return (
    <PageContainer>
      <ProTable<SupplierRecord>
        actionRef={actionRef}
        rowKey="id"
        search={false}
        request={async (params) => {
          const res = await listSuppliers({
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
                  新建供应商
                </Button>,
              ]
            : []
        }
        columns={columns}
      />

      <ModalForm
        title="新建供应商"
        open={createOpen}
        onOpenChange={setCreateOpen}
        modalProps={{ destroyOnHidden: true }}
        onFinish={async (values) => {
          const res = await createSupplier(values as Parameters<typeof createSupplier>[0]);
          if (res.code === 0) {
            message.success('创建成功');
            actionRef.current?.reload();
            return true;
          }
          message.error(res.message || '创建失败');
          return false;
        }}
      >
        {formFields}
      </ModalForm>

      <ModalForm
        title="编辑供应商"
        open={editOpen}
        onOpenChange={setEditOpen}
        modalProps={{ destroyOnHidden: true }}
        initialValues={current ?? {}}
        onFinish={async (values) => {
          if (!current) return false;
          const res = await updateSupplier(current.id, values as Parameters<typeof updateSupplier>[1]);
          if (res.code === 0) {
            message.success('更新成功');
            actionRef.current?.reload();
            return true;
          }
          message.error(res.message || '更新失败');
          return false;
        }}
      >
        {formFields}
      </ModalForm>
    </PageContainer>
  );
};

export default Suppliers;
