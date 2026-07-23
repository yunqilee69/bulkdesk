import type { DeliveryStatus } from '../../api/delivery';

export type DeliveryAction = 'sign' | 'exception' | 'return';

export function getDeliveryActions(roles: readonly string[], ownsTask: boolean, status: DeliveryStatus): DeliveryAction[] {
  if (status !== 'delivering') {
    return [];
  }
  if (roles.includes('admin') || (roles.includes('delivery') && ownsTask)) {
    return ['sign', 'exception', 'return'];
  }
  return [];
}
