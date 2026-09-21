import { loadCompleteList, newestFirst } from '../lib/completeList';
import { create } from 'zustand';
import { Siparis, KullaniciRolu, FirmaTenant } from '../types';
import {
  apiFetch,
  ApiError,
  fetchWithRetry,
  getApiContextVersion,
  setApiSession,
  setApiTenant,
  setUnauthorizedHandler,
} from '../lib/apiClient';

export interface SessionUser {
  id: string;
  adSoyad: string;
  email: string;
  rol: KullaniciRolu;
  tenantId: string;
}
interface SessionPayload {
  basarili: boolean;
  kullanici: SessionUser;
  csrfToken: string;
  expiresAt: string;
}
interface AppState {
  session: SessionUser | null;
  sessionStatus:
    'loading' | 'authenticated' | 'anonymous' | 'error' | 'logout-pending' | 'logout-error';
  sessionError: string | null;
  expiresAt: string | null;
  restoreSession: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearSession: () => void;
  siparisler: Siparis[];
  firmalar: FirmaTenant[];
  seciliFirmaId: string;
  aktifRol: KullaniciRolu | null;
  inboxSayisi: number;
  bildirim: string | null;
  dbKaynak: 'supabase' | 'bellek';
  yukleniyor: boolean;
  siparisYuklemeHatasi: string | null;
  siparisListesiHazir: boolean;
  inboxYuklemeHatasi: string | null;
  menuDar: boolean;
  seciliKuryeId: string;
  firmaSiparisSayilariServer: Record<string, number>;
  setSiparisler: (items: Siparis[]) => void;
  setFirmalar: (items: FirmaTenant[]) => void;
  setSeciliFirmaId: (id: string) => void;
  setInboxSayisi: (sayi: number) => void;
  setBildirim: (msg: string | null) => void;
  setDbKaynak: (kaynak: 'supabase' | 'bellek') => void;
  setYukleniyor: (value: boolean) => void;
  setMenuDar: (value: boolean | ((previous: boolean) => boolean)) => void;
  setSeciliKuryeId: (id: string) => void;
  siparisEkle: (item: Siparis) => void;
  siparisGuncelle: (id: string, change: Partial<Siparis>) => void;
  siparisSil: (id: string) => void;
  siparisleriYukle: (tenantId?: string) => Promise<void>;
  firmalariYukle: () => Promise<void>;
  inboxSayisiGuncelle: (tenantId?: string) => Promise<void>;
}
const privateData = () => ({
  siparisler: [],
  firmalar: [],
  inboxSayisi: 0,
  firmaSiparisSayilariServer: {},
  seciliKuryeId: '',
  yukleniyor: false,
  siparisYuklemeHatasi: null,
  siparisListesiHazir: false,
  inboxYuklemeHatasi: null,
  bildirim: null,
});
let ordersLoad = 0;
let inboxLoad = 0;
let restoration: Promise<void> | undefined;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;

function acceptSession(data: SessionPayload) {
  const roles: KullaniciRolu[] = [
    'SUPER_ADMIN',
    'PATRON',
    'KANADA_SATINALMA',
    'SATIS_SORUMLUSU',
    'BAKU_FINANS',
    'BAKU_KURYE',
  ];
  if (
    !data.basarili ||
    !data.kullanici?.id ||
    !data.kullanici.tenantId ||
    !roles.includes(data.kullanici.rol) ||
    !data.csrfToken ||
    !(Date.parse(data.expiresAt) > Date.now())
  )
    throw new Error('Server etibarlı oturum qaytarmadı.');
  setApiSession(data.csrfToken, data.kullanici.tenantId);
  clearTimeout(expiryTimer);
  expiryTimer = setTimeout(
    () => useAppStore.getState().clearSession(),
    Math.min(Date.parse(data.expiresAt) - Date.now(), 2147483647)
  );
  useAppStore.setState({
    ...privateData(),
    session: data.kullanici,
    sessionStatus: 'authenticated',
    sessionError: null,
    expiresAt: data.expiresAt,
    aktifRol: data.kullanici.rol,
    seciliFirmaId: data.kullanici.tenantId,
  });
}

export const useAppStore = create<AppState>((set, get) => ({
  ...privateData(),
  session: null,
  sessionStatus: 'loading',
  sessionError: null,
  expiresAt: null,
  seciliFirmaId: '',
  aktifRol: null,
  dbKaynak: 'supabase',
  menuDar: false,
  clearSession: () => {
    clearTimeout(expiryTimer);
    setApiSession(null);
    set({
      ...privateData(),
      session: null,
      sessionStatus: 'anonymous',
      sessionError: null,
      expiresAt: null,
      seciliFirmaId: '',
      aktifRol: null,
    });
  },
  restoreSession: () => {
    if (restoration) return restoration;
    set({ sessionStatus: 'loading', sessionError: null });
    const version = getApiContextVersion();
    restoration = (async () => {
      try {
        const data = await (await apiFetch('/api/auth/oturum')).json();
        if (version !== getApiContextVersion()) return;
        acceptSession(data);
      } catch (error) {
        if (version !== getApiContextVersion()) return;
        get().clearSession();
        if (!(error instanceof ApiError && error.status === 401))
          set({
            sessionStatus: 'error',
            sessionError: 'Oturum yoxlanıla bilmir. Yenidən cəhd edin.',
          });
      } finally {
        restoration = undefined;
      }
    })();
    return restoration;
  },
  login: async (identifier, password) => {
    const version = getApiContextVersion();
    const data = await (
      await apiFetch('/api/auth/giris', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifikator: identifier, sifre: password }),
      })
    ).json();
    if (version !== getApiContextVersion()) throw new DOMException('Oturum dəyişdi.', 'AbortError');
    acceptSession(data);
  },
  logout: async () => {
    // Hide private data immediately, retaining CSRF only to retry failed revocation.
    setApiTenant(null);
    set({
      ...privateData(),
      sessionStatus: 'logout-pending',
      sessionError: null,
      aktifRol: null,
      seciliFirmaId: '',
    });
    try {
      await apiFetch('/api/auth/cikis', { method: 'POST' });
      get().clearSession();
    } catch (error) {
      if (!get().session || (error instanceof ApiError && error.status === 401)) {
        get().clearSession();
        return;
      }
      set({
        sessionStatus: 'logout-error',
        sessionError: 'Çıxış serverdə tamamlanmadı. Bağlantını yoxlayıb yenidən cəhd edin.',
      });
      throw error;
    }
  },
  setSiparisler: (siparisler) => set({ siparisler }),
  setFirmalar: (firmalar) => set({ firmalar }),
  setSeciliFirmaId: (id) => {
    const session = get().session;
    if (
      !session ||
      (session.rol !== 'SUPER_ADMIN' && id !== session.tenantId) ||
      id === get().seciliFirmaId
    )
      return;
    if (
      session.rol === 'SUPER_ADMIN' &&
      id !== 'all' &&
      !get().firmalar.some((firma) => firma.id === id)
    )
      return;
    setApiTenant(id);
    set({ ...privateData(), seciliFirmaId: id });
  },
  setInboxSayisi: (inboxSayisi) => set({ inboxSayisi }),
  setBildirim: (bildirim) => set({ bildirim }),
  setDbKaynak: (dbKaynak) => set({ dbKaynak }),
  setYukleniyor: (yukleniyor) => set({ yukleniyor }),
  setMenuDar: (value) =>
    set((state) => ({ menuDar: typeof value === 'function' ? value(state.menuDar) : value })),
  setSeciliKuryeId: (seciliKuryeId) => set({ seciliKuryeId }),
  siparisEkle: (item) => {
    if (get().sessionStatus === 'authenticated')
      set((state) => ({ siparisler: [item, ...state.siparisler] }));
  },
  siparisGuncelle: (id, change) =>
    set((state) => ({
      siparisler: state.siparisler.map((item) => (item.id === id ? { ...item, ...change } : item)),
    })),
  siparisSil: (id) =>
    set((state) => ({ siparisler: state.siparisler.filter((item) => item.id !== id) })),
  siparisleriYukle: async (tenantId) => {
    if (get().sessionStatus !== 'authenticated' || get().aktifRol === 'BAKU_KURYE') return;
    const id = tenantId ?? get().seciliFirmaId;
    if (id !== get().seciliFirmaId) return;
    const version = getApiContextVersion();
    const run = ++ordersLoad;
    const current = () => version === getApiContextVersion() && run === ordersLoad;
    set({ yukleniyor: true, siparisYuklemeHatasi: null });
    try {
      const data = await loadCompleteList<Siparis>(
        id && id !== 'all'
          ? `/api/siparisler?tenant_id=${encodeURIComponent(id)}`
          : '/api/siparisler',
        'siparisler'
      );
      if (current())
        set({
          siparisler: data.items.sort(newestFirst),
          siparisListesiHazir: true,
          dbKaynak: data.metadata.kaynak || 'supabase',
        });
    } catch (error) {
      if (current())
        set({
          siparisYuklemeHatasi:
            error instanceof Error ? error.message : 'Sifarişlər tam yüklənə bilmədi.',
        });
    } finally {
      if (current()) set({ yukleniyor: false });
    }
  },
  firmalariYukle: async () => {
    if (get().sessionStatus !== 'authenticated' || get().aktifRol === 'BAKU_KURYE') return;
    const version = getApiContextVersion();
    try {
      const data = await (await fetchWithRetry('/api/firmalar')).json();
      if (version === getApiContextVersion())
        set({
          firmalar: data.basarili && Array.isArray(data.firmalar) ? data.firmalar : [],
          firmaSiparisSayilariServer: data.siparis_sayilari || {},
        });
    } catch {
      if (version === getApiContextVersion()) set({ firmalar: [], firmaSiparisSayilariServer: {} });
    }
  },
  inboxSayisiGuncelle: async (tenantId) => {
    if (get().sessionStatus !== 'authenticated' || get().aktifRol === 'BAKU_KURYE') return;
    const id = tenantId ?? get().seciliFirmaId;
    if (id !== get().seciliFirmaId) return;
    const version = getApiContextVersion();
    const run = ++inboxLoad;
    try {
      const data = await loadCompleteList<any>(
        id && id !== 'all' ? `/api/inbox?tenant_id=${encodeURIComponent(id)}` : '/api/inbox',
        'mesajlar'
      );
      if (version === getApiContextVersion() && run === inboxLoad)
        set({
          inboxSayisi: data.items.filter((item) => item.durum === 'BEKLEMEDE').length,
          inboxYuklemeHatasi: null,
        });
    } catch {
      if (version === getApiContextVersion() && run === inboxLoad)
        set({ inboxYuklemeHatasi: 'Gələn qutunun tam sayı yüklənmədi; əvvəlki say aktual deyil.' });
    }
  },
}));
setUnauthorizedHandler(() => useAppStore.getState().clearSession());
