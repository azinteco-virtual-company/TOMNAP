import { V2_FLOW_ENABLED } from './featureFlags';
import { rolGrubunda } from '../shared/roller';

/**
 * v1 menüsündeki v2 bağlantısı (Deploy 2 bulgusu 2): yalnız bayrak açıkken ve /v2'yi
 * açabilen rollere (App'teki rota ile aynı: STAFF). Bağlantı sayfayı yeniden yüklemez,
 * v1'de seçilen butik v2'de korunur. v2 kodunu içe aktarmaz.
 */
export function v2MenuGorunur(rol: unknown, bayrak: boolean = V2_FLOW_ENABLED): boolean {
  return bayrak && rolGrubunda(rol, 'STAFF');
}
