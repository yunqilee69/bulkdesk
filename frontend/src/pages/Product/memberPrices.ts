export type MemberPriceRow = {
  level_id: string;
  level_name: string;
  price?: number | null;
  draftPrice?: number;
};

export type MemberLevelOption = {
  id: string;
  name: string;
};

export function createMemberPriceRows(levels: MemberLevelOption[]): MemberPriceRow[] {
  return levels.map((level) => ({
    level_id: level.id,
    level_name: level.name,
    draftPrice: undefined,
  }));
}

export function normalizeMemberPrice(value: number): number {
  if (value <= 0) throw new Error('会员价必须大于0');
  return value;
}

export function getEnteredMemberPriceItems(rows: MemberPriceRow[]) {
  return rows.flatMap((row) =>
    row.draftPrice === undefined
      ? []
      : [{ level_id: row.level_id, price: normalizeMemberPrice(row.draftPrice) }],
  );
}

export function getChangedMemberPriceItems(rows: MemberPriceRow[]) {
  return rows.flatMap((row) => {
    if (row.draftPrice === undefined || row.draftPrice === row.price) return [];
    return [{ level_id: row.level_id, price: row.draftPrice }];
  });
}

export function getValidatedChangedMemberPriceItems(rows: MemberPriceRow[]) {
  return getChangedMemberPriceItems(rows).map((item) => ({
    ...item,
    price: normalizeMemberPrice(item.price),
  }));
}

export function getMemberPriceChangeState(row: MemberPriceRow) {
  if (row.draftPrice === undefined || row.draftPrice === row.price) return '未变更';
  return row.price === undefined || row.price === null ? '新增' : '已修改';
}
