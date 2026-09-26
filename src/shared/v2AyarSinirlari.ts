/**
 * v2 butik ayarlarının sayı sınırları (K8, K11): sunucu doğrulaması ve istemci formu
 * aynı değerleri buradan alır (Codex R4 F11). `altDahil` false ise alt sınır hariçtir.
 */
export interface AyarSiniri {
  alt: number;
  ust: number;
  ondalik: number;
  altDahil: boolean;
}
export const AYAR_SINIRLARI = {
  aylikBeyanSinirUsd: { alt: 0, ust: 100_000, ondalik: 2, altDahil: false },
  varsayilanKgFiyatiAzn: { alt: 0, ust: 10_000, ondalik: 2, altDahil: true },
  /** Oran (0,05 = %5); formda yüzde olarak girilir. */
  primOraniVarsayilan: { alt: 0, ust: 1, ondalik: 4, altDahil: true },
} as const satisfies Record<string, AyarSiniri>;

export function sinirIcinde(deger: number, sinir: AyarSiniri): boolean {
  return (
    Number.isFinite(deger) &&
    (sinir.altDahil ? deger >= sinir.alt : deger > sinir.alt) &&
    deger <= sinir.ust
  );
}
