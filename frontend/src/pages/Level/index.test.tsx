import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Level from './index';

const mocks = vi.hoisted(() => ({
  createLevel: vi.fn(),
  listLevels: vi.fn(),
  listProducts: vi.fn(),
}));

vi.mock('@/services/customer', () => ({
  listLevels: mocks.listLevels,
  listAllLevels: mocks.listLevels,
  createLevel: mocks.createLevel,
  updateLevel: vi.fn(),
  deleteLevel: vi.fn(),
  listMemberPrices: vi.fn(),
  setMemberPrice: vi.fn(),
}));

vi.mock('@/services/product', () => ({
  listAllProducts: mocks.listProducts,
}));

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ProTable: ({
    toolBarRender,
    columns,
  }: {
    toolBarRender?: () => React.ReactNode[];
    columns: Array<Record<string, unknown>>;
  }) => {
    const isMemberPriceTable = columns.some((column) => column.title === '条形码');
    const actionColumn = columns.find((column) => column.title === '操作');
    const renderAction = actionColumn?.render as
      | ((value: unknown, record: Record<string, unknown>) => React.ReactNode)
      | undefined;
    return (
      <div>
        {toolBarRender?.()}
        {isMemberPriceTable
          ? renderAction?.(undefined, {
              product_id: 'sku-1',
              level_id: 'level-1',
              barcode: '商品-001',
              product_name: '测试商品',
              level_name: '金卡',
              price: 88.5,
            })
          : null}
      </div>
    );
  },
  ModalForm: ({
    open,
    title,
    children,
    initialValues,
  }: {
    open: boolean;
    title: string;
    children: React.ReactNode;
    initialValues?: unknown;
  }) => (open ? <div role="dialog" aria-label={title}>{children}<span>{JSON.stringify(initialValues)}</span></div> : null),
  ProFormText: ({ label }: { label: string }) => <input aria-label={label} />,
  ProFormDigit: ({ label }: { label: string }) => <input aria-label={label} type="number" />,
  ProFormSelect: ({ label }: { label: string }) => <select aria-label={label} />,
  ProFormSwitch: ({ label }: { label: string }) => <input aria-label={label} type="checkbox" />,
}));

describe('Level management', () => {
  beforeEach(() => {
    mocks.createLevel.mockReset();
    mocks.listLevels.mockResolvedValue([]);
    mocks.listProducts.mockResolvedValue([]);
  });

  it('does not expose obsolete discount or points fields', async () => {
    render(<Level />);

    fireEvent.click(screen.getByRole('button', { name: '新建等级' }));

    expect(await screen.findByLabelText('等级名称')).toBeInTheDocument();
    expect(screen.queryByLabelText('折扣率')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('积分倍率')).not.toBeInTheDocument();
  });

});
