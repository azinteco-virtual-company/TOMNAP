import React, { useState } from 'react';
import { Siparis } from '../types';
import { 
  X, 
  DollarSign, 
  AlertCircle, 
  CheckCircle2, 
  Phone, 
  MapPin, 
  CreditCard,
  Download,
  Copy,
  Check,
  Building
} from 'lucide-react';

interface BakuTahsilatModalProps {
  siparisler: Siparis[];
  onDurumGuncelle: (id: string, guncellemeler: Partial<Siparis>) => void;
  onKapat: () => void;
}

export const BakuTahsilatModal: React.FC<BakuTahsilatModalProps> = ({
  siparisler,
  onDurumGuncelle,
  onKapat,
}) => {
  const [filtre, setFiltre] = useState<'borclu' | 'tumu'>('borclu');
  const [kopyalandi, setKopyalandi] = useState(false);

  // Bakü'de kalan borçlu olanlar veya tümü
  const listelenenSiparisler = siparisler.filter((s) => {
    if (filtre === 'borclu') {
      return s.kalan_tutar > 0;
    }
    return true;
  });

  const toplamToplanacakBorc = listelenenSiparisler.reduce(
    (acc, s) => acc + (s.kalan_tutar || 0),
    0
  );

  const toplamTahsilEdilen = siparisler.reduce(
    (acc, s) => acc + (s.alinan_tutar || 0),
    0
  );

  const handleTamaminiOde = (siparis: Siparis) => {
    onDurumGuncelle(siparis.id, {
      alinan_tutar: siparis.toplam_tutar,
      kalan_tutar: 0,
      finans_durumu: 'ODENDI',
      baku_tahsilat_notu: (siparis.baku_tahsilat_notu ? siparis.baku_tahsilat_notu + ' • ' : '') + 'Baküde tam ödendi (' + new Date().toLocaleDateString('az-AZ') + ')',
    });
  };

  const bakuRaporuMetin = (): string => {
    const baslik = `📋 BAKI TƏHSİLAT VƏ QALIQ BORC HESABATI (${new Date().toLocaleDateString('az-AZ')})\nToplam Toplanacaq Qalıq: ${toplamToplanacakBorc.toFixed(2)} AZN\n--------------------------------------\n`;
    const satirlar = listelenenSiparisler.map((s, idx) => {
      const ozelNotMetni = s.ozel_not ? `   📌 Xüsusi Qeyd/Təlimat: ${s.ozel_not}\n` : '';
      return `${idx + 1}. ${s.musteri_adi} (${s.telefon_numarasi || 'Nömrə yox'})\n   Məhsul: ${s.urun_aciklamasi}\n   Qalıq Borc: ${s.kalan_tutar.toFixed(2)} ${s.para_birimi}\n   Ünvan: ${s.teslimat_adresi || 'Məlum deyil'}\n${ozelNotMetni}   Qeyd: ${s.baku_tahsilat_notu || 'Yoxdur'}\n`;
    }).join('\n');
    return baslik + satirlar;
  };

  const handleMetniKopyala = () => {
    navigator.clipboard.writeText(bakuRaporuMetin());
    setKopyalandi(true);
    setTimeout(() => setKopyalandi(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]">
        {/* Başlık */}
        <div className="bg-gradient-to-r from-amber-600 to-orange-700 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-amber-100">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">
                Bakı Təhsilat & Qalıq Borc İdarəetməsi
              </h3>
              <p className="text-xs text-amber-100">
                Bakıdakı qohum / dost üçün nağd və ya m10 ilə toplanacaq kassa hesabatı
              </p>
            </div>
          </div>
          <button
            onClick={onKapat}
            className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Özet Kartları & Butonlar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-4">
            <div className="bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-500 block">Toplanacaq Qalıq Borc</span>
              <span className="text-base font-bold text-amber-700">
                {toplamToplanacakBorc.toFixed(2)} AZN
              </span>
            </div>
            <div className="bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-500 block">Borclu Müştəri Sayı</span>
              <span className="text-base font-bold text-slate-800">
                {listelenenSiparisler.filter(s => s.kalan_tutar > 0).length} nəfər
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFiltre('borclu')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                filtre === 'borclu'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Yalnız Qalıq Borcu Olanlar
            </button>
            <button
              type="button"
              onClick={() => setFiltre('tumu')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                filtre === 'tumu'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Bütün Müştərilər
            </button>
            <button
              type="button"
              onClick={handleMetniKopyala}
              className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              {kopyalandi ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Kopyalandı</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-600" />
                  <span>Bakı Hesabatını Kopyala</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Borçlu Siparişler Listesi */}
        <div className="p-6 overflow-y-auto flex-1 divide-y divide-slate-100">
          {listelenenSiparisler.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              Mövcud filtr üzrə qalıq borcu olan müştəri yoxdur. Bütün ödənişlər tamamlanıb!
            </div>
          ) : (
            listelenenSiparisler.map((s) => (
              <div key={s.id} className="py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50/70 px-2 rounded-xl transition-colors">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-900 text-sm">{s.musteri_adi}</span>
                    {s.instagram_kullanici_adi && (
                      <span className="text-blue-600 text-xs font-medium">{s.instagram_kullanici_adi}</span>
                    )}
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">
                      {s.lojistik_durumu.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-800">{s.urun_aciklamasi}</span>
                    <span>•</span>
                    <span className="text-slate-500">{s.telefon_numarasi || 'Nömrə qeyd olunmayıb'}</span>
                    {s.teslimat_adresi && (
                      <>
                        <span>•</span>
                        <span className="text-slate-500">{s.teslimat_adresi}</span>
                      </>
                    )}
                  </div>

                  {s.ozel_not && (
                    <div className="text-[11px] text-amber-950 bg-amber-50 px-2 py-1 rounded-lg border border-amber-300 inline-flex items-center gap-1 font-semibold">
                      <span>📌</span>
                      <span>Xüsusi Təlimat: {s.ozel_not}</span>
                    </div>
                  )}

                  {s.baku_tahsilat_notu && (
                    <div className="text-[11px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-block">
                      💡 {s.baku_tahsilat_notu}
                    </div>
                  )}
                </div>

                {/* Tutar & Tahsilat Butonu */}
                <div className="flex items-center space-x-4 shrink-0 justify-between md:justify-end">
                  <div className="text-right">
                    <div className="text-xs text-slate-400">
                      Toplam: {s.toplam_tutar.toFixed(2)} {s.para_birimi} • Ödənilən: {s.alinan_tutar.toFixed(2)}
                    </div>
                    <div className="text-sm font-bold text-amber-700">
                      Qalıq: {s.kalan_tutar.toFixed(2)} {s.para_birimi}
                    </div>
                  </div>

                  {s.kalan_tutar > 0 ? (
                    <button
                      type="button"
                      onClick={() => handleTamaminiOde(s)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Tam Ödənildi</span>
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Ödənilib
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Alt Kısım */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500">
            * "Tam Ödənildi" düyməsinə basıldıqda status avtomatik olaraq canlı Supabase bazasında yenilənir.
          </span>
          <button
            type="button"
            onClick={onKapat}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Bağla
          </button>
        </div>
      </div>
    </div>
  );
};
