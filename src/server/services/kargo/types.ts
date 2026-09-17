import { LojistikDurumu } from '../../../types';

export type KargoSaglayiciTipi = 'ARAMEX' | 'DHL' | 'UPS' | 'FEDEX' | 'MANUEL';

export type CikisUlkesi = 'CA' | 'US' | 'JP' | 'GB' | 'DE' | 'TR' | 'AE' | string;

export interface KargoSaglayiciKimlik {
  kullaniciAdi?: string;
  sifre?: string;
  hesapNo?: string;
  pin?: string;
  entity?: string;
  apiKey?: string;
  apiSecret?: string;
  testModu: boolean;
}

export interface KargoSaglayiciAyarlari {
  tenantId: string;
  saglayici: KargoSaglayiciTipi;
  aktif: boolean;
  cikisUlkesi: CikisUlkesi;
  cikisSehri: string;
  varisUlkesi: string;
  varisHavalimani: string;
  kimlikBilgileri: KargoSaglayiciKimlik;
  otomatikSenkronizasyon: boolean;
  guncellenmeTarihi: string;
}

export interface KargoTakipGuncelleme {
  kaynak?: 'LIVE' | 'SIMULATION';
  takipNo: string;
  durum: LojistikDurumu;
  hamDurumKodu: string;
  hamAciklama: string;
  konum: string;
  tarih: string;
  detaylar?: Record<string, any>;
}

export interface AyrismisManifestoSatiri {
  takipNo: string;
  aliciAdi: string;
  telefon?: string;
  sehir?: string;
  adres?: string;
  agirlikKg?: number;
  tarih?: string;
  referansNo?: string;
}

export interface AyrismisManifestoSonuc {
  basarili: boolean;
  saglayici: KargoSaglayiciTipi;
  toplamSatir: number;
  satirlar: AyrismisManifestoSatiri[];
  hatalar?: string[];
}

export interface BaglantiTestSonucu {
  basarili: boolean;
  mesaj: string;
  saglayici: KargoSaglayiciTipi;
  gecikmeMs: number;
  detay?: any;
}

export interface KargoSaglayiciInterface {
  readonly tip: KargoSaglayiciTipi;
  readonly ad: string;

  kargoTakipEt(takipNo: string, ayarlar: KargoSaglayiciAyarlari): Promise<KargoTakipGuncelleme>;
  topluTakipEt(
    takipNolari: string[],
    ayarlar: KargoSaglayiciAyarlari
  ): Promise<KargoTakipGuncelleme[]>;
  baglantiTesti(ayarlar: KargoSaglayiciAyarlari): Promise<BaglantiTestSonucu>;
  manifestoAyristir(
    dosyaBuffer: Buffer | ArrayBuffer,
    dosyaAdi: string
  ): Promise<AyrismisManifestoSonuc>;
}
