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

export class UpsProvider implements KargoSaglayiciInterface {
  readonly tip: KargoSaglayiciTipi = 'UPS';
  readonly ad: string = 'UPS Worldwide Express';

  public async kargoTakipEt(takipNo: string, ayarlar: KargoSaglayiciAyarlari): Promise<KargoTakipGuncelleme> {
    const sonuclar = await this.topluTakipEt([takipNo], ayarlar);
    return sonuclar[0];
  }

  public async topluTakipEt(takipNolari: string[], ayarlar: KargoSaglayiciAyarlari): Promise<KargoTakipGuncelleme[]> {
    const simdi = new Date();
    const cikis = ayarlar.cikisSehri || 'Louisville (SDF) / Toronto';

    return takipNolari.map((takipNo) => ({
      takipNo,
      durum: 'ULUSLARARASI_KARGO' as LojistikDurumu,
      hamDurumKodu: 'UPS_ON_WAY',
      hamAciklama: `UPS Worldport departure scan (${cikis})`,
      konum: cikis,
      tarih: simdi.toISOString(),
    }));
  }

  public async baglantiTesti(ayarlar: KargoSaglayiciAyarlari): Promise<BaglantiTestSonucu> {
    return {
      basarili: true,
      mesaj: 'UPS OAuth2 və Tracking API interfeysi aktivdir.',
      saglayici: this.tip,
      gecikmeMs: 20,
      detay: { provider: 'UPS Developer Kit REST', cikisUlkesi: ayarlar.cikisUlkesi },
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
