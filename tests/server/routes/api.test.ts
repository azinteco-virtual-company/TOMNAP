import { loginFixture } from '../helpers/session';
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/server/index';

const app = createApp();
let authenticated: any;
beforeAll(async () => {
  authenticated = (await loginFixture(app)).agent;
  authenticated.set('x-tenant-id', 'kanada_shopper_baku');
});

describe('API Rota Entegrasyon Testleri', () => {
  it('GET /api/sistem-durum — sistem durumunu dönmeli', async () => {
    const res = await authenticated.get('/api/sistem-durum');
    expect(res.status).toBe(200);
    expect(res.body.basarili).toBe(true);
    expect(res.body).toHaveProperty('supabase');
    expect(res.body).toHaveProperty('gemini');
    expect(res.body).toHaveProperty('sunucu_zamani');
  });

  it('GET /api/siparisler — sipariş listesini getirmeli', async () => {
    const res = await authenticated.get('/api/siparisler');
    expect(res.status).toBe(200);
    expect(res.body.basarili).toBe(true);
    expect(Array.isArray(res.body.siparisler)).toBe(true);
    expect(res.body.siparisler.length).toBeGreaterThan(0);
  });

  it('GET /api/firmalar — multi-tenant firma listesini getirmeli', async () => {
    const res = await authenticated.get('/api/firmalar');
    expect(res.status).toBe(200);
    expect(res.body.basarili).toBe(true);
    expect(Array.isArray(res.body.firmalar)).toBe(true);
    expect(res.body.firmalar.length).toBeGreaterThan(0);
  });

  it('GET /api/kuryeler — kurye ve paket dağıtım masasını getirmeli', async () => {
    const res = await authenticated.get('/api/kuryeler');
    expect(res.status).toBe(200);
    expect(res.body.basarili).toBe(true);
    expect(Array.isArray(res.body.kuryeler)).toBe(true);
    expect(res.body.kuryeler.length).toBe(4);
  });

  it('GET /api/inbox — onay bekleyen gelen kutusunu getirmeli', async () => {
    const res = await authenticated.get('/api/inbox');
    expect(res.status).toBe(200);
    expect(res.body.basarili).toBe(true);
    expect(Array.isArray(res.body.mesajlar)).toBe(true);
  });

  it('GET /api/veritabani/durum — veritabanı rejim durumunu getirmeli', async () => {
    const res = await authenticated.get('/api/veritabani/durum');
    expect(res.status).toBe(200);
    expect(res.body.basarili).toBe(true);
    expect(res.body).toHaveProperty('rejim');
    expect(res.body).toHaveProperty('toplam_siparis');
  });

  it('GET /api/tenant/izolasyon-testi — izolasyon testini hatasız tamamlamalı', async () => {
    const res = await authenticated.get(
      '/api/tenant/izolasyon-testi?tenant_id=kanada_shopper_baku'
    );
    expect(res.status).toBe(200);
    expect(res.body.basarili).toBe(true);
    expect(res.body.tum_testler_gecti).toBe(true);
    expect(res.body.toplam_sizinti_sayisi).toBe(0);
  });

  it('POST /api/siparisler & PATCH & DELETE — CRUD yaşam döngüsünü tamamlamalı', async () => {
    // 1. Yeni sipariş ekle
    const yeniSiparis = {
      musteri_adi: 'Vitest Test Müşterisi',
      urun_aciklamasi: 'Test Michael Kors Çanta',
      toplam_tutar: 220,
      alinan_tutar: 100,
      para_birimi: 'AZN',
      tenant_id: 'kanada_shopper_baku',
    };

    const ekleRes = await authenticated.post('/api/siparisler').send(yeniSiparis);
    expect(ekleRes.status).toBe(200);
    expect(ekleRes.body.basarili).toBe(true);
    const eklenenId = ekleRes.body.siparis.id;
    expect(eklenenId).toBeDefined();

    // 2. Güncelle
    const guncelleRes = await authenticated
      .patch(`/api/siparisler/${eklenenId}`)
      .send({ alinan_tutar: 220, finans_durumu: 'ODENDI' });
    expect(guncelleRes.status).toBe(200);
    expect(guncelleRes.body.siparis.kalan_tutar).toBe(0);
    expect(guncelleRes.body.siparis.finans_durumu).toBe('ODENDI');

    // 3. Sil
    const silRes = await authenticated.delete(`/api/siparisler/${eklenenId}`);
    expect(silRes.status).toBe(200);
    expect(silRes.body.basarili).toBe(true);
  });

  it('kök yoldan (/siparisler) doğrudan istek yapıldığında 404 dönmeli (bypass engeli)', async () => {
    const res = await authenticated.get('/siparisler');
    expect(res.status).toBe(404);
  });

  it('POST /api/katalog-gorseli-kaydet dahili ağ/metadata SSRF adreslerini 403 ile engellemeli', async () => {
    const res = await authenticated.post('/api/katalog-gorseli-kaydet').send({
      siparis_id: 'sip-test-ssrf',
      urun_indeksi: 0,
      katalog_gorsel_url: 'http://169.254.169.254/latest/meta-data/',
    });
    expect(res.status).toBe(403);
    expect(res.body.basarili).toBe(false);
    expect(res.body.hata).toContain('SSRF');
  });

  it('POST /api/veritabani/temizle canlı tenant için onaysız çağrıldığında 403 dönmeli', async () => {
    const res = await authenticated.post('/api/veritabani/temizle').send({
      tenant_id: 'kanada_shopper_baku',
    });
    expect(res.status).toBe(403);
    expect(res.body.basarili).toBe(false);
  });
});
