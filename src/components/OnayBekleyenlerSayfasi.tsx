import { apiFetch } from '../lib/apiClient';
import React, { useState, useEffect } from 'react';
import { OnayBekleyenMesaj, Siparis } from '../types';
import {
  Inbox,
  Sparkles,
  CheckCircle2,
  XCircle,
  Edit3,
  MessageSquare,
  Send,
  User,
  Smartphone,
  MapPin,
  DollarSign,
  Tag,
  Clock,
  ArrowLeft,
  RefreshCw,
  Check,
  AlertCircle,
  PlusCircle,
  Search,
  Filter,
  Store,
} from 'lucide-react';

interface OnayBekleyenlerSayfasiProps {
  onSiparisOnaylandi: (yeniSiparis: Siparis) => void;
  onSiparislereDon?: () => void;
  onYenile?: () => void;
  seciliFirmaId?: string;
  seciliFirmaAd?: string;
}

export const OnayBekleyenlerSayfasi: React.FC<OnayBekleyenlerSayfasiProps> = ({
  onSiparisOnaylandi,
  onSiparislereDon,
  onYenile,
  seciliFirmaId,
  seciliFirmaAd,
}) => {
  const [inboxListesi, setInboxListesi] = useState<OnayBekleyenMesaj[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [seciliMesaj, setSeciliMesaj] = useState<OnayBekleyenMesaj | null>(null);
  const [duzenlemeModu, setDuzenlemeModu] = useState(false);
  const [aramaMetni, setAramaMetni] = useState('');
  const [kaynakFiltre, setKaynakFiltre] = useState<'tumu' | 'INSTAGRAM_DM' | 'WHATSAPP'>('tumu');

  // Düzenleme formu alanları
  const [duzenlemeForm, setDuzenlemeForm] = useState({
    musteri_adi: '',
    instagram_kullanici_adi: '',
    telefon_numarasi: '',
    teslimat_sehri: 'Bakü',
    teslimat_adresi: '',
    urun_aciklamasi: '',
    beden_veya_olcu: '',
    renk: '',
    adet: 1,
    toplam_tutar: 0,
    alinan_tutar: 0,
    para_birimi: 'AZN',
    baku_tahsilat_notu: '',
  });

  // Test mesajı simülasyonu
  const [simulasyonMetni, setSimulasyonMetni] = useState('');
  const [simulasyonGonderen, setSimulasyonGonderen] = useState('');
  const [simulasyonKaynak, setSimulasyonKaynak] = useState<'INSTAGRAM_DM' | 'WHATSAPP'>(
    'INSTAGRAM_DM'
  );
  const [simulasyonYukleniyor, setSimulasyonYukleniyor] = useState(false);
  const [islemYapiliyor, setIslemYapiliyor] = useState(false);

  // Inbox verilerini getir
  const inboxGetir = async () => {
    try {
      setYukleniyor(true);
      const url =
        seciliFirmaId && seciliFirmaId !== 'all'
          ? `/api/inbox?tenant_id=${encodeURIComponent(seciliFirmaId)}`
          : '/api/inbox';
      const res = await apiFetch(url);
      const data = await res.json();
      if (data.basarili && Array.isArray(data.mesajlar)) {
        const bekleyenler = data.mesajlar.filter((m: OnayBekleyenMesaj) => m.durum === 'BEKLEMEDE');
        setInboxListesi(bekleyenler);
        if (bekleyenler.length > 0) {
          // Eğer seçili mesaj listede yoksa ilkini seç
          if (!seciliMesaj || !bekleyenler.some((m) => m.id === seciliMesaj.id)) {
            seciliMesajAyarla(bekleyenler[0]);
          }
        } else {
          setSeciliMesaj(null);
        }
      } else {
        setInboxListesi([]);
        setSeciliMesaj(null);
      }
    } catch (e) {
      console.error('Inbox verileri alınamadı:', e);
      setInboxListesi([]);
      setSeciliMesaj(null);
    } finally {
      setYukleniyor(false);
    }
  };

  useEffect(() => {
    inboxGetir();
  }, [seciliFirmaId]);

  const seciliMesajAyarla = (mesaj: OnayBekleyenMesaj) => {
    setSeciliMesaj(mesaj);
    const oneri = mesaj.oneri_siparis || ({} as any);
    setDuzenlemeForm({
      musteri_adi: oneri.musteri_adi || '',
      instagram_kullanici_adi: oneri.instagram_kullanici_adi || '',
      telefon_numarasi: oneri.telefon_numarasi || '',
      teslimat_sehri: oneri.teslimat_sehri || 'Bakü',
      teslimat_adresi: oneri.teslimat_adresi || '',
      urun_aciklamasi: oneri.urun_aciklamasi || '',
      beden_veya_olcu: oneri.beden_veya_olcu || '',
      renk: oneri.renk || '',
      adet: oneri.adet || 1,
      toplam_tutar: oneri.toplam_tutar || 0,
      alinan_tutar: oneri.alinan_tutar || 0,
      para_birimi: oneri.para_birimi || 'AZN',
      baku_tahsilat_notu: oneri.baku_tahsilat_notu || '',
    });
    setDuzenlemeModu(false);
  };

  // Onayla ve Sipariş Oluştur
  const handleOnayla = async (mesajId: string) => {
    try {
      setIslemYapiliyor(true);
      const res = await apiFetch(`/api/inbox/${mesajId}/onayla`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duzeltilmis_siparis: duzenlemeForm,
          tenant_id:
            seciliFirmaId && seciliFirmaId !== 'all' ? seciliFirmaId : seciliMesaj?.tenant_id,
        }),
      });
      const data = await res.json();
      if (data.basarili && data.siparis) {
        onSiparisOnaylandi(data.siparis);
        if (onYenile) onYenile();

        const guncel = inboxListesi.filter((m) => m.id !== mesajId);
        setInboxListesi(guncel);
        if (guncel.length > 0) {
          seciliMesajAyarla(guncel[0]);
        } else {
          setSeciliMesaj(null);
        }
      }
    } catch (e) {
      console.error('Onaylama xətası:', e);
    } finally {
      setIslemYapiliyor(false);
    }
  };

  // Reddet / Sil
  const handleReddet = async (mesajId: string) => {
    try {
      setIslemYapiliyor(true);
      await apiFetch(`/api/inbox/${mesajId}/reddet`, { method: 'POST' });
      if (onYenile) onYenile();
      const guncel = inboxListesi.filter((m) => m.id !== mesajId);
      setInboxListesi(guncel);
      if (guncel.length > 0) {
        seciliMesajAyarla(guncel[0]);
      } else {
        setSeciliMesaj(null);
      }
    } catch (e) {
      console.error('Reddetmə xətası:', e);
    } finally {
      setIslemYapiliyor(false);
    }
  };

  // Simülasyon Gönder
  const handleSimulasyonGonder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simulasyonMetni.trim()) return;

    try {
      setSimulasyonYukleniyor(true);
      const res = await apiFetch('/api/webhook/siparis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mesaj: simulasyonMetni,
          gonderen: simulasyonGonderen || '@instagram_musteri',
          kaynak: simulasyonKaynak,
          tenant_id: seciliFirmaId && seciliFirmaId !== 'all' ? seciliFirmaId : undefined,
        }),
      });
      const data = await res.json();
      if (data.basarili && data.inbox) {
        setInboxListesi((prev) => [data.inbox, ...prev]);
        seciliMesajAyarla(data.inbox);
        setSimulasyonMetni('');
        setSimulasyonGonderen('');
        if (onYenile) onYenile();
      }
    } catch (e) {
      console.error('Simülasyon xətası:', e);
    } finally {
      setSimulasyonYukleniyor(false);
    }
  };

  // Filtrelenmiş liste
  const filtrelenmisInbox = inboxListesi.filter((m) => {
    if (kaynakFiltre !== 'tumu' && m.kaynak !== kaynakFiltre) return false;
    if (aramaMetni.trim()) {
      const q = aramaMetni.toLowerCase();
      const str = [
        m.gonderen,
        m.mesaj_icerigi,
        m.oneri_siparis?.musteri_adi,
        m.oneri_siparis?.urun_aciklamasi,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!str.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 1. Üst Başlık & Eylem Çubuğu */}
      <div className="bg-gradient-to-r from-violet-950 via-slate-900 to-indigo-950 p-6 rounded-2xl text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 border border-violet-900/30">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0">
            <Inbox className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="font-extrabold text-xl text-white tracking-tight">
                Gələn Qutusu: Təsdiq Gözləyən Sifarişlər
              </h2>
              {seciliFirmaAd && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/30 text-blue-200 border border-blue-400/40 flex items-center gap-1">
                  <Store className="w-3.5 h-3.5 text-blue-300" />
                  {seciliFirmaAd}
                </span>
              )}
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-violet-500/20 text-violet-300 border border-violet-400/30">
                {inboxListesi.length} Yeni Tələb
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Instagram DM və ya WhatsApp danışıqlarında <strong>#SİPARİŞ</strong> /{' '}
              <strong>#ONAY</strong> etiketi ilə avtomatik çıxarılan AI sifariş qaralamaları
            </p>
          </div>
        </div>

        {/* Butonlar */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {onSiparislereDon && (
            <button
              type="button"
              onClick={onSiparislereDon}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Siparişlərə Qayıt</span>
            </button>
          )}

          <button
            type="button"
            onClick={inboxGetir}
            disabled={yukleniyor}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${yukleniyor ? 'animate-spin' : ''}`} />
            <span>{yukleniyor ? 'Yenilənir...' : 'Yenilə'}</span>
          </button>
        </div>
      </div>

      {/* 2. Ana İş Masası (Sol: Talepler Listesi, Sağ: İnceleme & Onay Formu) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sol Panel: Gelen Talepler Listesi (5 Kolon) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col min-h-[550px]">
          {/* Arama & Kaynak Filtresi */}
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Göndərən, məhsul, mətn axtar..."
                  value={aramaMetni}
                  onChange={(e) => setAramaMetni(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-700 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-violet-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-1 text-xs">
              <button
                type="button"
                onClick={() => setKaynakFiltre('tumu')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  kaynakFiltre === 'tumu'
                    ? 'bg-violet-700 text-white'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                Hamısı ({inboxListesi.length})
              </button>
              <button
                type="button"
                onClick={() => setKaynakFiltre('INSTAGRAM_DM')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  kaynakFiltre === 'INSTAGRAM_DM'
                    ? 'bg-pink-700 text-white'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                Instagram ({inboxListesi.filter((m) => m.kaynak === 'INSTAGRAM_DM').length})
              </button>
              <button
                type="button"
                onClick={() => setKaynakFiltre('WHATSAPP')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  kaynakFiltre === 'WHATSAPP'
                    ? 'bg-emerald-700 text-white'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                WhatsApp ({inboxListesi.filter((m) => m.kaynak === 'WHATSAPP').length})
              </button>
            </div>
          </div>

          {/* Liste Gövdesi */}
          <div className="divide-y divide-slate-100 overflow-y-auto max-h-[600px] flex-1">
            {filtrelenmisInbox.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-400" />
                <div className="font-bold text-slate-700 text-sm">Gözləyən sifariş yoxdur!</div>
                <p className="text-slate-500 mt-1">
                  Bütün Instagram və WhatsApp danışıqları təsdiqlənərək əsas bazaya ötürülüb.
                </p>
              </div>
            ) : (
              filtrelenmisInbox.map((mesaj) => {
                const secili = seciliMesaj?.id === mesaj.id;
                const oneri = mesaj.oneri_siparis || {};
                return (
                  <div
                    key={mesaj.id}
                    onClick={() => seciliMesajAyarla(mesaj)}
                    className={`p-4 cursor-pointer transition-all ${
                      secili ? 'bg-violet-50/90 border-l-4 border-violet-600' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            mesaj.kaynak === 'INSTAGRAM_DM'
                              ? 'bg-pink-100 text-pink-700 border border-pink-200'
                              : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {mesaj.kaynak === 'INSTAGRAM_DM' ? '📸 Instagram DM' : '💬 WhatsApp'}
                        </span>
                        <span className="font-bold text-slate-900 text-xs">{mesaj.gonderen}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {mesaj.tarih
                          ? new Date(mesaj.tarih).toLocaleTimeString('az-AZ', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </span>
                    </div>

                    <div className="text-xs font-semibold text-slate-800 line-clamp-1 mb-1">
                      {oneri.urun_aciklamasi || 'Məhsul aşkarlandı'}
                    </div>

                    <p className="text-[11px] text-slate-500 line-clamp-2 bg-slate-100/70 p-2 rounded-lg font-mono">
                      "{mesaj.mesaj_icerigi}"
                    </p>

                    <div className="mt-2 flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-700">
                        {oneri.toplam_tutar
                          ? `${oneri.toplam_tutar} AZN`
                          : 'Qiymət təyin olunmayıb'}
                      </span>
                      {oneri.musteri_adi && (
                        <span className="text-slate-500">{oneri.musteri_adi}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Sağ Panel: Seçilen Talebin İnceleme Masası & Düzenleme Formu (7 Kolon) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col min-h-[550px]">
          {seciliMesaj ? (
            <div className="p-6 space-y-6 flex-1 flex flex-col justify-between">
              <div className="space-y-5">
                {/* 1. Üst Bar: Orijinal Mesaj & AI Doğrulama Durumu */}
                <div className="bg-slate-900 text-slate-100 p-4 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-violet-400" />
                      <span className="font-bold text-violet-300">Orijinal Müştəri Mesajı</span>
                      <span className="text-slate-400">({seciliMesaj.kaynak})</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {seciliMesaj.gonderen}
                    </span>
                  </div>
                  <div className="bg-slate-800/80 p-3 rounded-lg text-xs font-mono text-slate-200 leading-relaxed border border-slate-700 whitespace-pre-wrap">
                    {seciliMesaj.mesaj_icerigi}
                  </div>
                </div>

                {/* 2. AI Tarafından Çıkarılan Sipariş Kartı / Form */}
                <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/50 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-violet-600" />
                      <h4 className="font-bold text-sm text-slate-900">
                        Çıxarılan Sifariş Məlumatları
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDuzenlemeModu(!duzenlemeModu)}
                      className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                      <span>{duzenlemeModu ? 'Baxış Rejimi' : 'Düzəliş Et'}</span>
                    </button>
                  </div>

                  {duzenlemeModu ? (
                    /* Düzenleme Formu */
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">
                          Müştəri Adı
                        </label>
                        <input
                          type="text"
                          value={duzenlemeForm.musteri_adi}
                          onChange={(e) =>
                            setDuzenlemeForm({ ...duzenlemeForm, musteri_adi: e.target.value })
                          }
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">
                          Telefon Nömrəsi
                        </label>
                        <input
                          type="text"
                          value={duzenlemeForm.telefon_numarasi}
                          onChange={(e) =>
                            setDuzenlemeForm({ ...duzenlemeForm, telefon_numarasi: e.target.value })
                          }
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="font-semibold text-slate-700 block mb-1">
                          Məhsul Təsviri
                        </label>
                        <input
                          type="text"
                          value={duzenlemeForm.urun_aciklamasi}
                          onChange={(e) =>
                            setDuzenlemeForm({ ...duzenlemeForm, urun_aciklamasi: e.target.value })
                          }
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">
                          Ölçü / Bədən
                        </label>
                        <input
                          type="text"
                          value={duzenlemeForm.beden_veya_olcu}
                          onChange={(e) =>
                            setDuzenlemeForm({ ...duzenlemeForm, beden_veya_olcu: e.target.value })
                          }
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">Rəng</label>
                        <input
                          type="text"
                          value={duzenlemeForm.renk}
                          onChange={(e) =>
                            setDuzenlemeForm({ ...duzenlemeForm, renk: e.target.value })
                          }
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">
                          Toplam Qiymət (AZN)
                        </label>
                        <input
                          type="number"
                          value={duzenlemeForm.toplam_tutar}
                          onChange={(e) =>
                            setDuzenlemeForm({
                              ...duzenlemeForm,
                              toplam_tutar: Number(e.target.value),
                            })
                          }
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">
                          Alınan İlkin Ödəniş (AZN)
                        </label>
                        <input
                          type="number"
                          value={duzenlemeForm.alinan_tutar}
                          onChange={(e) =>
                            setDuzenlemeForm({
                              ...duzenlemeForm,
                              alinan_tutar: Number(e.target.value),
                            })
                          }
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">
                          Çatdırılma Şəhəri
                        </label>
                        <input
                          type="text"
                          value={duzenlemeForm.teslimat_sehri}
                          onChange={(e) =>
                            setDuzenlemeForm({ ...duzenlemeForm, teslimat_sehri: e.target.value })
                          }
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">Ünvan</label>
                        <input
                          type="text"
                          value={duzenlemeForm.teslimat_adresi}
                          onChange={(e) =>
                            setDuzenlemeForm({ ...duzenlemeForm, teslimat_adresi: e.target.value })
                          }
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                  ) : (
                    /* Temiz Önizleme Görünümü */
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="p-3 bg-white rounded-xl border border-slate-200">
                        <div className="text-[11px] text-slate-400 flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          Müştəri
                        </div>
                        <div className="font-bold text-slate-900 text-sm mt-0.5">
                          {duzenlemeForm.musteri_adi || 'Təyin olunmayıb'}
                        </div>
                        <div className="text-slate-500 font-mono mt-0.5">
                          {duzenlemeForm.telefon_numarasi || 'Telefon yoxdur'}
                        </div>
                        {duzenlemeForm.instagram_kullanici_adi && (
                          <div className="text-pink-600 font-medium text-[11px] mt-0.5">
                            @{duzenlemeForm.instagram_kullanici_adi.replace('@', '')}
                          </div>
                        )}
                      </div>

                      <div className="p-3 bg-white rounded-xl border border-slate-200">
                        <div className="text-[11px] text-slate-400 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          Çatdırılma Ünvanı
                        </div>
                        <div className="font-bold text-slate-900 mt-0.5">
                          {duzenlemeForm.teslimat_sehri || 'Bakı'}
                        </div>
                        <div className="text-slate-600 mt-0.5 line-clamp-2">
                          {duzenlemeForm.teslimat_adresi || 'Ünvan qeyd edilməyib'}
                        </div>
                      </div>

                      <div className="sm:col-span-2 p-3 bg-white rounded-xl border border-slate-200">
                        <div className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Tag className="w-3.5 h-3.5" />
                          Məhsul & Parametrlər
                        </div>
                        <div className="font-bold text-slate-900 text-sm mt-0.5">
                          {duzenlemeForm.urun_aciklamasi || 'Məhsul aşkar edilmədi'}
                        </div>
                        <div className="text-slate-600 mt-0.5 flex items-center gap-2">
                          {duzenlemeForm.beden_veya_olcu && (
                            <span>
                              Ölçü: <strong>{duzenlemeForm.beden_veya_olcu}</strong>
                            </span>
                          )}
                          {duzenlemeForm.renk && (
                            <span>
                              Rəng: <strong>{duzenlemeForm.renk}</strong>
                            </span>
                          )}
                          <span>
                            Say: <strong>{duzenlemeForm.adet || 1} ədəd</strong>
                          </span>
                        </div>
                      </div>

                      <div className="p-3 bg-white rounded-xl border border-slate-200">
                        <div className="text-[11px] text-slate-400">Toplam Məbləğ</div>
                        <div className="font-extrabold text-slate-900 text-base mt-0.5">
                          {duzenlemeForm.toplam_tutar.toFixed(2)} AZN
                        </div>
                      </div>

                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-300">
                        <div className="text-[11px] text-amber-800 font-bold">
                          Bakıda Qalıq Borc
                        </div>
                        <div className="font-extrabold text-amber-900 text-base mt-0.5">
                          {(duzenlemeForm.toplam_tutar - duzenlemeForm.alinan_tutar).toFixed(2)} AZN
                        </div>
                        <div className="text-[10px] text-amber-700">
                          Öncədən alınan: {duzenlemeForm.alinan_tutar.toFixed(2)} AZN
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Alt Eylem Butonları: Onayla & Reddet */}
              <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={islemYapiliyor}
                  onClick={() => handleReddet(seciliMesaj.id)}
                  className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <XCircle className="w-4 h-4 text-rose-600" />
                  <span>İmtina Et (Sil)</span>
                </button>

                <button
                  type="button"
                  disabled={islemYapiliyor}
                  onClick={() => handleOnayla(seciliMesaj.id)}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-lg cursor-pointer flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {islemYapiliyor ? 'Əlavə edilir...' : 'Təsdiqlə və Əsas Sifarişlərə Əlavə Et'}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-16 text-center text-slate-400 text-xs my-auto">
              <Inbox className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <div className="font-bold text-slate-700 text-base">Heç bir tələb seçilməyib</div>
              <p className="text-slate-500 mt-1 max-w-sm mx-auto">
                Soldakı siyahıdan bir müraciətə klikləyərək AI tərəfindən çıxarılan detalları
                incələyə və təsdiqləyə bilərsiniz.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 3. Alt Bölüm: Canlı Webhook & Mesaj Simulyatoru (Test & Nümayiş) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center font-bold">
            🤖
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900">Canlı Webhook / Sınaq Simulyatoru</h3>
            <p className="text-xs text-slate-500">
              Instagram DM və ya WhatsApp danışıq mətnini buraya yapışdıraraq sistemin sifarişi necə
              avtomatik aşkar etdiyini yoxlayın
            </p>
          </div>
        </div>

        <form onSubmit={handleSimulasyonGonder} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Mənbə Kanalı
              </label>
              <select
                value={simulasyonKaynak}
                onChange={(e) => setSimulasyonKaynak(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800"
              >
                <option value="INSTAGRAM_DM">📸 Instagram DM</option>
                <option value="WHATSAPP">💬 WhatsApp Mesajı</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Göndərən (İstifadəçi / Nömrə)
              </label>
              <input
                type="text"
                placeholder="@aylin_baku və ya +994501234567"
                value={simulasyonGonderen}
                onChange={(e) => setSimulasyonGonderen(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 placeholder-slate-400"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700 block">Danışıq Mətni</label>
              {seciliFirmaAd && (
                <span className="text-[11px] text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                  Hedef Butik: {seciliFirmaAd}
                </span>
              )}
            </div>
            <textarea
              rows={2}
              placeholder="Məsələn: Salam, zəhmət olmasa Kanada Lululemon qara şalvar M razmer sifariş edin. Qiymət 180 AZN, 80 AZN ödəmişəm. Ünvan: Nərimanov, Təbriz küçəsi. Tel: 0501112233. #SİPARİŞ"
              value={simulasyonMetni}
              onChange={(e) => setSimulasyonMetni(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-violet-500"
            />
          </div>

          {/* Sürətli Sınaq Şablonları */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-bold text-slate-400">💡 Sürətli Şablonlar:</span>
            <button
              type="button"
              onClick={() => {
                setSimulasyonKaynak('INSTAGRAM_DM');
                setSimulasyonGonderen('@butik_alici_vip');
                setSimulasyonMetni(
                  `Salam, ${seciliFirmaAd || 'Kanada'} butikindən Michael Kors dəri çanta sifariş edirəm. Qiymət 190 AZN, 50 AZN beh atdım, qalıq 140 AZN kuryeyə nəğd. Ünvan: Bakı, 28 May. Tel: +994509998877 #SİPARİŞ`
                );
              }}
              className="px-2.5 py-1 bg-pink-50 hover:bg-pink-100 text-pink-700 rounded-lg text-[11px] font-semibold border border-pink-200 cursor-pointer transition-colors"
            >
              📸 Instagram DM Çanta Şablonu
            </button>
            <button
              type="button"
              onClick={() => {
                setSimulasyonKaynak('WHATSAPP');
                setSimulasyonGonderen('+994502223344');
                setSimulasyonMetni(
                  `Salam, canlı yayındakı qırmızı midi don üçün yazıram. Qiymət 85 AZN tam ödəniş etdim. Ünvan: Nərimanov, Təbriz küçəsi döngə 2. Tel: +994502223344 #ONAY`
                );
              }}
              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[11px] font-semibold border border-emerald-200 cursor-pointer transition-colors"
            >
              💬 WhatsApp Canlı Yayım Şablonu
            </button>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={simulasyonYukleniyor || !simulasyonMetni.trim()}
              className="px-5 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {simulasyonYukleniyor ? 'Təhlil edilir...' : 'Gələn Qutusuna Göndər (Simulyasiya)'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
