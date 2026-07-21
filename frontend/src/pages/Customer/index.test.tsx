import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Customer from './index';

const mocks = vi.hoisted(() => ({
  listAllLevels: vi.fn(),
  listCustomers: vi.fn(),
  request: vi.fn(),
  access: { canAdmin: false },
  customerRecord: null as null | Record<string, unknown>,
}));

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  ProTable: ({
    request,
    params,
    toolBarRender,
    columns,
  }: {
    request: (params: Record<string, unknown>) => Promise<unknown>;
    params?: Record<string, unknown>;
    toolBarRender?: () => React.ReactNode[];
    columns?: Array<{ valueType?: string; render?: (_: unknown, record: Record<string, unknown>) => React.ReactNode[] }>;
  }) => {
    React.useEffect(() => {
      void request({ current: 1, pageSize: 20, ...params });
    }, [request, params]);
    const actionColumn = columns?.find((column) => column.valueType === 'option');
    return (
      <div data-testid="customer-table">
        {toolBarRender?.()}
        {mocks.customerRecord ? actionColumn?.render?.(null, mocks.customerRecord) : null}
      </div>
    );
  },
  ModalForm: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ProFormText: () => null,
  ProFormSelect: () => null,
  ProFormTextArea: () => null,
  ProForm: {
    Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Item: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
}));

vi.mock('@umijs/max', () => ({
  request: mocks.request,
  useAccess: () => mocks.access,
  useLocation: () => ({ search: '?keyword=%E5%AE%A2%E6%88%B7%E7%94%B2' }),
}));

vi.mock('@/services/customer', () => ({
  createCustomer: vi.fn(),
  listAllLevels: mocks.listAllLevels,
  listCustomers: mocks.listCustomers,
  updateCustomer: vi.fn(),
}));

describe('Customer page route keyword', () => {
  beforeEach(() => {
    mocks.listAllLevels.mockReset();
    mocks.listCustomers.mockReset();
    mocks.request.mockReset();
    mocks.listAllLevels.mockResolvedValue([]);
    mocks.listCustomers.mockResolvedValue({
      code: 0,
      data: { items: [], total: 0 },
    });
    mocks.access = { canAdmin: false };
    mocks.customerRecord = null;
  });

  it('uses the customer keyword from the URL when opened from delivery links', async () => {
    render(<Customer />);

    await waitFor(() => expect(mocks.listCustomers).toHaveBeenCalledWith({
      keyword: '客户甲',
      page: 1,
      page_size: 20,
    }));
  });

  it('hides customer create and edit actions from non-admin users', async () => {
    mocks.customerRecord = { id: 'customer-1', name: '客户甲' };

    render(<Customer />);

    await waitFor(() => expect(mocks.listCustomers).toHaveBeenCalled());
    expect(screen.queryByText('新建客户')).not.toBeInTheDocument();
    expect(screen.queryByText('编辑')).not.toBeInTheDocument();
  });

  it('keeps customer write actions visible for admins', async () => {
    mocks.access = { canAdmin: true };
    mocks.customerRecord = { id: 'customer-1', name: '客户甲' };

    render(<Customer />);

    await waitFor(() => expect(mocks.listCustomers).toHaveBeenCalled());
    expect(screen.getByText('新建客户')).toBeInTheDocument();
    expect(screen.getByText('编辑')).toBeInTheDocument();
  });
});
