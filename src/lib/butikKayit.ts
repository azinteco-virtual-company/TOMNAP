export interface ButikKayitBilgileri {
  ad: string;
  sehir: string;
  sahipAdi: string;
  sahipEmail: string;
  sahipTelefon: string;
  paket: 'BASLANGIC' | 'PRO' | 'ENTERPRISE';
  menseiUlke: string;
}

export interface ButikKayitSonucu {
  firma: {
    id: string;
    ad: string;
    paket?: string;
    rolLimitleri?: Record<string, number>;
  };
  emailGonderildi: boolean;
}

export async function butikKaydet(
  bilgiler: ButikKayitBilgileri,
  hataMesaji: string
): Promise<ButikKayitSonucu> {
  const response = await fetch('/api/firmalar/kayit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bilgiler),
  });
  const data = await response.json().catch(() => null);
  if (
    !response.ok ||
    data?.basarili !== true ||
    typeof data?.firma?.id !== 'string' ||
    typeof data?.firma?.ad !== 'string'
  ) {
    throw new Error(typeof data?.hata === 'string' ? data.hata : hataMesaji);
  }
  return { firma: data.firma, emailGonderildi: data.emailGonderildi === true };
}
