import { describe, expect, it } from 'vitest';
import { normalizeWarehouseForm } from './form';

describe('normalizeWarehouseForm', () => {
  it('maps a disabled switch and preserves contact fields', () => {
    expect(
      normalizeWarehouseForm({
        name: '备用仓',
        contact_person: '张三',
        contact_phone: '13800000000',
        status: false,
      }),
    ).toEqual({
      name: '备用仓',
      contact_person: '张三',
      contact_phone: '13800000000',
      status: 'disabled',
    });
  });

  it('maps an enabled switch to active', () => {
    expect(normalizeWarehouseForm({ name: '主仓', status: true })).toEqual({
      name: '主仓',
      status: 'active',
    });
  });
});
