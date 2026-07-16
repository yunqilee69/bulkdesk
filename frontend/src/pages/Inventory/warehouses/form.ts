export interface WarehouseFormValues {
  name: string;
  address?: string;
  contact_person?: string;
  contact_phone?: string;
  is_default?: boolean;
  status?: boolean;
}

export function normalizeWarehouseForm(values: WarehouseFormValues) {
  return {
    ...values,
    status: values.status ? ('active' as const) : ('disabled' as const),
  };
}
