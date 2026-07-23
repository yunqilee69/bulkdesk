import { describe, expect, it } from 'vitest';

import proxy, { defaultApiTarget } from '../../config/proxy';

describe('frontend dev proxy', () => {
  it('defaults to the backend port used by the root dev script', () => {
    expect(defaultApiTarget).toBe('http://localhost:9000');
    expect(proxy.dev['/api/'].target).toBe('http://localhost:9000');
  });
});
