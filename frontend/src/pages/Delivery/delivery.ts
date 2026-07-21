import type { UploadFile } from 'antd';

import type {
  OrderDeliveryArchiveParams,
  OrderDeliveryEventType,
  OrderDeliveryExceptionRequest,
  OrderDeliveryExceptionType,
  OrderDeliveryStatus,
} from '@/services/delivery';

const statusLabels: Record<OrderDeliveryStatus, string> = {
  delivering: '配送中',
  signed: '已签收',
};

const eventLabels: Record<OrderDeliveryEventType, string> = {
  assigned: '已分配',
  reassigned: '已改派',
  exception: '配送异常',
  signed: '已签收',
};

const exceptionLabels: Record<OrderDeliveryExceptionType, string> = {
  customer_absent: '客户不在',
  customer_refused: '客户拒收',
  invalid_contact: '地址或联系方式有误',
  other: '其他',
};

export function getDeliveryStatusLabel(status: OrderDeliveryStatus) {
  return statusLabels[status];
}

export function getDeliveryEventLabel(eventType: OrderDeliveryEventType) {
  return eventLabels[eventType];
}

export function getDeliveryExceptionLabel(exceptionType: OrderDeliveryExceptionType) {
  return exceptionLabels[exceptionType];
}

export interface CurrentGroupMetrics {
  order_count: number;
  customer_count: number;
  product_quantity: number;
  total_amount: number;
  exception_order_count: number;
}

type NullableCurrentGroupMetrics = {
  [Metric in keyof CurrentGroupMetrics]?: number | null;
};

function safeMetric(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function normalizeCurrentGroupMetrics(
  metrics: NullableCurrentGroupMetrics,
): CurrentGroupMetrics {
  return {
    order_count: safeMetric(metrics.order_count),
    customer_count: safeMetric(metrics.customer_count),
    product_quantity: safeMetric(metrics.product_quantity),
    total_amount: safeMetric(metrics.total_amount),
    exception_order_count: safeMetric(metrics.exception_order_count),
  };
}

type ArchiveDateValue = string | { format: (pattern: string) => string };

export interface DeliveryArchiveFilters {
  current?: number;
  pageSize?: number;
  employee_id?: string;
  order_keyword?: string;
  customer_keyword?: string;
  signer_keyword?: string;
  signed_range?: [ArchiveDateValue | null | undefined, ArchiveDateValue | null | undefined];
}

function trimFilter(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function formatArchiveDate(value: ArchiveDateValue | null | undefined) {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.format('YYYY-MM-DD');
}

export function serializeArchiveFilters(
  filters: DeliveryArchiveFilters,
): OrderDeliveryArchiveParams {
  const [signedFrom, signedTo] = filters.signed_range ?? [];
  return {
    page: filters.current,
    page_size: filters.pageSize,
    employee_id: trimFilter(filters.employee_id),
    order_keyword: trimFilter(filters.order_keyword),
    customer_keyword: trimFilter(filters.customer_keyword),
    signer_keyword: trimFilter(filters.signer_keyword),
    signed_from: formatArchiveDate(signedFrom),
    signed_to: formatArchiveDate(signedTo),
  };
}

export function validateDeliveryException(data: OrderDeliveryExceptionRequest) {
  if (data.exception_type === 'other' && !data.remark?.trim()) {
    return '其他异常必须填写说明';
  }
  return undefined;
}

type DeliveryProofResponse = {
  url?: string;
  data?: {
    url?: string;
  };
};

export function extractDeliveryProofUrls(fileList: UploadFile<DeliveryProofResponse>[]) {
  return fileList.flatMap((file) => {
    if (file.status !== 'done') return [];
    const url = file.response?.url ?? file.response?.data?.url ?? file.url;
    return url ? [url] : [];
  });
}

export type DeliveryAction = 'sign' | 'exception' | 'reassign';
export type DeliveryUserRole = 'admin' | 'delivery';

export function canHandleDelivery(
  isAdmin: boolean,
  isAssignedToCurrentUser: boolean,
  status: OrderDeliveryStatus,
) {
  return status === 'delivering' && (isAdmin || isAssignedToCurrentUser);
}

export function canReassignDelivery(isAdmin: boolean, status: OrderDeliveryStatus) {
  return isAdmin && status === 'delivering';
}

export function getDeliveryActions(
  role: DeliveryUserRole,
  isOwnDelivery: boolean,
  status: OrderDeliveryStatus,
): DeliveryAction[] {
  if (status !== 'delivering') return [];
  if (role === 'admin') return ['sign', 'exception', 'reassign'];
  return isOwnDelivery ? ['sign', 'exception'] : [];
}
