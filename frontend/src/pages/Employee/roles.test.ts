import { describe, expect, it } from 'vitest';

import { normalizeEmployeeRoles, roleOptions } from './roles';

describe('employee roles', () => {
  it('deduplicates roles while preserving fixed option order', () => {
    expect(normalizeEmployeeRoles(['delivery', 'warehouse_manager', 'delivery'])).toEqual(['warehouse_manager', 'delivery']);
  });

  it('contains all fixed business roles', () => {
    expect(roleOptions.map((option) => option.value)).toEqual([
      'admin',
      'warehouse_manager',
      'delivery',
      'finance',
    ]);
  });
});
