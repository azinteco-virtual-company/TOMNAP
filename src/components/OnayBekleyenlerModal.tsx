import { apiFetch } from '../lib/apiClient';
import React, { useState } from 'react';
import { OnayBekleyenMesaj, Siparis } from '../types';
import { fetchWithRetry } from '../lib/apiClient';
import {
  X,
  CheckCircle2,
  XCircle,
  Edit3,
  MessageSquare,
  Sparkles,
  Send,
  User,
  Smartphone,
  MapPin,
  DollarSign,
  Tag,
  AlertCircle,
  PlusCircle,
  Clock,
  Store,
  RefreshCw,
} from 'lucide-react';

interface OnayBekleyenlerModalProps {
  onKapat: () => void;
  onSiparisOnaylandi: (yeniSiparis: Siparis) => void;
  seciliFirmaId?: string;
  seciliFirmaAd?: string;
}

export const OnayBekleyenlerModal: React.FC<OnayBekleyenlerModalProps> = ({
  onKapat,
  onSiparisOnaylandi,
  seciliFirmaId,
  seciliFirmaAd,
}) => {
  const [inboxListesi, setInboxListesi] = useState<OnayBekleyenMesaj[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [seciliMesaj, setSeciliMesaj] = useState<OnayBekleyenMesaj | null>(null);
  const [duzenlemeModu, setDuzenlemeModu] = useState(false);

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

  // Test mesajı simülasyonu alanı
  const [simulasyonMetni, setSimulasyonMetni] = useState('');
  const [simulasyonGonderen, setSimulasyonGonderen] = useState('');
  const [simulasyonKaynak, setSimulasyonKaynak] = useState<'INSTAGRAM_DM' | 'WHATSAPP'>(
    'INSTAGRAM_DM'
  );
  const [simulasyonYukleniyor, setSimulasyonYukleniyor] = useState(false);

  // Inbox verilerini getir (Zorunlu Tenant İzolasyonlu)
  const inboxGetir = async () => {
    try {
      setYukleniyor(true);
      const aktifTenant = seciliFirmaId || 'all';
      const url = `/api/inbox?tenant_id=${encodeURIComponent(aktifTenant)}`;
      const res = await fetchWithRetry(url, { timeoutMs: 8000, retries: 2 });
      const data = await res.json();
      if (data.basarili && Array.isArray(data.mesajlar)) {
        setInboxListesi(data.mesajlar.filter((m: OnayBekleyenMesaj) => m.durum === 'BEKLEMEDE'));
        if (data.mesajlar.length > 0 && !seciliMesaj) {
          const ilkBekleyen = data.mesajlar.find((m: OnayBekleyenMesaj) => m.durum === 'BEKLEMEDE');
          if (ilkBekleyen) seciliMesajAyarla(ilkBekleyen);
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

  React.useEffect(() => {
    inboxGetir();
  }, [seciliFirmaId]);

  const seciliMesajAyarla = (mesaj: OnayBekleyenMesaj) => {
    setSeciliMesaj(mesaj);
    const oneri = mesaj.oneri_siparis;
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
      const res = await apiFetch(`/api/inbox/${mesajId}/onayla`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duzeltilmis_siparis: duzenlemeForm,
        }),
      });
      const data = await res.json();
      if (data.basarili && data.siparis) {
        onSiparisOnaylandi(data.siparis);
        // Listeden çıkar
        const guncel = inboxListesi.filter((m) => m.id !== mesajId);
        setInboxListesi(guncel);
        if (guncel.length > 0) {
          seciliMesajAyarla(guncel[0]);
        } else {
          setSeciliMesaj(null);
        }
      }
    } catch (e) {
      console.error('Onaylama hatası:', e);
    }
  };

  // Reddet / Sil
  const handleReddet = async (mesajId: string) => {
    try {
      await apiFetch(`/api/inbox/${mesajId}/reddet`, { method: 'POST' });
      const guncel = inboxListesi.filter((m) => m.id !== mesajId);
      setInboxListesi(guncel);
      if (guncel.length > 0) {
        seciliMesajAyarla(guncel[0]);
      } else {
        setSeciliMesaj(null);
      }
    } catch (e) {
      console.error('Reddetme hatası:', e);
    }
  };

  // Webhook / Tetikleyici Test Simülasyonu
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
          gonderen: simulasyonGonderen || '@instagram_kullanici',
          kaynak: simulasyonKaynak,
          tenant_id: seciliFirmaId,
        }),
      });
      const data = await res.json();
      if (data.basarili && data.inbox) {
        setInboxListesi((prev) => [data.inbox, ...prev]);
        seciliMesajAyarla(data.inbox);
        setSimulasyonMetni('');
        setSimulasyonGonderen('');
      }
    } catch (e) {
      console.error('Simülasyon hatası:', e);
    } finally {
      setSimulasyonYukleniyor(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-5xl w-full border border-slate-200 shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]">
        {/* Modal Başlığı */}
        <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-amber-100">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base">Gelen Kutusu: Onay Bekleyen Siparişler</h3>
                <span className="text-xs bg-white/20 text-white font-bold px-2 py-0.5 rounded-full">
                  {inboxListesi.length} Bekleyen
                </span>
                {seciliFirmaAd && (
                  <span className="text-xs bg-amber-900/40 border border-amber-400/40 text-amber-100 font-bold px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                    <Store className="w-3 h-3" />
                    {seciliFirmaAd}
                  </span>
                )}
              </div>
              <p className="text-xs text-amber-100">
                Instagram DM / WhatsApp konuşmasında <strong>#SİPARİŞ</strong> veya{' '}
                <strong>#ONAY</strong> ile tetiklenen sipariş taslakları
              </p>
            </div>
          </div>
          <button
            onClick={onKapat}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ana Gövde (Sol: Mesaj Havuzu, Sağ: İnceleme & Düzenleme) */}
        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-hidden">
          {/* Sol Kolon: Bekleyen Mesajlar Listesi */}
          <div className="md:col-span-4 border-r border-slate-200 bg-slate-50 flex flex-col h-full overflow-hidden">
            <div className="p-3 border-b border-slate-200 bg-white flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Yakalalan Mesajlar
              </span>
              <span className="text-[11px] text-slate-400">Kontrol Havuzu</span>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {inboxListesi.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Şu an onay bekleyen yeni mesaj yok.
                </div>
              ) : (
                inboxListesi.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => seciliMesajAyarla(item)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer text-xs ${
                      seciliMesaj?.id === item.id
                        ? 'bg-white border-amber-500 shadow-sm ring-1 ring-amber-500/20'
                        : 'bg-white/70 hover:bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-900 truncate">
                        {item.gonderen_kullanici}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                        {item.tetikleyici_kod || '#SİPARİŞ'}
                      </span>
                    </div>

                    <div className="text-slate-600 font-medium truncate mb-1">
                      {item.oneri_siparis.urun_aciklamasi}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>{item.kaynak.replace('_', ' ')}</span>
                      <span className="font-bold text-slate-800">
                        {item.oneri_siparis.toplam_tutar} {item.oneri_siparis.para_birimi}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Hızlı Test Simülatörü Buton/Formu */}
            <div className="p-3 bg-white border-t border-slate-200 text-xs">
              <details className="cursor-pointer group">
                <summary className="font-bold text-slate-700 flex items-center gap-1.5 select-none">
                  <PlusCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Yeni Sohbet / Webhook Simüle Et</span>
                </summary>
                <form onSubmit={handleSimulasyonGonder} className="mt-2.5 space-y-2">
                  <input
                    type="text"
                    placeholder="Müşteri Adı / @kullanici"
                    value={simulasyonGonderen}
                    onChange={(e) => setSimulasyonGonderen(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <textarea
                    rows={3}
                    placeholder="Sohbet geçmişi... Müşteri: 'Bunu istiyorum...' Satıcı: 'Tamamdır #SİPARİŞ'"
                    value={simulasyonMetni}
                    onChange={(e) => setSimulasyonMetni(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-amber-500 font-mono text-[11px]"
                  />
                  <button
                    type="submit"
                    disabled={simulasyonYukleniyor || !simulasyonMetni.trim()}
                    className="w-full py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    <Send className="w-3 h-3" />
                    <span>{simulasyonYukleniyor ? 'Ayrıştırılıyor...' : 'Havuzuna Gönder'}</span>
                  </button>
                </form>
              </details>
            </div>
          </div>

          {/* Sağ Kolon: Mesaj Detayı & Düzenleme Formu */}
          <div className="md:col-span-8 p-6 overflow-y-auto flex flex-col justify-between">
            {seciliMesaj ? (
              <div className="space-y-4">
                {/* Orijinal Sohbet Geçmişi */}
                <div className="p-4 rounded-xl bg-slate-900 text-slate-200 border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" />
                      Yakalalan Orijinal Sohbet Geçmişi:
                    </span>
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono">
                      {seciliMesaj.kaynak} •{' '}
                      {new Date(seciliMesaj.gelis_tarihi).toLocaleTimeString('tr-TR')}
                    </span>
                  </div>
                  <pre className="text-xs font-mono whitespace-pre-wrap text-emerald-300 leading-relaxed bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                    {seciliMesaj.konusma_gecmisi}
                  </pre>
                  {seciliMesaj.tetikleyici_kod && (
                    <div className="mt-2 text-[11px] text-amber-300 flex items-center gap-1">
                      <span>⚡ Tetikleyici Tespit Edildi:</span>
                      <strong className="bg-amber-500/20 px-1.5 py-0.2 rounded border border-amber-500/40">
                        {seciliMesaj.tetikleyici_kod}
                      </strong>
                    </div>
                  )}
                </div>

                {/* Gemini'nin Çıkardığı ve Düzenlenebilir Veriler */}
                <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      AI Tarafından Çıkarılan Sipariş Taslağı:
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      Kaydetmeden önce düzenleyebilirsiniz
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {/* Müşteri Adı */}
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Müşteri Adı
                      </label>
                      <input
                        type="text"
                        value={duzenlemeForm.musteri_adi}
                        onChange={(e) =>
                          setDuzenlemeForm({ ...duzenlemeForm, musteri_adi: e.target.value })
                        }
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>

                    {/* Instagram Kullanıcı Adı */}
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Instagram Hesabı
                      </label>
                      <input
                        type="text"
                        value={duzenlemeForm.instagram_kullanici_adi}
                        onChange={(e) =>
                          setDuzenlemeForm({
                            ...duzenlemeForm,
                            instagram_kullanici_adi: e.target.value,
                          })
                        }
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs text-blue-600 font-medium outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>

                    {/* Telefon Numarası */}
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Telefon Numarası
                      </label>
                      <input
                        type="text"
                        placeholder="+994 50 000 00 00"
                        value={duzenlemeForm.telefon_numarasi}
                        onChange={(e) =>
                          setDuzenlemeForm({ ...duzenlemeForm, telefon_numarasi: e.target.value })
                        }
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>

                    {/* Teslimat Şehri ve Adres */}
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Teslimat Adresi
                      </label>
                      <input
                        type="text"
                        placeholder="Örn: Nərimanov m/s yaxınlığı"
                        value={duzenlemeForm.teslimat_adresi}
                        onChange={(e) =>
                          setDuzenlemeForm({ ...duzenlemeForm, teslimat_adresi: e.target.value })
                        }
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>

                    {/* Ürün Açıklaması */}
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Ürün Açıklaması
                      </label>
                      <input
                        type="text"
                        value={duzenlemeForm.urun_aciklamasi}
                        onChange={(e) =>
                          setDuzenlemeForm({ ...duzenlemeForm, urun_aciklamasi: e.target.value })
                        }
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>

                    {/* Beden & Renk */}
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Beden / Ölçü
                      </label>
                      <input
                        type="text"
                        value={duzenlemeForm.beden_veya_olcu}
                        onChange={(e) =>
                          setDuzenlemeForm({ ...duzenlemeForm, beden_veya_olcu: e.target.value })
                        }
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Renk
                      </label>
                      <input
                        type="text"
                        value={duzenlemeForm.renk}
                        onChange={(e) =>
                          setDuzenlemeForm({ ...duzenlemeForm, renk: e.target.value })
                        }
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>

                    {/* Toplam Tutar & Alınan Kapora */}
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Toplam Tutar (AZN)
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
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Alınan Kapora / Beh (AZN)
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
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold text-emerald-700 outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>

                    {/* Kalan Borç Göstergesi */}
                    <div className="sm:col-span-2 bg-amber-50 p-2.5 rounded-lg border border-amber-200 flex items-center justify-between">
                      <span className="text-xs text-amber-900 font-semibold">
                        Bakü'de Teslimatta Alınacak Kalan Borç:
                      </span>
                      <span className="text-sm font-bold text-amber-900">
                        {Math.max(
                          0,
                          duzenlemeForm.toplam_tutar - duzenlemeForm.alinan_tutar
                        ).toFixed(2)}{' '}
                        {duzenlemeForm.para_birimi}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 text-slate-400 text-xs">
                İncelemek için sol taraftaki mesajlardan birini seçin.
              </div>
            )}

            {/* Alt İşlem Butonları */}
            {seciliMesaj && (
              <div className="pt-4 mt-4 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleReddet(seciliMesaj.id)}
                  className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg border border-rose-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Siparişi Reddet / Sadece Sohbet</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOnayla(seciliMesaj.id)}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-2 transition-all cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Onayla ve Resmi Sipariş Olarak Kaydet</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
