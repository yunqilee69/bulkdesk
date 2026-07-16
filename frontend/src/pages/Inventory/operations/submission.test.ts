import { describe, expect, it, vi } from 'vitest';
import { runWithSubmissionLock } from './submission';

describe('runWithSubmissionLock', () => {
  it('releases the lock when the request rejects', async () => {
    const lock = { current: false };

    await expect(
      runWithSubmissionLock(lock, async () => {
        throw new Error('network failure');
      }),
    ).rejects.toThrow('network failure');

    const retry = vi.fn().mockResolvedValue(undefined);
    await runWithSubmissionLock(lock, retry);

    expect(retry).toHaveBeenCalledOnce();
    expect(lock.current).toBe(false);
  });

  it('ignores a second request while one is running', async () => {
    const lock = { current: true };
    const task = vi.fn();

    await runWithSubmissionLock(lock, task);

    expect(task).not.toHaveBeenCalled();
  });

  it('reports loading state around the request', async () => {
    const lock = { current: false };
    const states: boolean[] = [];

    await runWithSubmissionLock(lock, async () => undefined, (loading) => {
      states.push(loading);
    });

    expect(states).toEqual([true, false]);
  });
});
