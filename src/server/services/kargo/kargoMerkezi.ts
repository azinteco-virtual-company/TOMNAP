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
import { formatlaSiparis } from '../siparisFormatlama';
import { updateCargoOrder } from './orderUpdates';
import {
  loadCargoSettings,
  saveCargoSettings,
  SECRET_FIELDS,
  CargoSettingsError,
} from './settings';

export class KargoMerkezi {
  private providers: Map<KargoSaglayiciTipi, KargoSaglayiciInterface> = new Map();

  constructor() {
    // 1. Sağlayıcıları kaydet
    this.kayitSaglayici(new AramexProvider());
    this.kayitSaglayici(new DhlExpressProvider());
    this.kayitSaglayici(new UpsProvider());
  }

  public kayitSaglayici(provider: KargoSaglayiciInterface) {
    this.providers.set(provider.tip, provider);
  }

  public getProvider(tip: KargoSaglayiciTipi): KargoSaglayiciInterface {
    const provider = this.providers.get(tip);
    if (!provider) {
      throw new CargoSettingsError('Bu sağlayıcı için bağlantı henüz desteklenmiyor.', 400);
    }
    return provider;
  }

  public async getAyarlar(tenantId?: string): Promise<KargoSaglayiciAyarlari> {
    return loadCargoSettings(tenantId!);
  }

  public async kaydetAyarlar(yeniAyarlar: Partial<KargoSaglayiciAyarlari> & { tenantId: string }) {
    return saveCargoSettings(yeniAyarlar);
  }

  /**
   * İstemciye (Frontend) gönderilirken şifre ve PIN kodlarını maskeler.
   */
  public maskeleAyarlar(ayarlar: KargoSaglayiciAyarlari): any {
    const masked = structuredClone(ayarlar) as any;
    for (const field of SECRET_FIELDS) {
      masked.kimlikBilgileri[field] = ayarlar.kimlikBilgileri[field] ? '••••••••' : '';
      masked.kimlikBilgileri[`${field}Tanimli`] = Boolean(ayarlar.kimlikBilgileri[field]);
    }
    return masked;
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
    const ayarlar = await this.getAyarlar(tenantId);
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
    const ayarlar = await this.getAyarlar(tenantId);
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
    const aktifSiparisler = adaylar
      .filter(
        (s) =>
          s.tenant_id === tenantId &&
          Boolean(s.uluslararasi_kargo_kodu?.trim()) &&
          s.lojistik_durumu !== 'TESLIM_EDILDI'
      )
      .map((order) => structuredClone(order));

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
    // Simulated tracking must never change an order; 409 tells the client why.
    if (takipSonuclari.some((result) => result.kaynak !== 'LIVE'))
      throw new CargoSettingsError(
        'Simülasyon sonuçları siparişlere kaydedilemez. Canlı kargo hesabı yapılandırın.',
        409
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
        const note = `[${ayarlar.saglayici} Canlı: ${guncelleme.konum} - ${guncelleme.hamAciklama}]`;
        await updateCargoOrder(siparis, {
          lojistik_durumu: guncelleme.durum,
          ...(!siparis.baku_tahsilat_notu?.includes(guncelleme.konum) ? { kargo_notu: note } : {}),
        });
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
      }
    }

    return {
      basarili: true,
      sorgulananSayi: aktifSiparisler.length,
      guncellenenSayi,
      detaylar,
    };
  }
}

export const kargoMerkezi = new KargoMerkezi();
