import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createApp } from '../../../src/server';
import kargoRouter from '../../../src/server/routes/kargoEntegrasyon';
import { kargoMerkezi } from '../../../src/server/services/kargo/kargoMerkezi';
import { CargoSettingsError } from '../../../src/server/services/kargo/settings';
import { loginFixture } from '../helpers/session';

const TENANT = 'luxury_brand_baku';
type Agent = Awaited<ReturnType<typeof loginFixture>>['agent'];
afterEach(() => vi.restoreAllMocks());

describe('Cargo routes: settings, tracking and synchronization', () => {
  const app = createApp();
  let owner: Agent;
  beforeAll(async () => {
    owner = (await loginFixture(app, 'PATRON', TENANT)).agent;
  });

  it('saves settings with the current revision and rejects a stale revision', async () => {
    const current = await owner.get('/api/kargo/ayarlar');
    expect(current.status).toBe(200);
    const revision = current.body.ayarlar.revision;
    const saved = await owner.post('/api/kargo/ayarlar').send({
      revision,
      saglayici: 'MANUEL',
      kimlikBilgileri: { testModu: true },
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ basarili: true, ayarlar: { saglayici: 'MANUEL' } });
    const stale = await owner.post('/api/kargo/ayarlar').send({ revision, saglayici: 'ARAMEX' });
    expect(stale.status).toBe(409);
    expect(stale.body.basarili).toBe(false);
  });

  it('maps settings, connection and tracking failures to explicit statuses', async () => {
    vi.spyOn(kargoMerkezi, 'getAyarlar').mockRejectedValueOnce(
      new CargoSettingsError('Synthetic settings outage', 503)
    );
    expect((await owner.get('/api/kargo/ayarlar')).status).toBe(503);

    vi.spyOn(kargoMerkezi, 'baglantiTesti').mockRejectedValueOnce(new Error('Synthetic failure'));
    const test = await owner.post('/api/kargo/test').send({});
    expect(test.status).toBe(500);
    expect(test.body).toMatchObject({ basarili: false, gecikmeMs: 0 });

    expect((await owner.post('/api/kargo/takip').send({ takipNolari: [] })).status).toBe(400);
    vi.spyOn(kargoMerkezi, 'takipEt').mockRejectedValueOnce(
      new CargoSettingsError('Synthetic carrier outage', 503)
    );
    expect((await owner.post('/api/kargo/takip').send({ takipNolari: ['AWB-1'] })).status).toBe(503);
  });

  it('reports synchronization results and conflicts', async () => {
    vi.spyOn(kargoMerkezi, 'topluSenkronizeEt').mockResolvedValueOnce({
      basarili: true,
      sorgulananSayi: 3,
      guncellenenSayi: 2,
      detaylar: [],
    });
    const synced = await owner.post('/api/kargo/senkronize-et').send({});
    expect(synced.status).toBe(200);
    expect(synced.body.mesaj).toContain('3');
    expect(synced.body.guncellenenSayi).toBe(2);

    vi.spyOn(kargoMerkezi, 'topluSenkronizeEt').mockRejectedValueOnce(
      new CargoSettingsError('Sipariş değişti', 409)
    );
    expect((await owner.post('/api/kargo/senkronize-et').send({})).status).toBe(409);
  });
});

describe('Manifest upload input validation and error mapping', () => {
  const app = createApp();
  let owner: Agent;
  beforeAll(async () => {
    owner = (await loginFixture(app, 'PATRON', TENANT)).agent;
  });

  it('requires file content and enforces the size limit before parsing', async () => {
    const parse = vi.spyOn(kargoMerkezi, 'getProvider');
    expect((await owner.post('/api/kargo/manifesto-yukle').send({})).status).toBe(400);
    expect(
      (await owner.post('/api/kargo/manifesto-yukle').send({ dosya_base64: 12345 })).status
    ).toBe(413);
    const oversized = 'A'.repeat(14 * 1024 * 1024 + 4);
    expect(
      (await owner.post('/api/kargo/manifesto-yukle').send({ dosya_base64: oversized })).status
    ).toBe(413);
    expect(parse).not.toHaveBeenCalled();
  });

  it('returns parser errors as 400 and hides unexpected internal errors', async () => {
    const unreadable = await owner
      .post('/api/kargo/manifesto-yukle')
      .send({ dosya_base64: Buffer.from('only one line').toString('base64') });
    expect(unreadable.status).toBe(400);
    expect(unreadable.body.basarili).toBe(false);

    vi.spyOn(kargoMerkezi, 'getProvider').mockImplementationOnce(() => {
      throw new Error('internal stack detail');
    });
    const failure = await owner
      .post('/api/kargo/manifesto-yukle')
      .send({ dosya_base64: Buffer.from('a,b\n1,2').toString('base64') });
    expect(failure.status).toBe(500);
    expect(JSON.stringify(failure.body)).not.toContain('internal stack detail');
  });

  it('refuses to parse without a server-resolved tenant', async () => {
    const bare = express();
    bare.use(express.json());
    bare.use('/api', kargoRouter);
    const response = await request(bare)
      .post('/api/kargo/manifesto-yukle')
      .send({ tenantId: TENANT, dosya_base64: 'YQ==' });
    expect(response.status).toBe(400);
  });
});
