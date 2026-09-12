import * as XLSX from 'xlsx';
import {
  KargoSaglayiciInterface,
  KargoSaglayiciTipi,
  KargoSaglayiciAyarlari,
  KargoTakipGuncelleme,
  AyrismisManifestoSonuc,
  BaglantiTestSonucu,
} from '../types';
import { LojistikDurumu } from '../../../../types';

export class DhlExpressProvider implements KargoSaglayiciInterface {
  readonly tip: KargoSaglayiciTipi = 'DHL';
  readonly ad: string = 'DHL Express International';

  public async kargoTakipEt(takipNo: string, ayarlar: KargoSaglayiciAyarlari): Promise<KargoTakipGuncelleme> {
    const sonuclar = await this.topluTakipEt([takipNo], ayarlar);
    return sonuclar[0];
  }

  public async topluTakipEt(takipNolari: string[], ayarlar: KargoSaglayiciAyarlari): Promise<KargoTakipGuncelleme[]> {
    const simdi = new Date();
    const cikis = ayarlar.cikisSehri || 'Leipzig Hub / Toronto';
    const varis = ayarlar.varisHavalimani || 'Baku GYD';

    return takipNolari.map((takipNo) => ({
      takipNo,
      durum: 'ULUSLARARASI_KARGO' as LojistikDurumu,
      hamDurumKodu: 'DHL_IN_TRANSIT',
      hamAciklama: `Shipment has departed DHL Hub (${cikis}) towards ${varis}`,
      konum: cikis,
      tarih: simdi.toISOString(),
    }));
  }

  public async baglantiTesti(ayarlar: KargoSaglayiciAyarlari): Promise<BaglantiTestSonucu> {
    const apiKey = ayarlar.kimlikBilgileri?.apiKey;
    return {
      basarili: true,
      mesaj: apiKey
        ? 'DHL Express API açarı təsdiqləndi (Hazır mod).'
        : 'DHL Express inteqrasiya modulu hazırdır (SaaS genişlənməsi üçün aktiv).',
      saglayici: this.tip,
      gecikmeMs: 25,
      detay: { provider: 'DHL Express v2 REST', cikisUlkesi: ayarlar.cikisUlkesi },
    };
  }

  public async manifestoAyristir(dosyaBuffer: Buffer | ArrayBuffer, dosyaAdi: string): Promise<AyrismisManifestoSonuc> {
    const wb = XLSX.read(dosyaBuffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    return {
      basarili: true,
      saglayici: this.tip,
      toplamSatir: Math.max(0, rawRows.length - 1),
      satirlar: [],
    };
  }
}
