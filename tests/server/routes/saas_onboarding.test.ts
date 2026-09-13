import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import { createApp } from '../../../src/server/index';
import { FIRMALAR_DOSYA_YOLU } from '../../../src/server/config';

const app = createApp();

describe('SaaS Onboarding, Butik Qeydiyyatı, Təsdiq və Dəvət Testləri', () => {
  const createdTenantIds: string[] = [];
  let primaryTenantId = '';
  let inviteToken = '';

  afterAll(() => {
    if (createdTenantIds.length > 0 && fs.existsSync(FIRMALAR_DOSYA_YOLU)) {
      try {
        const raw = fs.readFileSync(FIRMALAR_DOSYA_YOLU, 'utf-8');
        const list = JSON.parse(raw);
        const filtered = list.filter((f: any) => !createdTenantIds.includes(f.id));
        fs.writeFileSync(FIRMALAR_DOSYA_YOLU, JSON.stringify(filtered, null, 2), 'utf-8');
      } catch {
        // cleanup yoksay
      }
    }
  });

  it('POST /api/firmalar/kayit — yeni butik qeydiyyatını BEKLEMEDE statusu ilə qəbul etməli', async () => {
    const res = await request(app)
      .post('/api/firmalar/kayit')
      .send({
        ad: 'Test Moda Evi',
        sehir: 'Bakı',
        sahipAdi: 'Zəhra Qasımova',
        sahipTelefon: '+994 50 777 88 99',
        sahipEmail: 'zehra@testmoda.az',
        paket: 'PRO',
        menseiUlke: 'CA',
      });

    expect(res.status).toBe(200);
    expect(res.body.basarili).toBe(true);
    expect(res.body.firma).toBeDefined();
    expect(res.body.firma.onayDurumu).toBe('BEKLEMEDE');
    expect(res.body.firma.rolLimitleri.BAKU_KURYE).toBe(5);
    expect(res.body.firma.rolLimitleri.SATIS_SORUMLUSU).toBe(2);

    primaryTenantId = res.body.firma.id;
    createdTenantIds.push(res.body.firma.id);
  });

  it('POST /api/firmalar/kayit — ekran görüntüsündeki exact payload ile test', async () => {
    const res = await request(app)
      .post('/api/firmalar/kayit')
      .send({
        ad: 'Test123',
        sehir: 'Baku',
        sahipAdi: 'TEstural',
        sahipEmail: 'tural.musab.osmanli@gmail.com',
        sahipTelefon: '+994103337692',
        paket: 'PRO',
        menseiUlke: 'CA',
      });
    expect(res.status).toBe(200);
    expect(res.body.basarili).toBe(true);
    if (res.body?.firma?.id) createdTenantIds.push(res.body.firma.id);
  });

  it('Supabase firmalar tablosu durumunu kontrol et', async () => {
    const { supabase } = await import('../../../src/server/services/supabase');
    if (supabase) {
      const { data, error } = await supabase.from('firmalar').select('*').limit(1);
      if (error) {
        throw new Error('Supabase firmalar error: ' + JSON.stringify(error));
      }
      expect(data).toBeDefined();
    }
  });

  it('api/index.ts (Vercel Serverless Handler) — /firmalar/kayit sorğusunu avtomatik /api-yə normallaşdırmalı', async () => {
    const http = await import('http');
    const handler = (await import('../../../api/index')).default;
    const server = http.createServer((req, res) => handler(req, res));
    const res = await request(server)
      .post('/firmalar/kayit')
      .send({
        ad: 'Test123_VercelHandler',
        sehir: 'Baku',
        sahipAdi: 'TEstural',
        sahipEmail: 'tural.musab.osmanli@gmail.com',
        sahipTelefon: '+994103337692',
        paket: 'PRO',
        menseiUlke: 'CA',
      });
    expect(res.status).toBe(200);
    expect(res.body.basarili).toBe(true);
    if (res.body?.firma?.id) createdTenantIds.push(res.body.firma.id);
  });

  it('POST /api/firmalar/kayit — çatışmayan sahələrdə 400 xətası qaytarmalı', async () => {
    const res = await request(app)
      .post('/api/firmalar/kayit')
      .send({
        ad: '',
        sahipAdi: '',
      });

    expect(res.status).toBe(400);
    expect(res.body.basarili).toBe(false);
  });

  it('PATCH /api/firmalar/:id/onay — Super Admin butiki AKTIF etməlidir', async () => {
    const res = await request(app)
      .patch(`/api/firmalar/${primaryTenantId}/onay`)
      .send({ onayDurumu: 'AKTIF' });

    expect(res.status).toBe(200);
    expect(res.body.basarili).toBe(true);
    expect(res.body.firma.onayDurumu).toBe('AKTIF');
  });

  it('POST /api/firmalar/davet-olustur — kurye üçün dəvət linki yaratmalıdır', async () => {
    const res = await request(app)
      .post('/api/firmalar/davet-olustur')
      .send({
        tenantId: primaryTenantId,
        rol: 'BAKU_KURYE',
        olusturanKisi: 'Zəhra Qasımova',
      });

    expect(res.status).toBe(200);
    expect(res.body.basarili).toBe(true);
    expect(res.body.davet).toBeDefined();
    expect(res.body.davet.token).toBeDefined();
    expect(res.body.davet.rol).toBe('BAKU_KURYE');
    expect(res.body.davetUrl).toContain('/davet?token=');

    inviteToken = res.body.davet.token;
  });

  it('GET /api/firmalar/davet/:token — dəvət tokenini yoxlamalı və butik məlumatını qaytarmalı', async () => {
    const res = await request(app).get(`/api/firmalar/davet/${inviteToken}`);

    expect(res.status).toBe(200);
    expect(res.body.basarili).toBe(true);
    expect(res.body.davet.rol).toBe('BAKU_KURYE');
    expect(res.body.firma.id).toBe(primaryTenantId);
  });

  it('POST /api/firmalar/davet/katil — komandaya qoşulmalı və kurye sayını artırmalı', async () => {
    const res = await request(app)
      .post('/api/firmalar/davet/katil')
      .send({
        token: inviteToken,
        adSoyad: 'Kamran Əliyev (Kurye)',
        telefon: '+994 55 123 99 88',
      });

    expect(res.status).toBe(200);
    expect(res.body.basarili).toBe(true);
    expect(res.body.rol).toBe('BAKU_KURYE');
  });
});
