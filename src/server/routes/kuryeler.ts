import { Router } from 'express';
import { siparislerVeritabani } from '../services/state';

const router = Router();

// GET /api/kuryeler — Bakü Kuryeleri (Multi-Tenant Saha Dağıtım Masası)
router.get('/kuryeler', (req, res) => {
  const seciliTenant = req.query.tenant_id as string | undefined;

  // İlgili butik siparişlerini filtrele
  const ilgiliSiparisler = (seciliTenant && seciliTenant !== 'all')
    ? siparislerVeritabani.filter(s => (s.tenant_id || 'kanada_shopper_baku') === seciliTenant)
    : siparislerVeritabani;

  const kuryeler = [
    {
      id: 'kurye-elvin',
      ad_soyad: 'Elvin Məmmədli',
      telefon: '+994 50 411 22 33',
      bolge: 'Nərimanov & Gənclik & Mərkəz',
    },
    {
      id: 'kurye-resad',
      ad_soyad: 'Rəşad Kərimov',
      telefon: '+994 55 622 33 44',
      bolge: 'Yasamal & Elmlər & 28 May',
    },
    {
      id: 'kurye-vuqar',
      ad_soyad: 'Vüqar Tağıyev',
      telefon: '+994 70 833 44 55',
      bolge: 'Gəncə & Qərb Rayonları (Poçt/Avtovağzal)',
    },
    {
      id: 'ofis-tehvil',
      ad_soyad: 'Ofis / Mərkəzi Evdən Təhvil',
      telefon: '+994 50 111 22 33',
      bolge: 'Nəsimi r., 28 May',
    },
  ];

  const zenginKuryeler = kuryeler.map(k => {
    // Bu kuryeye atanmış veya bölgesine düşen ilgili butik siparişleri
    const kuryeSiparisleri = ilgiliSiparisler.filter(s => {
      if (s.baku_kurye_id === k.id) return true;
      const adresVeSehir = `${s.teslimat_sehri || ''} ${s.teslimat_adresi || ''}`.toLowerCase();
      if (k.id === 'kurye-elvin' && (adresVeSehir.includes('nərimanov') || adresVeSehir.includes('gənclik') || adresVeSehir.includes('təbriz'))) return true;
      if (k.id === 'kurye-resad' && (adresVeSehir.includes('yasamal') || adresVeSehir.includes('elmlər') || adresVeSehir.includes('28 may') || adresVeSehir.includes('içərişəhər'))) return true;
      if (k.id === 'kurye-vuqar' && (adresVeSehir.includes('gəncə') || adresVeSehir.includes('sumqayıt') || adresVeSehir.includes('rayon'))) return true;
      if (k.id === 'ofis-tehvil' && (s.ozel_not?.toLowerCase().includes('sürücü') || s.ozel_not?.toLowerCase().includes('özü') || s.ham_mesaj?.toLowerCase().includes('özü'))) return true;
      return false;
    });

    const bekleyenler = kuryeSiparisleri.filter(s => s.lojistik_durumu !== 'TESLIM_EDILDI');
    const toplanacakBorc = bekleyenler.reduce((acc, s) => acc + (s.kalan_tutar || 0), 0);

    return {
      ...k,
      tenant_id: seciliTenant || 'all',
      aktif_paket_sayisi: bekleyenler.length,
      toplam_tahsilat_bekleyen: toplanacakBorc,
      toplam_paket_sayisi: kuryeSiparisleri.length,
    };
  });

  res.json({
    basarili: true,
    kuryeler: zenginKuryeler,
  });
});

export default router;
