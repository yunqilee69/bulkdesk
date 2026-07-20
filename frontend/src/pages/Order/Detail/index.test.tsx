import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import OrderDetailPage from './index';

const mocks = vi.hoisted(() => ({
  getOrder: vi.fn(),
}));

vi.mock('@umijs/max', () => ({
  useParams: () => ({ id: 'order-1' }),
}));

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock('@/services/order', () => ({
  getOrder: mocks.getOrder,
}));

const orderDetail = {
  id: 'order-1',
  order_no: 'SO20260720001',
  customer_id: 'customer-1',
  customer_name: '客户甲',
  total_amount: 368.5,
  status: 'stocked_out',
  remark: '下午送达',
  shipping_started_at: '2026-07-20T08:00:00',
  shipping_started_by: '管理员',
  stock_out_at: '2026-07-20T09:00:00',
  stock_out_by: '仓库员',
  delivered_at: null,
  delivered_by: null,
  paid_at: '2026-07-20T10:00:00',
  paid_by: '收银员',
  paid_amount: 360,
  payment_proof_image_urls: ['https://example.com/payment.jpg'],
  cancelled_at: null,
  cancelled_by: null,
  cancel_reason: null,
  created_at: '2026-07-20T07:00:00',
  updated_at: '2026-07-20T09:00:00',
  items: [
    {
      id: 'item-1',
      order_id: 'order-1',
      product_id: 'product-1',
      product_name: '矿泉水',
      barcode: '690000000001',
      quantity: 3,
      unit_price: 10,
      subtotal: 30,
      allocations: [
        {
          id: 'allocation-1',
          order_id: 'order-1',
          order_item_id: 'item-1',
          product_id: 'product-1',
          warehouse_id: 'warehouse-1',
          warehouse_name: '主仓库',
          quantity: 3,
          status: 'shipped',
        },
      ],
    },
  ],
  status_logs: [
    {
      id: 'log-1',
      order_id: 'order-1',
      from_status: 'shipping',
      to_status: 'stocked_out',
      operator: '仓库员',
      remark: '确认出库',
      created_at: '2026-07-20T09:00:00',
    },
  ],
  delivery: {
    id: 'delivery-1',
    status: 'delivering',
    delivery_employee_id: 'employee-1',
    delivery_employee_name: '配送员甲',
    recipient_name: '收货人甲',
    recipient_phone: '13800000000',
    delivery_address: '上海市静安区',
    assigned_at: '2026-07-20T09:00:00',
    signer_name: null,
    signed_at: null,
    proof_image_urls: [],
    sign_remark: null,
    signed_by_id: null,
    signed_by_name: null,
    latest_exception: null,
  },
};

describe('OrderDetailPage', () => {
  beforeEach(() => {
    mocks.getOrder.mockReset();
    mocks.getOrder.mockResolvedValue({ code: 0, data: orderDetail });
  });

  it('loads the order and shows order, item, status, and delivery details', async () => {
    render(<OrderDetailPage />);

    await waitFor(() => expect(mocks.getOrder).toHaveBeenCalledWith('order-1'));
    expect(await screen.findByText('SO20260720001')).toBeInTheDocument();
    expect(screen.getByText('矿泉水')).toBeInTheDocument();
    expect(screen.getByText('主仓库：3')).toBeInTheDocument();
    expect(screen.getByText('配送员甲')).toBeInTheDocument();
    expect(screen.getByText('配送中')).toBeInTheDocument();
    expect(screen.getByText('收货人甲 13800000000')).toBeInTheDocument();
    expect(screen.getAllByText('确认出库')).toHaveLength(2);
    expect(screen.getByText('¥360.00')).toBeInTheDocument();
    expect(screen.getByText('¥8.50')).toBeInTheDocument();
    expect(screen.getByText('1 张')).toBeInTheDocument();
  });

  it('renders payment and delivery proof images for preview', async () => {
    mocks.getOrder.mockResolvedValue({
      code: 0,
      data: {
        ...orderDetail,
        delivery: {
          ...orderDetail.delivery,
          status: 'signed',
          signer_name: '收货人甲',
          signed_at: '2026-07-20T11:00:00',
          proof_image_urls: ['https://example.com/sign-proof.jpg'],
        },
      },
    });

    render(<OrderDetailPage />);

    expect(await screen.findByAltText('付款凭证 1')).toHaveAttribute('src', 'https://example.com/payment.jpg');
    expect(screen.getByAltText('签收凭证 1')).toHaveAttribute('src', 'https://example.com/sign-proof.jpg');
  });

  it('shows an error state when the order cannot be loaded', async () => {
    mocks.getOrder.mockResolvedValue({ code: 404, message: '订单不存在' });

    render(<OrderDetailPage />);

    expect(await screen.findByText('订单不存在')).toBeInTheDocument();
  });
});
