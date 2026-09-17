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
import { JsonStorageError, readJsonFile, writeJsonAtomic } from '../atomicJson';

const AYARLAR_DOSYA_YOLU = path.join(DATA_DIR, 'kargo_ayarlari.json');

// Kimlik bilgisi içermeyen başlangıç kargo ayarları.
const VARSAYILAN_AYARLAR: KargoSaglayiciAyarlari = {
  tenantId: 'kanada_shopper_baku',
  saglayici: 'ARAMEX',
  aktif: true,
  cikisUlkesi: 'CA',
  cikisSehri: 'Toronto (YYZ)',
  varisUlkesi: 'AZ',
  varisHavalimani: 'Heydər Əliyev Beynəlxalq Hava Limanı (GYD)',
  kimlikBilgileri: {
    kullaniciAdi: '',
    sifre: '',
    hesapNo: '',
    pin: '',
    entity: 'YYZ',
    testModu: true,
  },
  otomatikSenkronizasyon: true,
  guncellenmeTarihi: new Date().toISOString(),
};

export class KargoMerkezi {
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
    const tid = tenantId;
    if (!tid || tid === 'all') throw new Error('Kargo işlemi için firma seçin.');
    const ayar = this.tenantAyarlari.get(tid);
    if (ayar) {
      return structuredClone(ayar);
    }
    return {
      ...structuredClone(VARSAYILAN_AYARLAR),
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

    const pending = new Map(this.tenantAyarlari);
    pending.set(tid, structuredClone(guncel));
    this.kaydetAyarlariDosyaya(pending);
    this.tenantAyarlari = pending;
    return structuredClone(guncel);
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
    let adaylar = siparislerVeritabani;
    if (supabase) {
      const { data, error } = await supabase
        .from('siparisler')
        .select('*')
        .eq('tenant_id', tenantId);
      if (error) throw new Error('Kargo siparişleri okunamadı.');
      adaylar = (data || []).map(formatlaSiparis);
    }
    const aktifSiparisler = adaylar.filter(
      (s) =>
        s.tenant_id === tenantId &&
        Boolean(s.uluslararasi_kargo_kodu?.trim()) &&
        s.lojistik_durumu !== 'TESLIM_EDILDI'
    );

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
    if (takipSonuclari.some((result) => result.kaynak !== 'LIVE'))
      throw new Error(
        'Simülasyon sonuçları siparişlere kaydedilemez. Canlı kargo hesabı yapılandırın.'
      );
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
            const { data, error } = await supabase
              .from('siparisler')
              .update(payload)
              .eq('id', siparis.id)
              .eq('tenant_id', tenantId)
              .select('id')
              .maybeSingle();
            if (error || !data) throw new Error('Kargo güncellemesi kaydedilemedi.');
          } catch {
            throw new Error('Kargo güncellemesi kaydedilemedi.');
          }
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

  // Persist settings before publishing them to providers or callers.
  private yukleAyarlariDosyadan() {
    const valid = (value: unknown): value is KargoSaglayiciAyarlari[] => {
      if (!Array.isArray(value)) return false;
      const tenants = new Set<string>();
      for (const row of value) {
        if (
          !row ||
          typeof row !== 'object' ||
          typeof row.tenantId !== 'string' ||
          !row.tenantId ||
          row.tenantId === 'all' ||
          tenants.has(row.tenantId) ||
          !row.kimlikBilgileri ||
          typeof row.kimlikBilgileri !== 'object' ||
          Array.isArray(row.kimlikBilgileri)
        )
          return false;
        for (const field of ['kullaniciAdi', 'sifre', 'hesapNo', 'pin', 'entity'])
          if (
            row.kimlikBilgileri[field] !== undefined &&
            typeof row.kimlikBilgileri[field] !== 'string'
          )
            return false;
        tenants.add(row.tenantId);
      }
      return true;
    };
    const stored = readJsonFile(AYARLAR_DOSYA_YOLU, valid);
    const loaded = new Map<string, KargoSaglayiciAyarlari>();
    for (const row of stored || []) {
      const item = structuredClone(row);
      for (const field of ['sifre', 'pin'] as const) {
        const encoded = item.kimlikBilgileri[field];
        if (!encoded) continue;
        const decoded = cozMetin(encoded);
        if (encoded.startsWith('enc:') && decoded === encoded)
          throw new JsonStorageError('Kargo kimlik bilgileri çözülemedi.');
        item.kimlikBilgileri[field] = decoded;
      }
      loaded.set(item.tenantId, item);
    }
    this.tenantAyarlari = loaded;
  }

  private kaydetAyarlariDosyaya(settings: Map<string, KargoSaglayiciAyarlari>) {
    const encode = (value: string | undefined) => {
      if (!value) return '';
      const encoded = sifreleMetin(value);
      if (!encoded.startsWith('enc:'))
        throw new JsonStorageError('Kargo kimlik bilgileri şifrelenemedi.');
      return encoded;
    };
    const list = Array.from(settings.values()).map((item) => ({
      ...item,
      kimlikBilgileri: {
        ...item.kimlikBilgileri,
        sifre: encode(item.kimlikBilgileri?.sifre),
        pin: encode(item.kimlikBilgileri?.pin),
      },
    }));
    writeJsonAtomic(AYARLAR_DOSYA_YOLU, list);
  }
}

export const kargoMerkezi = new KargoMerkezi();
