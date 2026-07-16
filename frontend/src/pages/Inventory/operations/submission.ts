type SubmissionLock = { current: boolean };

export async function runWithSubmissionLock(
  lock: SubmissionLock,
  task: () => Promise<void>,
  onLoadingChange?: (loading: boolean) => void,
): Promise<void> {
  if (lock.current) return;

  lock.current = true;
  onLoadingChange?.(true);
  try {
    await task();
  } finally {
    lock.current = false;
    onLoadingChange?.(false);
  }
}
