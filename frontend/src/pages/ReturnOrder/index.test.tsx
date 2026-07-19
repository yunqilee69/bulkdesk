import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReturnOrderList from './index';

const mocks = vi.hoisted(() => ({
  listCustomers: vi.fn(),
  listWarehouses: vi.fn(),
  voidReturnOrder: vi.fn(),
}));

vi.mock('@/services/returnOrder', () => ({
  listReturnOrders: vi.fn(),
  getReturnOrder: vi.fn(),
  createReturnOrder: vi.fn(),
  voidReturnOrder: mocks.voidReturnOrder,
}));
vi.mock('@/services/customer', () => ({ listAllCustomers: mocks.listCustomers }));
vi.mock('@/services/inventory', () => ({ listAllWarehouses: mocks.listWarehouses }));
vi.mock('@/components/ProductSelectModal', () => ({
  default: ({ open, onConfirm }: { open: boolean; onConfirm: (products: unknown[]) => void }) => open ? (
    <div data-testid="return-product-select">
      <button type="button" onClick={() => onConfirm([{ id: 'p1', name: '商品 A', barcode: 'A001', category_id: 'c1', unit: '件', cost_price: 5, standard_price: 12, status: 'active' }])}>确认商品</button>
    </div>
  ) : null,
}));
vi.mock('@umijs/max', () => ({ request: vi.fn() }));
vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ProTable: ({ columns, toolBarRender }: { columns: Array<Record<string, unknown>>; toolBarRender?: () => React.ReactNode[] }) => {
    const actionColumn = columns.find((column) => column.title === '操作');
    const renderAction = actionColumn?.render as ((value: unknown, record: Record<string, unknown>) => React.ReactNode) | undefined;
    const record = { id: 'ret-1', return_no: 'RET1', customer_name: '客户', status: 'completed', total_amount: 20, created_at: '2026-07-19' };
    return <div>{toolBarRender?.()}{renderAction?.(undefined, record)}</div>;
  },
}));

describe('ReturnOrder page', () => {
  beforeEach(() => {
    mocks.listCustomers.mockResolvedValue([]);
    mocks.listWarehouses.mockResolvedValue([{ id: 'w1', name: '主仓', status: 'active' }]);
    mocks.voidReturnOrder.mockResolvedValue({ code: 0, data: {} });
  });

  it('uses the product selector and exposes batch stock decisions', async () => {
    render(<ReturnOrderList />);
    fireEvent.click(screen.getByRole('button', { name: '新建退货单' }));
    fireEvent.click(await screen.findByRole('button', { name: /选择商品/ }));
    expect(await screen.findByTestId('return-product-select')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认商品' }));
    expect(await screen.findByRole('button', { name: '批量入库' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '批量不入库' })).toBeInTheDocument();
  });

  it('submits a mandatory reason when voiding', async () => {
    render(<ReturnOrderList />);
    fireEvent.click(screen.getByRole('button', { name: '作废' }));
    fireEvent.change(await screen.findByLabelText('作废原因'), { target: { value: '录入错误' } });
    fireEvent.click(screen.getByRole('button', { name: '确认作废' }));
    await waitFor(() => expect(mocks.voidReturnOrder).toHaveBeenCalledWith('ret-1', { void_reason: '录入错误' }));
  });
});
