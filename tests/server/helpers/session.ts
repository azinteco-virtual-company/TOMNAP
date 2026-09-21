import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { kullanicilarVeritabani, firmalarVeritabani } from '../../../src/server/services/state';
import { sifreHashle } from '../../../src/server/services/crypto';
import type { KullaniciKaydi } from '../../../src/server/types';

export async function loginFixture(
  app: any,
  role: KullaniciKaydi['rol'] = 'SUPER_ADMIN',
  tenantId = 'kanada_shopper_baku'
) {
  const id = randomUUID();
  const email = `${id}@example.invalid`;
  const password = 'Fixture-password-only!';
  const company = firmalarVeritabani.find((f) => f.id === tenantId);
  if (company) company.onayDurumu = 'AKTIF';
  kullanicilarVeritabani.push({
    id,
    tenant_id: tenantId,
    email,
    telefon: '',
    ad_soyad: 'Synthetic Test',
    olusturma_tarihi: new Date().toISOString(),
    rol: role,
    durum: 'AKTIF',
    sifre_hash: sifreHashle(password),
  });
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/giris').send({ email, sifre: password });
  if (login.status !== 200)
    throw new Error(`Fixture login failed: ${login.status} ${JSON.stringify(login.body)}`);
  agent.set('x-csrf-token', login.body.csrfToken);
  return {
    agent,
    csrfToken: login.body.csrfToken as string,
    cookie: login.headers['set-cookie'][0].split(';')[0] as string,
    userId: id,
  };
}
