import fs from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/server/index';
import { UPLOADS_DIR } from '../../../src/server/config';
import {
  setFirmalarVeritabani,
  setKullanicilarVeritabani,
  setSiparislerVeritabani,
  setMusterilerVeritabani,
  setOnayBekleyenler,
  siparislerVeritabani,
  musterilerVeritabani,
  onayBekleyenler,
  firmalarVeritabani,
} from '../../../src/server/services/state';
import { loginFixture } from '../helpers/session';
import type {
  FirmaTenantItem,
  MusteriKaydi,
  OnayBekleyenKaydi,
  SiparisKaydi,
} from '../../../src/server/types';

// Real app, middleware, cookies, session persistence, CSRF, role rules and routers.
// Only synthetic tenant records are seeded; tests/setup.ts blocks external network.
const app = createApp();
const companyA = 'integration-company-a';
const companyB = 'integration-company-b';
const now = new Date().toISOString();
const companies = (): FirmaTenantItem[] =>
  [companyA, companyB].map((id) => ({
    id,
    ad: id,
    sehir: 'Baku',
    varsayilanParaBirimi: 'AZN',
    varsayilanKomisyonYuzdesi: 10,
    aciklama: 'Synthetic integration company',
    onayDurumu: 'AKTIF',
  }));
const customer = (id: string, tenant_id: string): MusteriKaydi => ({
  id,
  tenant_id,
  ad_soyad: 'Same customer display name',
  telefon: '+994501111111',
  adres: tenant_id === companyA ? 'Address A' : 'Private address B',
  musteri_tipi: 'TANIMADIK',
  toplam_siparis_sayisi: 0,
  toplam_harcama: 0,
  kalan_toplam_borc: 0,
  olusturma_tarihi: now,
  son_siparis_tarihi: now,
});
const order = (id: string, tenant_id: string, musteri_id: string, total: number): SiparisKaydi => ({
  id,
  tenant_id,
  musteri_id,
  musteri_adi: 'Same customer display name',
  telefon_numarasi: '+994501111111',
  olusturma_tarihi: now,
  ham_mesaj: 'Synthetic message',
  urun_aciklamasi: `Product ${id}`,
  adet: 1,
  toplam_tutar: total,
  alinan_tutar: 0,
  kalan_tutar: total,
  para_birimi: 'AZN',
  finans_durumu: 'BEKLIYOR',
  lojistik_durumu: 'KANADA_SATINALIM_BEKLIYOR',
  eksik_bilgiler: [],
  siparis_kaynagi: 'WHATSAPP',
});
const inbox = (id: string, tenant_id: string): OnayBekleyenKaydi => ({
  id,
  tenant_id,
  gelis_tarihi: now,
  kaynak: 'WHATSAPP',
  gonderen_kullanici: 'Synthetic sender',
  konusma_gecmisi: `Private message ${id}`,
  durum: 'BEKLEMEDE',
  oneri_siparis: {
    musteri_adi: `Inbox customer ${id}`,
    urun_aciklamasi: 'Inbox product',
    toplam_tutar: 80,
    alinan_tutar: 0,
    tenant_id,
  },
});

type Login = Awaited<ReturnType<typeof loginFixture>>;
let ownerA: Login;
let ownerB: Login;
let financeA: Login;
let salesA: Login;
let admin: Login;

beforeAll(async () => {
  setFirmalarVeritabani(companies());
  setKullanicilarVeritabani([]);
  ownerA = await loginFixture(app, 'PATRON', companyA);
  ownerB = await loginFixture(app, 'PATRON', companyB);
  financeA = await loginFixture(app, 'BAKU_FINANS', companyA);
  salesA = await loginFixture(app, 'SATIS_SORUMLUSU', companyA);
  admin = await loginFixture(app, 'SUPER_ADMIN', companyA);
});
beforeEach(() => {
  setFirmalarVeritabani(companies());
  setSiparislerVeritabani([
    order('order-a', companyA, 'customer-a', 100),
    order('order-b', companyB, 'customer-b', 900),
  ]);
  setMusterilerVeritabani([customer('customer-a', companyA), customer('customer-b', companyB)]);
  setOnayBekleyenler([inbox('inbox-a', companyA), inbox('inbox-b', companyB)]);
  fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
});

describe('Real session authorization and tenant integration', () => {
  it('blocks anonymous and case-alias reads through actual Express mounts', async () => {
    for (const url of [
      '/api/siparisler',
      '/api/musteriler',
      '/api/inbox',
      '/api/firmalar',
      '/api/kargo/ayarlar',
      '/API/siparisler',
      '/Api/musteriler',
      '/api/veritabani/yedek-al',
    ]) {
      const response = await request(app)
        .get(url)
        .set('x-api-key', 'legacy-key')
        .set('sec-fetch-site', 'same-origin');
      expect(response.status).toBe(401);
      expect(JSON.stringify(response.body)).not.toContain('Private address B');
    }
  });

  it('restores CSRF and identity from the cookie and applies CSRF before a real mutation', async () => {
    const restored = await request(app).get('/api/auth/oturum').set('Cookie', ownerA.cookie);
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({
      csrfToken: ownerA.csrfToken,
      kullanici: { id: ownerA.userId, rol: 'PATRON', tenantId: companyA },
    });
    expect(JSON.stringify(restored.body)).not.toMatch(
      /sifre_hash|credential_fingerprint|token_hash/
    );
    const denied = await request(app)
      .patch('/api/siparisler/order-a')
      .set('Cookie', ownerA.cookie)
      .send({ urun_aciklamasi: 'Missing CSRF' });
    expect(denied.status).toBe(403);
    expect(siparislerVeritabani[0].urun_aciklamasi).toBe('Product order-a');
    const permitted = await request(app)
      .patch('/api/siparisler/order-a')
      .set('Cookie', ownerA.cookie)
      .set('x-csrf-token', restored.body.csrfToken)
      .send({ urun_aciklamasi: 'Verified CSRF' });
    expect(permitted.status).toBe(200);
    expect((await ownerA.agent.get('/api/siparisler')).body.siparisler[0].urun_aciklamasi).toBe(
      'Verified CSRF'
    );
  });

  it('scopes real order and firm lists to each signed-in company', async () => {
    const listA = await ownerA.agent.get('/api/siparisler');
    const listB = await ownerB.agent.get('/api/siparisler');
    expect(listA.status).toBe(200);
    expect(listB.status).toBe(200);
    expect(listA.body.siparisler.map((row: any) => row.id)).toEqual(['order-a']);
    expect(listB.body.siparisler.map((row: any) => row.id)).toEqual(['order-b']);
    const firms = await ownerA.agent.get('/api/firmalar');
    expect(firms.body.firmalar.map((row: any) => row.id)).toEqual([companyA]);
    expect(firms.body.siparis_sayilari).toEqual({ [companyA]: 1 });
  });

  it('rejects cross-tenant order PATCH and DELETE without changing either tenant', async () => {
    const before = structuredClone(siparislerVeritabani);
    expect(
      (
        await ownerA.agent
          .patch('/api/siparisler/order-b')
          .send({ urun_aciklamasi: 'Attacker change' })
      ).status
    ).toBe(404);
    expect((await ownerA.agent.delete('/api/siparisler/order-b').send({})).status).toBe(404);
    expect(siparislerVeritabani).toEqual(before);
    expect(
      (
        await ownerB.agent
          .patch('/api/siparisler/order-b')
          .send({ urun_aciklamasi: 'Owner B change' })
      ).status
    ).toBe(200);
    expect((await ownerA.agent.delete('/api/siparisler/order-a').send({})).status).toBe(200);
    expect(siparislerVeritabani).toHaveLength(1);
    expect(siparislerVeritabani[0]).toMatchObject({
      id: 'order-b',
      tenant_id: companyB,
      urun_aciklamasi: 'Owner B change',
    });
  });

  it('does not join same-name/same-phone customer histories across tenants', async () => {
    const listed = await financeA.agent.get('/api/musteriler');
    expect(listed.status).toBe(200);
    expect(listed.body.musteriler).toHaveLength(1);
    expect(listed.body.musteriler[0]).toMatchObject({
      id: 'customer-a',
      toplam_siparis_sayisi: 1,
      toplam_harcama: 100,
      kalan_toplam_borc: 100,
    });
    expect(JSON.stringify(listed.body)).not.toContain('Private address B');
    const own = await ownerA.agent.get('/api/musteriler/customer-a/siparisler');
    expect(own.status).toBe(200);
    expect(own.body.siparisler.map((row: any) => row.id)).toEqual(['order-a']);
    const denied = await ownerA.agent.get('/api/musteriler/customer-b/siparisler');
    expect(denied.status).toBe(404);
    expect(JSON.stringify(denied.body)).not.toContain('Private address B');
  });

  it('rejects foreign customer IDs in updates and order references while allowing owned references', async () => {
    const before = structuredClone(musterilerVeritabani);
    expect(
      (
        await salesA.agent
          .post('/api/musteriler')
          .send({ id: 'customer-b', ad_soyad: 'Changed victim' })
      ).status
    ).toBe(404);
    expect(musterilerVeritabani).toEqual(before);
    expect(
      (await ownerA.agent.patch('/api/siparisler/order-a').send({ musteri_id: 'customer-b' }))
        .status
    ).toBe(404);
    expect(siparislerVeritabani[0].musteri_id).toBe('customer-a');
    const payload = {
      musteri_id: 'customer-b',
      musteri_adi: 'Synthetic',
      urun_aciklamasi: 'Synthetic product',
      toplam_tutar: 30,
    };
    expect((await ownerA.agent.post('/api/siparisler').send(payload)).status).toBe(404);
    expect(siparislerVeritabani).toHaveLength(2);
    const created = await ownerA.agent
      .post('/api/siparisler')
      .send({ ...payload, musteri_id: 'customer-a' });
    expect(created.status).toBe(200);
    expect(created.body.siparis).toMatchObject({ tenant_id: companyA, musteri_id: 'customer-a' });
    expect(
      (
        await salesA.agent
          .post('/api/musteriler')
          .send({ id: 'customer-a', ad_soyad: 'Owned customer updated' })
      ).status
    ).toBe(200);
    expect(musterilerVeritabani.find((row) => row.id === 'customer-b')!.ad_soyad).toBe(
      'Same customer display name'
    );
  });

  it('scopes inbox lists and rejects foreign approval/rejection while allowing a single owned approval', async () => {
    const own = await salesA.agent.get('/api/inbox');
    expect(own.status).toBe(200);
    expect(own.body.mesajlar.map((row: any) => row.id)).toEqual(['inbox-a']);
    expect((await salesA.agent.post('/api/inbox/inbox-b/onayla').send({})).status).toBe(404);
    expect((await salesA.agent.post('/api/inbox/inbox-b/reddet').send({})).status).toBe(404);
    expect(siparislerVeritabani).toHaveLength(2);
    expect(onayBekleyenler.find((row) => row.id === 'inbox-b')!.durum).toBe('BEKLEMEDE');
    const accepted = await salesA.agent.post('/api/inbox/inbox-a/onayla').send({});
    expect(accepted.status).toBe(200);
    expect(accepted.body.siparis.tenant_id).toBe(companyA);
    expect(siparislerVeritabani).toHaveLength(3);
    expect((await salesA.agent.post('/api/inbox/inbox-a/onayla').send({})).status).toBe(409);
    expect(siparislerVeritabani).toHaveLength(3);
    expect((await ownerB.agent.post('/api/inbox/inbox-b/reddet').send({})).status).toBe(200);
  });

  it('enforces finance and sales field permissions after real session verification', async () => {
    const paid = await financeA.agent.patch('/api/siparisler/order-a').send({ alinan_tutar: 40 });
    expect(paid.status).toBe(200);
    expect(paid.body.siparis).toMatchObject({
      alinan_tutar: 40,
      kalan_tutar: 60,
      finans_durumu: 'KISMI_ODEME',
    });
    expect(
      (
        await financeA.agent
          .patch('/api/siparisler/order-a')
          .send({ musteri_adi: 'Finance overwrite' })
      ).status
    ).toBe(403);
    expect((await financeA.agent.delete('/api/siparisler/order-a').send({})).status).toBe(403);
    expect(
      (await financeA.agent.post('/api/musteriler').send({ ad_soyad: 'Finance customer' })).status
    ).toBe(403);
    expect(
      (
        await salesA.agent
          .patch('/api/siparisler/order-a')
          .send({ lojistik_durumu: 'TESLIM_EDILDI' })
      ).status
    ).toBe(403);
    expect(
      (
        await salesA.agent
          .patch('/api/siparisler/order-a')
          .send({ urun_aciklamasi: 'Sales product update' })
      ).status
    ).toBe(200);
    expect(siparislerVeritabani.find((row) => row.id === 'order-a')).toMatchObject({
      musteri_adi: 'Same customer display name',
      lojistik_durumu: 'KANADA_SATINALIM_BEKLIYOR',
    });
  });

  it('rejects forged scope aliases on actual routes and allows an administrator to select a concrete tenant', async () => {
    for (const query of [`tenant_id=${companyB}`, `tenantId=${companyB}`, 'tenant_id=all']) {
      expect((await ownerA.agent.get(`/api/siparisler?${query}`)).status).toBe(403);
    }
    expect((await ownerA.agent.get('/api/siparisler').set('x-tenant-id', companyB)).status).toBe(
      403
    );
    expect(
      (
        await ownerA.agent
          .patch('/api/siparisler/order-b')
          .send({ tenantId: companyB, urun_aciklamasi: 'Spoofed tenant' })
      ).status
    ).toBe(403);
    expect(
      (
        await ownerA.agent
          .post('/api/inbox/inbox-a/onayla')
          .send({ duzeltilmis_siparis: { tenant_id: companyB } })
      ).status
    ).toBe(403);
    const selected = await admin.agent.get(`/api/siparisler?tenant_id=${companyB}`);
    expect(selected.status).toBe(200);
    expect(selected.body.siparisler.map((row: any) => row.id)).toEqual(['order-b']);
    expect(
      (await admin.agent.patch('/api/siparisler/order-b').send({ urun_aciklamasi: 'No selection' }))
        .status
    ).toBe(403);
    const updated = await admin.agent
      .patch('/api/siparisler/order-b')
      .set('x-tenant-id', companyB)
      .send({ urun_aciklamasi: 'Admin selected B' });
    expect(updated.status).toBe(200);
    expect(siparislerVeritabani.find((row) => row.id === 'order-b')).toMatchObject({
      tenant_id: companyB,
      urun_aciklamasi: 'Admin selected B',
    });
  });

  it('reserves global backup and company approval for administrators and disables existing company sessions', async () => {
    expect((await ownerA.agent.get('/api/veritabani/yedek-al')).status).toBe(403);
    expect((await financeA.agent.get('/api/veritabani/yedek-al')).status).toBe(403);
    expect(
      (
        await ownerA.agent
          .patch(`/api/firmalar/${companyB}/onay`)
          .send({ onayDurumu: 'REDDEDILDI' })
      ).status
    ).toBe(403);
    expect(firmalarVeritabani.find((row) => row.id === companyB)!.onayDurumu).toBe('AKTIF');
    const backup = await admin.agent.get('/api/veritabani/yedek-al');
    expect(backup.status).toBe(200);
    expect(backup.body.siparisler.map((row: any) => row.id).sort()).toEqual(['order-a', 'order-b']);
    expect(
      (await admin.agent.patch(`/api/firmalar/${companyB}/onay`).send({ onayDurumu: 'REDDEDILDI' }))
        .status
    ).toBe(200);
    expect((await ownerB.agent.get('/api/auth/oturum')).status).toBe(401);
    expect((await ownerB.agent.get('/api/siparisler')).status).toBe(401);
    expect((await ownerA.agent.get('/api/siparisler')).status).toBe(200);
  });

  it('protects uploaded bytes on root and API image paths and rejects foreign image attachment', async () => {
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8mQAAAAASUVORK5CYII=';
    const uploaded = await ownerA.agent
      .post('/api/upload-gorsel')
      .send({ base64: png, mimeType: 'image/png' });
    expect(uploaded.status).toBe(200);
    const url = uploaded.body.url as string;
    expect(url).toMatch(/^\/uploads\/t_[a-f0-9]{24}_[a-f0-9]{32}\.png$/);
    for (const imageUrl of [url, `/api${url}`]) {
      expect((await request(app).get(imageUrl)).status).toBe(401);
      expect((await ownerB.agent.get(imageUrl)).status).toBe(404);
      const own = await ownerA.agent.get(imageUrl);
      expect(own.status).toBe(200);
      expect(own.headers['content-type']).toMatch(/^image\/png/);
      expect(own.headers['cache-control']).toContain('no-store');
      expect(own.body).toEqual(Buffer.from(png, 'base64'));
    }
    expect(
      (await ownerB.agent.patch('/api/siparisler/order-b').send({ gorseller: [url] })).status
    ).toBe(404);
    expect(
      (await ownerA.agent.patch('/api/siparisler/order-a').send({ gorseller: [url] })).status
    ).toBe(200);
    expect(siparislerVeritabani.find((row) => row.id === 'order-b')!.gorseller).toBeUndefined();
  });

  it('revokes an actual persisted login session and rejects the old cookie after logout', async () => {
    const transient = await loginFixture(app, 'PATRON', companyA);
    expect((await transient.agent.get('/api/auth/oturum')).status).toBe(200);
    const logout = await transient.agent.post('/api/auth/cikis').send({});
    expect(logout.status).toBe(200);
    expect(logout.headers['set-cookie'][0]).toMatch(/^tomnap_session=;/);
    expect((await request(app).get('/api/siparisler').set('Cookie', transient.cookie)).status).toBe(
      401
    );
    expect((await transient.agent.get('/api/auth/oturum')).status).toBe(401);
    expect((await ownerA.agent.get('/api/siparisler')).status).toBe(200);
  });
});
