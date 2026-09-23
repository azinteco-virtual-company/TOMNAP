import type { ManifestSatirOnerisi, SatirDurumu } from './manifestEslestirmeApi';

const DURUM_ETIKETI: Record<SatirDurumu, { metin: string; sinif: string }> = {
  ONERILDI: { metin: 'Güclü təklif', sinif: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  BELIRSIZ: { metin: 'Qeyri-müəyyən', sinif: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  ZAYIF_ADAY: { metin: 'Zəif namizəd (ad)', sinif: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' },
  ZATEN_BAGLI: { metin: 'Artıq bağlıdır', sinif: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  CAKISMA: { metin: 'Konflikt', sinif: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
  ESLESME_YOK: { metin: 'Uyğunluq yoxdur', sinif: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
  GECERSIZ_AWB: { metin: 'Etibarsız AWB', sinif: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
};

const BELIRSIZLIK: Record<string, string> = {
  COKLU_SIPARIS: 'Bir neçə sifariş uyğun gəlir',
  MANIFESTTE_TEKRAR_AWB: 'AWB manifestdə təkrarlanır',
  SIPARIS_BIRDEN_FAZLA_SATIRDA: 'Sifariş bir neçə sətirdə təklif edilib',
};

const TIP_ETIKETI = { TELEFON: 'Telefon', SIPARIS_KODU: 'Sifariş kodu', ISIM: 'Ad oxşarlığı' } as const;

interface Props {
  satirlar: ManifestSatirOnerisi[];
  secimler: Record<number, string>;
  onSec: (satirNo: number, siparisId: string | null) => void;
}

export default function EslestirmeSatirlari({ satirlar, secimler, onSec }: Props) {
  if (satirlar.length === 0)
    return <p className="text-xs text-slate-500">Manifestdə AWB sətri tapılmadı.</p>;
  return (
    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
      <table className="w-full text-xs text-left">
        <thead className="bg-slate-50 dark:bg-slate-800 font-bold uppercase text-2xs text-slate-500">
          <tr>
            <th className="p-2.5">Sətir</th>
            <th className="p-2.5">AWB</th>
            <th className="p-2.5">Alıcı</th>
            <th className="p-2.5">Vəziyyət</th>
            <th className="p-2.5">Bağlanacaq sifariş</th>
            <th className="p-2.5 text-center">Çəki</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {satirlar.map((satir) => {
            const etiket = DURUM_ETIKETI[satir.durum];
            return (
              <tr key={satir.satirNo} className="align-top">
                <td className="p-2.5 font-mono text-slate-500">{satir.satirNo}</td>
                <td className="p-2.5 font-mono font-bold text-blue-600">{satir.takipNo}</td>
                <td className="p-2.5">
                  <div className="font-bold">{satir.aliciAdi || '—'}</div>
                  {satir.telefon && <div className="text-2xs text-slate-500 font-mono">{satir.telefon}</div>}
                </td>
                <td className="p-2.5">
                  <span className={`inline-block px-2 py-0.5 rounded-md font-bold ${etiket.sinif}`}>
                    {etiket.metin}
                  </span>
                  {satir.belirsizlikSebebi && (
                    <div className="text-2xs text-amber-700 dark:text-amber-300 mt-1">
                      {BELIRSIZLIK[satir.belirsizlikSebebi] ?? satir.belirsizlikSebebi}
                    </div>
                  )}
                </td>
                <td className="p-2.5">
                  {satir.adaylar.length > 0 ? (
                    <select
                      aria-label={`Sətir ${satir.satirNo} üçün sifariş`}
                      value={secimler[satir.satirNo] ?? ''}
                      onChange={(event: { target: { value: string } }) => onSec(satir.satirNo, event.target.value || null)}
                      className="w-full max-w-72 p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option value="">— Seçilməyib —</option>
                      {satir.adaylar.map((aday) => (
                        <option key={aday.siparisId} value={aday.siparisId}>
                          {`${aday.musteriAdi || aday.siparisId} · ${TIP_ETIKETI[aday.eslesmeTipi]}${
                            aday.guc === 'ZAYIF' ? ` · ${Math.round(aday.skor * 100)}%` : ''
                          }`}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="p-2.5 text-center font-mono">
                  {satir.agirlikKg !== null ? `${satir.agirlikKg} kg` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
