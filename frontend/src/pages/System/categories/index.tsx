import { ModalForm, PageContainer, ProFormSelect, ProFormText, ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, message } from 'antd';
import { useAccess } from '@umijs/max';
import { useRef, useState } from 'react';
import { createCategory, listCategories, updateCategory } from '@/services/product';

type Category = { id: string; name: string; status: string };
export default function Categories() {
  const access = useAccess(); const actionRef = useRef<ActionType>(null); const [current, setCurrent] = useState<Category>(); const [open, setOpen] = useState(false);
  const columns: ProColumns<Category>[] = [{ title: '分类名称', dataIndex: 'name' }, { title: '状态', dataIndex: 'status', valueType: 'select', valueEnum: { active: { text: '启用', status: 'Success' }, disabled: { text: '停用', status: 'Default' } } }, { title: '操作', valueType: 'option', render: (_, row) => access.canAdmin ? [<Button key="edit" type="link" onClick={() => { setCurrent(row); setOpen(true); }}>编辑</Button>] : [] }];
  return <PageContainer><ProTable<Category> actionRef={actionRef} rowKey="id" columns={columns} request={async (params) => { const res = await listCategories({ page: params.current, page_size: params.pageSize }); return { data: res.data?.items ?? [], total: res.data?.total ?? 0, success: res.code === 0 }; }} toolBarRender={() => access.canAdmin ? [<Button key="create" type="primary" onClick={() => { setCurrent(undefined); setOpen(true); }}>新建分类</Button>] : []} /><ModalForm title={current ? '编辑分类' : '新建分类'} open={open} onOpenChange={setOpen} initialValues={current ?? { status: 'active' }} onFinish={async (values) => { const res = current ? await updateCategory(current.id, values) : await createCategory(values as Parameters<typeof createCategory>[0]); if (res.code === 0) { message.success('保存成功'); actionRef.current?.reload(); return true; } message.error(res.message || '保存失败'); return false; }}><ProFormText name="name" label="分类名称" rules={[{ required: true }]} /><ProFormSelect name="status" label="状态" options={[{ label: '启用', value: 'active' }, { label: '停用', value: 'disabled' }]} /></ModalForm></PageContainer>;
}
