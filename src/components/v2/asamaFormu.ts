import { sonrakiAsama } from '../../shared/v2Asama';

/** GEÇİCİ aşama köprüsü (OPEN_QUESTIONS 38): the "next stage" button's request and question. */
export interface AsamaSiparisi {
  musteriAdi: string;
  lojistikDurumu: string;
}

/** The stage the person saw is the expected one; the server refuses if it moved. */
export function asamaIstegi(siparis: AsamaSiparisi): { beklenen_asama: string } | null {
  return sonrakiAsama(siparis.lojistikDurumu) ? { beklenen_asama: siparis.lojistikDurumu } : null;
}

export function asamaOnayMetni(siparis: AsamaSiparisi): string {
  return (
    `${siparis.musteriAdi}: ${siparis.lojistikDurumu} → ${sonrakiAsama(siparis.lojistikDurumu)}. ` +
    'Mərhələ geri qaytarıla bilməz. Davam edilsin?'
  );
}
