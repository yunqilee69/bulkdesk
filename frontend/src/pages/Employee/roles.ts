export const employeeRoles = [
  'admin',
  'warehouse_manager',
  'delivery',
  'finance',
] as const satisfies readonly API.EmployeeRole[];

export const roleLabels: Record<API.EmployeeRole, string> = {
  admin: '管理员',
  warehouse_manager: '仓库管理员',
  delivery: '配送员',
  finance: '财务',
};

export const roleColors: Record<API.EmployeeRole, string> = {
  admin: 'blue',
  warehouse_manager: 'green',
  delivery: 'orange',
  finance: 'purple',
};

export const roleOptions = employeeRoles.map((role) => ({
  label: roleLabels[role],
  value: role,
}));

export function normalizeEmployeeRoles(roles: readonly unknown[] | undefined): API.EmployeeRole[] {
  const selected = new Set(roles);
  return employeeRoles.filter((role) => selected.has(role));
}
