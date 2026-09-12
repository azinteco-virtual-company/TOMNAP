import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { AramexProvider } from '../../../src/server/services/kargo/providers/aramex';
import { DhlExpressProvider } from '../../../src/server/services/kargo/providers/dhl';
import { UpsProvider } from '../../../src/server/services/kargo/providers/ups';
import { kargoMerkezi } from '../../../src/server/services/kargo/kargoMerkezi';
import { createApp } from '../../../src/server';

describe('Multi-Carrier & Multi-Country Kargo Entegrasyonu Testleri', () => {
  describe('Aramex Durum Haritalama (Status Mapping)', () => {
    const aramex = new AramexProvider();

    it('DLV ve Delivered açıklaması TESLIM_EDILDI durumuna dönüştürülmeli', () => {
      expect(aramex.mapStatus('DLV', 'Shipment delivered to customer', 'Baku')).toBe('TESLIM_EDILDI');
      expect(aramex.mapStatus('', 'Package delivered successfully', 'Baku')).toBe('TESLIM_EDILDI');
      expect(aramex.mapStatus('SH005', 'Proof of delivery signed', 'Baku')).toBe('TESLIM_EDILDI');
    });

    it('Bakü, kurye, gümrük veya GYD konumları BAKU_DAGITIM_ARKADAS durumuna dönüştürülmeli', () => {
      expect(aramex.mapStatus('SH008', 'Out for delivery with courier', 'Baku, Azerbaijan')).toBe('BAKU_DAGITIM_ARKADAS');
      expect(aramex.mapStatus('SH068', 'Customs clearance completed at airport', 'Heydar Aliyev Int Airport (GYD)')).toBe('BAKU_DAGITIM_ARKADAS');
    });

    it('Tranzit, Dubai hub ve uçuş aşamaları ULUSLARARASI_KARGO durumuna dönüştürülmeli', () => {
      expect(aramex.mapStatus('SH014', 'Departed operations facility', 'Dubai Hub (DXB)')).toBe('ULUSLARARASI_KARGO');
      expect(aramex.mapStatus('SH069', 'In transit flight connection', 'Frankfurt')).toBe('ULUSLARARASI_KARGO');
    });

    it('Toronto kabul ve ilk çıkış aşamaları KANADA_DEPO durumuna dönüştürülmeli', () => {
      expect(aramex.mapStatus('SH001', 'Record created at origin facility', 'Toronto (YYZ)')).toBe('KANADA_DEPO');
      expect(aramex.mapStatus('SH005', 'Shipment collected from merchant', 'Toronto, Canada')).toBe('KANADA_DEPO');
    });
  });

  describe('Aramex Daily Dispatch Excel Ayrıştırma (Parser)', () => {
    const aramex = new AramexProvider();

    it('Excel formatındaki günlük çıkış raporunu başarıyla okumalı ve AWBlere ayırmalı', async () => {
      // Bellekte sanal Aramex Excel'i oluştur
      const wb = XLSX.utils.book_new();
      const veriler = [
        ['Waybill Number', 'Consignee Name', 'Telephone', 'Destination', 'Weight (kg)', 'Dispatch Date'],
        ['37349392426', 'Aytən Məmmədova', '+994502145588', 'Baku', '1.45', '2026-09-12'],
        ['37349392427', 'Kəmalə Bədirbəyli', '+994506942525', 'Ganja', '2.80', '2026-09-12'],
        ['37349392428', 'Nigar Əliyeva', '+994559871122', 'Baku', '0.65', '2026-09-12'],
      ];
      const ws = XLSX.utils.aoa_to_sheet(veriler);
      XLSX.utils.book_append_sheet(wb, ws, 'DailyDispatch');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const sonuc = await aramex.manifestoAyristir(buffer, 'Aramex_Dispatch.xlsx');

      expect(sonuc.basarili).toBe(true);
      expect(sonuc.toplamSatir).toBe(3);
      expect(sonuc.satirlar[0].takipNo).toBe('37349392426');
      expect(sonuc.satirlar[0].aliciAdi).toBe('Aytən Məmmədova');
      expect(sonuc.satirlar[0].agirlikKg).toBe(1.45);
      expect(sonuc.satirlar[1].sehir).toBe('Ganja');
    });
  });

  describe('Kargo Sağlayıcı Fabrikası (Provider Registry & Settings)', () => {
    it('İstenen sağlayıcı nesnesini doğru tipte döndürmeli', () => {
      const aramex = kargoMerkezi.getProvider('ARAMEX');
      expect(aramex.tip).toBe('ARAMEX');
      expect(aramex.ad).toContain('Aramex');

      const dhl = kargoMerkezi.getProvider('DHL');
      expect(dhl.tip).toBe('DHL');

      const ups = kargoMerkezi.getProvider('UPS');
      expect(ups.tip).toBe('UPS');
    });

    it('Tenant ayarlarını doğru getirmeli ve şifreleri maskelemeli', () => {
      const ayar = kargoMerkezi.getAyarlar('kanada_shopper_baku');
      expect(ayar.tenantId).toBe('kanada_shopper_baku');
      expect(ayar.saglayici).toBe('ARAMEX');
      expect(ayar.kimlikBilgileri.hesapNo).toBe('72470858');

      const maskeli = kargoMerkezi.maskeleAyarlar(ayar);
      expect(maskeli.kimlikBilgileri.sifre).toBe('');
    });
  });

  describe('Kargo API Rotaları (Supertest Entegrasyon)', () => {
    const app = createApp();

    it('GET /api/kargo/ayarlar — aktif ayarları ve desteklenen sağlayıcıları dönmeli', async () => {
      const res = await request(app).get('/api/kargo/ayarlar?tenant_id=kanada_shopper_baku');
      expect(res.status).toBe(200);
      expect(res.body.basarili).toBe(true);
      expect(res.body.desteklenenSaglayicilar).toBeInstanceOf(Array);
      expect(res.body.desteklenenUlkeler).toBeInstanceOf(Array);
      expect(res.body.ayarlar.saglayici).toBe('ARAMEX');
    });

    it('POST /api/kargo/test — bağlantı testi başarılı yanıt vermeli', async () => {
      const res = await request(app)
        .post('/api/kargo/test')
        .send({
          tenantId: 'kanada_shopper_baku',
          ayarlar: {
            saglayici: 'ARAMEX',
            kimlikBilgileri: { testModu: true, hesapNo: '72470858' },
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.basarili).toBe(true);
      expect(res.body.saglayici).toBe('ARAMEX');
      expect(res.body.gecikmeMs).toBeGreaterThanOrEqual(0);
    });

    it('POST /api/kargo/takip — AWB listesini sorgulamalı ve konum dönmeli', async () => {
      const res = await request(app)
        .post('/api/kargo/takip')
        .send({
          takipNolari: ['37349392426', '37349392428'],
          tenantId: 'kanada_shopper_baku',
        });

      expect(res.status).toBe(200);
      expect(res.body.basarili).toBe(true);
      expect(res.body.toplam).toBe(2);
      expect(res.body.sonuclar[0].takipNo).toBe('37349392426');
      expect(res.body.sonuclar[0].durum).toBeDefined();
    });

    it('POST /api/kargo/senkronize-et — aktif siparişleri senkronize etmeli', async () => {
      const res = await request(app)
        .post('/api/kargo/senkronize-et')
        .send({ tenantId: 'all' });

      expect(res.status).toBe(200);
      expect(res.body.basarili).toBe(true);
      expect(res.body.sorgulananSayi).toBeGreaterThanOrEqual(0);
    });
  });
});
