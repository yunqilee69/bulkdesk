import type { InventoryItem } from '@/services/inventory';

type InventoryLoader = (warehouseId: string) => Promise<InventoryItem[]>;

export async function loadInventoryQuantities(
  warehouseId: string,
  load: InventoryLoader,
): Promise<Record<string, number>> {
  const items = await load(warehouseId);
  return Object.fromEntries(items.map((item) => [item.product_id, item.quantity]));
}
