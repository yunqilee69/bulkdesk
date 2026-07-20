import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DeliveryPage from './index';

const mocks = vi.hoisted(() => ({
  createDeliveryException: vi.fn(),
  getDeliveryDetail: vi.fn(),
  listCurrentDeliveries: vi.fn(),
  listDeliveryArchive: vi.fn(),
  listDeliveryEmployeeOptions: vi.fn(),
  reassignDelivery: vi.fn(),
  signDelivery: vi.fn(),
  uploadFile: vi.fn(),
  historyPush: vi.fn(),
}));

let isAdmin = true;
let currentUserId = 'employee-a';

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  ProTable: ({ request, columns }: { request: (params: Record<string, unknown>) => Promise<unknown>; columns: Array<{ dataIndex?: string; key?: string; render?: (_: unknown, record: Record<string, unknown>) => React.ReactNode }> }) => {
    React.useEffect(() => {
      void request({
        current: 2,
        pageSize: 10,
        employee_id: 'employee-a',
        order_keyword: 'SO2026',
        customer_keyword: '客户甲',
        signer_keyword: '收货人甲',
        signed_range: [{ format: () => '2026-07-01' }, { format: () => '2026-07-19' }],
      });
    }, [request]);
    const orderColumn = columns.find((column) => column.dataIndex === 'order_no');
    const customerColumn = columns.find((column) => column.dataIndex === 'customer_name');
    const actionColumn = columns.find((column) => column.key === 'actions');
    return (
      <div data-testid="archive-pro-table">
        {archiveResponse().data.items.map((record) => (
          <React.Fragment key={record.id}>
            {orderColumn?.render?.(record.order_no, record)}
            {customerColumn?.render?.(record.customer_name, record)}
            {actionColumn?.render?.(undefined, record)}
          </React.Fragment>
        ))}
        {['detail-a', 'detail-b'].map((id) => <React.Fragment key={id}>{actionColumn?.render?.(undefined, { id })}</React.Fragment>)}
      </div>
    );
  },
}));

vi.mock('@umijs/max', () => ({
  history: { push: mocks.historyPush },
  useAccess: () => ({ canAdmin: isAdmin }),
  useModel: () => ({ initialState: { currentUser: { id: currentUserId } } }),
}));

vi.mock('@/services/delivery', () => ({
  createDeliveryException: mocks.createDeliveryException,
  getDeliveryDetail: mocks.getDeliveryDetail,
  listCurrentDeliveries: mocks.listCurrentDeliveries,
  listDeliveryArchive: mocks.listDeliveryArchive,
  listDeliveryEmployeeOptions: mocks.listDeliveryEmployeeOptions,
  reassignDelivery: mocks.reassignDelivery,
  signDelivery: mocks.signDelivery,
}));

vi.mock('@/services/upload', () => ({ uploadFile: mocks.uploadFile }));

const currentGroups = [
  {
    delivery_employee_id: 'employee-a',
    delivery_employee_name: '配送员甲',
    order_count: 2,
    customer_count: 2,
    product_quantity: 8,
    total_amount: 1268.5,
    exception_order_count: 1,
    deliveries: [
      {
        id: 'delivery-a',
        status: 'delivering',
        delivery_employee_id: 'employee-a',
        delivery_employee_name: '配送员甲',
        order_id: 'order-a',
        order_no: 'SO20260719001',
        customer_id: 'customer-a',
        customer_name: '客户甲',
        recipient_name: '收货人甲',
        recipient_phone: '13800000000',
        delivery_address: '上海市静安区',
        assigned_at: '2026-07-19T09:00:00',
        total_amount: 1268.5,
        product_quantity: 8,
        has_exception: true,
        latest_exception: {
          exception_type: 'customer_absent',
          remark: '客户临时外出',
          occurred_at: '2026-07-19T10:00:00',
        },
      },
    ],
  },
  {
    delivery_employee_id: 'employee-b',
    delivery_employee_name: '配送员乙',
    order_count: 1,
    customer_count: 1,
    product_quantity: 3,
    total_amount: 280,
    exception_order_count: 0,
    deliveries: [],
  },
];

function archiveResponse() {
  return {
    code: 0,
    data: {
      items: [
        {
          ...currentGroups[0].deliveries[0],
          status: 'signed',
          signer_name: '收货人甲',
          signed_at: '2026-07-19T12:00:00',
          proof_image_urls: ['https://example.com/proof.jpg'],
          sign_remark: '已交接',
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

beforeEach(() => {
  isAdmin = true;
  currentUserId = 'employee-a';
  Object.values(mocks).forEach((mock) => {
    mock.mockReset();
  });
  mocks.listCurrentDeliveries.mockResolvedValue({ code: 0, data: currentGroups });
  mocks.listDeliveryArchive.mockResolvedValue(archiveResponse());
  mocks.listDeliveryEmployeeOptions.mockResolvedValue({
    code: 0,
    data: [
      { id: 'employee-a', name: '配送员甲' },
      { id: 'employee-b', name: '配送员乙' },
    ],
  });
  mocks.getDeliveryDetail.mockResolvedValue({
    code: 0,
    data: {
      ...archiveResponse().data.items[0],
      assigned_by_id: 'admin-1',
      assigned_by_name: '管理员',
      signed_by_id: 'employee-a',
      signed_by_name: '配送员甲',
      created_at: '2026-07-19T09:00:00',
      updated_at: '2026-07-19T12:00:00',
      events: [{ id: 'event-1', delivery_id: 'delivery-a', event_type: 'signed', operator_id: 'employee-a', operator_name: '配送员甲', created_at: '2026-07-19T12:00:00' }],
      items: [{ product_id: 'product-1', product_name: '矿泉水', barcode: '1001', quantity: 8 }],
    },
  });
  mocks.signDelivery.mockResolvedValue({ code: 0, data: {} });
  mocks.createDeliveryException.mockResolvedValue({ code: 0, data: {} });
  mocks.reassignDelivery.mockResolvedValue({ code: 0, data: {} });
  mocks.uploadFile.mockResolvedValue({ code: 0, data: { url: 'https://example.com/uploaded.jpg' } });
});

describe('DeliveryPage', () => {
  it('loads current groups and presents C-level operational metrics in expandable employee cards', async () => {
    render(<DeliveryPage />);

    expect(await screen.findByText('配送员甲')).toBeInTheDocument();
    expect(screen.getAllByText('订单数')).toHaveLength(2);
    expect(screen.getAllByText('客户数')).toHaveLength(2);
    expect(screen.getAllByText('商品件数')).toHaveLength(2);
    expect(screen.getAllByText('配送金额')).toHaveLength(2);
    expect(screen.getAllByText('异常订单')).toHaveLength(2);
    expect(screen.getAllByText('¥1,268.50')).toHaveLength(2);
    expect(await screen.findByText('SO20260719001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '收起配送员甲' })).toBeInTheDocument();
    expect(screen.getByText('收货人甲 13800000000')).toBeInTheDocument();
    expect(screen.getByText('上海市静安区')).toBeInTheDocument();
    expect(screen.getByText('客户不在 · 客户临时外出 · 2026-07-19T10:00:00')).toBeInTheDocument();
  });

  it('opens the selected current delivery order from the order number', async () => {
    render(<DeliveryPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'SO20260719001' }));

    expect(mocks.historyPush).toHaveBeenCalledWith('/order/detail/order-a');
  });

  it('opens the selected current delivery customer from the customer name', async () => {
    render(<DeliveryPage />);

    fireEvent.click(await screen.findByRole('button', { name: '客户甲' }));

    expect(mocks.historyPush).toHaveBeenCalledWith('/customer?keyword=%E5%AE%A2%E6%88%B7%E7%94%B2');
  });

  it('opens archived delivery order and customer links from the archive table', async () => {
    render(<DeliveryPage />);
    fireEvent.click(await screen.findByRole('tab', { name: '配送归档' }));

    const archiveTable = await screen.findByTestId('archive-pro-table');
    fireEvent.click(within(archiveTable).getByRole('button', { name: 'SO20260719001' }));
    fireEvent.click(within(archiveTable).getByRole('button', { name: '客户甲' }));

    expect(mocks.historyPush).toHaveBeenCalledWith('/order/detail/order-a');
    expect(mocks.historyPush).toHaveBeenCalledWith('/customer?keyword=%E5%AE%A2%E6%88%B7%E7%94%B2');
  });

  it('shows all backend-provided employee groups for admins without serial per-employee fetches', async () => {
    render(<DeliveryPage />);

    expect(await screen.findByText('配送员乙')).toBeInTheDocument();
    expect(mocks.listCurrentDeliveries).toHaveBeenCalledTimes(1);
    expect(mocks.listCurrentDeliveries).toHaveBeenCalledWith(undefined);
  });

  it('relies on backend self scope for normal employees and hides reassignment', async () => {
    isAdmin = false;
    mocks.listCurrentDeliveries.mockResolvedValue({ code: 0, data: [currentGroups[0]] });
    render(<DeliveryPage />);

    expect(await screen.findByText('配送员甲')).toBeInTheDocument();
    expect(screen.queryByText('配送员乙')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '登记签收' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '改派' })).not.toBeInTheDocument();
  });

  it('does not show delivery actions for a non-admin record owned by another employee', async () => {
    isAdmin = false;
    currentUserId = 'employee-a';
    mocks.listCurrentDeliveries.mockResolvedValue({
      code: 0,
      data: [
        currentGroups[0],
        {
          ...currentGroups[1],
          deliveries: [{ ...currentGroups[0].deliveries[0], id: 'delivery-b', delivery_employee_id: 'employee-b', delivery_employee_name: '配送员乙' }],
        },
      ],
    });
    render(<DeliveryPage />);

    expect(await screen.findByText('配送员乙')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '收起配送员甲' }));
    expect(screen.queryByRole('button', { name: '登记签收' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '登记异常' })).not.toBeInTheDocument();
  });

  it('uses ProTable to request the archive page rather than an Ant Table', async () => {
    render(<DeliveryPage />);
    fireEvent.click(await screen.findByRole('tab', { name: '配送归档' }));

    expect(await screen.findByTestId('archive-pro-table')).toBeInTheDocument();
    await waitFor(() => expect(mocks.listDeliveryArchive).toHaveBeenCalledWith({
      page: 2,
      page_size: 10,
      employee_id: 'employee-a',
      order_keyword: 'SO2026',
      customer_keyword: '客户甲',
      signer_keyword: '收货人甲',
      signed_from: '2026-07-01',
      signed_to: '2026-07-19',
    }));
  });

  it('loads the archive through ProTable and keeps details on demand', async () => {
    render(<DeliveryPage />);
    fireEvent.click(await screen.findByRole('tab', { name: '配送归档' }));
    expect(await screen.findByTestId('archive-pro-table')).toBeInTheDocument();
    expect(mocks.getDeliveryDetail).not.toHaveBeenCalled();
  });

  it('uploads completed proof URLs, signs, and refreshes current plus visited archive data', async () => {
    render(<DeliveryPage />);
    fireEvent.click(await screen.findByRole('button', { name: '登记签收' }));

    fireEvent.change(within(screen.getByRole('dialog', { name: '登记签收' })).getByLabelText('签收人'), { target: { value: '实际签收人' } });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['proof'], 'proof.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(mocks.uploadFile).toHaveBeenCalledWith(expect.any(File), 'deliveries'));
    fireEvent.click(within(screen.getByRole('dialog', { name: '登记签收' })).getByRole('button', { name: '确认签收' }));

    await waitFor(() => expect(mocks.signDelivery).toHaveBeenCalledWith('delivery-a', {
      signer_name: '实际签收人',
      proof_image_urls: ['https://example.com/uploaded.jpg'],
      remark: undefined,
    }));
    expect(mocks.listCurrentDeliveries).toHaveBeenCalledTimes(2);
  });

  it('submits payment fields when signing and collecting payment together', async () => {
    render(<DeliveryPage />);
    fireEvent.click(await screen.findByRole('button', { name: '登记签收' }));

    const dialog = screen.getByRole('dialog', { name: '登记签收' });
    fireEvent.change(within(dialog).getByLabelText('签收人'), { target: { value: '实际签收人' } });
    fireEvent.click(within(dialog).getByLabelText('同时确认收款'));
    expect(within(dialog).getByLabelText('实收金额')).toHaveValue('1268.50');
    fireEvent.change(within(dialog).getByLabelText('实收金额'), { target: { value: '1260' } });
    const input = Array.from(document.querySelectorAll('input[type="file"]')).at(-1) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['payment'], 'payment.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(mocks.uploadFile).toHaveBeenCalledWith(expect.any(File), 'payments'));
    fireEvent.click(within(dialog).getByRole('button', { name: '确认签收' }));

    await waitFor(() => expect(mocks.signDelivery).toHaveBeenCalledWith('delivery-a', {
      signer_name: '实际签收人',
      proof_image_urls: [],
      remark: undefined,
      collect_payment: true,
      paid_amount: 1260,
      payment_proof_image_urls: ['https://example.com/uploaded.jpg'],
    }));
  });

  it('keeps the employee card collapsed after a delivery refresh', async () => {
    render(<DeliveryPage />);
    fireEvent.click(await screen.findByRole('button', { name: '登记签收' }));
    fireEvent.click(screen.getByRole('button', { name: '收起配送员甲' }));
    fireEvent.change(within(screen.getByRole('dialog', { name: '登记签收' })).getByLabelText('签收人'), { target: { value: '签收人甲' } });
    fireEvent.click(within(screen.getByRole('dialog', { name: '登记签收' })).getByRole('button', { name: '确认签收' }));

    await waitFor(() => expect(mocks.listCurrentDeliveries).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: '展开配送员甲' })).toBeInTheDocument();
    expect(screen.queryByText('SO20260719001')).not.toBeInTheDocument();
  });

  it('keeps action forms usable after backend failures and permits repeated exceptions', async () => {
    mocks.createDeliveryException.mockResolvedValueOnce({ code: 400, message: '异常保存失败' });
    render(<DeliveryPage />);
    fireEvent.click(await screen.findByRole('button', { name: '登记异常' }));
    fireEvent.mouseDown(screen.getByLabelText('异常类型'));
    fireEvent.click(await screen.findByText('其他'));
    fireEvent.change(screen.getByLabelText('异常说明'), { target: { value: '客户临时外出' } });
    fireEvent.click(within(screen.getByRole('dialog', { name: '登记配送异常' })).getByRole('button', { name: '确认登记' }));

    expect(await screen.findByText('异常保存失败')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '登记配送异常' })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog', { name: '登记配送异常' })).getByRole('button', { name: '确认登记' }));
    await waitFor(() => expect(mocks.createDeliveryException).toHaveBeenCalledTimes(2));
  });

  it('allows only administrators to reassign after active employee options load', async () => {
    render(<DeliveryPage />);
    fireEvent.click(await screen.findByRole('button', { name: '改派' }));
    await waitFor(() => expect(mocks.listDeliveryEmployeeOptions).toHaveBeenCalled());
    const employeeSelect = screen.getByLabelText('新配送员');
    fireEvent.mouseDown(employeeSelect);
    const employeeOption = await waitFor(() => {
      const option = Array.from(document.querySelectorAll<HTMLElement>('.ant-select-item-option')).find((element) => element.textContent === '配送员乙');
      if (!option) throw new Error('未找到配送员乙选项');
      return option;
    });
    fireEvent.click(employeeOption);
    fireEvent.change(screen.getByLabelText('改派原因'), { target: { value: '路线调整' } });
    fireEvent.click(within(screen.getByRole('dialog', { name: '改派配送' })).getByRole('button', { name: '确认改派' }));

    await waitFor(() => expect(mocks.reassignDelivery).toHaveBeenCalledWith('delivery-a', {
      delivery_employee_id: 'employee-b',
      reason: '路线调整',
    }));
  });

  it('ignores an older current refresh that completes after a newer refresh', async () => {
    const older = createDeferred<ReturnType<typeof archiveResponse>>();
    const newer = createDeferred<ReturnType<typeof archiveResponse>>();
    mocks.listCurrentDeliveries
      .mockResolvedValueOnce({ code: 0, data: currentGroups })
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    render(<DeliveryPage />);
    await screen.findByRole('button', { name: '登记签收' });
    for (const signer of ['第一次签收', '第二次签收']) {
      fireEvent.click(screen.getByRole('button', { name: '登记签收' }));
      fireEvent.change(within(screen.getByRole('dialog', { name: '登记签收' })).getByLabelText('签收人'), { target: { value: signer } });
      fireEvent.click(within(screen.getByRole('dialog', { name: '登记签收' })).getByRole('button', { name: '确认签收' }));
      await waitFor(() => expect(mocks.signDelivery).toHaveBeenCalledTimes(signer === '第一次签收' ? 1 : 2));
    }

    newer.resolve({ code: 0, data: [{ ...currentGroups[0], delivery_employee_name: '最新配送员' }] } as never);
    expect(await screen.findByText('最新配送员')).toBeInTheDocument();
    older.resolve({ code: 0, data: [{ ...currentGroups[0], delivery_employee_name: '过期配送员' }] } as never);
    await waitFor(() => expect(screen.queryByText('过期配送员')).not.toBeInTheDocument());
  });

  it('ignores detail A when detail B completes first', async () => {
    const detailA = createDeferred<unknown>();
    const detailB = createDeferred<unknown>();
    mocks.getDeliveryDetail.mockReturnValueOnce(detailA.promise).mockReturnValueOnce(detailB.promise);
    render(<DeliveryPage />);
    fireEvent.click(await screen.findByRole('tab', { name: '配送归档' }));
    const detailButtons = await screen.findAllByRole('button', { name: '查看详情' });
    fireEvent.click(detailButtons[0]);
    fireEvent.click(detailButtons[1]);

    detailB.resolve({ code: 0, data: { ...archiveResponse().data.items[0], id: 'detail-b', order_no: '订单B', events: [], items: [], proof_image_urls: [], assigned_by_id: 'admin', assigned_by_name: '管理员', created_at: '', updated_at: '' } });
    expect(await screen.findByText('订单B')).toBeInTheDocument();
    detailA.resolve({ code: 0, data: { ...archiveResponse().data.items[0], id: 'detail-a', order_no: '订单A', events: [], items: [], proof_image_urls: [], assigned_by_id: 'admin', assigned_by_name: '管理员', created_at: '', updated_at: '' } });
    await waitFor(() => expect(screen.queryByText('订单A')).not.toBeInTheDocument());
  });
});
