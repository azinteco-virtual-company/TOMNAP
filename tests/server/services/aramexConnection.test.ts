import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AramexProvider } from '../../../src/server/services/kargo/providers/aramex';
import { defaultSettings } from '../../../src/server/services/kargo/settings';

const provider = new AramexProvider();
const settings = () => ({
  ...defaultSettings('test-tenant'),
  kimlikBilgileri: {
    kullaniciAdi: 'fixture-user',
    sifre: 'fixture-secret',
    hesapNo: 'fixture-account',
    testModu: false,
  },
});
const valid = { HasErrors: false, Notifications: [], TrackingResults: [], Transaction: null };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('Aramex connection proof', () => {
  it.each([400, 401, 403, 500, 503])(
    'rejects HTTP%s even when the JSON claims provider success',
    async (status) => {
      fetchMock.mockResolvedValueOnce(Response.json(valid, { status }));
      expect(await provider.baglantiTesti(settings())).toMatchObject({
        basarili: false,
        detay: { status },
      });
    }
  );

  it.each([
    null,
    {},
    [],
    'OK',
    { HasErrors: false },
    { ...valid, HasErrors: 'false' },
    { ...valid, HasErrors: true },
    { ...valid, Notifications: null },
    { ...valid, TrackingResults: {} },
  ])('rejects malformed or unsuccessful provider payload %j', async (payload) => {
    fetchMock.mockResolvedValueOnce(Response.json(payload));
    expect((await provider.baglantiTesti(settings())).basarili).toBe(false);
  });

  it('accepts only a successful HTTP response with the documented success structure', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(valid));
    const result = await provider.baglantiTesti(settings());
    expect(result.basarili).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain('https://ws.aramex.net/');
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('does not claim a connection was tested when credentials are missing', async () => {
    const result = await provider.baglantiTesti(defaultSettings('test-tenant'));
    expect(result).toMatchObject({ basarili: false, detay: { mod: 'UNCONFIGURED' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never exposes provider error bodies or network exception details', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        ...valid,
        HasErrors: true,
        Notifications: [{ Code: 'ERROR', Message: 'SYNTHETIC_CREDENTIAL_CANARY' }],
      })
    );
    const providerError = await provider.baglantiTesti(settings());
    expect(providerError.basarili).toBe(false);
    expect(JSON.stringify(providerError)).not.toContain('SYNTHETIC_CREDENTIAL_CANARY');
    fetchMock.mockRejectedValueOnce(new Error('SYNTHETIC_CREDENTIAL_CANARY'));
    const networkError = await provider.baglantiTesti(settings());
    expect(networkError.basarili).toBe(false);
    expect(JSON.stringify(networkError)).not.toContain('SYNTHETIC_CREDENTIAL_CANARY');
    expect(networkError.detay).toBeUndefined();
    fetchMock.mockResolvedValueOnce(new Response('SYNTHETIC_CREDENTIAL_CANARY', { status: 200 }));
    expect(JSON.stringify(await provider.baglantiTesti(settings()))).not.toContain(
      'SYNTHETIC_CREDENTIAL_CANARY'
    );
  });
});
