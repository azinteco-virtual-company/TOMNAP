import i18n from '../../i18n';

/**
 * v2 metinleri (docs/i18n.md): yardımcı modüller (form doğrulamaları, adlar) çeviriyi
 * bileşen dışından arayüz dilinde alır. Bileşenler useTranslation('v2') kullanır.
 */
export const v2t = (anahtar: string, secenekler: Record<string, unknown> = {}): string =>
  i18n.t(anahtar, { ns: 'v2', ...secenekler });
