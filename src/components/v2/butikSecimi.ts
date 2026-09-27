import { PLATFORM_ROLU } from '../../shared/roller';

/**
 * v2 butik seçimi (Deploy 2 bulgusu 2). v2 verisi her zaman tek bir butiğe aittir.
 * Platform yöneticisinin oturumu butiğe bağlı değil; v1'deki seçim sayfa yeniden
 * yüklenince (adresle /v2) kaybolur. v2 bu yüzden v1'in listesini ve mekanizmasını
 * (store'daki firmalar ve setSeciliFirmaId) sunar. Ekip üyesinin butiği oturumundan gelir.
 */
export interface ButikSecenegi {
  id: string;
  ad: string;
}

export function v2ButikSecimi(
  rol: unknown,
  seciliFirmaId: string,
  firmalar: readonly ButikSecenegi[]
): { secici: boolean; secimGerekli: boolean; secenekler: ButikSecenegi[] } {
  if (rol !== PLATFORM_ROLU) return { secici: false, secimGerekli: false, secenekler: [] };
  return {
    secici: true,
    secimGerekli: !firmalar.some((firma) => firma.id === seciliFirmaId),
    secenekler: firmalar.map(({ id, ad }) => ({ id, ad })),
  };
}
