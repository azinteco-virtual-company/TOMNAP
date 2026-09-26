import fs from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const environment = vi.hoisted(() => ({ ai: vi.fn() }));
vi.mock('../../../src/server/services/gemini', () => ({
  getGeminiClient: () => ({}),
  generateContentWithRetryAndFallback: environment.ai,
}));

import { createApp } from '../../../src/server';
import {
  firmalarVeritabani,
  kullanicilarVeritabani,
  musterilerVeritabani,
  siparislerVeritabani,
} from '../../../src/server/services/state';
import {
  aiYanitiniOneriyeCevir,
  gorselleriAyikla,
} from '../../../src/server/services/v2/siparisAyristirma';
import { loginFixture } from '../helpers/session';
import { TENANT_A, TENANT_B, describeTenantIsolation } from '../helpers/tenantIsolation';

type Agent = Awaited<ReturnType<typeof loginFixture>>['agent'];
const TENANT = 'v2-ayristirma';
const MESAJ =
  'Salam, Aytən Məmmədova. 0552843911. 2 ədəd qara çanta M, 1 kəmər və 3 cüt corab. Gəncə';
const aiReturns = (value: unknown) =>
  environment.ai.mockResolvedValue({ text: JSON.stringify(value) });
const customer = (id: string, tenant: string, ad_soyad: string, telefon: string, adres: string) =>
  ({ id, tenant_id: tenant, ad_soyad, telefon, adres, sehir: 'Bakı' }) as never;

function seedUser(id: string, tenant: string, rol: string, durum = 'AKTIF') {
  if (kullanicilarVeritabani.some((u) => u.id === id)) return;
  kullanicilarVeritabani.push({
    id,
    tenant_id: tenant,
    ad_soyad: `${id}-ad`,
    email: `${id}@example.invalid`,
    rol: rol as 'PATRON',
    durum: durum as 'AKTIF',
    olusturma_tarihi: new Date().toISOString(),
  });
}

describeTenantIsolation('v2 order owner picker (GET /api/v2/siparis-sahipleri)', {
  env: { FF_V2_FLOW: 'true' },
  seed: () => {
    seedUser('sahip-a-isaret', TENANT_A, 'SATIS_SORUMLUSU');
    seedUser('sahip-b-isaret', TENANT_B, 'SATIS_SORUMLUSU');
  },
  own: { id: 'own', marker: 'sahip-a-isaret' },
  foreign: { id: 'foreign', markers: ['sahip-b-isaret'] },
  list: (agent) => agent.get('/api/v2/siparis-sahipleri'),
});

describe('v2 order suggestion from a message (A9)', () => {
  const app = createApp();
  const agents: Record<string, Agent> = {};
  beforeAll(async () => {
    firmalarVeritabani.push({
      id: TENANT,
      ad: 'v2 ayrıştırma',
      sehir: 'Baku',
      aciklama: '',
      varsayilanParaBirimi: 'AZN',
      varsayilanKomisyonYuzdesi: 15,
      onayDurumu: 'AKTIF',
    });
    musterilerVeritabani.push(
      customer('m-ayten', TENANT, 'Aytən Məmmədova', '+994 55 284 39 11', 'gizli-adres-1'),
      customer('m-aytan', TENANT, 'Aytan Mammadova', '+994 70 000 00 01', 'gizli-adres-2'),
      customer('m-diger', TENANT, 'Rəşad Quliyev', '+994 50 777 66 55', 'gizli-adres-3'),
      customer('m-yabanci', TENANT_B, 'Aytən Məmmədova', '+994 55 284 39 11', 'yabanci-adres')
    );
    for (const role of ['PATRON', 'SATIS_SORUMLUSU', 'KANADA_SATINALMA'] as const)
      agents[role] = (await loginFixture(app, role, TENANT)).agent;
    seedUser('v2-sahip-pasif', TENANT, 'SATIS_SORUMLUSU', 'PASIF');
    seedUser('v2-sahip-kanada', TENANT, 'KANADA_SATINALMA');
  });
  beforeEach(() => {
    vi.stubEnv('FF_V2_FLOW', 'true');
    environment.ai.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('turns a multi-product message into one line per product, and writes nothing', async () => {
    aiReturns({
      musteri_adi: 'Aytən Məmmədova',
      telefon_numarasi: '0552843911',
      teslimat_sehri: 'Gəncə',
      satirlar: [
        { urun_aciklamasi: 'Qara çanta', beden: 'M', renk: 'Qara', adet: 2, birim_fiyat: 45 },
        { urun_aciklamasi: 'Kəmər', adet: 1, birim_fiyat: 20.555 },
        { urun_aciklamasi: 'Corab', adet: 3 },
      ],
      eksik_bilgiler: ['Ünvan yoxdur.'],
    });
    const orders = siparislerVeritabani.length;
    const response = await agents.SATIS_SORUMLUSU.post('/api/v2/siparisler/ayristir').send({
      ham_mesaj: MESAJ,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.oneri.satirlar).toEqual([
      {
        urun_aciklamasi: 'Qara çanta',
        beden: 'M',
        renk: 'Qara',
        adet: 2,
        birim_satis_fiyati_azn: 45,
        kaynak_ulke: 'CA',
      },
      {
        urun_aciklamasi: 'Kəmər',
        beden: null,
        renk: null,
        adet: 1,
        birim_satis_fiyati_azn: 20.56,
        kaynak_ulke: 'CA',
      },
      {
        urun_aciklamasi: 'Corab',
        beden: null,
        renk: null,
        adet: 3,
        birim_satis_fiyati_azn: 0,
        kaynak_ulke: 'CA',
      },
    ]);
    expect(response.body.eksikBilgiler).toEqual(['Ünvan yoxdur.', '3. satırın fiyatı yok.']);
    // The server links a unique exact phone match and lists similar names; the AI never saw them.
    expect(response.body.musteriEslesen).toEqual({
      musteri_id: 'm-ayten',
      ad_soyad: 'Aytən Məmmədova',
    });
    expect(siparislerVeritabani.length).toBe(orders);
  });

  it('sends only the message to the AI: no customer of this or another boutique', async () => {
    aiReturns({
      musteri_adi: 'Aytan',
      satirlar: [{ urun_aciklamasi: 'Çanta', adet: 1, birim_fiyat: 10 }],
      eksik_bilgiler: [],
    });
    const response = await agents.PATRON.post('/api/v2/siparisler/ayristir').send({
      ham_mesaj: 'Aytan, 1 çanta',
    });
    expect(response.status).toBe(200);
    const sent = JSON.stringify(environment.ai.mock.calls);
    expect(sent).toContain('Aytan, 1 çanta');
    for (const marker of [
      'm-ayten',
      'm-aytan',
      'Məmmədova',
      'Quliyev',
      '777 66 55',
      'gizli-adres',
      'yabanci-adres',
      'm-yabanci',
    ])
      expect([marker, sent.includes(marker)]).toEqual([marker, false]);
    // Similar names come back as suggestions only, from this boutique only.
    expect(response.body.musteriEslesen).toBeNull();
    expect(
      response.body.musteriAdaylari.map((c: { musteri_id: string }) => c.musteri_id)
    ).toContain('m-aytan');
    expect(JSON.stringify(response.body)).not.toContain('m-yabanci');
  });

  // A real 1x1 PNG and a JPEG start marker: enough for the type check (nothing decodes them).
  const PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString(
    'base64'
  );
  const uploads = () =>
    fs.existsSync(process.env.UPLOADS_DIR!)
      ? fs.readdirSync(process.env.UPLOADS_DIR!, { recursive: true }).length
      : 0;

  it('reads screenshots too: sent only as images next to the message, nothing stored (A9b)', async () => {
    aiReturns({
      musteri_adi: 'Aytan',
      satirlar: [{ urun_aciklamasi: 'Ekrandakı çanta', adet: 1, birim_fiyat: 30 }],
      eksik_bilgiler: [],
    });
    const before = uploads();
    const orders = siparislerVeritabani.length;
    const response = await agents.SATIS_SORUMLUSU.post('/api/v2/siparisler/ayristir').send({
      gorseller: [
        { mime_type: 'image/png', veri_base64: PNG },
        { mime_type: 'image/jpeg', veri_base64: JPEG },
      ],
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.oneri.satirlar[0]).toMatchObject({ urun_aciklamasi: 'Ekrandakı çanta' });
    const [[, request]] = environment.ai.mock.calls;
    expect(request.contents).toEqual([
      { text: expect.stringContaining('yalnız ekran görüntüleri') },
      { inlineData: { mimeType: 'image/png', data: PNG } },
      { inlineData: { mimeType: 'image/jpeg', data: JPEG } },
    ]);
    const sent = JSON.stringify(environment.ai.mock.calls);
    for (const marker of ['m-ayten', 'Məmmədova', 'gizli-adres', 'yabanci-adres'])
      expect([marker, sent.includes(marker)]).toEqual([marker, false]);
    expect(uploads()).toBe(before);
    expect(siparislerVeritabani.length).toBe(orders);
  });

  it('refuses bad screenshots without calling the AI (A9b)', async () => {
    const png = { mime_type: 'image/png', veri_base64: PNG };
    const big = Buffer.alloc(1_000_001, 1);
    big.set([0xff, 0xd8, 0xff]);
    // The validator directly (the AI route is rate limited to 10 calls a minute) ...
    for (const [value, status] of [
      [[png, png, png, png], 413],
      [[{ mime_type: 'image/jpeg', veri_base64: big.toString('base64') }], 413],
      [[{ mime_type: 'image/gif', veri_base64: PNG }], 400],
      [[{ mime_type: 'image/jpeg', veri_base64: PNG }], 400],
      [[{ mime_type: 'image/png', veri_base64: 'bm90IGFuIGltYWdl!' }], 400],
      [[{ mime_type: 'image/png', veri_base64: '' }], 400],
      [[{ ...png, dosya_yolu: '/etc/passwd' }], 400],
      [png, 400],
    ] as const) {
      let status_: number | undefined;
      try {
        gorselleriAyikla(value);
      } catch (error) {
        status_ = (error as { status?: number }).status;
      }
      expect([JSON.stringify(value).slice(0, 60), status_]).toEqual([
        JSON.stringify(value).slice(0, 60),
        status,
      ]);
    }
    expect(gorselleriAyikla(undefined)).toEqual([]);
    // ... and once through the route: refused before the AI.
    for (const body of [{ gorseller: [png, png, png, png] }, { gorseller: [] }])
      expect((await agents.PATRON.post('/api/v2/siparisler/ayristir').send(body)).status).toBe(
        body.gorseller.length ? 413 : 400
      );
    expect(environment.ai).not.toHaveBeenCalled();
  });

  it('refuses empty, oversized and unknown input without calling the AI', async () => {
    for (const [body, status] of [
      [{}, 400],
      [{ ham_mesaj: '   ' }, 400],
      [{ ham_mesaj: 'x'.repeat(20_001) }, 413],
      [{ ham_mesaj: 'ok', musteriler: [] }, 400],
    ] as const)
      expect([
        body,
        (await agents.PATRON.post('/api/v2/siparisler/ayristir').send(body)).status,
      ]).toEqual([body, status]);
    expect(environment.ai).not.toHaveBeenCalled();
    expect(
      (await agents.KANADA_SATINALMA.post('/api/v2/siparisler/ayristir').send({ ham_mesaj: 'x' }))
        .status
    ).toBe(403);
  });

  it('lists active order owners of the boutique to owners only', async () => {
    const response = await agents.PATRON.get('/api/v2/siparis-sahipleri');
    expect(response.status).toBe(200);
    const ids = response.body.sahipler.map((s: { id: string }) => s.id);
    expect(ids).not.toContain('v2-sahip-pasif');
    expect(ids).not.toContain('v2-sahip-kanada');
    expect(
      response.body.sahipler.every((s: { rol: string }) =>
        ['PATRON', 'SATIS_SORUMLUSU'].includes(s.rol)
      )
    ).toBe(true);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect((await agents.SATIS_SORUMLUSU.get('/api/v2/siparis-sahipleri')).status).toBe(403);
  });
});

describe('AI answer normalisation', () => {
  it('drops lines without a product, clamps quantities and never trusts a price', () => {
    const { oneri, eksikBilgiler } = aiYanitiniOneriyeCevir({
      musteri_adi: '  Ayla \u0000 ',
      satirlar: [
        { urun_aciklamasi: '  ', adet: 1, birim_fiyat: 5 },
        { urun_aciklamasi: 'Çanta', adet: 0, birim_fiyat: -3 },
        { urun_aciklamasi: 'Kəmər', adet: 5000, birim_fiyat: 'on' },
        'garbage',
      ],
      eksik_bilgiler: 'not a list',
    });
    expect(oneri.musteri_adi).toBe('Ayla');
    expect(
      oneri.satirlar.map((s) => [s.urun_aciklamasi, s.adet, s.birim_satis_fiyati_azn])
    ).toEqual([
      ['Çanta', 1, 0],
      ['Kəmər', 1, 0],
    ]);
    expect(eksikBilgiler).toEqual(['2. satırın fiyatı yok.', '3. satırın fiyatı yok.']);
    expect(aiYanitiniOneriyeCevir(null).eksikBilgiler).toEqual(['Mesajda ürün bulunamadı.']);
  });
});
