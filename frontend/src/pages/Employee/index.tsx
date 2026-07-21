import {
  PageContainer,
  ProTable,
  ModalForm,
  ProFormText,
  ProFormSelect,
} from '@ant-design/pro-components';
import { Button, message, Popconfirm, Tag } from 'antd';
import { useAccess } from '@umijs/max';
import {
  listEmployees,
  createEmployee,
  updateEmployee,
  disableEmployee,
  enableEmployee,
  resetPassword,
} from '@/services/employee';
import React, { useRef } from 'react';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { normalizeEmployeeRoles, roleColors, roleLabels, roleOptions } from './roles';

interface EmployeeRecord {
  id: string;
  username: string;
  name: string;
  phone: string;
  roles: API.EmployeeRole[];
  status: string;
  last_login_at: string;
}

interface EmployeeCreateFormValues {
  username: string;
  password: string;
  name: string;
  phone?: string;
  roles?: API.EmployeeRole[];
}

interface EmployeeEditFormValues {
  name: string;
  phone?: string;
  roles?: API.EmployeeRole[];
}

const Employee: React.FC = () => {
  const access = useAccess();
  const actionRef = useRef<ActionType>(null);
  const [createModalOpen, handleCreateModalOpen] = React.useState(false);
  const [editModalOpen, handleEditModalOpen] = React.useState(false);
  const [resetPwdModalOpen, handleResetPwdModalOpen] = React.useState(false);
  const [currentRow, setCurrentRow] = React.useState<EmployeeRecord>();

  const columns: ProColumns<EmployeeRecord>[] = [
    {
      title: '用户名',
      dataIndex: 'username',
      copyable: true,
    },
    {
      title: '姓名',
      dataIndex: 'name',
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      copyable: true,
    },
    {
      title: '角色',
      dataIndex: 'roles',
      search: false,
      render: (_, record) => {
        const roles = normalizeEmployeeRoles(record.roles);
        if (roles.length === 0) return '-';
        return roles.map((role) => (
          <Tag key={role} color={roleColors[role]}>
            {roleLabels[role]}
          </Tag>
        ));
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      valueEnum: {
        active: { text: '正常', status: 'Success' },
        disabled: { text: '已禁用', status: 'Error' },
      },
    },
    {
      title: '最后登录',
      dataIndex: 'last_login_at',
      valueType: 'dateTime',
      search: false,
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
        access.canAdmin && record.status === 'active' ? (
          <Popconfirm
            key="disable"
            title="确认禁用该员工？"
            onConfirm={async () => {
              const res = await disableEmployee(record.id);
              if (res.code === 0) {
                message.success('禁用成功');
                actionRef.current?.reload();
              } else {
                message.error(res.message || '禁用失败');
              }
            }}
          >
            <Button type="link" danger>
              禁用
            </Button>
          </Popconfirm>
        ) : access.canAdmin && record.status === 'disabled' ? (
          <Popconfirm
            key="enable"
            title="确认启用该员工？"
            onConfirm={async () => {
              const res = await enableEmployee(record.id);
              if (res.code === 0) {
                message.success('启用成功');
                actionRef.current?.reload();
              } else {
                message.error(res.message || '启用失败');
              }
            }}
          >
            <Button type="link">
              启用
            </Button>
          </Popconfirm>
        ) : null,
        access.canAdmin ? (
          <Button
            key="resetPwd"
            type="link"
            onClick={() => {
              setCurrentRow(record);
              handleResetPwdModalOpen(true);
            }}
          >
            重置密码
          </Button>
        ) : null,
      ],
    },
  ];

  return (
    <PageContainer>
      <ProTable<EmployeeRecord>
        actionRef={actionRef}
        rowKey="id"
        search={{
          labelWidth: 120,
        }}
        toolBarRender={() =>
          access.canAdmin
            ? [
                <Button key="create" type="primary" onClick={() => handleCreateModalOpen(true)}>
                  新建员工
                </Button>,
              ]
            : []
        }
        request={async (params) => {
          const res = await listEmployees({
            keyword: params.username,
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
        title="新建员工"
        open={createModalOpen}
        onOpenChange={handleCreateModalOpen}
        modalProps={{ destroyOnHidden: true }}
        onFinish={async (values: EmployeeCreateFormValues) => {
          const roles = normalizeEmployeeRoles(values.roles);
          const res = await createEmployee({
            username: values.username,
            password: values.password,
            name: values.name,
            phone: values.phone,
            roles,
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
          name="username"
          label="用户名"
          rules={[{ required: true, message: '请输入用户名' }]}
        />
        <ProFormText.Password
          name="password"
          label="密码"
          rules={[{ required: true, message: '请输入密码' }]}
        />
        <ProFormText
          name="name"
          label="姓名"
          rules={[{ required: true, message: '请输入姓名' }]}
        />
        <ProFormText name="phone" label="手机号" />
        <ProFormSelect
          name="roles"
          label="角色"
          mode="multiple"
          rules={[{ required: true, message: '请至少选择一个角色' }]}
          options={roleOptions}
        />
      </ModalForm>

      <ModalForm
        title="编辑员工"
        open={editModalOpen}
        onOpenChange={handleEditModalOpen}
        modalProps={{ destroyOnHidden: true }}
        initialValues={currentRow ? { ...currentRow, roles: normalizeEmployeeRoles(currentRow.roles) } : undefined}
        onFinish={async (values: EmployeeEditFormValues) => {
          if (!currentRow) return false;
          const roles = normalizeEmployeeRoles(values.roles);
          const res = await updateEmployee(currentRow.id, {
            name: values.name,
            phone: values.phone,
            roles,
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
          label="姓名"
          rules={[{ required: true, message: '请输入姓名' }]}
        />
        <ProFormText name="phone" label="手机号" />
        <ProFormSelect
          name="roles"
          label="角色"
          mode="multiple"
          rules={[{ required: true, message: '请至少选择一个角色' }]}
          options={roleOptions}
        />
      </ModalForm>

      <ModalForm
        title="重置密码"
        open={resetPwdModalOpen}
        onOpenChange={handleResetPwdModalOpen}
        modalProps={{ destroyOnHidden: true }}
        onFinish={async (values: Record<string, string>) => {
          if (!currentRow) return false;
          const res = await resetPassword(currentRow.id, {
            new_password: values.new_password,
          });
          if (res.code === 0) {
            message.success('重置密码成功');
            return true;
          }
          message.error(res.message || '重置密码失败');
          return false;
        }}
      >
        <ProFormText.Password
          name="new_password"
          label="新密码"
          rules={[{ required: true, message: '请输入新密码' }]}
        />
      </ModalForm>
    </PageContainer>
  );
};

export default Employee;
