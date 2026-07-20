export interface ShipmentSourceAllocation {
  warehouse_id: string;
  warehouse_name?: string;
  quantity: number;
  status: string;
}

export interface ShipmentSourceItem {
  id: string;
  product_id: string;
  product_name: string;
  barcode: string;
  quantity: number;
  allocations?: ShipmentSourceAllocation[];
}

export interface ShipmentAllocationDraft {
  draft_id: string;
  warehouse_id?: string;
  quantity: number;
}

export interface ShipmentItemDraft {
  order_item_id: string;
  product_id: string;
  product_name: string;
  barcode: string;
  ordered_quantity: number;
  allocations: ShipmentAllocationDraft[];
}

export interface ShipmentWarehouseAvailability {
  warehouse_id: string;
  warehouse_name: string;
  available_quantity: number;
}

export type ShipmentAvailabilityMap = Record<
  string,
  Record<string, ShipmentWarehouseAvailability>
>;

export type OrderAction =
  | 'startShipping'
  | 'adjustAllocations'
  | 'stockOut'
  | 'complete'
  | 'cancel';

const actionsByStatus: Record<string, OrderAction[]> = {
  placed: ['startShipping', 'cancel'],
  shipping: ['adjustAllocations', 'stockOut', 'cancel'],
  stocked_out: [],
  delivered_unpaid: ['complete'],
  completed: [],
  cancelled: [],
};

export function getAvailableOrderActions(status: string): OrderAction[] {
  return actionsByStatus[status] ?? [];
}

export function buildShipmentDraft(items: ShipmentSourceItem[]): ShipmentItemDraft[] {
  return items.map((item) => {
    const activeAllocations = (item.allocations ?? []).filter(
      (allocation) => allocation.status === 'reserved' || allocation.status === 'shipped',
    );
    return {
      order_item_id: item.id,
      product_id: item.product_id,
      product_name: item.product_name,
      barcode: item.barcode,
      ordered_quantity: item.quantity,
      allocations:
        activeAllocations.length > 0
          ? activeAllocations.map((allocation) => ({
              draft_id: `${item.id}:${allocation.warehouse_id}`,
              warehouse_id: allocation.warehouse_id,
              quantity: allocation.quantity,
            }))
          : [{ draft_id: `${item.id}:unassigned`, warehouse_id: undefined, quantity: item.quantity }],
    };
  });
}

export function toWarehouseSelectOptions(warehouses: ShipmentWarehouseAvailability[]) {
  return warehouses.map((warehouse) => ({
    label: `${warehouse.warehouse_name}（可分配 ${warehouse.available_quantity}）`,
    value: warehouse.warehouse_id,
    disabled: warehouse.available_quantity === 0,
  }));
}

export function validateShipmentDraft(
  draft: ShipmentItemDraft[],
  availabilityMap?: ShipmentAvailabilityMap,
): string | undefined {
  for (const item of draft) {
    if (item.allocations.some((allocation) => !allocation.warehouse_id)) {
      return `${item.product_name} 还有未选择仓库的发货明细`;
    }
    const warehouseIds = item.allocations.map((allocation) => allocation.warehouse_id);
    if (new Set(warehouseIds).size !== warehouseIds.length) {
      return `${item.product_name} 不能重复选择同一仓库`;
    }
    if (item.allocations.some((allocation) => allocation.quantity < 1)) {
      return `${item.product_name} 的发货数量必须大于 0`;
    }
    for (const allocation of item.allocations) {
      const availability = availabilityMap?.[item.order_item_id]?.[allocation.warehouse_id as string];
      if (availability && allocation.quantity > availability.available_quantity) {
        return `${item.product_name} 在${availability.warehouse_name}最多可分配 ${availability.available_quantity}`;
      }
    }
    const total = item.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
    if (total !== item.ordered_quantity) {
      return `${item.product_name} 的发货数量合计必须等于 ${item.ordered_quantity}`;
    }
  }
  return undefined;
}

export function toShipmentRequest(draft: ShipmentItemDraft[]) {
  return {
    allocations: draft.flatMap((item) =>
      item.allocations.map((allocation) => ({
        order_item_id: item.order_item_id,
        warehouse_id: allocation.warehouse_id as string,
        quantity: allocation.quantity,
      })),
    ),
  };
}
