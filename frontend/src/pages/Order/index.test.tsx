import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrderList from './index';

const mocks = vi.hoisted(() => ({
  cancelOrder: vi.fn(),
  listCustomers: vi.fn(),
  listWarehouses: vi.fn(),
}));

vi.mock('@/services/order', () => ({
  listOrders: vi.fn(),
  getOrder: vi.fn(),
  createOrder: vi.fn(),
  shipOrder: vi.fn(),
  confirmPayment: vi.fn(),
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

vi.mock('@/services/product', () => ({ listAllProducts: vi.fn() }));

vi.mock('@umijs/max', () => ({ request: vi.fn() }));

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ProTable: ({ columns, toolBarRender }: { columns: Array<Record<string, unknown>>; toolBarRender?: () => React.ReactNode[] }) => {
    const actionColumn = columns.find((column) => column.title === '操作');
    const renderAction = actionColumn?.render as
      | ((value: unknown, record: Record<string, unknown>) => React.ReactNode)
      | undefined;
    return (
      <div>
        {toolBarRender?.()}
        {renderAction?.(undefined, {
          id: 'order-1',
          order_no: 'ORD1',
          customer_id: 'customer-1',
          customer_name: '测试客户',
          status: 'placed',
          total_amount: 100,
          created_at: '2026-07-15T09:00:00',
        })}
      </div>
    );
  },
}));

describe('Order cancel action', () => {
  beforeEach(() => {
    mocks.cancelOrder.mockReset();
    mocks.cancelOrder.mockResolvedValue({ code: 0, message: 'success', data: {} });
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
});
