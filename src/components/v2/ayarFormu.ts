/**
 * v2 butik ayarları formu (K8, K11) — Codex R3 F11. Sayılar yalnız düz ondalık olarak
 * okunur (virgül ya da nokta). Boş kq qiyməti "təyin edilməyib" (null) deməkdir; yanlış
 * yazılmış dəyər xətadır və heç nə göndərilmir. Yalnız dəyişən sahələr gedir.
 */
import { AYAR_SINIRLARI, sinirIcinde, type AyarSiniri } from '../../shared/v2AyarSinirlari';
export interface AyarDegerleri {
  aylikBeyanSinirUsd: number;
  varsayilanKgFiyatiAzn: number | null;
  /** Only the owner receives the prim rate (K15). */
  primOraniVarsayilan?: number;
}
export interface AyarFormu {
  beyan: string;
  kg: string;
  prim: string;
}
export type AyarFormuSonucu =
  | { degisiklik: Record<string, number | null>; hata?: undefined }
  | { hata: string; degisiklik?: undefined };

/** Plain decimal with at most `ondalik` digits after the separator; otherwise null. */
function ondalik(metin: string, basamak: number): number | null {
  const temiz = metin.trim().replace(',', '.');
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${basamak}})?$`).test(temiz)) return null;
  const sayi = Number(temiz);
  // A long digit string is Infinity, which JSON would send as null (Codex R4 F11).
  return Number.isFinite(sayi) ? sayi : null;
}
/** A plain decimal inside the server's range (shared/v2AyarSinirlari), else null. */
function sinirli(metin: string, sinir: AyarSiniri, basamak = sinir.ondalik): number | null {
  const sayi = ondalik(metin, basamak);
  return sayi !== null && sinirIcinde(sayi, sinir) ? sayi : null;
}

export function ayarFormu(ayarlar: AyarDegerleri): AyarFormu {
  return {
    beyan: String(ayarlar.aylikBeyanSinirUsd),
    kg: ayarlar.varsayilanKgFiyatiAzn === null ? '' : String(ayarlar.varsayilanKgFiyatiAzn),
    // Stored as a fraction (0.05), shown as a percentage (5).
    prim:
      ayarlar.primOraniVarsayilan === undefined
        ? ''
        : String(Math.round(ayarlar.primOraniVarsayilan * 10000) / 100),
  };
}

export function ayarDegisiklikleri(ayarlar: AyarDegerleri, form: AyarFormu): AyarFormuSonucu {
  const degisiklik: Record<string, number | null> = {};
  const beyan = sinirli(form.beyan, AYAR_SINIRLARI.aylikBeyanSinirUsd);
  if (beyan === null)
    return { hata: 'Aylıq bəyan limiti 0-dan böyük, ən çox 100.000 USD olmalıdır.' };
  if (beyan !== ayarlar.aylikBeyanSinirUsd) degisiklik.aylik_beyan_sinir_usd = beyan;

  // Empty clears the price (null); anything else must be a number in range.
  let kg: number | null = null;
  if (form.kg.trim() !== '') {
    kg = sinirli(form.kg, AYAR_SINIRLARI.varsayilanKgFiyatiAzn);
    if (kg === null)
      return { hata: 'Kq qiyməti 0–10.000 AZN arası rəqəm olmalıdır (boş: təyin edilməyib).' };
  }
  if (kg !== ayarlar.varsayilanKgFiyatiAzn) degisiklik.varsayilan_kg_fiyati_azn = kg;

  if (ayarlar.primOraniVarsayilan !== undefined) {
    const faiz = ondalik(form.prim, 2);
    const prim = faiz === null ? null : Math.round(faiz * 100) / 10000;
    if (prim === null || !sinirIcinde(prim, AYAR_SINIRLARI.primOraniVarsayilan))
      return { hata: 'Prim faizi 0–100 arası rəqəm olmalıdır.' };
    if (prim !== ayarlar.primOraniVarsayilan) degisiklik.prim_orani_varsayilan = prim;
  }
  return { degisiklik };
}
