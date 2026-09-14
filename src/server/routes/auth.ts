import { Router } from 'express';
import {
  kullanicilarVeritabani,
  kullanicilariKaydetDosyaya,
  firmalarVeritabani,
  firmalariKaydetDosyaya,
} from '../services/state';
import { davetlerVeritabani } from './firmalar';
import { sifreHashle, sifreDogrula } from '../services/crypto';
import { supabase } from '../services/supabase';
import { KullaniciKaydi } from '../types';

const router = Router();

// GET /api/auth/token-kontrol/:token — Aktivasiya və ya Dəvət tokenini yoxlama
router.get('/auth/token-kontrol/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ basarili: false, hata: 'Token təqdim edilməyib.' });
    }
    const cleanToken = token.trim();

    // 1. İstifadəçi aktivasiya tokeni yoxlanışı (Butik Sahibi və ya Qeydiyyat)
    let kullanici = kullanicilarVeritabani.find((u) => u.aktivasyon_token === cleanToken);
    if (kullanici) {
      if (kullanici.token_gecerlilik && new Date(kullanici.token_gecerlilik) < new Date()) {
        return res.status(400).json({ basarili: false, hata: 'Bu aktivasiya linkinin vaxtı bitmişdir.' });
      }

      const firma = firmalarVeritabani.find((f) => f.id === kullanici.tenant_id);
      return res.json({
        basarili: true,
        tip: 'aktivasyon',
        email: kullanici.email,
        adSoyad: kullanici.ad_soyad,
        butikAdi: firma?.ad || '',
        rol: kullanici.rol,
        tenantId: kullanici.tenant_id,
      });
    }

    // 2. Komanda üzvü dəvət tokeni yoxlanışı
    const davet = davetlerVeritabani.find((d) => d.token === cleanToken);
    if (davet) {
      if (davet.kullanildiMi) {
        return res.status(400).json({ basarili: false, hata: 'Bu dəvət linki artıq istifadə edilmişdir.' });
      }
      if (new Date(davet.gecerlilikTarihi) < new Date()) {
        return res.status(400).json({ basarili: false, hata: 'Bu dəvət linkinin vaxtı bitmişdir.' });
      }

      const firma = firmalarVeritabani.find((f) => f.id === davet.tenantId);
      return res.json({
        basarili: true,
        tip: 'davet',
        email: davet.email || '',
        adSoyad: '',
        butikAdi: firma?.ad || davet.tenantAd,
        rol: davet.rol,
        tenantId: davet.tenantId,
      });
    }

    // 3. Supabase-də yoxla (əgər yerli yaddaşda tapılmadısa)
    if (supabase) {
      try {
        let sbUser: any = null;

        // A. Dəqiq token
        const { data: exactUser } = await supabase
          .from('kullanicilar')
          .select('*')
          .eq('aktivasyon_token', cleanToken)
          .maybeSingle();
        sbUser = exactUser;

        // B. Prefiks ilə axtarış (əgər linkdə nüsxələmə xətası olubsa)
        if (!sbUser && cleanToken.length >= 16) {
          const prefix = cleanToken.substring(0, 16);
          const { data: prefixUsers } = await supabase
            .from('kullanicilar')
            .select('*')
            .like('aktivasyon_token', `${prefix}%`)
            .eq('durum', 'BEKLEMEDE_SIFRE')
            .limit(2);
          if (prefixUsers && prefixUsers.length === 1) {
            sbUser = prefixUsers[0];
          }
        }

        if (sbUser) {
          // Butik adını da tap
          let butikAdi = '';
          const firma = firmalarVeritabani.find((f) => f.id === sbUser.tenant_id);
          if (firma) {
            butikAdi = firma.ad;
          } else {
            const { data: sbFirma } = await supabase
              .from('firmalar')
              .select('ad')
              .eq('id', sbUser.tenant_id)
              .maybeSingle();
            if (sbFirma?.ad) butikAdi = sbFirma.ad;
          }

          return res.json({
            basarili: true,
            tip: 'aktivasyon',
            email: sbUser.email,
            adSoyad: sbUser.ad_soyad,
            butikAdi,
            rol: sbUser.rol,
            tenantId: sbUser.tenant_id,
          });
        }

        // C. Supabase davetler cədvəlində yoxla
        const { data: sbDavet } = await supabase
          .from('davetler')
          .select('*')
          .eq('token', cleanToken)
          .maybeSingle();

        if (sbDavet) {
          if (sbDavet.kullanildi_mi) {
            return res.status(400).json({ basarili: false, hata: 'Bu dəvət linki artıq istifadə edilmişdir.' });
          }
          if (new Date(sbDavet.gecerlilik_tarihi) < new Date()) {
            return res.status(400).json({ basarili: false, hata: 'Bu dəvət linkinin vaxtı bitmişdir.' });
          }

          let butikAdi = sbDavet.tenant_ad || '';
          if (!butikAdi) {
            const { data: sbFirma } = await supabase
              .from('firmalar')
              .select('ad')
              .eq('id', sbDavet.tenant_id)
              .maybeSingle();
            if (sbFirma?.ad) butikAdi = sbFirma.ad;
          }

          return res.json({
            basarili: true,
            tip: 'davet',
            email: sbDavet.email || '',
            adSoyad: sbDavet.kullanan_kisi || '',
            butikAdi,
            rol: sbDavet.rol,
            tenantId: sbDavet.tenant_id,
          });
        }
      } catch (e) {
        console.warn('Supabase token-kontrol axtarış xətası:', e);
      }
    }

    return res.status(404).json({
      basarili: false,
      hata: 'Aktivasiya və ya dəvət linki etibarsızdır və ya tapılmadı.',
    });
  } catch (err: any) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});

// POST /api/auth/sifre-belirle — Aktivasiya və ya Dəvət vasitəsilə Şifrə Təyin Etmə
router.post('/auth/sifre-belirle', async (req, res) => {
  try {
    const { token, sifre, adSoyad, telefon, email } = req.body || {};

    if (!token && !email) {
      return res.status(400).json({ basarili: false, hata: 'Təhlükəsizlik tokeni və ya e-poçt mütləqdir.' });
    }

    if (!sifre || typeof sifre !== 'string' || sifre.length < 6) {
      return res.status(400).json({
        basarili: false,
        hata: 'Şifrə ən azı 6 simvoldan ibarət olmalıdır.',
      });
    }

    const hashed = sifreHashle(sifre);
    const cleanToken = String(token || '').trim();

    // 1. Butik Sahibi / Aktivasiya Tokeni
    let user: any = cleanToken ? kullanicilarVeritabani.find((u) => u.aktivasyon_token === cleanToken) : null;

    // Əgər yerli yaddaşda yoxdursa, Supabase-də axtar
    if (!user && supabase) {
      try {
        // A. Dəqiq token ilə axtar
        if (cleanToken) {
          const { data: exactUser } = await supabase
            .from('kullanicilar')
            .select('*')
            .eq('aktivasyon_token', cleanToken)
            .maybeSingle();
          if (exactUser) user = exactUser;
        }

        // B. E-poçt ünvanı ilə axtar (əgər durum BEKLEMEDE_SIFREdirsə)
        if (!user && email) {
          const { data: emailUser } = await supabase
            .from('kullanicilar')
            .select('*')
            .eq('email', String(email).trim().toLowerCase())
            .eq('durum', 'BEKLEMEDE_SIFRE')
            .maybeSingle();
          if (emailUser) user = emailUser;
        }

        // C. Prefiks ilə axtar (ən azı 16 simvol üst-üstə düşərsə)
        if (!user && cleanToken && cleanToken.length >= 16) {
          const prefix = cleanToken.substring(0, 16);
          const { data: prefixUsers } = await supabase
            .from('kullanicilar')
            .select('*')
            .like('aktivasyon_token', `${prefix}%`)
            .eq('durum', 'BEKLEMEDE_SIFRE')
            .limit(2);
          if (prefixUsers && prefixUsers.length === 1) {
            user = prefixUsers[0];
          }
        }
      } catch (errDb) {
        console.warn('Supabase sifre-belirle axtarış xətası:', errDb);
      }
    }

    if (user) {
      user.sifre_hash = hashed;
      user.durum = 'AKTIF';
      user.aktivasyon_token = null;
      user.token_gecerlilik = null;
      if (adSoyad && String(adSoyad).trim()) user.ad_soyad = String(adSoyad).trim();
      if (telefon && String(telefon).trim()) user.telefon = String(telefon).trim();

      // Yerli yaddaşı yenilə
      const localIdx = kullanicilarVeritabani.findIndex((u) => u.id === user.id);
      if (localIdx !== -1) {
        kullanicilarVeritabani[localIdx] = { ...kullanicilarVeritabani[localIdx], ...user };
      } else {
        kullanicilarVeritabani.push(user);
      }
      kullanicilariKaydetDosyaya(kullanicilarVeritabani);

      // Butik təsdiq statusunu da aktivləşdir
      const firma = firmalarVeritabani.find((f) => f.id === user.tenant_id);
      if (firma && firma.onayDurumu === 'BEKLEMEDE') {
        firma.onayDurumu = 'AKTIF';
        firmalariKaydetDosyaya(firmalarVeritabani);
      }

      // Supabase-i tam sinxronlaşdır
      if (supabase) {
        try {
          await Promise.all([
            supabase
              .from('kullanicilar')
              .update({
                sifre_hash: hashed,
                durum: 'AKTIF',
                aktivasyon_token: null,
                token_gecerlilik: null,
                ad_soyad: user.ad_soyad,
                telefon: user.telefon,
              })
              .eq('id', user.id),
            supabase
              .from('firmalar')
              .update({
                onay_durumu: 'AKTIF',
              })
              .eq('id', user.tenant_id),
          ]);
        } catch (e) {
          console.warn('Supabase sifre-belirle update xətası:', e);
        }
      }

      // Əgər butik yerli yaddaşda yoxdursa, Supabase-dən gətir
      let donusFirmasi = firma;
      if (!donusFirmasi && supabase) {
        const { data: sbFirma } = await supabase.from('firmalar').select('*').eq('id', user.tenant_id).maybeSingle();
        if (sbFirma) donusFirmasi = sbFirma;
      }

      return res.json({
        basarili: true,
        mesaj: 'Şifrəniz uğurla təyin edildi! İndi daxil ola bilərsiniz.',
        kullanici: {
          id: user.id,
          adSoyad: user.ad_soyad,
          email: user.email,
          telefon: user.telefon,
          rol: user.rol,
          tenantId: user.tenant_id,
        },
        firma: donusFirmasi,
      });
    }

    // 2. Komanda Üzvü Dəvət Tokeni
    let davet: any = cleanToken ? davetlerVeritabani.find((d) => d.token === cleanToken) : null;
    if (!davet && supabase && cleanToken) {
      try {
        const { data: sbDavet } = await supabase
          .from('davetler')
          .select('*')
          .eq('token', cleanToken)
          .maybeSingle();
        if (sbDavet) {
          davet = {
            token: sbDavet.token,
            tenantId: sbDavet.tenant_id,
            tenantAd: sbDavet.tenant_ad,
            rol: sbDavet.rol,
            olusturanKisi: sbDavet.olusturan_kisi,
            olusturmaTarihi: sbDavet.olusturma_tarihi,
            gecerlilikTarihi: sbDavet.gecerlilik_tarihi,
            kullanildiMi: sbDavet.kullanildi_mi,
            email: sbDavet.email,
            kullananKisi: sbDavet.kullanan_kisi,
          };
        }
      } catch (e) {}
    }

    if (davet) {
      if (davet.kullanildiMi) {
        return res.status(400).json({ basarili: false, hata: 'Bu dəvət artıq istifadə edilib.' });
      }

      let firma = firmalarVeritabani.find((f) => f.id === davet.tenantId);
      if (!firma && supabase) {
        const { data: sbFirma } = await supabase.from('firmalar').select('*').eq('id', davet.tenantId).maybeSingle();
        if (sbFirma) firma = sbFirma;
      }

      if (!firma) {
        return res.status(404).json({ basarili: false, hata: 'Əlaqəli butik tapılmadı.' });
      }

      davet.kullanildiMi = true;
      davet.kullananKisi = adSoyad || davet.kullananKisi || 'Komanda Üzvü';

      const userEmail = davet.email || email || `${davet.token.slice(0, 8)}@tomnap.internal`;

      // İstifadəçi qeydi yaradılır
      const yeniUser: KullaniciKaydi = {
        id: 'usr_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36).slice(-4),
        tenant_id: davet.tenantId,
        ad_soyad: adSoyad || davet.kullananKisi,
        email: userEmail,
        telefon: telefon || '',
        rol: davet.rol as any,
        sifre_hash: hashed,
        durum: 'AKTIF',
        aktivasyon_token: null,
        token_gecerlilik: null,
        olusturma_tarihi: new Date().toISOString(),
      };

      kullanicilarVeritabani.push(yeniUser);
      kullanicilariKaydetDosyaya(kullanicilarVeritabani);

      // Butik rol sayını artır
      if (!firma.aktifKullaniciSayilari) {
        firma.aktifKullaniciSayilari = {
          PATRON: 1,
          KANADA_SATINALMA: 0,
          SATIS_SORUMLUSU: 0,
          BAKU_FINANS: 0,
          BAKU_KURYE: 0,
        };
      }
      const rolKey = davet.rol as keyof typeof firma.aktifKullaniciSayilari;
      if (firma.aktifKullaniciSayilari[rolKey] !== undefined) {
        firma.aktifKullaniciSayilari[rolKey] = (firma.aktifKullaniciSayilari[rolKey] || 0) + 1;
      }
      firmalariKaydetDosyaya(firmalarVeritabani);

      // Supabase
      if (supabase) {
        try {
          await Promise.all([
            supabase.from('kullanicilar').insert({
              id: yeniUser.id,
              tenant_id: yeniUser.tenant_id,
              ad_soyad: yeniUser.ad_soyad,
              email: yeniUser.email,
              telefon: yeniUser.telefon,
              rol: yeniUser.rol,
              sifre_hash: yeniUser.sifre_hash,
              durum: 'AKTIF',
              olusturma_tarihi: yeniUser.olusturma_tarihi,
            }),
            supabase.from('davetler').update({
              kullanildi_mi: true,
              kullanan_kisi: yeniUser.ad_soyad,
            }).eq('token', davet.token),
          ]);
        } catch (e) {}
      }

      return res.json({
        basarili: true,
        mesaj: `Təbriklər! "${firma.ad}" komandasına ${davet.rol} olaraq şifrəniz təyin edildi və daxil oldunuz.`,
        kullanici: {
          id: yeniUser.id,
          adSoyad: yeniUser.ad_soyad,
          email: yeniUser.email,
          telefon: yeniUser.telefon,
          rol: yeniUser.rol,
          tenantId: yeniUser.tenant_id,
        },
        firma,
      });
    }

    return res.status(404).json({
      basarili: false,
      hata: 'Bu tokenə uyğun heç bir gözləyən qeydiyyat və ya dəvət tapılmadı.',
    });
  } catch (err: any) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});

// POST /api/auth/giris — İdentifikator (E-poçt / Telefon) və Şifrə ilə Giriş
router.post('/auth/giris', async (req, res) => {
  try {
    const { identifikator, sifre } = req.body || {};
    const girisMetni = String(identifikator || '').trim();
    const sifreMetni = String(sifre || '').trim();

    if (!girisMetni) {
      return res.status(400).json({
        basarili: false,
        hata: 'Zəhmət olmasa e-poçt ünvanınızı və ya telefon nömrənizi daxil edin.',
      });
    }

    const lower = girisMetni.toLowerCase();

    // 1. Super Admin Girişi (Kod və ya Parol ilə)
    if (lower === 'admin2026' || (lower === 'admin' && sifreMetni === 'admin2026')) {
      return res.json({
        basarili: true,
        tip: 'super_admin',
        rol: 'SUPER_ADMIN',
        tenantId: 'all',
        mesaj: 'Səlahiyyətli Super Admin girişi təsdiqləndi.',
      });
    }

    // 2. Canlı Təqdimat Demo Girişi (Toxunulmaz)
    if (lower === 'tomnap2026' || lower === 'tomnap' || (lower === 'demo' && sifreMetni === 'tomnap2026')) {
      return res.json({
        basarili: true,
        tip: 'demo',
        rol: 'SUPER_ADMIN',
        tenantId: 'demo_sandbox',
        mesaj: 'Canlı Sandbox Demo Mühitinə keçid edildi.',
      });
    }

    // Normal istifadəçi üçün şifrə mütləqdir
    if (!sifreMetni) {
      return res.status(400).json({
        basarili: false,
        hata: 'Zəhmət olmasa şifrənizi daxil edin.',
      });
    }

    const reqDigits = girisMetni.replace(/[^0-9]/g, '');

    // 3. İstifadəçilər bazasında axtarış (Email və ya Telefon)
    let tapilanKullanici: KullaniciKaydi | undefined = kullanicilarVeritabani.find((u) => {
      const emailMatch = u.email && u.email.toLowerCase() === lower;
      const uDigits = String(u.telefon || '').replace(/[^0-9]/g, '');
      const phoneMatch =
        reqDigits.length >= 7 &&
        uDigits.length >= 7 &&
        (reqDigits.endsWith(uDigits.slice(-7)) || uDigits.endsWith(reqDigits.slice(-7)));

      return emailMatch || phoneMatch;
    });

    // Supabase varsa axtar
    if (!tapilanKullanici && supabase) {
      try {
        const { data: sbUser } = await supabase
          .from('kullanicilar')
          .select('*')
          .or(`email.ilike.${lower},telefon.ilike.%${reqDigits.slice(-7)}%`)
          .maybeSingle();

        if (sbUser) {
          tapilanKullanici = {
            id: sbUser.id,
            tenant_id: sbUser.tenant_id,
            ad_soyad: sbUser.ad_soyad,
            email: sbUser.email,
            telefon: sbUser.telefon,
            rol: sbUser.rol,
            sifre_hash: sbUser.sifre_hash,
            durum: sbUser.durum,
            aktivasyon_token: sbUser.aktivasyon_token,
            token_gecerlilik: sbUser.token_gecerlilik,
            olusturma_tarihi: sbUser.olusturma_tarihi,
          };
          kullanicilarVeritabani.push(tapilanKullanici);
        }
      } catch (e) {}
    }

    // Əgər istifadəçi tapıldısa
    if (tapilanKullanici) {
      // Aktivasiya gözləyirsə
      if (tapilanKullanici.durum === 'BEKLEMEDE_SIFRE') {
        return res.status(403).json({
          basarili: false,
          hata: 'Hesabınız hələ aktivləşdirilməyib. Zəhmət olmasa e-poçt ünvanınıza göndərilən təhlükəsiz linkə keçid edərək şifrənizi təyin edin.',
        });
      }

      // Şifrə yoxlanışı
      if (!tapilanKullanici.sifre_hash || !sifreDogrula(sifreMetni, tapilanKullanici.sifre_hash)) {
        return res.status(401).json({
          basarili: false,
          hata: 'Daxil edilmiş şifrə yanlışdır. Zəhmət olmasa yenidən cəhd edin.',
        });
      }

      const firma = firmalarVeritabani.find((f) => f.id === tapilanKullanici?.tenant_id);

      return res.json({
        basarili: true,
        tip: 'butik',
        rol: tapilanKullanici.rol,
        tenantId: tapilanKullanici.tenant_id,
        kullanici: {
          id: tapilanKullanici.id,
          adSoyad: tapilanKullanici.ad_soyad,
          email: tapilanKullanici.email,
          telefon: tapilanKullanici.telefon,
          rol: tapilanKullanici.rol,
          tenantId: tapilanKullanici.tenant_id,
        },
        firma,
        mesaj: `Xoş gəldiniz, ${tapilanKullanici.ad_soyad}!`,
      });
    }

    // 4. Əgər istifadəçi tapılmadısa, amma köhnə/demo butiklərdən birinin sahibi uyğun gəlirsə (Legacy Support)
    const firma = firmalarVeritabani.find((f) => {
      const fPhoneDigits = String(f.sahipTelefon || '').replace(/[^0-9]/g, '');
      const phoneMatch =
        reqDigits.length >= 7 &&
        fPhoneDigits.length >= 7 &&
        (reqDigits.endsWith(fPhoneDigits.slice(-7)) || fPhoneDigits.endsWith(reqDigits.slice(-7)));
      const emailMatch = f.sahipEmail && f.sahipEmail.toLowerCase() === lower;
      const adMatch = f.ad.toLowerCase() === lower || f.id.toLowerCase() === lower;
      return phoneMatch || emailMatch || adMatch;
    });

    if (firma) {
      // Köhnə butik üçün istifadəçi avtomatik generasiya edilir və şifrəsi qeydə alınır
      const yeniUser: KullaniciKaydi = {
        id: 'usr_' + Math.random().toString(36).substring(2, 9),
        tenant_id: firma.id,
        ad_soyad: firma.sahipAdi || firma.ad,
        email: firma.sahipEmail || `${firma.id}@tomnap.az`,
        telefon: firma.sahipTelefon || '',
        rol: 'PATRON',
        sifre_hash: sifreHashle(sifreMetni),
        durum: 'AKTIF',
        aktivasyon_token: null,
        token_gecerlilik: null,
        olusturma_tarihi: new Date().toISOString(),
      };
      kullanicilarVeritabani.push(yeniUser);
      kullanicilariKaydetDosyaya(kullanicilarVeritabani);

      return res.json({
        basarili: true,
        tip: 'butik',
        rol: 'PATRON',
        tenantId: firma.id,
        kullanici: {
          id: yeniUser.id,
          adSoyad: yeniUser.ad_soyad,
          email: yeniUser.email,
          telefon: yeniUser.telefon,
          rol: 'PATRON',
          tenantId: firma.id,
        },
        firma,
        mesaj: `Xoş gəldiniz! "${firma.ad}" idarəetmə masasına daxil oldunuz.`,
      });
    }

    return res.status(404).json({
      basarili: false,
      hata: 'Bu məlumatlara uyğun aktiv istifadəçi və ya butik tapılmadı. Zəhmət olmasa e-poçt / nömrənizi yoxlayın və ya qeydiyyatdan keçin.',
    });
  } catch (err: any) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});

export default router;
