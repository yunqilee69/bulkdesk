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
import { Line } from '@ant-design/charts';
import { PlusOutlined } from '@ant-design/icons';
import { Button, Empty, Image, Input, InputNumber, message, Modal, Row, Col, Space, Table, Tag, Upload } from 'antd';
import type { UploadFile, UploadProps } from 'antd';
import { useAccess } from '@umijs/max';
import { useEffect, useRef, useState } from 'react';
import { listAllLevels } from '@/services/customer';
import {
  batchUpdateMemberPrices,
  changeProductPrice,
  createProduct,
  listAllBrands,
  listAllCategories,
  listMemberPrices,
  listPriceChangeLogs,
  listProducts,
  updateProduct,
} from '@/services/product';
import { uploadFile } from '@/services/upload';
import {
  extractUploadedImageUrls,
  findProductImagePreviewIndex,
  getProductListImageUrl,
  getProductImagePreviewUrl,
  MAX_PRODUCT_IMAGES,
  validateProductImage,
} from './form';
import {
  createMemberPriceRows,
  getChangedMemberPriceItems,
  getEnteredMemberPriceItems,
  getMemberPriceChangeState,
} from './memberPrices';
import type { MemberPriceRow } from './memberPrices';
import { toPriceChartData } from './priceChart';
import type { PriceChartPoint } from './priceChart';
import {
  productKeywordSearchConfig,
  productListSearchConfig,
  toProductListParams,
} from './searchFilters';

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
  available_quantity: number;
  locked_quantity: number;
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
  const [memberLevels, setMemberLevels] = useState<Option[]>([]);
  const [newProductMemberPriceRows, setNewProductMemberPriceRows] = useState<MemberPriceRow[]>([]);
  const [editing, setEditing] = useState<ProductRecord>();
  const [open, setOpen] = useState(false);
  const [imageFileList, setImageFileList] = useState<ProductImageFile[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItems, setPreviewItems] = useState<string[]>([]);
  const [priceProduct, setPriceProduct] = useState<ProductRecord>();
  const [priceOpen, setPriceOpen] = useState(false);

  useEffect(() => {
    Promise.all([listAllCategories(), listAllBrands(), listAllLevels()])
      .then(([categoryItems, brandItems, levelItems]) => {
        setCategories(categoryItems as Option[]);
        setBrands(brandItems as Option[]);
        setMemberLevels(levelItems as Option[]);
      })
      .catch(() => message.error('基础数据加载失败'));
  }, []);

  const columns: ProColumns<ProductRecord>[] = [
    {
      title: '图片',
      dataIndex: 'image_urls',
      width: 72,
      search: false,
      render: (_, record) => {
        const imageUrl = getProductListImageUrl(record.image_urls);
        return imageUrl ? (
          <Image
            alt={`${record.name} 图片`}
            fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN88P/BfwAJhAPi5i8i7AAAAABJRU5ErkJggg=="
            height={40}
            preview={false}
            src={imageUrl}
            style={{ borderRadius: 4, objectFit: 'cover' }}
            width={40}
          />
        ) : (
          <span style={{ color: '#999' }}>暂无</span>
        );
      },
    },
    { title: '商品名称', dataIndex: 'name', search: false },
    { title: '商品名称/简称', dataIndex: 'keyword', hideInTable: true, ...productKeywordSearchConfig },
    { title: '条形码', dataIndex: 'barcode' },
    { title: '分类', dataIndex: 'category_name', search: false },
    {
      title: '分类',
      dataIndex: 'category_id',
      hideInTable: true,
      valueType: 'select',
      fieldProps: { options: categories.map((item) => ({ label: item.name, value: item.id })) },
    },
    { title: '品牌', dataIndex: 'brand_name', search: false },
    {
      title: '品牌',
      dataIndex: 'brand_id',
      hideInTable: true,
      valueType: 'select',
      fieldProps: { options: brands.map((item) => ({ label: item.name, value: item.id })) },
    },
    { title: '规格说明', dataIndex: 'specification', search: false },
    { title: '单位', dataIndex: 'unit', search: false },
    { title: '标准售价', dataIndex: 'standard_price', valueType: 'money', search: false },
    { title: '成本价', dataIndex: 'cost_price', valueType: 'money', search: false },
    { title: '售价范围', dataIndex: 'standard_price', hideInTable: true, valueType: 'digitRange' },
    { title: '成本价范围', dataIndex: 'cost_price', hideInTable: true, valueType: 'digitRange' },
    { title: '可销售数量', dataIndex: 'available_quantity', width: 110, search: false },
    { title: '已锁定数量', dataIndex: 'locked_quantity', width: 110, search: false },
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

  const availablePreviewImageUrls = imageFileList
    .map(getProductImagePreviewUrl)
    .filter((url): url is string => Boolean(url));

  const handleProductImagePreview: NonNullable<UploadProps['onPreview']> = (file) => {
    const productImage = file as ProductImageFile;
    const previewUrl = getProductImagePreviewUrl(productImage);
    if (!previewUrl) {
      message.warning('图片尚未上传完成，暂时无法预览');
      return;
    }
    const current = findProductImagePreviewIndex(imageFileList, productImage);
    if (current < 0) return;
    setPreviewItems([
      ...availablePreviewImageUrls.slice(current),
      ...availablePreviewImageUrls.slice(0, current),
    ]);
    setPreviewOpen(true);
  };

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
      {!editing && (
        <>
          <ProFormText name="price_reason" label="初始定价原因（选填）" />
          <ProForm.Item label="会员价格（选填）">
            <Table<MemberPriceRow>
              columns={[
                { title: '会员等级', dataIndex: 'level_name' },
                {
                  title: '会员价',
                  render: (_, row) => (
                    <InputNumber
                      min={0}
                      precision={2}
                      prefix="¥"
                      suffix="元"
                      style={{ width: '100%' }}
                      value={row.draftPrice}
                      onChange={(value) =>
                        setNewProductMemberPriceRows((rows) =>
                          rows.map((item) =>
                            item.level_id === row.level_id
                              ? { ...item, draftPrice: value ?? undefined }
                              : item,
                          ),
                        )
                      }
                    />
                  ),
                },
              ]}
              dataSource={newProductMemberPriceRows}
              locale={{ emptyText: '暂无会员等级' }}
              pagination={false}
              rowKey="level_id"
              size="small"
            />
          </ProForm.Item>
        </>
      )}
      <ProForm.Item label="商品图片">
        <Upload
          accept="image/*"
          beforeUpload={validateProductImage}
          customRequest={customProductImageUpload}
          fileList={imageFileList}
          listType="picture-card"
          maxCount={MAX_PRODUCT_IMAGES}
          multiple
          onChange={({ file, fileList }) => {
            if (file.status === 'done' && file.response?.url) file.url = file.response.url;
            setImageFileList(fileList as ProductImageFile[]);
          }}
          onPreview={handleProductImagePreview}
        >
          {imageFileList.length < MAX_PRODUCT_IMAGES && (
            <div>
              <PlusOutlined />
              <div style={{ marginTop: 8 }}>上传</div>
            </div>
          )}
        </Upload>
        <Image.PreviewGroup
          items={previewItems}
          preview={{
            visible: previewOpen,
            onOpenChange: (visible) => setPreviewOpen(visible),
          }}
        />
      </ProForm.Item>
      <ProFormTextArea name="description" label="描述" fieldProps={{ rows: 3 }} />
    </>
  );

  return (
    <PageContainer>
      <ProTable<ProductRecord>
        actionRef={actionRef}
        columns={columns}
        search={productListSearchConfig}
        request={async (params) => {
          const response = await listProducts(toProductListParams(params));
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
                    setNewProductMemberPriceRows(createMemberPriceRows(memberLevels));
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
            ...(!editing
              ? { member_prices: getEnteredMemberPriceItems(newProductMemberPriceRows) }
              : {}),
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
          if (!nextOpen) {
            setImageFileList([]);
            setPreviewOpen(false);
            setPreviewItems([]);
            setNewProductMemberPriceRows([]);
          }
        }}
        open={open}
        title={editing ? '编辑商品' : '新建商品'}
        width={760}
      >
        {productFields}
      </ModalForm>
      <Modal
        centered
        destroyOnHidden
        footer={null}
        open={priceOpen}
        title={`价格管理 - ${priceProduct?.name ?? ''}`}
        width={760}
        onCancel={() => setPriceOpen(false)}
      >
        {priceProduct && <PriceEditor product={priceProduct} onSaved={() => actionRef.current?.reload()} />}
      </Modal>
    </PageContainer>
  );
}

function PriceEditor({ product, onSaved }: { product: ProductRecord; onSaved: () => void }) {
  const [standard, setStandard] = useState(product.standard_price);
  const [cost, setCost] = useState(product.cost_price);
  const [memberPriceRows, setMemberPriceRows] = useState<MemberPriceRow[]>([]);
  const [memberPricesLoading, setMemberPricesLoading] = useState(false);
  const [memberPricesSaving, setMemberPricesSaving] = useState(false);
  const [priceChartData, setPriceChartData] = useState<PriceChartPoint[]>([]);
  const [reason, setReason] = useState('');

  const loadMemberPrices = async () => {
    setMemberPricesLoading(true);
    try {
      const response = await listMemberPrices(product.id);
      if (response.code !== 0) {
        message.error(response.message || '会员价加载失败');
        return;
      }
      setMemberPriceRows(
        (response.data ?? []).map((item) => ({
          ...item,
          draftPrice: item.price ?? undefined,
        })),
      );
    } finally {
      setMemberPricesLoading(false);
    }
  };

  const loadPriceChart = async () => {
    const response = await listPriceChangeLogs({ product_id: product.id, page: 1, page_size: 100 });
    if (response.code !== 0) {
      message.error(response.message || '价格变动加载失败');
      return;
    }
    setPriceChartData(toPriceChartData(response.data?.items ?? []));
  };

  useEffect(() => {
    setStandard(product.standard_price);
    setCost(product.cost_price);
    setReason('');
    void loadMemberPrices();
    void loadPriceChart();
  }, [product]);

  const submit = async (kind: 'standard_price' | 'cost_price') => {
    const price = kind === 'standard_price' ? standard : cost;
    if (price === undefined || price < 0) return message.warning('请输入有效价格');
    const response = await changeProductPrice(product.id, kind, { price, reason: reason.trim() });
    if (response.code === 0) {
      message.success('价格已调整');
      setReason('');
      await loadPriceChart();
      onSaved();
      return;
    }
    message.error(response.message || '调整失败');
    return;
  };

  const changedMemberPrices = getChangedMemberPriceItems(memberPriceRows);

  const saveMemberPrices = async () => {
    if (!changedMemberPrices.length) {
      message.warning('请先修改或新增会员价');
      return;
    }
    setMemberPricesSaving(true);
    try {
      const response = await batchUpdateMemberPrices(product.id, {
        items: changedMemberPrices,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      if (response.code !== 0) {
        message.error(response.message || '会员价保存失败');
        return;
      }
      message.success('会员价已保存');
      setReason('');
      await loadMemberPrices();
      await loadPriceChart();
      onSaved();
    } finally {
      setMemberPricesSaving(false);
    }
  };

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
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
      <span>会员价格</span>
      <Table<MemberPriceRow>
        dataSource={memberPriceRows}
        loading={memberPricesLoading}
        pagination={false}
        rowKey="level_id"
        size="small"
        columns={[
          { title: '会员等级', dataIndex: 'level_name' },
          {
            title: '当前价格',
            render: (_, row) => (row.price === undefined || row.price === null ? '未设置' : `¥${row.price.toFixed(2)}`),
          },
          {
            title: '新价格',
            render: (_, row) => (
              <InputNumber
                min={0}
                precision={2}
                prefix="¥"
                suffix="元"
                value={row.draftPrice}
                onChange={(value) => setMemberPriceRows((rows) => rows.map((item) => (item.level_id === row.level_id ? { ...item, draftPrice: value ?? undefined } : item)))}
              />
            ),
          },
          {
            title: '状态',
            render: (_, row) => {
              const state = getMemberPriceChangeState(row);
              return <Tag color={state === '未变更' ? 'default' : state === '新增' ? 'green' : 'blue'}>{state}</Tag>;
            },
          },
        ]}
      />
      <Input placeholder="调整原因（可选）" value={reason} onChange={(event) => setReason(event.target.value)} />
      <Button disabled={!changedMemberPrices.length} loading={memberPricesSaving} type="primary" onClick={saveMemberPrices}>
        保存会员价
      </Button>
      <span>价格变动趋势</span>
      {priceChartData.length ? (
        <Line
          data={priceChartData}
          xField="changedAt"
          yField="price"
          colorField="series"
          height={280}
          axis={{ y: { title: '价格（元）' } }}
          legend={{ color: { position: 'top' } }}
          tooltip={{ title: 'changedAt' }}
        />
      ) : (
        <Empty description="暂无价格变动记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
    </Space>
  );
}
