export type MemberPriceRow = {
  level_id: string;
  level_name: string;
  price?: number | null;
  draftPrice?: number;
};

export function getChangedMemberPriceItems(rows: MemberPriceRow[]) {
  return rows.flatMap((row) => {
    if (row.draftPrice === undefined || row.draftPrice === row.price) return [];
    return [{ level_id: row.level_id, price: row.draftPrice }];
  });
}

export function getMemberPriceChangeState(row: MemberPriceRow) {
  if (row.draftPrice === undefined || row.draftPrice === row.price) return '未变更';
  return row.price === undefined || row.price === null ? '新增' : '已修改';
}
