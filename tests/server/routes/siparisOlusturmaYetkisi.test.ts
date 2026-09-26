import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Codex R4 F19: a platform admin could not change a collected amount (PATCH, O-32) but
// could write one when creating an order: POST /api/siparisler, inbox approval and the
// AI auto-save path. F22: the detail-form field rights of OPEN_QUESTIONS 34 (customs
// identity, purchase price, store, invoice photo) are a data right, so they apply to
// every creation path as well as to the edit.
const environment = vi.hoisted(() => ({ ai: vi.fn() }));
vi.mock('../../../src/server/services/supabase', () => ({ supabase: null }));
vi.mock('../../../src/server/services/gemini', () => ({
  getGeminiClient: () => ({}),
  generateContentWithRetryAndFallback: environment.ai,
}));

import ordersRouter from '../../../src/server/routes/siparisler';
import inboxRouter from '../../../src/server/routes/inbox';
import * as state from '../../../src/server/services/state';

const TENANT = 'olusturma_yetkisi';
function app(role: string) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as any).tenantId = TENANT;
    (req as any).auth = { userId: 'u-' + role, role, tenantId: TENANT };
    next();
  });
  server.use('/api', ordersRouter);
  server.use('/api', inboxRouter);
  return server;
}
const order = (extra: Record<string, unknown> = {}) => ({
  musteri_adi: 'Aytən',
  urun_aciklamasi: 'Çanta',
  toplam_tutar: 100,
  ...extra,
});
const create = (role: string, extra: Record<string, unknown> = {}) =>
  request(app(role)).post('/api/siparisler').send(order(extra));
function inboxItem(oneri: Record<string, unknown> = order()) {
  const id = 'ib-' + randomUUID();
  state.onayBekleyenler.push({
    id,
    tenant_id: TENANT,
    gelis_tarihi: new Date().toISOString(),
    kaynak: 'WHATSAPP',
    gonderen_kullanici: '+994500000000',
    konusma_gecmisi: 'Salam, bir çanta',
    oneri_siparis: { ...oneri, tenant_id: TENANT },
    durum: 'BEKLEMEDE',
  });
  return id;
}
const approve = (role: string, id: string, duzeltilmis?: Record<string, unknown>) =>
  request(app(role))
    .post(`/api/inbox/${id}/onayla`)
    .send(duzeltilmis ? { duzeltilmis_siparis: duzeltilmis } : {});
function aiReturns(fields: Record<string, unknown>) {
  environment.ai.mockResolvedValue({
    text: JSON.stringify({
      musteri_adi: 'Aytən',
      urun_aciklamasi: 'Çanta',
      adet: 1,
      toplam_tutar: 100,
      ...fields,
    }),
  });
}
const aiSave = (role: string) =>
  request(app(role))
    .post('/api/ayristir-siparis')
    .send({ ham_mesaj: 'Aytən, bir çanta, 100 manat ödədi', otomatik_kaydet: true });
const tenantOrders = () => state.siparislerVeritabani.filter((s) => s.tenant_id === TENANT).length;

beforeEach(() => environment.ai.mockReset());

describe('the first collection follows the money-write rule on every creation path (Codex R4 F19)', () => {
  it('a platform admin creates no order with money received or a paid status', async () => {
    const before = tenantOrders();
    for (const extra of [
      { alinan_tutar: 100 },
      { alinan_tutar: 30 },
      { alinan_tutar: 0, finans_durumu: 'ODENDI' },
      { finans_durumu: 'KISMI_ODEME' },
    ]) {
      const response = await create('SUPER_ADMIN', extra);
      expect([extra, response.status]).toEqual([extra, 403]);
    }
    expect(tenantOrders()).toBe(before);
    // Without money the admin still creates the order; the team records the payment.
    expect((await create('SUPER_ADMIN', { alinan_tutar: 0 })).status).toBe(200);
    for (const role of ['PATRON', 'SATIS_SORUMLUSU'])
      expect([role, (await create(role, { alinan_tutar: 30 })).status]).toEqual([role, 200]);
    // Buyers write no collection on edit either (v1 field lists = PAYMENT_WRITE).
    expect((await create('KANADA_SATINALMA', { alinan_tutar: 30 })).status).toBe(403);
  });

  it('inbox approval refuses an admin approval that carries money, suggested or corrected', async () => {
    const suggested = inboxItem(order({ alinan_tutar: 50 }));
    expect((await approve('SUPER_ADMIN', suggested)).status).toBe(403);
    const corrected = inboxItem();
    expect(
      (await approve('SUPER_ADMIN', corrected, order({ finans_durumu: 'ODENDI' }))).status
    ).toBe(403);
    expect(state.onayBekleyenler.find((m) => m.id === corrected)?.durum).toBe('BEKLEMEDE');
    expect((await approve('SUPER_ADMIN', corrected, order({ alinan_tutar: 0 }))).status).toBe(200);
    expect((await approve('PATRON', suggested)).status).toBe(200);
  });

  it('the AI auto-save path refuses a parsed payment for the admin and saves nothing', async () => {
    const before = tenantOrders();
    aiReturns({ alinan_tutar: 100, finans_durumu: 'ODENDI' });
    expect((await aiSave('SUPER_ADMIN')).status).toBe(403);
    expect(tenantOrders()).toBe(before);
    aiReturns({ alinan_tutar: 100 });
    expect((await aiSave('PATRON')).status).toBe(200);
    expect(tenantOrders()).toBe(before + 1);
  });
});

describe('detail-form field rights apply to creation and to the edit (Codex R4 F22, O-34)', () => {
  const customs = { ek_veriler: { kanada_gumruk_fin_kodu: '5ABC123' } };
  const purchase = { ek_veriler: { kanada_alis_fiyati_cad: 45 } };

  it('sales writes no customs identity or purchase detail on create, approval or edit', async () => {
    for (const extra of [{ kanada_gumruk_pasaport_no: 'C01234567' }, customs, purchase])
      expect([extra, (await create('SATIS_SORUMLUSU', extra)).status]).toEqual([extra, 403]);
    const id = inboxItem();
    for (const body of [order(customs), order(purchase), order({ kanada_magaza_adi: 'Winners' })])
      expect([body, (await approve('SATIS_SORUMLUSU', id, body)).status]).toEqual([body, 403]);
    const created = await create('SATIS_SORUMLUSU');
    expect(created.status).toBe(200);
    const patch = await request(app('SATIS_SORUMLUSU'))
      .patch(`/api/siparisler/${created.body.siparis.id}`)
      .send({ kanada_gumruk_fin_kodu: '5ABC123' });
    expect(patch.status).toBe(403);
  });

  it('a platform admin writes purchase details but no customs identity', async () => {
    const id = inboxItem();
    expect((await approve('SUPER_ADMIN', id, order(customs))).status).toBe(403);
    expect((await create('SUPER_ADMIN', { kanada_gumruk_fin_kodu: '5ABC123' })).status).toBe(403);
    const approved = await approve(
      'SUPER_ADMIN',
      id,
      order({ ek_veriler: { kanada_magaza_adi: 'Winners' } })
    );
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.siparis.kanada_magaza_adi).toBe('Winners');
    const patch = await request(app('SUPER_ADMIN'))
      .patch(`/api/siparisler/${approved.body.siparis.id}`)
      .send({ kanada_gumruk_pasaport_no: 'C01234567' });
    expect(patch.status).toBe(403);
  });

  it('the owner approves with customs identity, checked and normalized like the edit', async () => {
    const bad = inboxItem();
    expect(
      (await approve('PATRON', bad, order({ ek_veriler: { kanada_gumruk_fin_kodu: '12' } }))).status
    ).toBe(400);
    const good = inboxItem();
    const approved = await approve(
      'PATRON',
      good,
      order({ ek_veriler: { kanada_gumruk_fin_kodu: '5abc123' } })
    );
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.siparis.kanada_gumruk_fin_kodu).toBe('5ABC123');
  });
});
