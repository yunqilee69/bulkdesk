import { PageContainer, ProTable, ModalForm, ProFormText, ProFormDigit, ProFormSelect } from '@ant-design/pro-components';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import { Button, message, Tag, Image } from 'antd';
import React, { useRef, useState } from 'react';
import { useAccess } from '@umijs/max';
import { listBrands, createBrand, updateBrand } from '@/services/product';

interface BrandRecord {
  id: string;
  name: string;
  logo_url?: string;
  description?: string;
  sort_order: number;
  status: string;
}

const Brands: React.FC = () => {
  const actionRef = useRef<ActionType>(null);
  const access = useAccess();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [current, setCurrent] = useState<BrandRecord | null>(null);

  const columns: ProColumns<BrandRecord>[] = [
    { title: '品牌名称', dataIndex: 'name', width: 180 },
    {
      title: 'Logo',
      dataIndex: 'logo_url',
      width: 80,
      render: (_, record) =>
        record.logo_url ? (
          <Image alt={`${record.name} Logo`} src={record.logo_url} width={40} height={40} style={{ objectFit: 'cover', borderRadius: 4 }} />
        ) : '-',
    },
    { title: '描述', dataIndex: 'description', width: 200, ellipsis: true },
    { title: '排序', dataIndex: 'sort_order', width: 80 },
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
      <ProFormText name="name" label="品牌名称" rules={[{ required: true }]} />
      <ProFormText name="logo_url" label="Logo URL" />
      <ProFormText name="description" label="描述" />
      <ProFormDigit name="sort_order" label="排序" min={0} initialValue={0} />
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
      <ProTable<BrandRecord>
        actionRef={actionRef}
        rowKey="id"
        search={false}
        request={async (params) => {
          const res = await listBrands({
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
                  新建品牌
                </Button>,
              ]
            : []
        }
        columns={columns}
      />

      <ModalForm
        title="新建品牌"
        open={createOpen}
        onOpenChange={setCreateOpen}
        modalProps={{ destroyOnHidden: true }}
        onFinish={async (values) => {
          const res = await createBrand(values as Parameters<typeof createBrand>[0]);
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
        title="编辑品牌"
        open={editOpen}
        onOpenChange={setEditOpen}
        modalProps={{ destroyOnHidden: true }}
        initialValues={current ?? {}}
        onFinish={async (values) => {
          if (!current) return false;
          const res = await updateBrand(current.id, values as Parameters<typeof updateBrand>[1]);
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

export default Brands;
