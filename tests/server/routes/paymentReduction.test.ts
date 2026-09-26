import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/server/services/supabase', () => ({ supabase: null }));

import ordersRouter from '../../../src/server/routes/siparisler';
import * as state from '../../../src/server/services/state';

// A3: a recorded collection must not be erased. Only the patron may lower
// alinan_tutar, with a reason that is written to the order history.
function app(role: string) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as any).tenantId = 'tenant-a';
    (req as any).auth = { userId: `user-${role}`, role, tenantId: 'tenant-a' };
    next();
  });
  server.use('/api', ordersRouter);
  return server;
}
const paid = () => ({
  id: 'order-paid',
  tenant_id: 'tenant-a',
  musteri_adi: 'Synthetic Customer',
  urun_aciklamasi: 'Bag',
  adet: 1,
  toplam_tutar: 100,
  alinan_tutar: 50,
  kalan_tutar: 50,
  para_birimi: 'AZN',
  finans_durumu: 'KISMI_ODEME',
  lojistik_durumu: 'KANADA_DEPO',
  eksik_bilgiler: [],
  olusturma_tarihi: '2026-09-01T10:00:00Z',
});
const stored = () => state.siparislerVeritabani.find((row) => row.id === 'order-paid');
const patch = (role: string, body: Record<string, unknown>) =>
  request(app(role)).patch('/api/siparisler/order-paid').send(body);

beforeEach(() => state.setSiparislerVeritabani([paid()]));

describe('Recorded collections cannot be erased', () => {
  it.each(['SATIS_SORUMLUSU', 'BAKU_FINANS', 'SUPER_ADMIN'])(
    '%s cannot lower the collected amount, not even to mark it unpaid',
    async (role) => {
      const before = structuredClone(stored());
      const response = await patch(role, { alinan_tutar: 0, finans_durumu: 'BEKLIYOR' });
      expect(response.status).toBe(403);
      expect(stored()).toEqual(before);
    }
  );

  it('still lets the finance role record more money', async () => {
    const response = await patch('BAKU_FINANS', { alinan_tutar: 100 });
    expect(response.status).toBe(200);
    expect(stored()).toMatchObject({ alinan_tutar: 100, finans_durumu: 'ODENDI' });
  });

  it('requires a reason when the patron lowers it', async () => {
    const before = structuredClone(stored());
    for (const body of [{ alinan_tutar: 20 }, { alinan_tutar: 20, duzeltme_gerekcesi: ' ab ' }]) {
      const response = await patch('PATRON', body);
      expect(response.status).toBe(400);
    }
    expect(stored()).toEqual(before);
  });

  it('lets the patron correct it with a reason and records the correction', async () => {
    const response = await patch('PATRON', {
      alinan_tutar: 20,
      duzeltme_gerekcesi: 'Yanlışlıkla 50 yazılmış, 20 alındı',
    });
    expect(response.status).toBe(200);
    expect(stored()).toMatchObject({ alinan_tutar: 20, finans_durumu: 'KISMI_ODEME' });
    expect(stored()?.islem_gecmisi).toEqual([
      expect.objectContaining({
        yapan_rol: 'PATRON',
        yapan_kisi: 'user-PATRON',
        eylem: 'TAHSILAT_AZALTILDI',
        aciklama: expect.stringContaining('50 → 20 AZN'),
      }),
    ]);
    expect(stored()?.islem_gecmisi?.[0].aciklama).toContain('Yanlışlıkla 50 yazılmış');
  });
});
