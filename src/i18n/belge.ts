import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/appStore';
import { BUTIK_VARSAYILAN_DILI, dilDestekleniyor } from '../shared/diller';

/**
 * Translator for documents and customer messages (docs/i18n.md): the boutique's default
 * language, whatever the interface language is. Suspends until the strings are loaded.
 */
export function useBelgeCevirisi() {
  const butikDili = useAppStore((state) => state.butikDili);
  const dil = dilDestekleniyor(butikDili) ? butikDili : BUTIK_VARSAYILAN_DILI;
  return useTranslation('belge', { lng: dil }).t;
}
