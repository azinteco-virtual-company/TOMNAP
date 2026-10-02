import i18n from '../../i18n';

/**
 * v2 metinleri (docs/i18n.md): yardımcı modüller (form doğrulamaları, adlar) çeviriyi
 * bileşen dışından arayüz dilinde alır. Bileşenler useTranslation('v2') kullanır.
 */
export const v2t = (anahtar: string, secenekler: Record<string, unknown> = {}): string =>
  i18n.t(anahtar, { ns: 'v2', ...secenekler });

/**
 * The visible name of a logistics stage, from the shared `ortak` mapping. The DB and API
 * keep the codes (KANADA_DEPO...); only what the person reads is translated. An unknown
 * code reads as itself.
 */
export const asamaAdi = (kod: string): string =>
  i18n.t(`lojistik.${kod}`, { ns: 'ortak', defaultValue: kod });
