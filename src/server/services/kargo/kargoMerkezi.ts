import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '../../config';
import {
  KargoSaglayiciInterface,
  KargoSaglayiciTipi,
  KargoSaglayiciAyarlari,
  KargoTakipGuncelleme,
  BaglantiTestSonucu,
} from './types';
import { AramexProvider } from './providers/aramex';
import { DhlExpressProvider } from './providers/dhl';
import { UpsProvider } from './providers/ups';
import { siparislerVeritabani, setSiparislerVeritabani } from '../state';
import { supabase } from '../supabase';
import { formatlaSiparis, hazirlaSupabasePayload } from '../siparisFormatlama';
import { sifreleMetin, cozMetin } from '../crypto';

const AYARLAR_DOSYA_YOLU = path.join(DATA_DIR, 'kargo_ayarlari.json');

// Varsayılan Kargo Ayarı (Kanada Aramex Kurumsal Hesabı #72470858)
const VARSAYILAN_AYARLAR: KargoSaglayiciAyarlari = {
  tenantId: 'kanada_shopper_baku',
  saglayici: 'ARAMEX',
  aktif: true,
  cikisUlkesi: 'CA',
  cikisSehri: 'Toronto (YYZ)',
  varisUlkesi: 'AZ',
  varisHavalimani: 'Heydər Əliyev Beynəlxalq Hava Limanı (GYD)',
  kimlikBilgileri: {
    kullaniciAdi: 'canadian_brand_shop@aramex.com',
    sifre: '',
    hesapNo: '72470858',
    pin: '',
    entity: 'YYZ',
    testModu: true,
  },
  otomatikSenkronizasyon: true,
  guncellenmeTarihi: new Date().toISOString(),
};

class KargoMerkezi {
  private providers: Map<KargoSaglayiciTipi, KargoSaglayiciInterface> = new Map();
  private tenantAyarlari: Map<string, KargoSaglayiciAyarlari> = new Map();

  constructor() {
    // 1. Sağlayıcıları kaydet
    this.kayitSaglayici(new AramexProvider());
    this.kayitSaglayici(new DhlExpressProvider());
    this.kayitSaglayici(new UpsProvider());

    // 2. Dosyadan kayıtlı tenant ayarlarını oku
    this.yukleAyarlariDosyadan();
  }

  public kayitSaglayici(provider: KargoSaglayiciInterface) {
    this.providers.set(provider.tip, provider);
  }

  public getProvider(tip: KargoSaglayiciTipi): KargoSaglayiciInterface {
    const provider = this.providers.get(tip);
    if (!provider) {
      // Fallback Aramex
      return this.providers.get('ARAMEX')!;
    }
    return provider;
  }

  public getAyarlar(tenantId?: string): KargoSaglayiciAyarlari {
    const tid = tenantId || 'kanada_shopper_baku';
    const ayar = this.tenantAyarlari.get(tid) || this.tenantAyarlari.get('all');
    if (ayar) {
      return { ...ayar };
    }
    return {
      ...VARSAYILAN_AYARLAR,
      tenantId: tid,
    };
  }

  public kaydetAyarlar(
    yeniAyarlar: Partial<KargoSaglayiciAyarlari> & { tenantId: string }
  ): KargoSaglayiciAyarlari {
    const tid = yeniAyarlar.tenantId || 'kanada_shopper_baku';
    const mevcut = this.getAyarlar(tid);

    const guncel: KargoSaglayiciAyarlari = {
      ...mevcut,
      ...yeniAyarlar,
      tenantId: tid,
      kimlikBilgileri: {
        ...mevcut.kimlikBilgileri,
        ...(yeniAyarlar.kimlikBilgileri || {}),
      },
      guncellenmeTarihi: new Date().toISOString(),
    };

    // Şifre boş geldiyse eskisini koru
    if (
      yeniAyarlar.kimlikBilgileri &&
      (!yeniAyarlar.kimlikBilgileri.sifre || yeniAyarlar.kimlikBilgileri.sifre === '••••••••')
    ) {
      guncel.kimlikBilgileri.sifre = mevcut.kimlikBilgileri.sifre;
    }
    if (
      yeniAyarlar.kimlikBilgileri &&
      (!yeniAyarlar.kimlikBilgileri.pin || yeniAyarlar.kimlikBilgileri.pin === '••••••••')
    ) {
      guncel.kimlikBilgileri.pin = mevcut.kimlikBilgileri.pin;
    }

    this.tenantAyarlari.set(tid, guncel);
    this.kaydetAyarlariDosyaya();
    return guncel;
  }

  /**
   * İstemciye (Frontend) gönderilirken şifre ve PIN kodlarını maskeler.
   */
  public maskeleAyarlar(ayarlar: KargoSaglayiciAyarlari): any {
    return {
      ...ayarlar,
      kimlikBilgileri: {
        ...ayarlar.kimlikBilgileri,
        sifre: ayarlar.kimlikBilgileri.sifre ? '••••••••' : '',
        pin: ayarlar.kimlikBilgileri.pin ? '••••••••' : '',
        sifreTanimli: Boolean(ayarlar.kimlikBilgileri.sifre),
        pinTanimli: Boolean(ayarlar.kimlikBilgileri.pin),
      },
    };
  }

  /**
   * Canlı Bağlantı Testi
   */
  public async baglantiTesti(ayarlar: KargoSaglayiciAyarlari): Promise<BaglantiTestSonucu> {
    const provider = this.getProvider(ayarlar.saglayici);
    return provider.baglantiTesti(ayarlar);
  }

  /**
   * Tekil veya Toplu Canlı AWB Takip Sorgusu
   */
  public async takipEt(takipNolari: string[], tenantId?: string): Promise<KargoTakipGuncelleme[]> {
    const ayarlar = this.getAyarlar(tenantId);
    const provider = this.getProvider(ayarlar.saglayici);
    return provider.topluTakipEt(takipNolari, ayarlar);
  }

  /**
   * Tenant'ın yoldaki tüm aktif kargolarını otomatik Aramex/Kargo API ile senkronize eder.
   */
  public async topluSenkronizeEt(tenantId?: string): Promise<{
    basarili: boolean;
    sorgulananSayi: number;
    guncellenenSayi: number;
    detaylar: Array<{
      id: string;
      takipNo: string;
      eskiDurum: string;
      yeniDurum: string;
      konum: string;
    }>;
  }> {
    const ayarlar = this.getAyarlar(tenantId);
    const provider = this.getProvider(ayarlar.saglayici);

    // 1. Senkronize edilecek siparişleri bul:
    // uluslararası kargo kodu olan ve henüz teslim edilmemiş olanlar
    const aktifSiparisler = siparislerVeritabani.filter((s) => {
      if (tenantId && tenantId !== 'all' && (s.tenant_id || 'kanada_shopper_baku') !== tenantId) {
        return false;
      }
      const hasCode = Boolean(s.uluslararasi_kargo_kodu && s.uluslararasi_kargo_kodu.trim());
      const notDelivered = s.lojistik_durumu !== 'TESLIM_EDILDI';
      return hasCode && notDelivered;
    });

    if (aktifSiparisler.length === 0) {
      return {
        basarili: true,
        sorgulananSayi: 0,
        guncellenenSayi: 0,
        detaylar: [],
      };
    }

    const awbListesi = aktifSiparisler.map((s) => s.uluslararasi_kargo_kodu.trim());
    const takipSonuclari = await provider.topluTakipEt(awbListesi, ayarlar);
    const takipMap = new Map<string, KargoTakipGuncelleme>();
    for (const res of takipSonuclari) {
      takipMap.set(res.takipNo.toUpperCase(), res);
    }

    let guncellenenSayi = 0;
    const detaylar: any[] = [];
    const simdiIso = new Date().toISOString();

    for (const siparis of aktifSiparisler) {
      const awb = siparis.uluslararasi_kargo_kodu.trim().toUpperCase();
      const guncelleme = takipMap.get(awb);
      if (!guncelleme) continue;

      if (siparis.lojistik_durumu !== guncelleme.durum) {
        const eski = siparis.lojistik_durumu;
        siparis.lojistik_durumu = guncelleme.durum;
        siparis.guncellenme_tarihi = simdiIso;

        // Sipariş notlarına canlı kargo durum güncellemesini ekle
        const kargoLog = `[${ayarlar.saglayici} Canlı: ${guncelleme.konum} - ${guncelleme.hamAciklama}]`;
        if (!siparis.baku_tahsilat_notu?.includes(guncelleme.konum)) {
          siparis.baku_tahsilat_notu =
            `${siparis.baku_tahsilat_notu ? siparis.baku_tahsilat_notu + ' ' : ''}${kargoLog}`.trim();
        }

        guncellenenSayi++;
        detaylar.push({
          id: siparis.id,
          takipNo: awb,
          eskiDurum: eski,
          yeniDurum: guncelleme.durum,
          konum: guncelleme.konum,
        });

        // Supabase varsa arka planda güncelle
        if (supabase) {
          try {
            const payload = hazirlaSupabasePayload(siparis);
            supabase.from('siparisler').update(payload).eq('id', siparis.id).then();
          } catch {}
        }
      }
    }

    return {
      basarili: true,
      sorgulananSayi: aktifSiparisler.length,
      guncellenenSayi,
      detaylar,
    };
  }

  // Kalıcılık (Persistence)
  private yukleAyarlariDosyadan() {
    try {
      if (fs.existsSync(AYARLAR_DOSYA_YOLU)) {
        const content = fs.readFileSync(AYARLAR_DOSYA_YOLU, 'utf-8');
        const data = JSON.parse(content);
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item.tenantId) {
              // Şifreli alanları çözerek belleğe al
              if (item.kimlikBilgileri) {
                if (item.kimlikBilgileri.sifre) {
                  item.kimlikBilgileri.sifre = cozMetin(item.kimlikBilgileri.sifre);
                }
                if (item.kimlikBilgileri.pin) {
                  item.kimlikBilgileri.pin = cozMetin(item.kimlikBilgileri.pin);
                }
              }
              this.tenantAyarlari.set(item.tenantId, item);
            }
          }
        }
      } else {
        // Varsayılanı kaydet
        this.tenantAyarlari.set(VARSAYILAN_AYARLAR.tenantId, { ...VARSAYILAN_AYARLAR });
        this.kaydetAyarlariDosyaya();
      }
    } catch (err) {
      console.warn('Kargo ayarları dosyası okunamadı, varsayılan yüklendi:', err);
      this.tenantAyarlari.set(VARSAYILAN_AYARLAR.tenantId, { ...VARSAYILAN_AYARLAR });
    }
  }

  private kaydetAyarlariDosyaya() {
    try {
      const dir = path.dirname(AYARLAR_DOSYA_YOLU);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Hassas şifre ve PIN alanlarını AES ile şifreleyerek diske yaz
      const list = Array.from(this.tenantAyarlari.values()).map((item) => ({
        ...item,
        kimlikBilgileri: {
          ...item.kimlikBilgileri,
          sifre: item.kimlikBilgileri?.sifre ? sifreleMetin(item.kimlikBilgileri.sifre) : '',
          pin: item.kimlikBilgileri?.pin ? sifreleMetin(item.kimlikBilgileri.pin) : '',
        },
      }));
      fs.writeFileSync(AYARLAR_DOSYA_YOLU, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      console.error('Kargo ayarları dosyaya yazılamadı:', err);
    }
  }
}

export const kargoMerkezi = new KargoMerkezi();
