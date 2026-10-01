import i18n from '.';
import { ApiError } from '../lib/apiClient';

/**
 * The text to show for a failed request (docs/i18n.md): the translation of the server's
 * stable code when there is one, otherwise the server's own message, otherwise `yedek`
 * (already translated by the caller).
 */
export function hataMetni(hata: unknown, yedek: string): string {
  if (hata instanceof ApiError && hata.kod && i18n.exists(hata.kod, { ns: 'hatalar' }))
    return i18n.t(hata.kod, { ns: 'hatalar' });
  return hata instanceof Error && hata.message ? hata.message : yedek;
}
