import { useTranslation } from 'react-i18next';
import { etkinButikDili, useAppStore } from '../store/appStore';
import { BUTIK_VARSAYILAN_DILI, dilDestekleniyor } from '../shared/diller';

/** The document language for a boutique language (docs/i18n.md). */
export function belgeDiliIcin(butikDili: string | null | undefined): string {
  return dilDestekleniyor(butikDili) ? butikDili : BUTIK_VARSAYILAN_DILI;
}

/** The session boutique's document language. */
export function useBelgeDili(): string {
  return belgeDiliIcin(useAppStore(etkinButikDili));
}

/**
 * Translator for documents and customer messages (docs/i18n.md): the boutique's default
 * language, whatever the interface language is. Suspends until the strings are loaded.
 */
export function useBelgeCevirisi() {
  return useTranslation('belge', { lng: useBelgeDili() }).t;
}
