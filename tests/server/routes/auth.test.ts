import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/server/index';
import { firmalarVeritabani, kullanicilarVeritabani } from '../../../src/server/services/state';

describe('E-poçt ilə Aktivasiya və Şifrəli Giriş Sistemi (/api/auth & /api/firmalar)', () => {
  let app: any;

  beforeAll(() => {
    app = createApp();
  });

  it('Butik qeydiyyatında e-poçt daxil edilmədikdə xəta (400) qaytarmalıdır', async () => {
    const res = await request(app).post('/api/firmalar/kayit').send({
      ad: 'Emailless Boutique',
      sahipAdi: 'Aysel Xanım',
      sahipTelefon: '+994 50 111 22 33',
      // sahipEmail yoxdur
    });

    expect(res.status).toBe(400);
    expect(res.body.basarili).toBe(false);
    expect(res.body.hata).toContain('e-poçt');
  });

  it('Yeni butik qeydiyyatı aktivasiya tokeni yaratmalı və istifadəçini BEKLEMEDE_SIFRE statusunda saxlamalıdır', async () => {
    const uniqueEmail = `butik_${Date.now()}@testboutique.com`;
    const res = await request(app).post('/api/firmalar/kayit').send({
      ad: 'Nümunə Parfümeriya',
      sahipAdi: 'Nərgiz Məmmədova',
      sahipTelefon: '+994 50 999 88 77',
      sahipEmail: uniqueEmail,
      paket: 'PRO',
    });

    expect(res.status).toBe(200);
    expect(res.body.basarili).toBe(true);
    expect(res.body.aktivasyonLinki).toBeUndefined();
    expect(res.body.emailGonderildi).toBe(false);

    // Token bazada qeydə alınmalıdır
    const user = kullanicilarVeritabani.find((u) => u.email === uniqueEmail.toLowerCase());
    expect(user).toBeDefined();
    expect(user?.durum).toBe('BEKLEMEDE_SIFRE');
    expect(user?.aktivasyon_token).toBeDefined();
  });

  it('Hələ şifrə təyin etməmiş (BEKLEMEDE_SIFRE) istifadəçi giriş etmək istədikdə 403 verməlidir', async () => {
    const uniqueEmail = `pending_${Date.now()}@testboutique.com`;
    await request(app).post('/api/firmalar/kayit').send({
      ad: 'Gözləyən Butik',
      sahipAdi: 'Lalə İsmayılova',
      sahipTelefon: '+994 50 888 77 66',
      sahipEmail: uniqueEmail,
    });

    const loginRes = await request(app).post('/api/auth/giris').send({
      identifikator: uniqueEmail,
      sifre: 'IxtiyariParol123!',
    });

    expect(loginRes.status).toBe(403);
    expect(loginRes.body.basarili).toBe(false);
    expect(loginRes.body.hata).toContain('aktivləşdirilməyib');
  });

  it('GET /api/auth/token-kontrol/:token aktivasiya məlumatlarını düzgün qaytarmalıdır', async () => {
    const uniqueEmail = `token_test_${Date.now()}@testboutique.com`;
    const kayitRes = await request(app).post('/api/firmalar/kayit').send({
      ad: 'Token Test Butik',
      sahipAdi: 'Elvin Qasımov',
      sahipTelefon: '+994 50 777 66 55',
      sahipEmail: uniqueEmail,
    });

    const user = kullanicilarVeritabani.find((u) => u.email === uniqueEmail.toLowerCase());
    const token = user?.aktivasyon_token;

    const checkRes = await request(app).get(`/api/auth/token-kontrol/${token}`);
    expect(checkRes.status).toBe(200);
    expect(checkRes.body.basarili).toBe(true);
    expect(checkRes.body.tip).toBe('aktivasyon');
    expect(checkRes.body.email).toBe(uniqueEmail);
    expect(checkRes.body.adSoyad).toBe('Elvin Qasımov');
  });

  it('POST /api/auth/sifre-belirle şifrəni heşləyib hesabı aktivləşdirməlidir', async () => {
    const uniqueEmail = `activate_${Date.now()}@testboutique.com`;
    await request(app).post('/api/firmalar/kayit').send({
      ad: 'Aktiv Butik',
      sahipAdi: 'Samir Vəliyev',
      sahipTelefon: '+994 50 666 55 44',
      sahipEmail: uniqueEmail,
    });

    const user = kullanicilarVeritabani.find((u) => u.email === uniqueEmail.toLowerCase());
    const token = user?.aktivasyon_token;

    // Şifrə 6 simvoldan qısadırsa rədd etməlidir
    const shortRes = await request(app)
      .post('/api/auth/sifre-belirle')
      .send({ token, sifre: '123' });
    expect(shortRes.status).toBe(400);

    // Düzgün şifrə ilə aktivləşdirmə
    const successRes = await request(app)
      .post('/api/auth/sifre-belirle')
      .send({ token, sifre: 'DogruParol123!' });

    expect(successRes.status).toBe(200);
    expect(successRes.body.basarili).toBe(true);

    // İstifadəçi statusu və şifrəsi yenilənməlidir
    const updatedUser = kullanicilarVeritabani.find((u) => u.email === uniqueEmail.toLowerCase());
    expect(updatedUser?.durum).toBe('AKTIF');
    expect(updatedUser?.aktivasyon_token).toBeNull();
    expect(updatedUser?.sifre_hash).toBeDefined();
    expect(updatedUser?.sifre_hash?.startsWith('scrypt:')).toBe(true);
  });

  it('Aktivləşmiş istifadəçi düzgün şifrə ilə daxil ola bilməli, yanlış şifrə ilə bloklanmalıdır', async () => {
    const uniqueEmail = `login_test_${Date.now()}@testboutique.com`;
    await request(app).post('/api/firmalar/kayit').send({
      ad: 'Login Test Butik',
      sahipAdi: 'Fərid Əhmədov',
      sahipTelefon: '+994 50 555 44 33',
      sahipEmail: uniqueEmail,
    });

    const user = kullanicilarVeritabani.find((u) => u.email === uniqueEmail.toLowerCase());
    await request(app)
      .post('/api/auth/sifre-belirle')
      .send({ token: user?.aktivasyon_token, sifre: 'SuperGizli123' });

    // 1. Yanlış şifrə cəhdi (401)
    const failRes = await request(app).post('/api/auth/giris').send({
      identifikator: uniqueEmail,
      sifre: 'SehvParol999',
    });
    expect(failRes.status).toBe(401);
    expect(failRes.body.basarili).toBe(false);

    // 2. Düzgün şifrə ilə uğurlu giriş (200)
    const okRes = await request(app).post('/api/auth/giris').send({
      identifikator: uniqueEmail,
      sifre: 'SuperGizli123',
    });
    expect(okRes.status).toBe(200);
    expect(okRes.body.basarili).toBe(true);
    expect(okRes.body.rol).toBe('PATRON');
    expect(okRes.body.kullanici.email).toBe(uniqueEmail);
  });

  it('Canlı demo (tomnap2026) və Super Admin (admin2026) toxunulmaz qalmalıdır', async () => {
    // Admin girişi
    const adminRes = await request(app)
      .post('/api/auth/giris')
      .send({ identifikator: 'admin2026', sifre: '' });
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.rol).toBe('SUPER_ADMIN');

    // Demo girişi
    const demoRes = await request(app)
      .post('/api/auth/giris')
      .send({ identifikator: 'tomnap2026', sifre: '' });
    expect(demoRes.status).toBe(200);
    expect(demoRes.body.tenantId).toBe('demo_sandbox');
  });

  it('Komanda üzvü e-poçt ilə dəvət olunmalı və şifrə təyin edərək qoşulmalıdır', async () => {
    // Əvvəlcə bir butik götürək
    const firma = firmalarVeritabani[0];
    const employeeEmail = `kurye_${Date.now()}@courier.az`;

    // 1. Dəvət göndər
    const inviteRes = await request(app).post('/api/firmalar/davet-olustur').send({
      tenantId: firma.id,
      rol: 'BAKU_KURYE',
      email: employeeEmail,
      adSoyad: 'Cavid Həsənov',
    });

    expect(inviteRes.status).toBe(200);
    expect(inviteRes.body.basarili).toBe(true);
    expect(inviteRes.body.emailGonderildi).toBe(false);
    const token = inviteRes.body.davet.token;

    // 2. Dəvəti qəbul et və şifrə təyin et
    const joinRes = await request(app).post('/api/firmalar/davet/katil').send({
      token,
      adSoyad: 'Cavid Həsənov',
      telefon: '+994 50 333 22 11',
      sifre: 'KuryerSifresi2026!',
    });

    expect(joinRes.status).toBe(200);
    expect(joinRes.body.basarili).toBe(true);

    // 3. Kuryer öz e-poçtu və şifrəsi ilə daxil ola bilməlidir
    const courierLogin = await request(app).post('/api/auth/giris').send({
      identifikator: employeeEmail,
      sifre: 'KuryerSifresi2026!',
    });

    expect(courierLogin.status).toBe(200);
    expect(courierLogin.body.basarili).toBe(true);
    expect(courierLogin.body.rol).toBe('BAKU_KURYE');
    expect(courierLogin.body.tenantId).toBe(firma.id);
  });
});
