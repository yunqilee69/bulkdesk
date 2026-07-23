export type DraftSubmissionCandidate = {
  items: readonly unknown[];
  version: number;
};

export function validateDraftSubmission(draft: DraftSubmissionCandidate): string | null {
  if (draft.items.length === 0) {
    return '请至少添加一件商品';
  }
  if (draft.version <= 0) {
    return '草稿版本无效';
  }
  return null;
}
