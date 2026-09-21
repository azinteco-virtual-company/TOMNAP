import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({ db: null as any, deliver: vi.fn() }));
vi.mock('dotenv/config', () => ({}));
vi.mock('../../../src/server/services/supabase', () => ({
  get supabase() {
    return mocked.db;
  },
}));
vi.mock('../../../src/server/services/onboardingOutbox', () => ({
  deliverOnboardingEmail: mocked.deliver,
}));
const originalArguments = [...process.argv];
const originalExitCode = process.exitCode;
beforeEach(() => {
  vi.resetModules();
  mocked.deliver.mockReset();
  mocked.db = null;
  process.argv = ['node', 'retry-onboarding-emails.ts'];
  process.exitCode = 0;
});
afterEach(() => {
  process.argv = originalArguments;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

describe('Operator email retry worker', () => {
  it('refuses a standalone local writer before attempting any delivery', async () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {});
    await import('../../../scripts/retry-onboarding-emails');
    expect(process.exitCode).toBe(1);
    expect(mocked.deliver).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith(expect.stringContaining('requires Supabase'));
  });

  it('reports pending delivery instead of claiming complete success', async () => {
    mocked.db = {};
    mocked.deliver
      .mockResolvedValueOnce({ claimed: true, sent: false })
      .mockResolvedValueOnce({ claimed: false, sent: false });
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    await import('../../../scripts/retry-onboarding-emails');
    expect(process.exitCode).toBe(1);
    expect(output).toHaveBeenCalledWith(JSON.stringify({ claimed: 1, sent: 0, pendingRetry: 1 }));
  });
});
