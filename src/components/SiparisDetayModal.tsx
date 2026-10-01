import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Siparis } from '../types';
import { UrunGorselleriGalerisi } from './UrunGorselleriGalerisi';
import { KuryeAtamaAlani } from './KuryeAtamaAlani';
import { useAppStore } from '../store/appStore';
import {
  X,
  MessageSquare,
  Send,
  Check,
  Truck,
  DollarSign,
  Receipt,
  Store,
  Upload,
  RefreshCw,
} from 'lucide-react';
import { uretKanadaTakipKodu, uretUluslararasiKargoKodu } from '../utils/pdfHelpers';
import { detayFormuDegisiklikleri, FATURA_GORSELI_AZAMI_BAYT } from './siparisDetayFormu';
import { para, tarihSaat } from '../i18n/bicim';
import { useBelgeCevirisi } from '../i18n/belge';

interface SiparisDetayModalProps {
  siparis: Siparis | null;
  onKapat: () => void;
  /** Sunucu kaydı kabul ettiyse true. */
  onGuncelle: (id: string, guncellemeler: Partial<Siparis>) => Promise<boolean>;
  onWhatsAppAc?: (siparis: Siparis) => void;
  onAtamaKaydedildi: (siparis: Siparis) => void;
  onSiparisYenile: () => Promise<void>;
}

/**
 * v1 sipariş detayı (B2, docs/i18n.md): ekrandaki metinler arayüz dilinde; müşteriye
 * gidecek WhatsApp şablonları butiğin belge dilinde.
 */
export const SiparisDetayModal: React.FC<SiparisDetayModalProps> = ({
  siparis,
  onKapat,
  onGuncelle,
  onWhatsAppAc,
  onAtamaKaydedildi,
  onSiparisYenile,
}) => {
  const { t } = useTranslation('siparis');
  const belge = useBelgeCevirisi();
  const role = useAppStore((state) => state.aktifRol);
  const tenantId = useAppStore((state) => state.seciliFirmaId);
  const [kopyalandi, setKopyalandi] = useState(false);
  const [kaydedildi, setKaydedildi] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [formMesaji, setFormMesaji] = useState('');
  const [kanadaTakip, setKanadaTakip] = useState(siparis?.kanada_takip_kodu || '');
  const [kargoKodu, setKargoKodu] = useState(siparis?.uluslararasi_kargo_kodu || '');
  const [tahsilatNotu, setTahsilatNotu] = useState(siparis?.baku_tahsilat_notu || '');
  const [ozelNot, setOzelNot] = useState(siparis?.ozel_not || '');

  // Yeni Lojistik ve Satınalma Alanları
  const [magazaAdi, setMagazaAdi] = useState(siparis?.kanada_magaza_adi || '');
  const [alisFiyatiCad, setAlisFiyatiCad] = useState(
    siparis?.kanada_alis_fiyati_cad?.toString() || ''
  );
  const [faturaGorseli, setFaturaGorseli] = useState(siparis?.kanada_fatura_gorseli || '');
  const [finKodu, setFinKodu] = useState(siparis?.kanada_gumruk_fin_kodu || '');
  const [pasaportNo, setPasaportNo] = useState(siparis?.kanada_gumruk_pasaport_no || '');

  React.useEffect(() => {
    if (siparis) {
      setKanadaTakip(siparis.kanada_takip_kodu || '');
      setKargoKodu(siparis.uluslararasi_kargo_kodu || '');
      setTahsilatNotu(siparis.baku_tahsilat_notu || '');
      setOzelNot(siparis.ozel_not || '');
      setMagazaAdi(siparis.kanada_magaza_adi || '');
      setAlisFiyatiCad(siparis.kanada_alis_fiyati_cad?.toString() || '');
      setFaturaGorseli(siparis.kanada_fatura_gorseli || '');
      setFinKodu(siparis.kanada_gumruk_fin_kodu || '');
      setPasaportNo(siparis.kanada_gumruk_pasaport_no || '');
      setFormMesaji('');
    }
  }, [siparis]);

  if (!siparis) return null;

  const eksikler = siparis.eksik_bilgiler ?? [];
  // Eksik bilgi varsa müşteriye yazılacak hazır WhatsApp şablonu (belge dili).
  const whatsappEksikBilgiMesaji = belge('whatsapp.eksikBilgi', {
    musteri: siparis.musteri_adi,
    urun: siparis.urun_aciklamasi,
    eksikler: eksikler.length > 0 ? eksikler.join(', ') : belge('whatsapp.varsayilanEksikler'),
  });
  // Bakü teslimat bildirimi şablonu (belge dili).
  const whatsappTeslimatMesaji = belge('whatsapp.teslimat', {
    musteri: siparis.musteri_adi,
    urun: siparis.urun_aciklamasi,
    kalan: para(siparis.kalan_tutar, siparis.para_birimi),
  });

  const kopyalaMetin = (metin: string) => {
    navigator.clipboard.writeText(metin);
    setKopyalandi(true);
    setTimeout(() => setKopyalandi(false), 2000);
  };

  const handleFaturaYukle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.size > FATURA_GORSELI_AZAMI_BAYT) {
      setFormMesaji(t('detay.faturaCokBuyuk'));
    } else if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFaturaGorseli(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Yalnız değişen alanlar gider; "kaydedildi" sunucu kabul ettikten sonra (Codex R3 F14).
  const kaydetDetaylar = async () => {
    const sonuc = detayFormuDegisiklikleri(siparis, {
      kanadaTakip,
      kargoKodu,
      tahsilatNotu,
      ozelNot,
      magazaAdi,
      alisFiyatiCad,
      faturaGorseli,
      finKodu,
      pasaportNo,
    });
    if (sonuc.hata !== undefined) return setFormMesaji(t(sonuc.hata));
    if (Object.keys(sonuc.degisiklikler).length === 0)
      return setFormMesaji(t('detay.degisiklikYok'));
    setFormMesaji('');
    setKaydediliyor(true);
    const kabul = await onGuncelle(siparis.id, sonuc.degisiklikler).finally(() =>
      setKaydediliyor(false)
    );
    if (!kabul) return setFormMesaji(t('detay.kaydedilmedi'));
    setKaydedildi(true);
    setTimeout(() => setKaydedildi(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="siparis-detay-baslik"
        className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8"
      >
        {/* Modal Başlığı */}
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 shrink-0 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
              {t('detay.kimlikRozeti')}
            </div>
            <div className="min-w-0">
              <h3
                id="siparis-detay-baslik"
                className="text-base font-bold text-slate-900 break-words"
              >
                {t('detay.baslik', { musteri: siparis.musteri_adi })}
              </h3>
              <p className="text-xs text-slate-500">
                {t('detay.olusturulma', {
                  tarih: tarihSaat(siparis.olusturma_tarihi),
                  kanal: siparis.siparis_kaynagi,
                })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onKapat}
            aria-label={t('ortak:bagla')}
            className="p-1.5 shrink-0 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Gövdesi */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* 1. Müşterinin Orijinal Dağınık Mesajı */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                {t('detay.hamMesaj')}
              </span>
              <span className="text-[11px] text-slate-400">{t('detay.aiGirisi')}</span>
            </div>
            <p className="text-sm text-slate-800 italic bg-white p-3 rounded-lg border border-slate-200">
              “{siparis.ham_mesaj}”
            </p>
          </div>

          {/* Ayrıştırılan Ürün Fotoğrafları ve Orijinal Ekran Görüntüleri Galerisi */}
          <UrunGorselleriGalerisi siparis={siparis} onGuncelle={onGuncelle} />

          {/* 2. Finans ve Lojistik Durum Paneli */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> {t('detay.finans')}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-bold ${
                    siparis.finans_durumu === 'ODENDI'
                      ? 'bg-emerald-100 text-emerald-800'
                      : siparis.finans_durumu === 'KISMI_ODEME'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {t(`finans.${siparis.finans_durumu}`, { defaultValue: siparis.finans_durumu })}
                </span>
              </div>
              <div className="text-sm">
                {t('detay.toplam')}{' '}
                <strong>{para(siparis.toplam_tutar, siparis.para_birimi)}</strong>
              </div>
              <div className="text-sm text-emerald-700">
                {t('detay.tahsilEdilen')}{' '}
                <strong>{para(siparis.alinan_tutar, siparis.para_birimi)}</strong>
              </div>
              <div className="text-sm text-amber-700 font-semibold">
                {t('detay.kalanBorc')}{' '}
                <strong>{para(siparis.kalan_tutar, siparis.para_birimi)}</strong>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-blue-600" /> {t('detay.lojistik')}
                </span>
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 text-end">
                  {t(`lojistik.${siparis.lojistik_durumu}`, {
                    defaultValue: siparis.lojistik_durumu,
                  })}
                </span>
              </div>
              <div className="text-xs text-slate-600">
                <strong>{t('detay.sehir')}</strong>{' '}
                {siparis.teslimat_sehri || t('detay.sehirVarsayilan')}
              </div>
              <div className="text-xs text-slate-600">
                <strong>{t('detay.adres')}</strong>{' '}
                {siparis.teslimat_adresi || t('detay.belirtilmeyib')}
              </div>
              <div className="text-xs text-slate-600">
                <strong>{t('detay.elaqe')}</strong>{' '}
                {siparis.telefon_numarasi || t('detay.telefonYoxdur')}
              </div>
            </div>
          </div>

          {/* 3. Kanada Satınalma & Fatura / Fiş Yükleme Masası */}
          <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/40 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-rose-950 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-rose-600" />
                {t('detay.kanada.baslik')}
              </span>
              <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full border border-rose-200 shrink-0">
                {t('detay.kanada.etiket')}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-slate-700">
                <span className="block mb-1">{t('detay.kanada.magaza')}</span>
                <span className="relative block">
                  <Store className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={magazaAdi}
                    onChange={(e) => setMagazaAdi(e.target.value)}
                    placeholder={t('detay.kanada.magazaOrnek')}
                    className="w-full text-xs ps-8 pe-3 py-2 border border-slate-300 rounded-lg bg-white"
                  />
                </span>
              </label>

              <label className="block text-xs font-medium text-slate-700">
                <span className="block mb-1">{t('detay.kanada.alisTutari')}</span>
                <span className="relative block">
                  <span className="text-slate-400 text-xs font-bold absolute start-3 top-1/2 -translate-y-1/2">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={alisFiyatiCad}
                    onChange={(e) => setAlisFiyatiCad(e.target.value)}
                    placeholder="89.99"
                    className="w-full text-xs ps-7 pe-3 py-2 border border-slate-300 rounded-lg bg-white font-mono font-bold text-slate-800"
                  />
                </span>
              </label>
            </div>

            {/* Fatura / Fiş Görseli */}
            <div>
              <span className="block text-xs font-medium text-slate-700 mb-1">
                {t('detay.kanada.fatura')}
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 px-3 py-2 bg-white border border-rose-300 rounded-lg text-xs font-bold text-rose-800 hover:bg-rose-50 cursor-pointer shadow-2xs">
                  <Upload className="w-3.5 h-3.5 text-rose-600" />
                  <span>{t('detay.kanada.faturaYukle')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFaturaYukle}
                    className="hidden"
                  />
                </label>
                {faturaGorseli ? (
                  <div className="flex items-center gap-2">
                    <img
                      src={faturaGorseli}
                      alt={t('detay.kanada.faturaGorseli')}
                      className="w-10 h-10 object-cover rounded-lg border border-slate-300 shadow-xs"
                    />
                    <span className="text-[11px] text-emerald-700 font-semibold">
                      ✓ {t('detay.kanada.faturaYuklendi')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFaturaGorseli('')}
                      className="text-[11px] text-rose-600 hover:underline ms-1"
                    >
                      {t('detay.kanada.kaldir')}
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-400 italic">
                    {t('detay.kanada.faturaYoxdur')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 4. Bakü Bölgesel Kurye Ataması & Resmi Gümrük Alıcısı (FIN Kodu) */}
          <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/40 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-purple-600" />
                {t('detay.baki.baslik')}
              </span>
              <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full border border-purple-200 shrink-0">
                {t('detay.baki.etiket')}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <KuryeAtamaAlani
                key={siparis.id}
                order={siparis}
                role={role}
                tenantId={tenantId}
                onSaved={onAtamaKaydedildi}
                onRefresh={onSiparisYenile}
              />

              {/* Gümrük FIN Kodu */}
              <label className="block text-xs font-bold text-slate-700">
                <span className="block mb-1">{t('detay.baki.fin')}</span>
                <input
                  type="text"
                  value={finKodu}
                  onChange={(e) => setFinKodu(e.target.value.toUpperCase())}
                  placeholder={t('detay.baki.finOrnek')}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-white uppercase font-mono font-bold"
                />
                <span className="block text-[10px] font-normal text-slate-500 mt-1">
                  {t('detay.baki.finNotu')}
                </span>
              </label>
            </div>
          </div>

          {/* 5. Operasyonel Kodlar ve Notlar */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {t('detay.notlar.baslik')}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label
                    htmlFor="detay-kanada-kodu"
                    className="block text-xs font-medium text-slate-700"
                  >
                    {t('detay.notlar.kanadaKodu')}
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setKanadaTakip(
                        uretKanadaTakipKodu(magazaAdi || siparis.urun_aciklamasi, 'TOR')
                      )
                    }
                    className="text-[10px] text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 cursor-pointer hover:underline"
                    title={t('detay.notlar.kanadaKoduYarat')}
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>{t('detay.notlar.avtoYarat')}</span>
                  </button>
                </div>
                <input
                  id="detay-kanada-kodu"
                  type="text"
                  value={kanadaTakip}
                  onChange={(e) => setKanadaTakip(e.target.value)}
                  placeholder="TOR-ZARA-9821"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label
                    htmlFor="detay-kargo-kodu"
                    className="block text-xs font-medium text-slate-700"
                  >
                    {t('detay.notlar.kargoKodu')}
                  </label>
                  <button
                    type="button"
                    onClick={() => setKargoKodu(uretUluslararasiKargoKodu())}
                    className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer hover:underline"
                    title={t('detay.notlar.kargoKoduYarat')}
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>{t('detay.notlar.avtoYarat')}</span>
                  </button>
                </div>
                <input
                  id="detay-kargo-kodu"
                  type="text"
                  value={kargoKodu}
                  onChange={(e) => setKargoKodu(e.target.value)}
                  placeholder="AZ-CARGO-7749-YYZ"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>
            </div>

            {/* Özel Teslimat ve Müşteri Talimatı (ozel_not) */}
            <div className="p-3.5 bg-amber-50/80 border border-amber-300 rounded-xl space-y-1.5 shadow-2xs">
              <label
                htmlFor="detay-talimat"
                className="text-xs font-bold text-amber-950 flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-amber-600">📌</span>
                  <span>{t('detay.notlar.talimat')}</span>
                </span>
                <span className="text-[10px] bg-amber-200/70 text-amber-900 px-1.5 py-0.5 rounded font-bold shrink-0">
                  {t('detay.notlar.talimatEtiket')}
                </span>
              </label>
              <textarea
                id="detay-talimat"
                rows={2}
                value={ozelNot}
                onChange={(e) => setOzelNot(e.target.value)}
                placeholder={t('detay.notlar.talimatOrnek')}
                className="w-full text-xs p-2.5 border border-amber-300 rounded-lg bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-medium"
              />
              <p className="text-[10px] text-amber-800 italic">{t('detay.notlar.talimatNotu')}</p>
            </div>

            <label className="block text-xs font-medium text-slate-700">
              <span className="block mb-1">{t('detay.notlar.tahsilat')}</span>
              <textarea
                rows={2}
                value={tahsilatNotu}
                onChange={(e) => setTahsilatNotu(e.target.value)}
                placeholder={t('detay.notlar.tahsilatOrnek')}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-white"
              />
            </label>
          </div>

          {formMesaji && (
            <div
              role="status"
              className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold"
            >
              {formMesaji}
            </div>
          )}

          {/* Kaydedildi Başarı Bildirimi */}
          {kaydedildi && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 animate-fadeIn">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{t('detay.kaydedildi')}</span>
            </div>
          )}

          {/* WhatsApp Hızlı İletişim Şablonları */}
          <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-emerald-600" />
                {t('detay.whatsapp.baslik')}
              </span>
              {kopyalandi && (
                <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> {t('ortak:kopyalandi')}
                </span>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="text-xs text-emerald-800">
                {eksikler.length > 0
                  ? t('detay.whatsapp.eksikBilgi', { eksikler: eksikler.join(', ') })
                  : t('detay.whatsapp.teslimat')}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  aria-label={t('detay.whatsapp.baslik')}
                  value={eksikler.length > 0 ? whatsappEksikBilgiMesaji : whatsappTeslimatMesaji}
                  className="w-full text-xs p-2 bg-white border border-emerald-300 rounded-lg text-slate-700"
                />
                <button
                  type="button"
                  onClick={() =>
                    kopyalaMetin(
                      eksikler.length > 0 ? whatsappEksikBilgiMesaji : whatsappTeslimatMesaji
                    )
                  }
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium shrink-0 cursor-pointer"
                >
                  {t('ortak:kopyala')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Alt Butonları */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2.5">
          <div>
            {onWhatsAppAc && (
              <button
                type="button"
                onClick={() => onWhatsAppAc(siparis)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{t('detay.whatsapp.ac')}</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onKapat}
              className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-white transition-colors cursor-pointer"
            >
              {t('ortak:bagla')}
            </button>
            <button
              type="button"
              onClick={kaydetDetaylar}
              disabled={kaydediliyor}
              className="px-4 py-2 disabled:opacity-60 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors shadow-sm cursor-pointer"
            >
              {kaydedildi ? t('detay.saxlanildi') : t('detay.yaddaSaxla')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
