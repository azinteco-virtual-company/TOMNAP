import { PLATFORM_ROLU, rolGrubunda } from './roller';

/**
 * GEÇİCİ v2 lojistik aşama köprüsü (OPEN_QUESTIONS 38; migration 20260927100000).
 *
 * K20'ye göre v2 siparişinin aşaması birim ekseninden türetilecek (Faz B–C). O gelene
 * kadar bir v2 siparişi yalnız bir sonraki aşamaya taşınır; geri alma, atlama ve
 * TESLIM_EDILDI yok (teslimi kurye akışı yazar). Roller v1 gruplarından: Kanada ve kargo
 * adımları SHIPPING, Bakü dağıtımına geçiş COURIER_ASSIGN; SUPER_ADMIN ekip üyesi değil,
 * hiçbir geçişi yapamaz. SQL fonksiyonu aynı kuralı uygular. Faz C'de birim ekseni gelince
 * köprü birimi olan siparişi reddedecek, sonra kaldırılacak.
 */
export const V2_ASAMA_SIRASI = [
  'KANADA_SATINALIM_BEKLIYOR',
  'KANADA_DEPO',
  'ULUSLARARASI_KARGO',
  'BAKU_DAGITIM_ARKADAS',
] as const;
export type V2KopruAsamasi = (typeof V2_ASAMA_SIRASI)[number];

export function sonrakiAsama(asama: string): V2KopruAsamasi | null {
  const konum = (V2_ASAMA_SIRASI as readonly string[]).indexOf(asama);
  return konum < 0 || konum === V2_ASAMA_SIRASI.length - 1 ? null : V2_ASAMA_SIRASI[konum + 1];
}

/** Whether this role may move an order from `asama` to its next stage. */
export function asamaIlerletebilir(rol: unknown, asama: string): boolean {
  const sonraki = sonrakiAsama(asama);
  if (!sonraki || rol === PLATFORM_ROLU) return false;
  return rolGrubunda(rol, sonraki === 'BAKU_DAGITIM_ARKADAS' ? 'COURIER_ASSIGN' : 'SHIPPING');
}
