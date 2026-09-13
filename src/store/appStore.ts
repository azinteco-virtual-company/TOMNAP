import { create } from 'zustand';
import { Siparis, KullaniciRolu, FirmaTenant } from '../types';
import { BASLANGIC_SIPARISLER } from '../data/ornek-siparisler';
import { fetchWithRetry } from '../lib/apiClient';

interface AppState {
  siparisler: Siparis[];
  firmalar: FirmaTenant[];
  seciliFirmaId: string;
  aktifRol: KullaniciRolu;
  inboxSayisi: number;
  bildirim: string | null;
  dbKaynak: 'supabase' | 'bellek';
  yukleniyor: boolean;
  menuDar: boolean;
  seciliKuryeId: string;
  firmaSiparisSayilariServer: Record<string, number>;

  // Setters
  setSiparisler: (siparisler: Siparis[]) => void;
  setFirmalar: (firmalar: FirmaTenant[]) => void;
  setSeciliFirmaId: (id: string) => void;
  setAktifRol: (rol: KullaniciRolu) => void;
  setInboxSayisi: (sayi: number) => void;
  setBildirim: (msg: string | null) => void;
  setDbKaynak: (kaynak: 'supabase' | 'bellek') => void;
  setYukleniyor: (yukleniyor: boolean) => void;
  setMenuDar: (deger: boolean | ((onceki: boolean) => boolean)) => void;
  setSeciliKuryeId: (id: string) => void;

  // Actions
  siparisEkle: (siparis: Siparis) => void;
  siparisGuncelle: (id: string, guncel: Partial<Siparis>) => void;
  siparisSil: (id: string) => void;
  siparisleriYukle: (tenantId?: string) => Promise<void>;
  firmalariYukle: () => Promise<void>;
  inboxSayisiGuncelle: (tenantId?: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  siparisler: BASLANGIC_SIPARISLER,
  firmalar: [],
  seciliFirmaId: (() => {
    try {
      return localStorage.getItem('tomnap_aktif_tenant') || 'all';
    } catch {
      return 'all';
    }
  })(),
  aktifRol: (() => {
    try {
      return (localStorage.getItem('tomnap_aktif_rol') as KullaniciRolu) || 'SUPER_ADMIN';
    } catch {
      return 'SUPER_ADMIN';
    }
  })(),
  inboxSayisi: 2,
  bildirim: null,
  dbKaynak: 'supabase',
  yukleniyor: false,
  menuDar: (() => {
    try {
      return localStorage.getItem('knb_menu_dar') === 'true';
    } catch {
      return false;
    }
  })(),
  seciliKuryeId: 'kurye-elvin',
  firmaSiparisSayilariServer: {},

  setSiparisler: (siparisler) => set({ siparisler }),
  setFirmalar: (firmalar) => set({ firmalar }),
  setSeciliFirmaId: (seciliFirmaId) => {
    try {
      localStorage.setItem('tomnap_aktif_tenant', seciliFirmaId);
    } catch {}
    set({ seciliFirmaId });
  },
  setAktifRol: (aktifRol) => {
    try {
      localStorage.setItem('tomnap_aktif_rol', aktifRol);
    } catch {}
    set({ aktifRol });
  },
  setInboxSayisi: (inboxSayisi) => set({ inboxSayisi }),
  setBildirim: (bildirim) => set({ bildirim }),
  setDbKaynak: (dbKaynak) => set({ dbKaynak }),
  setYukleniyor: (yukleniyor) => set({ yukleniyor }),
  setMenuDar: (deger) =>
    set((state) => {
      const yeni = typeof deger === 'function' ? deger(state.menuDar) : deger;
      try {
        localStorage.setItem('knb_menu_dar', String(yeni));
      } catch {}
      return { menuDar: yeni };
    }),
  setSeciliKuryeId: (seciliKuryeId) => set({ seciliKuryeId }),

  siparisEkle: (siparis) =>
    set((state) => ({ siparisler: [siparis, ...state.siparisler] })),

  siparisGuncelle: (id, guncel) =>
    set((state) => ({
      siparisler: state.siparisler.map((s) =>
        s.id === id ? { ...s, ...guncel, guncellenme_tarihi: new Date().toISOString() } : s
      ),
    })),

  siparisSil: (id) =>
    set((state) => ({
      siparisler: state.siparisler.filter((s) => s.id !== id),
    })),

  siparisleriYukle: async (tenantId) => {
    const fId = tenantId !== undefined ? tenantId : get().seciliFirmaId;
    set({ yukleniyor: true });
    try {
      const url = fId && fId !== 'all'
        ? `/api/siparisler?tenant_id=${encodeURIComponent(fId)}`
        : '/api/siparisler';
      const res = await fetchWithRetry(url, { timeoutMs: 10000, retries: 2 });
      const data = await res.json();
      if (data.basarili && Array.isArray(data.siparisler)) {
        set({
          siparisler: data.siparisler,
          dbKaynak: data.kaynak || 'supabase',
        });
      }
    } catch (err: any) {
      console.warn('Sipariş yükleme uyarısı:', err);
    } finally {
      set({ yukleniyor: false });
    }
  },

  firmalariYukle: async () => {
    try {
      const res = await fetchWithRetry('/api/firmalar', { timeoutMs: 8000, retries: 2 });
      const data = await res.json();
      let birlesmisFirmalar = (data.basarili && Array.isArray(data.firmalar)) ? [...data.firmalar] : [];
      try {
        const localList = JSON.parse(localStorage.getItem('tomnap_yerel_firmalar') || '[]');
        if (Array.isArray(localList) && localList.length > 0) {
          const ids = new Set(birlesmisFirmalar.map((f: any) => f.id));
          for (const lf of localList) {
            if (!ids.has(lf.id)) {
              birlesmisFirmalar.push(lf);
            }
          }
        }
      } catch {}

      if (birlesmisFirmalar.length > 0) {
        set({
          firmalar: birlesmisFirmalar,
          firmaSiparisSayilariServer: data.siparis_sayilari || {},
        });
      }
    } catch (e) {
      console.warn('Firmalar alınamadı:', e);
      try {
        const localList = JSON.parse(localStorage.getItem('tomnap_yerel_firmalar') || '[]');
        if (Array.isArray(localList) && localList.length > 0) {
          set((prev) => ({ firmalar: [...prev.firmalar, ...localList] }));
        }
      } catch {}
    }
  },

  inboxSayisiGuncelle: async (tenantId) => {
    const fId = tenantId !== undefined ? tenantId : get().seciliFirmaId;
    try {
      const url = fId && fId !== 'all'
        ? `/api/inbox?tenant_id=${encodeURIComponent(fId)}`
        : '/api/inbox';
      const res = await fetchWithRetry(url, { timeoutMs: 8000, retries: 2 });
      const data = await res.json();
      if (data.basarili && typeof data.toplam === 'number') {
        set({ inboxSayisi: data.toplam });
      }
    } catch (e) {
      console.warn('Inbox sayısı alınamadı:', e);
    }
  },
}));
