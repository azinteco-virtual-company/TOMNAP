import { Router } from 'express';
import { firmalarVeritabani, siparislerVeritabani, firmalariKaydetDosyaya } from '../services/state';
import { FirmaTenantItem } from '../types';

const router = Router();

// GET /api/firmalar — Multi-Tenant SaaS Listesi
router.get('/firmalar', (req, res) => {
  const sayilar: Record<string, number> = {};
  for (const s of siparislerVeritabani) {
    const tid = s.tenant_id || 'kanada_shopper_baku';
    sayilar[tid] = (sayilar[tid] || 0) + 1;
  }
  res.json({
    basarili: true,
    firmalar: firmalarVeritabani,
    siparis_sayilari: sayilar,
  });
});

// POST /api/firmalar — Yeni Butik / Firma Ekle
router.post('/firmalar', (req, res) => {
  try {
    const { ad, sehir, varsayilanParaBirimi = 'AZN', varsayilanKomisyonYuzdesi = 15, aciklama } = req.body;
    if (!ad) {
      return res.status(400).json({ basarili: false, hata: 'Firma / butik adı zorunludur.' });
    }

    const slug = ad.toLowerCase()
      .replace(/ə/g, 'e').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g')
      .replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString(36).slice(-4);

    const yeniFirma: FirmaTenantItem = {
      id: slug,
      ad,
      sehir: sehir || 'Bakı',
      varsayilanParaBirimi: varsayilanParaBirimi || 'AZN',
      varsayilanKomisyonYuzdesi: Number(varsayilanKomisyonYuzdesi || 15),
      aciklama: aciklama || '',
      isDemo: false,
    };

    firmalarVeritabani.push(yeniFirma);
    firmalariKaydetDosyaya(firmalarVeritabani);

    res.json({
      basarili: true,
      mesaj: `"${ad}" butiki sistemə uğurla əlavə edildi!`,
      firma: yeniFirma,
    });
  } catch (err: any) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});

// DELETE /api/firmalar/:id — Butik Sil
router.delete('/firmalar/:id', (req, res) => {
  const { id } = req.params;
  const index = firmalarVeritabani.findIndex(f => f.id === id);
  if (index === -1) {
    return res.status(404).json({ basarili: false, hata: 'Butik tapılmadı.' });
  }
  if (id === 'kanada_shopper_baku') {
    return res.status(400).json({ basarili: false, hata: 'Əsas canlı butik silinə bilməz.' });
  }
  firmalarVeritabani.splice(index, 1);
  firmalariKaydetDosyaya(firmalarVeritabani);
  res.json({ basarili: true, mesaj: 'Butik uğurla silindi.' });
});

export default router;
