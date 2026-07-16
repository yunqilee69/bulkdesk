import {
  PageContainer,
  ProTable,
  ModalForm,
  ProFormText,
  ProFormSelect,
  ProFormTextArea,
  ProForm,
} from '@ant-design/pro-components';
import { Button, message, Upload, Image, Row, Col } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import {
  listCustomers,
  createCustomer,
  updateCustomer,
  listAllLevels,
} from '@/services/customer';
import React, { useRef, useEffect, useState } from 'react';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { request } from '@umijs/max';

interface CustomerRecord {
  id: string;
  name: string;
  contact_name: string;
  contact_phone: string;
  address: string;
  level_id: string;
  level_name: string;
  image_urls?: string[];
  total_spent: number;
  order_count: number;
  last_order_at: string;
  remark: string;
}

interface LevelOption {
  id: string;
  name: string;
}

const Customer: React.FC = () => {
  const actionRef = useRef<ActionType>(null);
  const [createModalOpen, handleCreateModalOpen] = useState(false);
  const [editModalOpen, handleEditModalOpen] = useState(false);
  const [currentRow, setCurrentRow] = useState<CustomerRecord>();
  const [levelOptions, setLevelOptions] = useState<LevelOption[]>([]);
  const [createFileList, setCreateFileList] = useState<UploadFile[]>([]);
  const [editFileList, setEditFileList] = useState<UploadFile[]>([]);

  useEffect(() => {
    const fetchLevels = async () => {
      try {
        const levels = await listAllLevels();
        setLevelOptions(
          levels.map((item: Record<string, string>) => ({
            id: item.id,
            name: item.name,
          })),
        );
      } catch {
        message.error('客户等级加载失败，请刷新页面');
      }
    };
    fetchLevels();
  }, []);

  const columns: ProColumns<CustomerRecord>[] = [
    {
      title: '图片',
      dataIndex: 'image_urls',
      width: 70,
      search: false,
      render: (_, record) => {
        if (!record.image_urls || record.image_urls.length === 0) return '-';
        return (
          <Image
            alt={`${record.name}图片`}
            src={record.image_urls[0]}
            width={40}
            height={40}
            style={{ objectFit: 'cover', borderRadius: 4 }}
            fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFuSJAAAADUlEQVR42mN88P/BfwAJhAPi5i8i7AAAAABJRU5ErkJggg=="
          />
        );
      },
    },
    {
      title: '客户名称',
      dataIndex: 'name',
    },
    {
      title: '联系人',
      dataIndex: 'contact_name',
      search: false,
    },
    {
      title: '联系电话',
      dataIndex: 'contact_phone',
      search: false,
    },
    {
      title: '等级',
      dataIndex: 'level_name',
      search: false,
    },
    {
      title: '累计消费',
      dataIndex: 'total_spent',
      valueType: 'money',
      search: false,
    },
    {
      title: '订单数',
      dataIndex: 'order_count',
      search: false,
    },
    {
      title: '最后下单',
      dataIndex: 'last_order_at',
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
      ],
    },
  ];

  const levelSelectOptions = levelOptions.map((l) => ({
    label: l.name,
    value: l.id,
  }));

  const uploadButton = (
    <div style={{ marginTop: 8 }}>
      <PlusOutlined />
      <div style={{ fontSize: 12 }}>上传</div>
    </div>
  );

  const customUploadRequest = async ({ file, onSuccess, onError }: any) => {
    try {
      const formData = new FormData();
      formData.append('file', file as File);
      const res = await request('/api/v1/upload', {
        method: 'POST',
        data: formData,
        params: { prefix: 'customers' },
      });
      if (res.code === 0) {
        onSuccess?.(res.data);
      } else {
        onError?.(new Error(res.message || '上传失败'));
      }
    } catch (err) {
      onError?.(err as Error);
    }
  };

  return (
    <PageContainer>
      <ProTable<CustomerRecord>
        actionRef={actionRef}
        rowKey="id"
        search={{
          labelWidth: 120,
        }}
        toolBarRender={() => [
          <Button key="create" type="primary" onClick={() => handleCreateModalOpen(true)}>
            新建客户
          </Button>,
        ]}
        request={async (params) => {
          const res = await listCustomers({
            keyword: params.name,
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
        title="新建客户"
        open={createModalOpen}
        onOpenChange={(open) => {
          handleCreateModalOpen(open);
          if (!open) setCreateFileList([]);
        }}
        modalProps={{ destroyOnHidden: true }}
        width={720}
        onFinish={async (values) => {
          const image_urls = createFileList
            .filter((f) => f.status === 'done')
            .map((f) => f.response?.url || f.response?.key)
            .filter(Boolean) as string[];
          const res = await createCustomer({
            ...(values as Record<string, unknown>),
            image_urls,
          } as Parameters<typeof createCustomer>[0]);
          if (res.code === 0) {
            message.success('创建成功');
            actionRef.current?.reload();
            return true;
          }
          message.error(res.message || '创建失败');
          return false;
        }}
      >
        <Row gutter={16}>
          <Col span={12}>
            <ProFormText
              name="name"
              label="客户名称"
              rules={[{ required: true, message: '请输入客户名称' }]}
            />
          </Col>
          <Col span={12}>
            <ProFormSelect
              name="level_id"
              label="等级"
              rules={[{ required: true, message: '请选择等级' }]}
              options={levelSelectOptions}
            />
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <ProFormText
              name="contact_name"
              label="联系人"
              rules={[{ required: true, message: '请输入联系人' }]}
            />
          </Col>
          <Col span={12}>
            <ProFormText
              name="contact_phone"
              label="联系电话"
              rules={[{ required: true, message: '请输入联系电话' }]}
            />
          </Col>
        </Row>
        <ProFormText name="address" label="地址" />
        <ProForm.Item name="image_urls" label="客户照片">
          <Upload
            listType="picture-card"
            maxCount={5}
            accept=".jpg,.jpeg,.png,.gif,.webp"
            customRequest={customUploadRequest}
            onChange={({ fileList }) => setCreateFileList(fileList)}
          >
            {uploadButton}
          </Upload>
        </ProForm.Item>
        <ProFormTextArea name="remark" label="备注" fieldProps={{ rows: 2 }} />
      </ModalForm>

      <ModalForm
        title="编辑客户"
        open={editModalOpen}
        onOpenChange={(open) => {
          handleEditModalOpen(open);
          if (!open) {
            setEditFileList([]);
          } else if (currentRow?.image_urls && currentRow.image_urls.length > 0) {
            const files: UploadFile[] = currentRow.image_urls.map((url, idx) => ({
              uid: String(-idx - 1),
              name: url.split('/').pop() || `image-${idx}`,
              status: 'done' as const,
              url,
              response: { url },
            }));
            setEditFileList(files);
          }
        }}
        modalProps={{ destroyOnHidden: true }}
        initialValues={currentRow}
        width={720}
        onFinish={async (values) => {
          if (!currentRow) return false;
          const image_urls = editFileList
            .filter((f) => f.status === 'done')
            .map((f) => f.response?.url || f.url)
            .filter(Boolean) as string[];
          const res = await updateCustomer(currentRow.id, {
            ...(values as Record<string, unknown>),
            image_urls,
          } as Parameters<typeof updateCustomer>[1]);
          if (res.code === 0) {
            message.success('更新成功');
            actionRef.current?.reload();
            return true;
          }
          message.error(res.message || '更新失败');
          return false;
        }}
      >
        <Row gutter={16}>
          <Col span={12}>
            <ProFormText
              name="name"
              label="客户名称"
              rules={[{ required: true, message: '请输入客户名称' }]}
            />
          </Col>
          <Col span={12}>
            <ProFormSelect
              name="level_id"
              label="等级"
              rules={[{ required: true, message: '请选择等级' }]}
              options={levelSelectOptions}
            />
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <ProFormText
              name="contact_name"
              label="联系人"
              rules={[{ required: true, message: '请输入联系人' }]}
            />
          </Col>
          <Col span={12}>
            <ProFormText
              name="contact_phone"
              label="联系电话"
              rules={[{ required: true, message: '请输入联系电话' }]}
            />
          </Col>
        </Row>
        <ProFormText name="address" label="地址" />
        <ProForm.Item name="image_urls" label="客户照片">
          <Upload
            listType="picture-card"
            maxCount={5}
            accept=".jpg,.jpeg,.png,.gif,.webp"
            fileList={editFileList}
            customRequest={customUploadRequest}
            onChange={({ fileList }) => setEditFileList(fileList)}
          >
            {uploadButton}
          </Upload>
        </ProForm.Item>
        <ProFormTextArea name="remark" label="备注" fieldProps={{ rows: 2 }} />
      </ModalForm>
    </PageContainer>
  );
};

export default Customer;
