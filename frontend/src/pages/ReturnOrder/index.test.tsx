import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReturnOrderList from './index';

const mocks = vi.hoisted(() => ({
  voidReturnOrder: vi.fn(),
}));

vi.mock('@/services/returnOrder', () => ({
  listReturnOrders: vi.fn(),
  getReturnOrder: vi.fn(),
  voidReturnOrder: mocks.voidReturnOrder,
}));
vi.mock('@umijs/max', () => ({ request: vi.fn(), useAccess: () => ({ canAdmin: true }) }));
vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ProTable: ({ columns, toolbar }: { columns: Array<Record<string, unknown>>; toolbar?: { title?: React.ReactNode } }) => {
    const actionColumn = columns.find((column) => column.title === '操作');
    const renderAction = actionColumn?.render as ((value: unknown, record: Record<string, unknown>) => React.ReactNode) | undefined;
    const record = { id: 'ret-1', return_no: 'RET1', customer_name: '客户', status: 'completed', total_amount: 20, created_at: '2026-07-19' };
    return <div>{toolbar?.title}{renderAction?.(undefined, record)}</div>;
  },
}));

describe('ReturnOrder page', () => {
  beforeEach(() => {
    mocks.voidReturnOrder.mockResolvedValue({ code: 0, data: {} });
  });

  it('only displays records and directs creation to delivery tasks', () => {
    render(<ReturnOrderList />);
    expect(screen.getByText('退货记录（退货请从配送任务发起）')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新建退货单' })).not.toBeInTheDocument();
  });

  it('submits a mandatory reason when voiding', async () => {
    render(<ReturnOrderList />);
    fireEvent.click(screen.getByRole('button', { name: '作废' }));
    fireEvent.change(await screen.findByLabelText('作废原因'), { target: { value: '录入错误' } });
    fireEvent.click(screen.getByRole('button', { name: '确认作废' }));
    await waitFor(() => expect(mocks.voidReturnOrder).toHaveBeenCalledWith('ret-1', { void_reason: '录入错误' }));
  });
});
