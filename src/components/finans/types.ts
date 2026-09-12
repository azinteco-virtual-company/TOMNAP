export type TarihAralikTipi = '7gun' | '14gun' | '30gun' | '90gun' | '1yil' | 'hepsi' | 'ozel';
export type GorunumSekmesi = 'trend' | 'maliye' | 'lojistik' | 'cedvel';
export type QrupModu = 'otomatik' | 'gunluk' | 'haftalik' | 'aylik';

export interface TrendNoktasiVerisi {
  tarihKey: string;
  formatliTarih: string;
  kisaTarih: string;
  siparisSayisi: number;
  ciro: number;
  tahsilat: number;
  kalan: number;
  kanadaMaliyetAzn: number;
  kargoMaliyetAzn: number;
  netKar: number;
  toplamKilo: number;
  teslimEdilen: number;
  yoldakiKargo: number;
  hazirlanan: number;
  lojistikBasariYuzdesi: number;
}

export interface AylikMaliyeSatiri {
  ayAdi: string;
  yilAy: string;
  siparisSayisi: number;
  ciro: number;
  tahsilat: number;
  kalan: number;
  kanadaAlisAzn: number;
  kargoMaliyetAzn: number;
  netKar: number;
  karMarji: number;
  toplamKilo: number;
  teslimSayisi: number;
  teslimOrani: number;
}

export interface MetrikKartlariProps {
  toplananTutar: number;
  toplamCiro: number;
  kalanAlacak: number;
  toplamKargoAgirligi: number;
  aktifYoldakiKargo: number;
  genelTeslimOrani: number;
  toplamSiparisSayisi: number;
  odenenSiparisSayisi: number;
  odemeYuzdesi: number;
  tahminiNetKar: number;
  toplamKanadaAlisMaliyetiAzn: number;
  toplamKargoMaliyetiAzn: number;
  t: any;
}
