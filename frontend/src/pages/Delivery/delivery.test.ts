import type { UploadFile } from 'antd';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  createDeliveryException,
  getDeliveryDetail,
  listCurrentDeliveries,
  listDeliveryArchive,
  listDeliveryEmployeeOptions,
  reassignDelivery,
  signDelivery,
} from '@/services/delivery';
import type { OrderDeliverySignInput } from '@/services/delivery';
import * as orderService from '@/services/order';
import type {
  listOrders,
  OrderDeliveryOrderSummary,
  OrderOut,
  OrderRecord,
} from '@/services/order';
import {
  extractDeliveryProofUrls,
  getDeliveryActions,
  canHandleDelivery,
  getDeliveryEventLabel,
  getDeliveryExceptionLabel,
  getDeliveryStatusLabel,
  normalizeCurrentGroupMetrics,
  serializeArchiveFilters,
  validateDeliveryException,
} from './delivery';

const requestMock = vi.hoisted(() => vi.fn());

vi.mock('@umijs/max', () => ({ request: requestMock }));

function proofFile(
  status: UploadFile<{ url?: string; data?: { url?: string } }>['status'],
  response?: { url?: string; data?: { url?: string } },
  url?: string,
): UploadFile<{ url?: string; data?: { url?: string } }> {
  return {
    uid: `${status}-${response?.url ?? response?.data?.url ?? url ?? 'none'}`,
    name: 'proof.png',
    status,
    response,
    url,
  };
}

describe('delivery helpers', () => {
  it('requires a normal employee to own the delivery before handling it', () => {
    expect(canHandleDelivery(false, true, 'delivering')).toBe(true);
    expect(canHandleDelivery(false, false, 'delivering')).toBe(false);
  });
  it('maps delivery status, event and exception labels', () => {
    expect(getDeliveryStatusLabel('delivering')).toBe('配送中');
    expect(getDeliveryStatusLabel('signed')).toBe('已签收');
    expect(getDeliveryEventLabel('assigned')).toBe('已分配');
    expect(getDeliveryEventLabel('reassigned')).toBe('已改派');
    expect(getDeliveryEventLabel('exception')).toBe('配送异常');
    expect(getDeliveryEventLabel('signed')).toBe('已签收');
    expect(getDeliveryExceptionLabel('customer_absent')).toBe('客户不在');
    expect(getDeliveryExceptionLabel('customer_refused')).toBe('客户拒收');
    expect(getDeliveryExceptionLabel('invalid_contact')).toBe('地址或联系方式有误');
    expect(getDeliveryExceptionLabel('other')).toBe('其他');
  });

  it('normalizes missing current group metrics to safe defaults', () => {
    expect(
      normalizeCurrentGroupMetrics({
        order_count: undefined,
        customer_count: null,
        product_quantity: 12,
        total_amount: undefined,
        exception_order_count: null,
      }),
    ).toEqual({
      order_count: 0,
      customer_count: 0,
      product_quantity: 12,
      total_amount: 0,
      exception_order_count: 0,
    });
  });

  it('serializes archive filters with signed dates and pagination', () => {
    const signedFrom = {
      format: (pattern: string) => (pattern === 'YYYY-MM-DD' ? '2026-07-01' : ''),
    };
    const signedTo = {
      format: (pattern: string) => (pattern === 'YYYY-MM-DD' ? '2026-07-19' : ''),
    };

    expect(
      serializeArchiveFilters({
        current: 3,
        pageSize: 50,
        employee_id: 'employee-1',
        order_keyword: ' ORD-001 ',
        customer_keyword: ' 客户甲 ',
        signer_keyword: ' 张三 ',
        signed_range: [signedFrom, signedTo],
      }),
    ).toEqual({
      page: 3,
      page_size: 50,
      employee_id: 'employee-1',
      order_keyword: 'ORD-001',
      customer_keyword: '客户甲',
      signer_keyword: '张三',
      signed_from: '2026-07-01',
      signed_to: '2026-07-19',
    });
  });

  it('requires a trimmed remark for other exceptions', () => {
    expect(validateDeliveryException({ exception_type: 'other', remark: '   ' })).toBe(
      '其他异常必须填写说明',
    );
    expect(
      validateDeliveryException({ exception_type: 'other', remark: ' 客户要求改日配送 ' }),
    ).toBeUndefined();
    expect(
      validateDeliveryException({ exception_type: 'customer_absent', remark: '   ' }),
    ).toBeUndefined();
  });

  it('extracts proof URLs only from completed uploads', () => {
    expect(
      extractDeliveryProofUrls([
        proofFile('done', { url: 'https://example.com/canonical.png' }),
        proofFile('done', { data: { url: 'https://example.com/nested.png' } }),
        proofFile('done', undefined, 'https://example.com/existing.png'),
        proofFile('uploading', { url: 'https://example.com/uploading.png' }),
        proofFile('error', { url: 'https://example.com/error.png' }),
        proofFile('done', { data: {} }),
      ]),
    ).toEqual([
      'https://example.com/canonical.png',
      'https://example.com/nested.png',
      'https://example.com/existing.png',
    ]);
  });

  it('allows administrators to act on all current deliveries and normal employees only on their own', () => {
    expect(getDeliveryActions('admin', false, 'delivering')).toEqual([
      'sign',
      'exception',
      'reassign',
    ]);
    expect(getDeliveryActions('normal', true, 'delivering')).toEqual(['sign', 'exception']);
    expect(getDeliveryActions('normal', false, 'delivering')).toEqual([]);
    expect(getDeliveryActions('admin', true, 'signed')).toEqual([]);
  });
});

describe('delivery services', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it('uses the exact delivery API paths and methods', async () => {
    await listDeliveryEmployeeOptions();
    await listCurrentDeliveries({ employee_id: 'employee-1', has_exception: true });
    await listDeliveryArchive({
      page: 2,
      page_size: 20,
      signed_from: '2026-07-01',
      signed_to: '2026-07-19',
    });
    await getDeliveryDetail('delivery-1');
    await reassignDelivery('delivery-1', {
      delivery_employee_id: 'employee-2',
      reason: '调度调整',
    });
    await createDeliveryException('delivery-1', {
      exception_type: 'customer_absent',
      remark: '客户不在',
    });
    const signInput: OrderDeliverySignInput = {
      signer_name: '张三',
      remark: '已签收',
    };
    await signDelivery('delivery-1', signInput);

    expect(requestMock.mock.calls).toEqual([
      ['/api/v1/deliveries/employee-options', { method: 'GET' }],
      [
        '/api/v1/deliveries/current',
        { method: 'GET', params: { employee_id: 'employee-1', has_exception: true } },
      ],
      [
        '/api/v1/deliveries/archive',
        {
          method: 'GET',
          params: {
            page: 2,
            page_size: 20,
            signed_from: '2026-07-01',
            signed_to: '2026-07-19',
          },
        },
      ],
      ['/api/v1/deliveries/delivery-1', { method: 'GET' }],
      [
        '/api/v1/deliveries/delivery-1/reassign',
        {
          method: 'PUT',
          data: { delivery_employee_id: 'employee-2', reason: '调度调整' },
        },
      ],
      [
        '/api/v1/deliveries/delivery-1/exceptions',
        {
          method: 'POST',
          data: { exception_type: 'customer_absent', remark: '客户不在' },
        },
      ],
      [
        '/api/v1/deliveries/delivery-1/sign',
        {
          method: 'PUT',
          data: {
            signer_name: '张三',
            remark: '已签收',
          },
        },
      ],
    ]);
  });

  it('sends the exact typed stock-out body and removes direct delivery', async () => {
    const data: orderService.OrderStockOutInput = {
      delivery_employee_id: 'employee-1',
      recipient_name: '李四',
      recipient_phone: '13800000000',
      delivery_address: '上海市客户地址',
    };

    await orderService.stockOutOrder('order-1', data);

    expect(requestMock).toHaveBeenCalledWith('/api/v1/orders/order-1/stock-out', {
      method: 'PUT',
      data,
    });
    expect('deliverOrder' in orderService).toBe(false);
  });

  it('keeps frontend order contracts aligned with the complete backend response', () => {
    const order: OrderOut = {
      id: 'order-1',
      order_no: 'ORD-001',
      customer_id: 'customer-1',
      customer_name: null,
      total_amount: 100,
      status: 'stocked_out',
      remark: null,
      shipping_started_at: null,
      shipping_started_by: null,
      stock_out_at: '2026-07-19 10:00:00',
      stock_out_by: '管理员',
      delivered_at: null,
      delivered_by: null,
      paid_at: null,
      paid_by: null,
      paid_amount: null,
      payment_proof_image_urls: [],
      cancelled_at: null,
      cancelled_by: null,
      cancel_reason: null,
      created_at: '2026-07-19 09:00:00',
      updated_at: '2026-07-19 10:00:00',
      items: [
        {
          id: 'item-1',
          order_id: 'order-1',
          product_id: 'product-1',
          product_name: '商品 A',
          barcode: 'A001',
          quantity: 2,
          unit_price: 50,
          subtotal: 100,
          allocations: [
            {
              id: 'allocation-1',
              order_id: 'order-1',
              order_item_id: 'item-1',
              product_id: 'product-1',
              warehouse_id: 'warehouse-1',
              warehouse_name: null,
              quantity: 2,
              status: 'shipped',
            },
          ],
        },
      ],
      status_logs: [
        {
          id: 'log-1',
          order_id: 'order-1',
          from_status: null,
          to_status: 'placed',
          operator: null,
          remark: null,
          created_at: '2026-07-19 09:00:00',
        },
      ],
      delivery: null,
    };
    const record: OrderRecord = order;

    expect(record.items[0].allocations[0].warehouse_name).toBeNull();
    expectTypeOf<OrderRecord>().toEqualTypeOf<OrderOut>();
    expectTypeOf<Awaited<ReturnType<typeof listOrders>>>().toEqualTypeOf<
      API.ResponseBase<API.PaginatedData<OrderOut>>
    >();
    expectTypeOf<
      Pick<
        OrderDeliveryOrderSummary,
        'signer_name' | 'signed_at' | 'sign_remark' | 'signed_by_id' | 'signed_by_name'
      >
    >().toEqualTypeOf<{
      signer_name: string | null;
      signed_at: string | null;
      sign_remark: string | null;
      signed_by_id: string | null;
      signed_by_name: string | null;
    }>();
  });
});
