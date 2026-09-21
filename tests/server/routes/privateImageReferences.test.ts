import type { Request } from 'express';
import { beforeEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({ exists: vi.fn() }));
vi.mock('../../../src/server/services/privateImageStorage', () => ({
  assertPrivateImageExists: storage.exists,
  readPrivateImage: vi.fn(),
  writePrivateImage: vi.fn(),
}));
import { assertTenantImageReferences } from '../../../src/server/routes/gorsel';
import { tenantImagePrefix } from '../../../src/server/services/tenantImageNames';
const req = { auth: { role: 'PATRON' }, tenantId: 'synthetic-tenant' } as Request;
const url = (id: number, tenant = req.tenantId) =>
  `/uploads/${tenantImagePrefix(tenant!)}${id.toString(16).padStart(32, '0')}.png`;
beforeEach(() => {
  storage.exists.mockReset().mockResolvedValue(undefined);
});
it('authorizes every tenant reference before any storage lookup', async () => {
  await expect(assertTenantImageReferences(req, [url(1, 'foreign'), url(2)])).rejects.toMatchObject(
    { status: 404 }
  );
  expect(storage.exists).not.toHaveBeenCalled();
});
it('deduplicates repeated references in products and serialized META', async () => {
  await assertTenantImageReferences(req, {
    images: [url(1), url(1)],
    notes: JSON.stringify({ image: url(1) }),
  });
  expect(storage.exists).toHaveBeenCalledOnce();
});
it('caps simultaneous storage operations at four for a large valid batch', async () => {
  let active = 0,
    peak = 0;
  storage.exists.mockImplementation(async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
  });
  await assertTenantImageReferences(
    req,
    Array.from({ length: 25 }, (_, i) => url(i))
  );
  expect(storage.exists).toHaveBeenCalledTimes(25);
  expect(peak).toBe(4);
});
it('stops queued work when storage fails', async () => {
  storage.exists.mockRejectedValue(new Error('Synthetic failure'));
  await expect(
    assertTenantImageReferences(
      req,
      Array.from({ length: 25 }, (_, i) => url(i))
    )
  ).rejects.toThrow('Synthetic failure');
  expect(storage.exists).toHaveBeenCalledTimes(4);
});
it('fails instead of spending an unbounded time validating references', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(30001);
  try {
    await expect(assertTenantImageReferences(req, [url(1)])).rejects.toMatchObject({ status: 503 });
    expect(storage.exists).not.toHaveBeenCalled();
  } finally {
    now.mockRestore();
  }
});
