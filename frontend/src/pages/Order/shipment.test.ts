import { describe, expect, it } from 'vitest';
import {
  buildShipmentDraft,
  getAvailableOrderActions,
  toWarehouseSelectOptions,
  toShipmentRequest,
  validateShipmentDraft,
} from './shipment';

describe('order shipment allocations', () => {
  const items = [
    {
      id: 'item-1',
      product_id: 'product-1',
      product_name: '商品 A',
      barcode: 'A001',
      quantity: 5,
      allocations: [
        { warehouse_id: 'warehouse-1', warehouse_name: '一号仓', quantity: 2, status: 'reserved' },
        { warehouse_id: 'warehouse-2', warehouse_name: '二号仓', quantity: 3, status: 'reserved' },
      ],
    },
  ];

  it('uses reserved warehouses as the editable shipment draft', () => {
    expect(buildShipmentDraft(items)).toEqual([
      {
        order_item_id: 'item-1',
        product_id: 'product-1',
        product_name: '商品 A',
        barcode: 'A001',
        ordered_quantity: 5,
        allocations: [
          { draft_id: 'item-1:warehouse-1', warehouse_id: 'warehouse-1', quantity: 2 },
          { draft_id: 'item-1:warehouse-2', warehouse_id: 'warehouse-2', quantity: 3 },
        ],
      },
    ]);
  });

  it('requires every item allocation total to equal its ordered quantity', () => {
    const draft = buildShipmentDraft(items);
    draft[0].allocations[1].quantity = 2;

    expect(validateShipmentDraft(draft)).toBe('商品 A 的发货数量合计必须等于 5');
  });

  it('flattens multi-warehouse rows for the shipment API', () => {
    expect(toShipmentRequest(buildShipmentDraft(items))).toEqual({
      allocations: [
        { order_item_id: 'item-1', warehouse_id: 'warehouse-1', quantity: 2 },
        { order_item_id: 'item-1', warehouse_id: 'warehouse-2', quantity: 3 },
      ],
    });
  });

  it('exposes only the actions allowed by each fulfillment status', () => {
    expect(getAvailableOrderActions('placed')).toEqual(['startShipping', 'cancel']);
    expect(getAvailableOrderActions('shipping')).toEqual([
      'adjustAllocations',
      'stockOut',
      'cancel',
    ]);
    expect(getAvailableOrderActions('stocked_out')).toEqual(['deliver']);
    expect(getAvailableOrderActions('delivered_unpaid')).toEqual(['complete']);
    expect(getAvailableOrderActions('completed')).toEqual([]);
    expect(getAvailableOrderActions('cancelled')).toEqual([]);
  });

  it('shows warehouse available quantity and disables empty warehouses', () => {
    expect(toWarehouseSelectOptions([
      { warehouse_id: 'w1', warehouse_name: '主仓', available_quantity: 12 },
      { warehouse_id: 'w2', warehouse_name: '备用仓', available_quantity: 0 },
    ])).toEqual([
      { label: '主仓（可分配 12）', value: 'w1', disabled: false },
      { label: '备用仓（可分配 0）', value: 'w2', disabled: true },
    ]);
  });

  it('rejects allocations above the selected warehouse availability', () => {
    const draft = buildShipmentDraft(items);
    draft[0].allocations[0].quantity = 9;
    draft[0].allocations[1].quantity = 1;

    expect(validateShipmentDraft(draft, {
      'item-1': {
        'warehouse-1': { warehouse_id: 'warehouse-1', warehouse_name: '一号仓', available_quantity: 8 },
        'warehouse-2': { warehouse_id: 'warehouse-2', warehouse_name: '二号仓', available_quantity: 3 },
      },
    })).toBe('商品 A 在一号仓最多可分配 8');
  });
});
