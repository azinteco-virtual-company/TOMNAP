/**
 * v2 butik ayarları formu (K8, K11) — Codex R3 F11. Sayılar yalnız düz ondalık olarak
 * okunur (virgül ya da nokta). Boş kq qiyməti "təyin edilməyib" (null) deməkdir; yanlış
 * yazılmış dəyər xətadır və heç nə göndərilmir. Yalnız dəyişən sahələr gedir.
 */
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
  return Number(temiz);
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
  const beyan = ondalik(form.beyan, 2);
  if (beyan === null || beyan <= 0) return { hata: 'Aylıq bəyan limiti müsbət rəqəm olmalıdır.' };
  if (beyan !== ayarlar.aylikBeyanSinirUsd) degisiklik.aylik_beyan_sinir_usd = beyan;

  let kg: number | null = null;
  if (form.kg.trim() !== '') {
    kg = ondalik(form.kg, 2);
    if (kg === null) return { hata: 'Kq qiyməti rəqəm olmalıdır (boş: təyin edilməyib).' };
  }
  if (kg !== ayarlar.varsayilanKgFiyatiAzn) degisiklik.varsayilan_kg_fiyati_azn = kg;

  if (ayarlar.primOraniVarsayilan !== undefined) {
    const faiz = ondalik(form.prim, 2);
    if (faiz === null || faiz > 100) return { hata: 'Prim faizi 0–100 arası rəqəm olmalıdır.' };
    const prim = Math.round(faiz * 100) / 10000;
    if (prim !== ayarlar.primOraniVarsayilan) degisiklik.prim_orani_varsayilan = prim;
  }
  return { degisiklik };
}
