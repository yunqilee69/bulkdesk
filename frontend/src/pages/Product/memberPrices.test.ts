import { describe, expect, it } from 'vitest';

import { getChangedMemberPriceItems, getMemberPriceChangeState } from './memberPrices';

describe('member price helpers', () => {
  it('identifies new and changed prices without requiring a reason', () => {
    expect(
      getChangedMemberPriceItems([
        { level_id: 'normal', level_name: '普通会员', price: undefined, draftPrice: 50 },
        { level_id: 'gold', level_name: '黄金会员', price: 80, draftPrice: 90 },
        { level_id: 'platinum', level_name: '铂金会员', price: 100, draftPrice: 100 },
        { level_id: 'silver', level_name: '白银会员', price: undefined, draftPrice: undefined },
      ]),
    ).toEqual([
      { level_id: 'normal', price: 50 },
      { level_id: 'gold', price: 90 },
    ]);
  });

  it('labels rows by their pending change state', () => {
    expect(getMemberPriceChangeState({ level_id: 'normal', level_name: '普通会员', price: undefined, draftPrice: 50 })).toBe('新增');
    expect(getMemberPriceChangeState({ level_id: 'gold', level_name: '黄金会员', price: 80, draftPrice: 90 })).toBe('已修改');
    expect(getMemberPriceChangeState({ level_id: 'platinum', level_name: '铂金会员', price: 100, draftPrice: 100 })).toBe('未变更');
  });
});
