import { afterEach, describe, expect, it, vi } from 'vitest';
import { butikKaydet, type ButikKayitBilgileri } from '../../src/lib/butikKayit';

const bilgiler: ButikKayitBilgileri = {
  ad: 'Fixture Boutique',
  sehir: 'Baku',
  sahipAdi: 'Fixture Owner',
  sahipEmail: 'owner@example.invalid',
  sahipTelefon: '+994000000001',
  paket: 'PRO',
  menseiUlke: 'CA',
};
const firma = { id: 'fixture-boutique', ad: bilgiler.ad, paket: bilgiler.paket };
const hataMesaji = 'Registration failed';

afterEach(() => vi.restoreAllMocks());

describe('Boutique registration API result', () => {
  it('uses only server-confirmed registration and reports successful email delivery', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        basarili: true,
        firma,
        emailGonderildi: true,
      })
    );
    await expect(butikKaydet(bilgiler, hataMesaji)).resolves.toEqual({
      firma,
      emailGonderildi: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/firmalar/kayit',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(bilgiler),
      })
    );
  });

  it.each([false, undefined])(
    'does not claim that an email was sent when delivery is %s',
    async (emailGonderildi) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        Response.json({ basarili: true, firma, emailGonderildi })
      );
      await expect(butikKaydet(bilgiler, hataMesaji)).resolves.toEqual({
        firma,
        emailGonderildi: false,
      });
    }
  );

  it('preserves an API rejection instead of creating a local company', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json(
        {
          basarili: false,
          hata: 'An application already exists',
        },
        { status: 409 }
      )
    );
    await expect(butikKaydet(bilgiler, hataMesaji)).rejects.toThrow(
      'An application already exists'
    );
  });

  it('rejects a failed HTTP response even if its body claims success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ basarili: true, firma }, { status: 503 })
    );
    await expect(butikKaydet(bilgiler, hataMesaji)).rejects.toMatchObject({ status: 503 });
  });

  it('rejects a proxy error page and a malformed success response', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('<html>Gateway Timeout</html>', { status: 504 }))
      .mockResolvedValueOnce(Response.json({ basarili: true, firma: { ad: 'Missing ID' } }));
    await expect(butikKaydet(bilgiler, hataMesaji)).rejects.toMatchObject({ status: 504 });
    await expect(butikKaydet(bilgiler, hataMesaji)).rejects.toThrow(hataMesaji);
  });

  it('propagates a lost connection without inventing a successful registration', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(butikKaydet(bilgiler, hataMesaji)).rejects.toThrow('Failed to fetch');
  });
});
