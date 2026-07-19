import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrderList from './index';

const mocks = vi.hoisted(() => ({
  cancelOrder: vi.fn(),
  getOrder: vi.fn(),
  getOrderShippingOptions: vi.fn(),
  listCustomers: vi.fn(),
  listWarehouses: vi.fn(),
}));

vi.mock('@/services/order', () => ({
  listOrders: vi.fn(),
  getOrder: mocks.getOrder,
  getOrderShippingOptions: mocks.getOrderShippingOptions,
  createOrder: vi.fn(),
  startShippingOrder: vi.fn(),
  updateShippingAllocations: vi.fn(),
  stockOutOrder: vi.fn(),
  deliverOrder: vi.fn(),
  completeOrder: vi.fn(),
  cancelOrder: mocks.cancelOrder,
}));

vi.mock('@/services/customer', () => ({
  listAllCustomers: mocks.listCustomers,
  listAllMemberPrices: vi.fn(),
}));
vi.mock('@/services/inventory', () => ({
  listAllWarehouses: mocks.listWarehouses,
  listAllInventory: vi.fn(),
}));

vi.mock('@/components/ProductSelectModal', () => ({
  default: ({ open }: { open: boolean }) => open ? <div data-testid="product-select-modal">专用商品选择</div> : null,
}));

vi.mock('@umijs/max', () => ({ request: vi.fn() }));

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ProTable: ({ columns, toolBarRender, rowSelection }: { columns: Array<Record<string, unknown>>; toolBarRender?: () => React.ReactNode[]; rowSelection?: { onChange?: (keys: React.Key[], rows: Array<Record<string, unknown>>) => void } }) => {
    const actionColumn = columns.find((column) => column.title === '操作');
    const renderAction = actionColumn?.render as
      | ((value: unknown, record: Record<string, unknown>) => React.ReactNode)
      | undefined;
    const record = {
      id: 'order-1',
      order_no: 'ORD1',
      customer_id: 'customer-1',
      customer_name: '测试客户',
      status: 'placed',
      total_amount: 100,
      created_at: '2026-07-15T09:00:00',
    };
    return (
      <div>
        {toolBarRender?.()}
        <button type="button" onClick={() => rowSelection?.onChange?.(['order-1'], [record])}>选择订单</button>
        {renderAction?.(undefined, record)}
      </div>
    );
  },
}));

describe('Order cancel action', () => {
  beforeEach(() => {
    mocks.cancelOrder.mockReset();
    mocks.cancelOrder.mockResolvedValue({ code: 0, message: 'success', data: {} });
    mocks.getOrder.mockReset();
    mocks.getOrderShippingOptions.mockReset();
    mocks.listCustomers.mockResolvedValue([]);
    mocks.listWarehouses.mockResolvedValue([]);
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
});
