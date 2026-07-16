import {
  ModalForm,
  PageContainer,
  ProForm,
  ProFormSelect,
  ProFormText,
  ProFormTextArea,
  ProTable,
} from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { PlusOutlined } from '@ant-design/icons';
import { Button, Drawer, Input, InputNumber, message, Row, Col, Select, Space, Upload } from 'antd';
import type { UploadFile, UploadProps } from 'antd';
import { useAccess } from '@umijs/max';
import { useEffect, useRef, useState } from 'react';
import {
  changeMemberPrice,
  changeProductPrice,
  createProduct,
  listAllBrands,
  listAllCategories,
  listProducts,
  updateProduct,
} from '@/services/product';
import { listAllLevels } from '@/services/customer';
import { uploadFile } from '@/services/upload';
import {
  extractUploadedImageUrls,
  MAX_PRODUCT_IMAGES,
  validateProductImage,
} from './form';

type ProductRecord = {
  id: string;
  name: string;
  short_name?: string;
  barcode: string;
  category_id: string;
  category_name?: string;
  brand_id?: string;
  brand_name?: string;
  specification?: string;
  unit: string;
  standard_price: number;
  cost_price: number;
  image_urls?: string[];
  status: string;
  description?: string;
};
type Option = { id: string; name: string };
type ProductImageResponse = { url?: string };
type ProductImageFile = UploadFile<ProductImageResponse>;

const customProductImageUpload: NonNullable<UploadProps['customRequest']> = async ({
  file,
  onError,
  onSuccess,
}) => {
  try {
    const response = await uploadFile(file as File, 'products');
    if (response.code === 0 && response.data) {
      onSuccess?.(response.data);
      return;
    }
    onError?.(new Error(response.message || '上传失败'));
  } catch (error) {
    onError?.(error as Error);
  }
};

function toProductImageFileList(urls?: string[]): ProductImageFile[] {
  return (urls ?? []).map((url, index) => ({
    uid: String(-index - 1),
    name: url.split('/').pop() || `image-${index + 1}`,
    status: 'done',
    url,
    response: { url },
  }));
}

export default function ProductList() {
  const access = useAccess();
  const actionRef = useRef<ActionType>(null);
  const [categories, setCategories] = useState<Option[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [levels, setLevels] = useState<Option[]>([]);
  const [editing, setEditing] = useState<ProductRecord>();
  const [open, setOpen] = useState(false);
  const [imageFileList, setImageFileList] = useState<ProductImageFile[]>([]);
  const [priceProduct, setPriceProduct] = useState<ProductRecord>();
  const [priceOpen, setPriceOpen] = useState(false);

  useEffect(() => {
    Promise.all([listAllCategories(), listAllBrands(), listAllLevels()])
      .then(([categoryItems, brandItems, levelItems]) => {
        setCategories(categoryItems as Option[]);
        setBrands(brandItems as Option[]);
        setLevels(levelItems as Option[]);
      })
      .catch(() => message.error('基础数据加载失败'));
  }, []);

  const columns: ProColumns<ProductRecord>[] = [
    { title: '商品名称', dataIndex: 'name' },
    { title: '条形码', dataIndex: 'barcode' },
    { title: '分类', dataIndex: 'category_name', search: false },
    { title: '品牌', dataIndex: 'brand_name', search: false },
    { title: '规格说明', dataIndex: 'specification', search: false },
    { title: '单位', dataIndex: 'unit', search: false },
    { title: '标准售价', dataIndex: 'standard_price', valueType: 'money', search: false },
    { title: '成本价', dataIndex: 'cost_price', valueType: 'money', search: false },
    {
      title: '销售状态',
      dataIndex: 'status',
      valueType: 'select',
      valueEnum: {
        active: { text: '在售', status: 'Success' },
        disabled: { text: '停售', status: 'Default' },
      },
    },
    {
      title: '操作',
      valueType: 'option',
      render: (_, record) =>
        access.canAdmin
          ? [
              <Button
                key="edit"
                type="link"
                onClick={() => {
                  setEditing(record);
                  setImageFileList(toProductImageFileList(record.image_urls));
                  setOpen(true);
                }}
              >
                编辑
              </Button>,
              <Button
                key="price"
                type="link"
                onClick={() => {
                  setPriceProduct(record);
                  setPriceOpen(true);
                }}
              >
                价格管理
              </Button>,
            ]
          : [],
    },
  ];

  const productFields = (
    <>
      <Row gutter={16}>
        <Col span={12}>
          <ProFormText name="name" label="商品名称" rules={[{ required: true, message: '请输入商品名称' }]} />
        </Col>
        <Col span={12}>
          <ProFormText name="short_name" label="商品简称" />
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <ProFormText name="barcode" label="条形码" rules={[{ required: true, message: '请输入条形码' }]} />
        </Col>
        <Col span={12}>
          <ProFormSelect
            name="category_id"
            label="分类"
            options={categories.map((item) => ({ label: item.name, value: item.id }))}
            rules={[{ required: true, message: '请选择分类' }]}
          />
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <ProFormSelect
            name="brand_id"
            label="品牌"
            allowClear
            options={brands.map((item) => ({ label: item.name, value: item.id }))}
          />
        </Col>
        <Col span={12}>
          <ProFormText name="specification" label="规格说明" />
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <ProFormText name="unit" label="单位" rules={[{ required: true, message: '请输入单位' }]} />
        </Col>
        <Col span={12}>
          <ProFormSelect
            name="status"
            label="销售状态"
            options={[
              { label: '在售', value: 'active' },
              { label: '停售', value: 'disabled' },
            ]}
          />
        </Col>
      </Row>
      {!editing && (
        <Row gutter={16}>
          <Col span={12}>
            <ProForm.Item
              name="standard_price"
              label="标准售价"
              rules={[{ required: true, message: '请输入标准售价' }]}
            >
              <InputNumber min={0} precision={2} prefix="¥" suffix="元" style={{ width: '100%' }} />
            </ProForm.Item>
          </Col>
          <Col span={12}>
            <ProForm.Item
              name="cost_price"
              label="成本价"
              rules={[{ required: true, message: '请输入成本价' }]}
            >
              <InputNumber min={0} precision={2} prefix="¥" suffix="元" style={{ width: '100%' }} />
            </ProForm.Item>
          </Col>
        </Row>
      )}
      {!editing && <ProFormText name="price_reason" label="初始定价原因" rules={[{ required: true, message: '请填写初始定价原因' }]} />}
      <ProForm.Item label="商品图片">
        <Upload
          accept="image/*"
          beforeUpload={validateProductImage}
          customRequest={customProductImageUpload}
          fileList={imageFileList}
          listType="picture-card"
          maxCount={MAX_PRODUCT_IMAGES}
          multiple
          onChange={({ fileList }) => setImageFileList(fileList)}
        >
          {imageFileList.length < MAX_PRODUCT_IMAGES && (
            <div>
              <PlusOutlined />
              <div style={{ marginTop: 8 }}>上传</div>
            </div>
          )}
        </Upload>
      </ProForm.Item>
      <ProFormTextArea name="description" label="描述" fieldProps={{ rows: 3 }} />
    </>
  );

  return (
    <PageContainer>
      <ProTable<ProductRecord>
        actionRef={actionRef}
        columns={columns}
        request={async (params) => {
          const response = await listProducts({
            keyword: params.name,
            barcode: params.barcode,
            category_id: params.category_id,
            status: params.status,
            page: params.current,
            page_size: params.pageSize,
          });
          return {
            data: response.data?.items ?? [],
            total: response.data?.total ?? 0,
            success: response.code === 0,
          };
        }}
        rowKey="id"
        toolBarRender={() =>
          access.canAdmin
            ? [
                <Button
                  key="create"
                  type="primary"
                  onClick={() => {
                    setEditing(undefined);
                    setImageFileList([]);
                    setOpen(true);
                  }}
                >
                  新建商品
                </Button>,
              ]
            : []
        }
      />
      <ModalForm
        initialValues={editing ?? { status: 'active', unit: '件' }}
        modalProps={{ destroyOnHidden: true }}
        onFinish={async (values) => {
          const payload = {
            ...values,
            image_urls: extractUploadedImageUrls(imageFileList),
          };
          const response = editing
            ? await updateProduct(editing.id, payload)
            : await createProduct(payload as Parameters<typeof createProduct>[0]);
          if (response.code === 0) {
            message.success('保存成功');
            actionRef.current?.reload();
            return true;
          }
          message.error(response.message || '保存失败');
          return false;
        }}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setImageFileList([]);
        }}
        open={open}
        title={editing ? '编辑商品' : '新建商品'}
        width={760}
      >
        {productFields}
      </ModalForm>
      <Drawer
        open={priceOpen}
        title={`价格管理 - ${priceProduct?.name ?? ''}`}
        width={440}
        onClose={() => setPriceOpen(false)}
      >
        {priceProduct && <PriceEditor levels={levels} product={priceProduct} onSaved={() => actionRef.current?.reload()} />}
      </Drawer>
    </PageContainer>
  );
}

function PriceEditor({ product, levels, onSaved }: { product: ProductRecord; levels: Option[]; onSaved: () => void }) {
  const [standard, setStandard] = useState(product.standard_price);
  const [cost, setCost] = useState(product.cost_price);
  const [memberLevel, setMemberLevel] = useState<string>();
  const [memberPrice, setMemberPrice] = useState<number>();
  const [reason, setReason] = useState('');

  useEffect(() => {
    setStandard(product.standard_price);
    setCost(product.cost_price);
    setMemberLevel(undefined);
    setMemberPrice(undefined);
    setReason('');
  }, [product]);

  const submit = async (kind: 'standard_price' | 'cost_price' | 'member_price') => {
    if (!reason.trim()) return message.warning('请填写调整原因');
    const price = kind === 'standard_price' ? standard : kind === 'cost_price' ? cost : memberPrice;
    if (price === undefined || price < 0) return message.warning('请输入有效价格');
    const response =
      kind === 'member_price'
        ? memberLevel
          ? await changeMemberPrice(product.id, memberLevel, { price, reason })
          : undefined
        : await changeProductPrice(product.id, kind, { price, reason });
    if (!response) return message.warning('请选择会员等级');
    if (response.code === 0) {
      message.success('价格已调整');
      setReason('');
      onSaved();
      return;
    }
    message.error(response.message || '调整失败');
    return;
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <span>标准售价</span>
      <Space.Compact style={{ width: '100%' }}>
        <InputNumber
          min={0}
          precision={2}
          prefix="¥"
          suffix="元"
          style={{ width: '100%' }}
          value={standard}
          onChange={(value) => setStandard(value ?? 0)}
        />
        <Button type="primary" onClick={() => submit('standard_price')}>
          保存
        </Button>
      </Space.Compact>
      <span>成本价</span>
      <Space.Compact style={{ width: '100%' }}>
        <InputNumber
          min={0}
          precision={2}
          prefix="¥"
          suffix="元"
          style={{ width: '100%' }}
          value={cost}
          onChange={(value) => setCost(value ?? 0)}
        />
        <Button type="primary" onClick={() => submit('cost_price')}>
          保存
        </Button>
      </Space.Compact>
      <span>会员等级与会员价</span>
      <Select
        placeholder="选择会员等级"
        value={memberLevel}
        options={levels.map((item) => ({ label: item.name, value: item.id }))}
        onChange={setMemberLevel}
      />
      <Space.Compact style={{ width: '100%' }}>
        <InputNumber
          min={0}
          precision={2}
          prefix="¥"
          suffix="元"
          placeholder="会员价"
          style={{ width: '100%' }}
          value={memberPrice}
          onChange={(value) => setMemberPrice(value ?? undefined)}
        />
        <Button type="primary" onClick={() => submit('member_price')}>
          保存
        </Button>
      </Space.Compact>
      <Input placeholder="调整原因" value={reason} onChange={(event) => setReason(event.target.value)} />
    </Space>
  );
}
