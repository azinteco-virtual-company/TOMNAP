import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const env = vi.hoisted(() => ({
  db: null as any,
  download: vi.fn(),
  afterRead: null as (() => void) | null,
}));
vi.mock('../../../src/server/services/supabase', () => ({
  get supabase() {
    return env.db;
  },
}));
vi.mock('../../../src/server/services/publicFetch', async (original) => ({
  ...(await original<typeof import('../../../src/server/services/publicFetch')>()),
  fetchPublicResource: env.download,
}));
import router from '../../../src/server/routes/gorsel';
import * as state from '../../../src/server/services/state';
import { hazirlaSupabasePayload } from '../../../src/server/services/siparisFormatlama';
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]);
const row = (): Record<string, any> => ({
  id: 'image-order',
  ...hazirlaSupabasePayload({
    tenant_id: 'image-tenant',
    musteri_adi: 'Synthetic',
    urun_aciklamasi: 'Bag',
    urunler: [
      {
        urun_adi: 'Bag',
        adet: 1,
        urun_gorseli: 'https://cdn.example/old.png',
        orijinal_gorsel_url: 'https://cdn.example/original.png',
      },
    ],
  }),
  baku_kurye_id: 'old-courier',
  kurye_atama_surumu: 1,
  lojistik_durumu: 'BAKU_DAGITIM_ARKADAS',
  alinan_tutar: 10,
});
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.tenantId = 'image-tenant';
  req.auth = { role: 'PATRON', tenantId: 'image-tenant' } as any;
  next();
});
app.use('/api', router);
function mockDatabase() {
  let current = row();
  const updates: any[] = [];
  env.db = {
    from: vi.fn(() => {
      let patch: any;
      const filters: [string, unknown, boolean][] = [];
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters.push([key, value, false]);
          return query;
        },
        is: (key: string, value: unknown) => {
          filters.push([key, value, true]);
          return query;
        },
        update: (value: any) => {
          patch = value;
          updates.push(value);
          return query;
        },
        maybeSingle: async () => {
          if (!patch) {
            const copy = structuredClone(current);
            env.afterRead?.();
            return { data: copy };
          }
          const matches = filters.every(([key, value, isNull]) =>
            isNull
              ? current[key] == null
              : (typeof current[key] === 'object' ? JSON.stringify(current[key]) : current[key]) ===
                value
          );
          if (!matches) return { data: null };
          current = { ...current, ...patch };
          return { data: structuredClone(current) };
        },
      };
      return query;
    }),
  };
  return {
    get current() {
      return current;
    },
    updates,
  };
}
const actions = ['katalog-gorseli-kaydet', 'urun-orijinal-gorsele-don'];
const body = {
  siparis_id: 'image-order',
  urun_indeksi: 0,
  katalog_gorsel_url: 'https://cdn.example/new.png',
};
beforeEach(() => {
  env.db = null;
  env.afterRead = null;
  env.download
    .mockReset()
    .mockResolvedValue(new Response(png, { headers: { 'Content-Type': 'image/png' } }));
  state.setSiparislerVeritabani([row()]);
});
describe('image writes preserve concurrent order operations', () => {
  it.each(actions)(
    '%s only updates metadata and preserves later assignment/delivery/payment',
    async (action) => {
      const database = mockDatabase();
      env.afterRead = () => {
        Object.assign(database.current, {
          baku_kurye_id: 'new-courier',
          kurye_atama_surumu: 2,
          lojistik_durumu: 'TESLIM_EDILDI',
          alinan_tutar: 100,
        });
      };
      const response = await request(app).post(`/api/${action}`).send(body);
      expect(response.status).toBe(200);
      expect(database.updates).toHaveLength(1);
      expect(Object.keys(database.updates[0])).toEqual(['eksik_bilgiler']);
      expect(response.body.siparis).toMatchObject({
        baku_kurye_id: 'new-courier',
        kurye_atama_surumu: 2,
        lojistik_durumu: 'TESLIM_EDILDI',
        alinan_tutar: 100,
      });
    }
  );
  it.each(actions)('%s rejects competing image/metadata changes with 409', async (action) => {
    const database = mockDatabase();
    env.afterRead = () => {
      database.current.eksik_bilgiler = [
        ...database.current.eksik_bilgiler,
        'New concurrent metadata',
      ];
    };
    const response = await request(app).post(`/api/${action}`).send(body);
    expect(response.status).toBe(409);
    expect(database.current.eksik_bilgiler).toContain('New concurrent metadata');
  });
  it('local catalogue update returns current assignment after an awaited download', async () => {
    env.download.mockImplementationOnce(async () => {
      Object.assign(state.siparislerVeritabani[0], {
        baku_kurye_id: 'new-courier',
        lojistik_durumu: 'TESLIM_EDILDI',
        alinan_tutar: 100,
      });
      return new Response(png, { headers: { 'Content-Type': 'image/png' } });
    });
    const response = await request(app).post('/api/katalog-gorseli-kaydet').send(body);
    expect(response.status).toBe(200);
    expect(response.body.siparis).toMatchObject({
      baku_kurye_id: 'new-courier',
      lojistik_durumu: 'TESLIM_EDILDI',
      alinan_tutar: 100,
    });
    expect(state.siparislerVeritabani[0].baku_kurye_id).toBe('new-courier');
  });
  it('local catalogue update rejects stale product metadata', async () => {
    env.download.mockImplementationOnce(async () => {
      state.siparislerVeritabani[0].eksik_bilgiler.push('Concurrent product edit');
      return new Response(png, { headers: { 'Content-Type': 'image/png' } });
    });
    const response = await request(app).post('/api/katalog-gorseli-kaydet').send(body);
    expect(response.status).toBe(409);
    expect(state.siparislerVeritabani[0].eksik_bilgiler).toContain('Concurrent product edit');
  });
});
