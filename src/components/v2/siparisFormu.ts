/**
 * v2 sipariş formu (A9): saf durum ve dönüşümler. Ekranlar (SiparisGirisi,
 * SatirTablosu) yalnız bunları kullanır; kurallar sunucudaki doğrulamayla aynı
 * sınırları izler, son söz yine sunucunundur.
 */

export type KaynakUlke = 'CA' | 'US';

export interface SatirFormu {
  urunAciklamasi: string;
  beden: string;
  renk: string;
  adet: string;
  fiyat: string;
  kaynakUlke: KaynakUlke;
}

export interface SiparisFormu {
  hamMesaj: string;
  musteriAdi: string;
  telefon: string;
  instagram: string;
  sehir: string;
  adres: string;
  ozelNot: string;
  musteriId: string | null;
  sahipKullaniciId: string | null;
  satirlar: SatirFormu[];
}

/** Server suggestion from POST /api/v2/siparisler/ayristir. */
export interface AyristirmaSonucu {
  oneri: {
    musteri_adi: string;
    telefon_numarasi: string | null;
    instagram_kullanici_adi: string | null;
    teslimat_sehri: string | null;
    teslimat_adresi: string | null;
    ozel_not: string | null;
    satirlar: Array<{
      urun_aciklamasi: string;
      beden: string | null;
      renk: string | null;
      adet: number;
      birim_satis_fiyati_azn: number;
      kaynak_ulke: KaynakUlke;
    }>;
  };
  eksikBilgiler: string[];
  musteriEslesen: { musteri_id: string; ad_soyad: string } | null;
  musteriAdaylari: Array<{ musteri_id: string; ad_soyad: string; skor: number }>;
}

export const bosSatir = (): SatirFormu => ({
  urunAciklamasi: '',
  beden: '',
  renk: '',
  adet: '1',
  fiyat: '',
  kaynakUlke: 'CA',
});

export const bosForm = (): SiparisFormu => ({
  hamMesaj: '',
  musteriAdi: '',
  telefon: '',
  instagram: '',
  sehir: '',
  adres: '',
  ozelNot: '',
  musteriId: null,
  sahipKullaniciId: null,
  satirlar: [bosSatir()],
});

/** Accepts "12,5" as well as "12.5"; NaN for anything else. */
export function sayiOku(value: string): number {
  const temiz = value.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(temiz) ? Number(temiz) : Number.NaN;
}

/** Line total in AZN, rounded per line to cents like the server; null while invalid. */
export function satirTutari(satir: SatirFormu): number | null {
  const adet = sayiOku(satir.adet);
  const fiyat = sayiOku(satir.fiyat);
  if (!Number.isInteger(adet) || adet < 1 || !Number.isFinite(fiyat)) return null;
  return Math.round(adet * fiyat * 100) / 100;
}

export function formToplami(form: SiparisFormu): number {
  const kurus = form.satirlar.reduce((toplam, satir) => {
    const tutar = satirTutari(satir);
    return tutar === null ? toplam : toplam + Math.round(tutar * 100);
  }, 0);
  return kurus / 100;
}

/** Fills the form from an AI suggestion; the person reviews every field. */
export function oneridenForm(sonuc: AyristirmaSonucu, hamMesaj: string): SiparisFormu {
  const { oneri } = sonuc;
  return {
    hamMesaj,
    musteriAdi: sonuc.musteriEslesen?.ad_soyad ?? oneri.musteri_adi,
    telefon: oneri.telefon_numarasi ?? '',
    instagram: oneri.instagram_kullanici_adi ?? '',
    sehir: oneri.teslimat_sehri ?? '',
    adres: oneri.teslimat_adresi ?? '',
    ozelNot: oneri.ozel_not ?? '',
    musteriId: sonuc.musteriEslesen?.musteri_id ?? null,
    sahipKullaniciId: null,
    satirlar: oneri.satirlar.length
      ? oneri.satirlar.map((satir) => ({
          urunAciklamasi: satir.urun_aciklamasi,
          beden: satir.beden ?? '',
          renk: satir.renk ?? '',
          adet: String(satir.adet),
          fiyat: satir.birim_satis_fiyati_azn ? String(satir.birim_satis_fiyati_azn) : '',
          kaynakUlke: satir.kaynak_ulke,
        }))
      : [bosSatir()],
  };
}

const bosIse = (value: string) => (value.trim() ? value.trim() : undefined);

/**
 * Validates the form and builds the POST /api/v2/siparisler body. `sahipZorunlu`:
 * a platform admin never owns an order and must pick the owner (O-24).
 */
export function formdanIstek(
  form: SiparisFormu,
  { sahipZorunlu = false }: { sahipZorunlu?: boolean } = {}
): { govde: Record<string, unknown>; hatalar: [] } | { govde: null; hatalar: string[] } {
  const hatalar: string[] = [];
  if (!form.musteriAdi.trim()) hatalar.push('Müştəri adı lazımdır.');
  if (sahipZorunlu && !form.sahipKullaniciId) hatalar.push('Sifarişin sahibini seçin.');
  if (form.satirlar.length === 0) hatalar.push('Ən azı bir sətir lazımdır.');
  if (form.satirlar.length > 100) hatalar.push('Ən çox 100 sətir ola bilər.');
  const satirlar = form.satirlar.map((satir, index) => {
    const etiket = `${index + 1}. sətir`;
    const adet = sayiOku(satir.adet);
    const fiyat = sayiOku(satir.fiyat);
    if (!satir.urunAciklamasi.trim()) hatalar.push(`${etiket}: məhsul adı lazımdır.`);
    if (!Number.isInteger(adet) || adet < 1 || adet > 1000)
      hatalar.push(`${etiket}: say 1-1000 arası tam ədəd olmalıdır.`);
    if (!Number.isFinite(fiyat) || fiyat >= 1_000_000 || Math.round(fiyat * 100) / 100 !== fiyat)
      hatalar.push(`${etiket}: qiymət 0-1.000.000 AZN, ən çox 2 onluq olmalıdır.`);
    return {
      urun_aciklamasi: satir.urunAciklamasi.trim(),
      ...(bosIse(satir.beden) ? { beden: satir.beden.trim() } : {}),
      ...(bosIse(satir.renk) ? { renk: satir.renk.trim() } : {}),
      adet,
      birim_satis_fiyati_azn: fiyat,
      kaynak_ulke: satir.kaynakUlke,
    };
  });
  if (hatalar.length) return { govde: null, hatalar };
  const govde: Record<string, unknown> = { musteri_adi: form.musteriAdi.trim(), satirlar };
  const secimli: Array<[string, string | null]> = [
    ['telefon_numarasi', form.telefon],
    ['instagram_kullanici_adi', form.instagram],
    ['teslimat_sehri', form.sehir],
    ['teslimat_adresi', form.adres],
    ['ozel_not', form.ozelNot],
    ['ham_mesaj', form.hamMesaj],
    ['musteri_id', form.musteriId],
    ['sahip_kullanici_id', form.sahipKullaniciId],
  ];
  for (const [alan, deger] of secimli) if (deger && deger.trim()) govde[alan] = deger.trim();
  return { govde, hatalar: [] };
}
