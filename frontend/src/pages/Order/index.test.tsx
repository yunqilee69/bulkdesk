import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrderList from './index';

const mocks = vi.hoisted(() => ({
  cancelOrder: vi.fn(),
  completeOrder: vi.fn(),
  getCustomer: vi.fn(),
  getOrder: vi.fn(),
  getOrderShippingOptions: vi.fn(),
  listCustomers: vi.fn(),
  listDeliveryEmployeeOptions: vi.fn(),
  listWarehouses: vi.fn(),
  stockOutOrder: vi.fn(),
  uploadFile: vi.fn(),
  historyPush: vi.fn(),
}));

let tableRecords: Array<Record<string, unknown>> = [];

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

vi.mock('@/services/order', () => ({
  listOrders: vi.fn(),
  getOrder: mocks.getOrder,
  getOrderShippingOptions: mocks.getOrderShippingOptions,
  createOrder: vi.fn(),
  startShippingOrder: vi.fn(),
  updateShippingAllocations: vi.fn(),
  stockOutOrder: mocks.stockOutOrder,
  completeOrder: mocks.completeOrder,
  cancelOrder: mocks.cancelOrder,
}));

vi.mock('@/services/customer', () => ({
  getCustomer: mocks.getCustomer,
  listAllCustomers: mocks.listCustomers,
  listAllMemberPrices: vi.fn(),
}));

vi.mock('@/services/delivery', () => ({
  listDeliveryEmployeeOptions: mocks.listDeliveryEmployeeOptions,
}));

vi.mock('@/services/inventory', () => ({
  listAllWarehouses: mocks.listWarehouses,
  listAllInventory: vi.fn(),
}));

vi.mock('@/services/upload', () => ({ uploadFile: mocks.uploadFile }));

vi.mock('@/components/ProductSelectModal', () => ({
  default: ({ open }: { open: boolean }) => open ? <div data-testid="product-select-modal">专用商品选择</div> : null,
}));

vi.mock('@umijs/max', () => ({
  history: { push: mocks.historyPush },
  request: vi.fn(),
}));

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ProTable: ({ columns, toolBarRender, rowSelection }: { columns: Array<Record<string, unknown>>; toolBarRender?: () => React.ReactNode[]; rowSelection?: { onChange?: (keys: React.Key[], rows: Array<Record<string, unknown>>) => void } }) => {
    const orderNumberColumn = columns.find((column) => column.title === '订单号');
    const actionColumn = columns.find((column) => column.title === '操作');
    const renderOrderNumber = orderNumberColumn?.render as
      | ((value: unknown, record: Record<string, unknown>) => React.ReactNode)
      | undefined;
    const renderAction = actionColumn?.render as
      | ((value: unknown, record: Record<string, unknown>) => React.ReactNode)
      | undefined;
    return (
      <div>
        {toolBarRender?.()}
        {tableRecords.map((record) => (
          <React.Fragment key={record.id as string}>
            <button type="button" onClick={() => rowSelection?.onChange?.([record.id as string], [record])}>选择订单</button>
            {renderOrderNumber?.(undefined, record)}
            {renderAction?.(undefined, record)}
          </React.Fragment>
        ))}
      </div>
    );
  },
}));

describe('Order actions and detail', () => {
  beforeEach(() => {
    tableRecords = [{
      id: 'order-1',
      order_no: 'ORD1',
      customer_id: 'customer-1',
      customer_name: '测试客户',
      status: 'placed',
      total_amount: 100,
      created_at: '2026-07-15T09:00:00',
    }];
    mocks.cancelOrder.mockReset();
    mocks.cancelOrder.mockResolvedValue({ code: 0, message: 'success', data: {} });
    mocks.completeOrder.mockReset();
    mocks.completeOrder.mockResolvedValue({ code: 0, message: 'success', data: {} });
    mocks.getCustomer.mockReset();
    mocks.getOrder.mockReset();
    mocks.getOrderShippingOptions.mockReset();
    mocks.listCustomers.mockResolvedValue([]);
    mocks.listDeliveryEmployeeOptions.mockReset();
    mocks.listWarehouses.mockResolvedValue([]);
    mocks.stockOutOrder.mockReset();
    mocks.uploadFile.mockReset();
    mocks.uploadFile.mockResolvedValue({ code: 0, data: { url: 'https://example.com/payment.jpg' } });
    mocks.historyPush.mockReset();
  });

  it('opens order details in the dedicated route', () => {
    render(<OrderList />);

    fireEvent.click(screen.getByRole('button', { name: 'ORD1' }));

    expect(mocks.historyPush).toHaveBeenCalledWith('/order/detail/order-1');
    expect(mocks.getOrder).not.toHaveBeenCalled();
  });

  it('requires and submits a cancellation reason', async () => {
    render(<OrderList />);

    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    const reason = await screen.findByLabelText('取消原因');
    expect(mocks.cancelOrder).not.toHaveBeenCalled();

    fireEvent.change(reason, { target: { value: '客户撤单' } });
    fireEvent.click(screen.getByRole('button', { name: '确认取消' }));

    await waitFor(() => {
      expect(mocks.cancelOrder).toHaveBeenCalledWith('order-1', {
        cancel_reason: '客户撤单',
      });
    });
  });

  it('uses the dedicated product selector inside the create modal', async () => {
    render(<OrderList />);

    fireEvent.click(screen.getByRole('button', { name: '新建订单' }));
    fireEvent.click(await screen.findByTestId('open-product-select'));

    expect(await screen.findByTestId('product-select-modal')).toBeInTheDocument();
  });

  it('enables the toolbar shipment action after selecting a placed order', async () => {
    render(<OrderList />);

    expect(screen.getByTestId('toolbar-ship-order')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '选择订单' }));

    await waitFor(() => {
      expect(screen.getByTestId('toolbar-ship-order')).toBeEnabled();
    });
  });

  it('opens stock-out form and loads delivery employees with customer snapshots', async () => {
    tableRecords[0].status = 'shipping';
    mocks.listDeliveryEmployeeOptions.mockResolvedValue({
      code: 0,
      data: [{ id: 'employee-1', name: '配送员甲' }],
    });
    mocks.getCustomer.mockResolvedValue({
      code: 0,
      data: { contact_name: '收货人甲', contact_phone: '13800000000', address: '上海市静安区' },
    });

    render(<OrderList />);
    fireEvent.click(screen.getByRole('button', { name: '确认出库' }));

    expect(await screen.findByRole('dialog', { name: '确认出库' })).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.listDeliveryEmployeeOptions).toHaveBeenCalledOnce();
      expect(mocks.getCustomer).toHaveBeenCalledWith('customer-1');
    });
    expect(screen.getByLabelText('收货人')).toHaveValue('收货人甲');
    expect(screen.getByLabelText('收货电话')).toHaveValue('13800000000');
    expect(screen.getByLabelText('收货地址')).toHaveValue('上海市静安区');
    fireEvent.mouseDown(screen.getByLabelText('配送员'));
    expect(await screen.findByText('配送员甲')).toBeInTheDocument();
  });

  it('requires each stock-out form field', async () => {
    tableRecords[0].status = 'shipping';
    mocks.listDeliveryEmployeeOptions.mockResolvedValue({ code: 0, data: [{ id: 'employee-1', name: '配送员甲' }] });
    mocks.getCustomer.mockResolvedValue({
      code: 0,
      data: { contact_name: '收货人甲', contact_phone: '13800000000', address: '上海市静安区' },
    });

    render(<OrderList />);
    fireEvent.click(screen.getByRole('button', { name: '确认出库' }));
    await screen.findByLabelText('收货人');
    await waitFor(() => {
      expect(screen.getByLabelText('收货人')).toHaveValue('收货人甲');
      expect(screen.getByLabelText('收货电话')).toHaveValue('13800000000');
      expect(screen.getByLabelText('收货地址')).toHaveValue('上海市静安区');
    });
    const stockOutDialog = screen.getByRole('dialog', { name: '确认出库' });
    const submit = () => fireEvent.click(within(stockOutDialog).getByRole('button', { name: '确认出库' }));

    submit();
    expect(await screen.findByText('请选择配送员')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByLabelText('配送员'));
    fireEvent.click(await screen.findByText('配送员甲'));
    fireEvent.change(screen.getByLabelText('收货人'), { target: { value: '' } });
    submit();
    expect(await screen.findByText('请填写收货人')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('收货人'), { target: { value: '收货人甲' } });
    fireEvent.change(screen.getByLabelText('收货电话'), { target: { value: '' } });
    submit();
    expect(await screen.findByText('请填写收货电话')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('收货电话'), { target: { value: '13800000000' } });
    fireEvent.change(screen.getByLabelText('收货地址'), { target: { value: '' } });
    submit();
    expect(await screen.findByText('请填写收货地址')).toBeInTheDocument();
    expect(mocks.stockOutOrder).not.toHaveBeenCalled();
  });

  it('submits the exact validated stock-out payload', async () => {
    tableRecords[0].status = 'shipping';
    mocks.listDeliveryEmployeeOptions.mockResolvedValue({ code: 0, data: [{ id: 'employee-1', name: '配送员甲' }] });
    mocks.getCustomer.mockResolvedValue({
      code: 0,
      data: { contact_name: '收货人甲', contact_phone: '13800000000', address: '上海市静安区' },
    });
    mocks.stockOutOrder.mockResolvedValue({ code: 0, data: {} });

    render(<OrderList />);
    fireEvent.click(screen.getByRole('button', { name: '确认出库' }));
    await screen.findByLabelText('收货人');
    fireEvent.mouseDown(screen.getByLabelText('配送员'));
    fireEvent.click(await screen.findByText('配送员甲'));
    fireEvent.change(screen.getByLabelText('收货人'), { target: { value: '新收货人' } });
    fireEvent.change(screen.getByLabelText('收货电话'), { target: { value: '13900000000' } });
    fireEvent.change(screen.getByLabelText('收货地址'), { target: { value: '杭州市西湖区' } });
    fireEvent.click(within(screen.getByRole('dialog', { name: '确认出库' })).getByRole('button', { name: '确认出库' }));

    await waitFor(() => {
      expect(mocks.stockOutOrder).toHaveBeenCalledWith('order-1', {
        delivery_employee_id: 'employee-1',
        recipient_name: '新收货人',
        recipient_phone: '13900000000',
        delivery_address: '杭州市西湖区',
      });
    });
  });

  it('does not render direct delivery confirmation for stocked-out orders', () => {
    tableRecords[0].status = 'stocked_out';

    render(<OrderList />);

    expect(screen.queryByRole('button', { name: '确认送达' })).not.toBeInTheDocument();
  });

  it('opens payment collection modal and submits actual paid amount with proof', async () => {
    tableRecords[0].status = 'delivered_unpaid';
    tableRecords[0].total_amount = 20010;

    render(<OrderList />);
    fireEvent.click(screen.getByRole('button', { name: '确认收款' }));

    const dialog = await screen.findByRole('dialog', { name: '确认收款' });
    expect(within(dialog).getByLabelText('实收金额')).toHaveValue('20010.00');
    fireEvent.change(within(dialog).getByLabelText('实收金额'), { target: { value: '20000' } });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['payment'], 'payment.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(mocks.uploadFile).toHaveBeenCalledWith(expect.any(File), 'payments'));
    fireEvent.click(within(dialog).getByRole('button', { name: '确认收款' }));

    await waitFor(() => expect(mocks.completeOrder).toHaveBeenCalledWith('order-1', {
      paid_amount: 20000,
      payment_proof_image_urls: ['https://example.com/payment.jpg'],
    }));
  });

  it('ignores stale stock-out responses after reopening another order', async () => {
    const employeesA = createDeferred<unknown>();
    const customerA = createDeferred<unknown>();
    const employeesB = createDeferred<unknown>();
    const customerB = createDeferred<unknown>();
    tableRecords = [
      { id: 'order-a', order_no: 'ORDA', customer_id: 'customer-a', customer_name: '客户 A', status: 'shipping', total_amount: 100, created_at: '2026-07-15T09:00:00' },
      { id: 'order-b', order_no: 'ORDB', customer_id: 'customer-b', customer_name: '客户 B', status: 'shipping', total_amount: 200, created_at: '2026-07-15T09:00:00' },
    ];
    mocks.listDeliveryEmployeeOptions
      .mockReturnValueOnce(employeesA.promise)
      .mockReturnValueOnce(employeesB.promise);
    mocks.getCustomer
      .mockReturnValueOnce(customerA.promise)
      .mockReturnValueOnce(customerB.promise);
    mocks.stockOutOrder.mockResolvedValue({ code: 0, data: {} });

    render(<OrderList />);
    fireEvent.click(screen.getAllByRole('button', { name: '确认出库' })[0]);
    expect(await screen.findByText('正在加载配送信息...')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog', { name: '确认出库' })).getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getAllByRole('button', { name: '确认出库' })[1]);

    await act(async () => {
      employeesA.resolve({ code: 0, data: [{ id: 'employee-a', name: '配送员 A' }] });
      customerA.resolve({ code: 0, data: { contact_name: '收货人 A', contact_phone: '13800000001', address: '地址 A' } });
    });
    expect(screen.getByText('正在加载配送信息...')).toBeInTheDocument();
    expect(screen.getByLabelText('收货人')).toHaveValue('');

    await act(async () => {
      employeesB.resolve({ code: 0, data: [{ id: 'employee-b', name: '配送员 B' }] });
      customerB.resolve({ code: 0, data: { contact_name: '收货人 B', contact_phone: '13800000002', address: '地址 B' } });
    });
    await waitFor(() => expect(screen.getByLabelText('收货人')).toHaveValue('收货人 B'));
    fireEvent.mouseDown(screen.getByLabelText('配送员'));
    fireEvent.click(await screen.findByText('配送员 B'));
    fireEvent.click(within(screen.getByRole('dialog', { name: '确认出库' })).getByRole('button', { name: '确认出库' }));

    await waitFor(() => {
      expect(mocks.stockOutOrder).toHaveBeenCalledWith('order-b', {
        delivery_employee_id: 'employee-b',
        recipient_name: '收货人 B',
        recipient_phone: '13800000002',
        delivery_address: '地址 B',
      });
    });
  });

  it('keeps stock-out controls unavailable after load rejection and offers retry', async () => {
    tableRecords[0].status = 'shipping';
    mocks.listDeliveryEmployeeOptions.mockRejectedValueOnce(new Error('network'));
    mocks.getCustomer.mockResolvedValue({ code: 0, data: { contact_name: '收货人', contact_phone: '13800000000', address: '地址' } });

    render(<OrderList />);
    fireEvent.click(screen.getByRole('button', { name: '确认出库' }));

    expect(await screen.findByText('加载配送信息失败，请重试')).toBeInTheDocument();
    expect(screen.getByLabelText('收货人')).toBeDisabled();
    expect(within(screen.getByRole('dialog', { name: '确认出库' })).getByRole('button', { name: '确认出库' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '重试加载' })).toBeEnabled();
  });

});
