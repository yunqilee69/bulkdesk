import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Customer from './index';

const mocks = vi.hoisted(() => ({
  listAllLevels: vi.fn(),
  listCustomers: vi.fn(),
  request: vi.fn(),
}));

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  ProTable: ({ request, params }: { request: (params: Record<string, unknown>) => Promise<unknown>; params?: Record<string, unknown> }) => {
    React.useEffect(() => {
      void request({ current: 1, pageSize: 20, ...params });
    }, [request, params]);
    return <div data-testid="customer-table" />;
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
    Object.values(mocks).forEach((mock) => {
      mock.mockReset();
    });
    mocks.listAllLevels.mockResolvedValue([]);
    mocks.listCustomers.mockResolvedValue({
      code: 0,
      data: { items: [], total: 0 },
    });
  });

  it('uses the customer keyword from the URL when opened from delivery links', async () => {
    render(<Customer />);

    await waitFor(() => expect(mocks.listCustomers).toHaveBeenCalledWith({
      keyword: '客户甲',
      page: 1,
      page_size: 20,
    }));
  });
});
