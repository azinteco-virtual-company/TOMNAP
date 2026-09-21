import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { apiFetch, fetchWithRetry, setApiSession, setApiTenant } from '../../src/lib/apiClient';
import { useAppStore } from '../../src/store/appStore';
import { RolSecici } from '../../src/components/RolSecici';
import { AccessGateModal } from '../../src/components/AccessGateModal';

const response = (data: any, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const sessionData = (extra = {}) => ({
  basarili: true,
  kullanici: {
    id: 'user-a',
    adSoyad: 'User A',
    email: 'a@example.test',
    rol: 'PATRON',
    tenantId: 'tenant-a',
  },
  csrfToken: 'csrf-test-token',
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  ...extra,
});
let mockFetch: ReturnType<typeof vi.fn>;
beforeEach(() => {
  useAppStore.getState().clearSession();
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});
afterEach(() => {
  useAppStore.getState().clearSession();
  vi.unstubAllGlobals();
});
const login = async (data = sessionData()) => {
  mockFetch.mockResolvedValueOnce(response(data));
  await useAppStore.getState().login('a@example.test', '  exact password  ');
};

describe('Server session is the only frontend identity source', () => {
  it('starts without protected data and does not fetch it before session restoration', async () => {
    await Promise.all([
      useAppStore.getState().firmalariYukle(),
      useAppStore.getState().siparisleriYukle(),
      useAppStore.getState().inboxSayisiGuncelle(),
    ]);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(useAppStore.getState()).toMatchObject({
      session: null,
      aktifRol: null,
      seciliFirmaId: '',
      siparisler: [],
      firmalar: [],
      inboxSayisi: 0,
    });
  });

  it('ignores forged storage grants and remains anonymous when the cookie is rejected', async () => {
    const getItem = vi.fn().mockReturnValue('true');
    vi.stubGlobal('localStorage', { getItem, setItem: vi.fn() });
    vi.stubGlobal('sessionStorage', { getItem, setItem: vi.fn() });
    mockFetch.mockResolvedValueOnce(response({ basarili: false }, 401));
    await useAppStore.getState().restoreSession();
    expect(getItem).not.toHaveBeenCalled();
    expect(useAppStore.getState()).toMatchObject({
      sessionStatus: 'anonymous',
      session: null,
      aktifRol: null,
      siparisler: [],
    });
  });

  it('restores server user, role and tenant without writing browser storage', async () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    vi.stubGlobal('sessionStorage', { setItem });
    mockFetch.mockResolvedValueOnce(response(sessionData()));
    await useAppStore.getState().restoreSession();
    expect(useAppStore.getState()).toMatchObject({
      sessionStatus: 'authenticated',
      aktifRol: 'PATRON',
      seciliFirmaId: 'tenant-a',
    });
    expect(mockFetch.mock.calls[0][0]).toBe('/api/auth/oturum');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('requires actual successful login and preserves password spaces', async () => {
    mockFetch.mockResolvedValueOnce(response({ hata: 'Şifrə yanlışdır.' }, 401));
    await expect(useAppStore.getState().login('a@example.test', 'wrong')).rejects.toThrow(
      'Şifrə yanlışdır'
    );
    expect(useAppStore.getState().session).toBeNull();
    await login();
    expect(JSON.parse(mockFetch.mock.calls[1][1].body).sifre).toBe('  exact password  ');
    expect(useAppStore.getState().session.id).toBe('user-a');
  });

  it('does not turn activation success into a session', async () => {
    mockFetch.mockResolvedValueOnce(
      response({ basarili: true, kullanici: sessionData().kullanici })
    );
    await apiFetch('/api/auth/sifre-belirle', { method: 'POST', body: '{}' });
    expect(useAppStore.getState().session).toBeNull();
  });

  it('rejects malformed server session data instead of granting fallback privileges', async () => {
    mockFetch.mockResolvedValueOnce(
      response({ basarili: true, rol: 'SUPER_ADMIN', tenantId: 'all' })
    );
    await expect(useAppStore.getState().login('a@example.test', 'password')).rejects.toThrow(
      'etibarlı oturum'
    );
    expect(useAppStore.getState().aktifRol).toBeNull();
  });

  it('clears cached private data on an expired or revoked session response', async () => {
    await login();
    useAppStore.setState({
      siparisler: [{ id: 'private-order' } as any],
      firmalar: [{ id: 'tenant-a' } as any],
      inboxSayisi: 3,
    });
    mockFetch.mockResolvedValueOnce(response({ hata: 'Oturum bitdi.' }, 401));
    await expect(apiFetch('/api/siparisler')).rejects.toMatchObject({ status: 401 });
    expect(useAppStore.getState()).toMatchObject({
      session: null,
      siparisler: [],
      firmalar: [],
      aktifRol: null,
      inboxSayisi: 0,
    });
  });

  it('uses CSRF on logout and clears all private state', async () => {
    await login();
    useAppStore.setState({ siparisler: [{ id: 'secret' } as any] });
    mockFetch.mockResolvedValueOnce(response({ basarili: true }));
    await useAppStore.getState().logout();
    const [url, options] = mockFetch.mock.calls[1];
    expect(url).toBe('/api/auth/cikis');
    expect(options.headers.get('x-csrf-token')).toBe('csrf-test-token');
    expect(useAppStore.getState()).toMatchObject({
      session: null,
      siparisler: [],
      seciliFirmaId: '',
    });
  });

  it('clears private state even if logout cannot reach the server', async () => {
    await login();
    useAppStore.setState({ siparisler: [{ id: 'secret' } as any] });
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(useAppStore.getState().logout()).rejects.toThrow('offline');
    expect(useAppStore.getState()).toMatchObject({
      sessionStatus: 'logout-error',
      siparisler: [],
      aktifRol: null,
    });
    mockFetch.mockResolvedValueOnce(response({ basarili: true }));
    await useAppStore.getState().logout();
    expect(mockFetch.mock.calls[2][1].headers.get('x-csrf-token')).toBe('csrf-test-token');
    expect(useAppStore.getState().session).toBeNull();
  });

  it('normal users cannot choose another tenant or role', async () => {
    await login();
    useAppStore.getState().setSeciliFirmaId('tenant-b');
    expect(useAppStore.getState().seciliFirmaId).toBe('tenant-a');
    expect((useAppStore.getState() as any).setAktifRol).toBeUndefined();
  });

  it('admin tenant switches clear existing tenant data and discard pending responses', async () => {
    await login(
      sessionData({
        kullanici: { ...sessionData().kullanici, rol: 'SUPER_ADMIN', tenantId: 'all' },
      })
    );
    useAppStore.setState({
      firmalar: [{ id: 'tenant-a' }, { id: 'tenant-b' }] as any,
      siparisler: [{ id: 'old-order' } as any],
    });
    let finish!: (response: Response) => void;
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const pending = useAppStore.getState().siparisleriYukle('all');
    useAppStore.getState().setSeciliFirmaId('tenant-b');
    finish(response({ basarili: true, siparisler: [{ id: 'stale-order' }] }));
    await pending;
    expect(useAppStore.getState()).toMatchObject({
      seciliFirmaId: 'tenant-b',
      siparisler: [],
      inboxSayisi: 0,
    });
  });

  it('logout prevents an already received but unparsed bootstrap response from restoring access', async () => {
    let parse!: (value: any) => void;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        new Promise((resolve) => {
          parse = resolve;
        }),
    });
    const pending = useAppStore.getState().restoreSession();
    await vi.waitFor(() => expect(parse).toBeTypeOf('function'));
    useAppStore.getState().clearSession();
    parse(sessionData());
    await pending;
    expect(useAppStore.getState().session).toBeNull();
  });
});

describe('Central API transport', () => {
  it('adds credentials, tenant and CSRF to mutations without exposing a static API key', async () => {
    setApiSession('csrf-token', 'tenant-a');
    mockFetch.mockResolvedValueOnce(response({ basarili: true }));
    await apiFetch('/api/siparisler/one', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const options = mockFetch.mock.calls[0][1];
    expect(options.credentials).toBe('same-origin');
    expect(options.headers.get('x-csrf-token')).toBe('csrf-token');
    expect(options.headers.get('x-tenant-id')).toBe('tenant-a');
    expect(options.headers.has('x-api-key')).toBe(false);
  });

  it('omits tenant override on public signup/auth and CSRF on GET', async () => {
    setApiSession('csrf-token', 'tenant-a');
    mockFetch.mockResolvedValueOnce(response({ basarili: true }));
    await apiFetch('/api/auth/token-kontrol/token');
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.has('x-tenant-id')).toBe(false);
    expect(headers.has('x-csrf-token')).toBe(false);
  });

  it('never forwards session headers to another origin', async () => {
    setApiSession('secret', 'tenant-a');
    await expect(
      apiFetch('https://attacker.invalid/api/collect', { method: 'POST' })
    ).rejects.toMatchObject({ status: 400 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws denied mutation results so callers cannot show false success', async () => {
    mockFetch.mockResolvedValueOnce(response({ hata: 'İcazə yoxdur.' }, 403));
    await expect(apiFetch('/api/siparisler/x', { method: 'DELETE' })).rejects.toThrow(
      'İcazə yoxdur'
    );
  });

  it('does not replay a mutation after a network failure', async () => {
    mockFetch.mockRejectedValue(new Error('lost response'));
    await expect(
      fetchWithRetry('/api/siparisler', { method: 'POST', retries: 3, backoffMs: 0 })
    ).rejects.toThrow('lost response');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('allows bounded retry for a read', async () => {
    mockFetch
      .mockResolvedValueOnce(response({ hata: 'temporary' }, 503))
      .mockResolvedValueOnce(response({ basarili: true }));
    await fetchWithRetry('/api/siparisler', { retries: 1, backoffMs: 0 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('rejects obsolete responses after tenant change', async () => {
    let finish!: (response: Response) => void;
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const pending = apiFetch('/api/siparisler');
    setApiTenant('tenant-b');
    finish(response({ basarili: true }));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('Login and role UI', () => {
  it('renders an informational role badge without any privilege-changing control', () => {
    const html = renderToString(
      React.createElement(RolSecici, { aktifRol: 'PATRON', onRolDegistir: vi.fn() })
    );
    expect(html).toContain('Butik rəhbəri');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<select');
  });

  it('requires personal login and explains that public demo is disabled', () => {
    const html = renderToString(
      React.createElement(AccessGateModal, {
        acik: true,
        hedef: 'demo',
        onBasariliGiris: vi.fn(),
        onKapat: vi.fn(),
        onQeydiyyatAc: vi.fn(),
      })
    );
    expect(html).toContain('İctimai demo hazırda bağlıdır');
    expect(html).toContain('current-password');
    expect(html).not.toContain('admin2026');
    expect(html).not.toContain('tomnap2026');
  });
});

describe('Late response bodies', () => {
  it('discards data parsed after logout even when response headers arrived earlier', async () => {
    let finish!: (data: unknown) => void;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const res = await apiFetch('/api/siparisler');
    const body = res.json();
    useAppStore.getState().clearSession();
    finish({ basarili: true, siparisler: [{ id: 'stale-private-order' }] });
    await expect(body).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('Session lifetime', () => {
  it('clears protected state at the server-provided expiry', async () => {
    vi.useFakeTimers();
    try {
      await login(sessionData({ expiresAt: new Date(Date.now() + 1000).toISOString() }));
      useAppStore.setState({ siparisler: [{ id: 'private-order' } as any] });
      await vi.advanceTimersByTimeAsync(1001);
      expect(useAppStore.getState()).toMatchObject({
        session: null,
        aktifRol: null,
        siparisler: [],
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
