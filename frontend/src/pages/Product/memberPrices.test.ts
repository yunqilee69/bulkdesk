import { describe, expect, it } from 'vitest';

import {
  createMemberPriceRows,
  getChangedMemberPriceItems,
  getEnteredMemberPriceItems,
  getMemberPriceChangeState,
  getValidatedChangedMemberPriceItems,
  normalizeMemberPrice,
} from './memberPrices';

describe('member price helpers', () => {
  it('creates empty member price rows from customer levels', () => {
    expect(
      createMemberPriceRows([
        { id: 'normal', name: '普通会员' },
        { id: 'gold', name: '黄金会员' },
      ]),
    ).toEqual([
      { level_id: 'normal', level_name: '普通会员', draftPrice: undefined },
      { level_id: 'gold', level_name: '黄金会员', draftPrice: undefined },
    ]);
  });

  it('submits only entered positive member prices', () => {
    expect(
      getEnteredMemberPriceItems([
        { level_id: 'normal', level_name: '普通会员', draftPrice: 50 },
        { level_id: 'gold', level_name: '黄金会员', draftPrice: 88 },
        { level_id: 'silver', level_name: '白银会员', draftPrice: undefined },
      ]),
    ).toEqual([
      { level_id: 'normal', price: 50 },
      { level_id: 'gold', price: 88 },
    ]);
  });

  it('rejects zero member prices', () => {
    expect(() => normalizeMemberPrice(0)).toThrow('会员价必须大于0');
  });

  it('keeps zero member-price drafts renderable but rejects them before saving', () => {
    const rows = [
      { level_id: 'normal', level_name: '普通会员', price: 80, draftPrice: 0 },
    ];

    expect(getChangedMemberPriceItems(rows)).toEqual([{ level_id: 'normal', price: 0 }]);
    expect(() => getValidatedChangedMemberPriceItems(rows)).toThrow('会员价必须大于0');
  });

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
