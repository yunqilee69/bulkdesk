import {
  PageContainer,
  ProTable,
  ModalForm,
  ProFormText,
  ProFormDigit,
  ProFormSwitch,
} from '@ant-design/pro-components';
import { Button, message, Popconfirm } from 'antd';
import {
  listLevels,
  createLevel,
  updateLevel,
  deleteLevel,
} from '@/services/customer';
import React, { useRef } from 'react';
import type { ActionType, ProColumns } from '@ant-design/pro-components';

interface LevelRecord {
  id: string;
  name: string;
  min_spent: number;
  sort_order: number;
  is_default: boolean;
}

const LevelManage: React.FC = () => {
  const actionRef = useRef<ActionType>(null);
  const [createModalOpen, handleCreateModalOpen] = React.useState(false);
  const [editModalOpen, handleEditModalOpen] = React.useState(false);
  const [currentRow, setCurrentRow] = React.useState<LevelRecord>();

  const columns: ProColumns<LevelRecord>[] = [
    {
      title: '等级名称',
      dataIndex: 'name',
    },
    {
      title: '最低消费',
      dataIndex: 'min_spent',
      valueType: 'money',
      search: false,
    },
    {
      title: '排序',
      dataIndex: 'sort_order',
      search: false,
    },
    {
      title: '默认等级',
      dataIndex: 'is_default',
      search: false,
      render: (_, record) => (record.is_default ? '是' : '否'),
    },
    {
      title: '操作',
      valueType: 'option',
      render: (_, record) => [
        <Button
          key="edit"
          type="link"
          onClick={() => {
            setCurrentRow(record);
            handleEditModalOpen(true);
          }}
        >
          编辑
        </Button>,
        !record.is_default ? (
          <Popconfirm
            key="delete"
            title="确认删除该等级？"
            onConfirm={async () => {
              const res = await deleteLevel(record.id);
              if (res.code === 0) {
                message.success('删除成功');
                actionRef.current?.reload();
              } else {
                message.error(res.message || '删除失败');
              }
            }}
          >
            <Button type="link" danger>
              删除
            </Button>
          </Popconfirm>
        ) : null,
      ],
    },
  ];

  return (
    <>
      <ProTable<LevelRecord>
        actionRef={actionRef}
        rowKey="id"
        search={false}
        toolBarRender={() => [
          <Button key="create" type="primary" onClick={() => handleCreateModalOpen(true)}>
            新建等级
          </Button>,
        ]}
        request={async (params) => {
          const res = await listLevels({
            page: params.current,
            page_size: params.pageSize,
          });
          return {
            data: res.code === 0 ? res.data.items : [],
            total: res.code === 0 ? res.data.total : 0,
            success: res.code === 0,
          };
        }}
        columns={columns}
      />

      <ModalForm
        title="新建等级"
        open={createModalOpen}
        onOpenChange={handleCreateModalOpen}
        modalProps={{ destroyOnHidden: true }}
        onFinish={async (values: Record<string, string | number | boolean>) => {
          const res = await createLevel({
            name: values.name as string,
            min_spent: values.min_spent as number,
            sort_order: values.sort_order as number,
            is_default: values.is_default as boolean,
          });
          if (res.code === 0) {
            message.success('创建成功');
            actionRef.current?.reload();
            return true;
          }
          message.error(res.message || '创建失败');
          return false;
        }}
      >
        <ProFormText
          name="name"
          label="等级名称"
          rules={[{ required: true, message: '请输入等级名称' }]}
        />
        <ProFormDigit
          name="min_spent"
          label="最低消费"
          min={0}
          fieldProps={{ precision: 2 }}
        />
        <ProFormDigit name="sort_order" label="排序" min={0} />
        <ProFormSwitch name="is_default" label="默认等级" />
      </ModalForm>

      <ModalForm
        title="编辑等级"
        open={editModalOpen}
        onOpenChange={handleEditModalOpen}
        modalProps={{ destroyOnHidden: true }}
        initialValues={currentRow}
        onFinish={async (values: Record<string, string | number | boolean>) => {
          if (!currentRow) return false;
          const res = await updateLevel(currentRow.id, {
            name: values.name as string,
            min_spent: values.min_spent as number,
            sort_order: values.sort_order as number,
            is_default: values.is_default as boolean,
          });
          if (res.code === 0) {
            message.success('更新成功');
            actionRef.current?.reload();
            return true;
          }
          message.error(res.message || '更新失败');
          return false;
        }}
      >
        <ProFormText
          name="name"
          label="等级名称"
          rules={[{ required: true, message: '请输入等级名称' }]}
        />
        <ProFormDigit
          name="min_spent"
          label="最低消费"
          min={0}
          fieldProps={{ precision: 2 }}
        />
        <ProFormDigit name="sort_order" label="排序" min={0} />
        <ProFormSwitch name="is_default" label="默认等级" />
      </ModalForm>
    </>
  );
};

const Level: React.FC = () => {
  return <PageContainer><LevelManage /></PageContainer>;
};

export default Level;
