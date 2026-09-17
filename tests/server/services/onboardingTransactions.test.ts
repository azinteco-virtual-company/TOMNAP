import fs from 'node:fs';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  registerBoutique,
  activateUser,
  acceptInvite,
  createInvite,
} from '../../../src/server/services/onboarding';
import {
  createEmailJob,
  deliverOnboardingEmail,
} from '../../../src/server/services/onboardingOutbox';
import {
  getIdentitySnapshot,
  saveIdentitySnapshot,
  loadIdentitySnapshot,
} from '../../../src/server/services/state';
import type { DavetKaydi, FirmaTenantItem, KullaniciKaydi } from '../../../src/server/types';

const mocked = vi.hoisted(() => ({ send: vi.fn(), db: null as any }));
vi.mock('../../../src/server/services/emailService', () => ({ sendEmail: mocked.send }));
vi.mock('../../../src/server/services/supabase', () => ({
  get supabase() {
    return mocked.db;
  },
}));

const future = () => new Date(Date.now() + 3_600_000).toISOString();
const company = (extra = {}): FirmaTenantItem => ({
  id: 'atomic-company',
  ad: 'Atomic',
  sehir: 'Baku',
  aciklama: '',
  varsayilanParaBirimi: 'AZN',
  varsayilanKomisyonYuzdesi: 15,
  onayDurumu: 'AKTIF',
  rolLimitleri: {
    PATRON: 1,
    KANADA_SATINALMA: 1,
    SATIS_SORUMLUSU: 1,
    BAKU_FINANS: 1,
    BAKU_KURYE: 1,
  },
  ...extra,
});
const user = (extra = {}): KullaniciKaydi => ({
  id: 'atomic-user',
  tenant_id: 'atomic-company',
  ad_soyad: 'User',
  email: 'user@example.test',
  telefon: '+994501010101',
  rol: 'PATRON',
  durum: 'BEKLEMEDE_SIFRE',
  aktivasyon_token: 'activation-token',
  token_gecerlilik: future(),
  olusturma_tarihi: new Date().toISOString(),
  ...extra,
});
const invitation = (extra = {}): DavetKaydi => ({
  token: 'invite-token',
  tenantId: 'atomic-company',
  tenantAd: 'Atomic',
  rol: 'BAKU_KURYE',
  olusturanKisi: 'Owner',
  olusturmaTarihi: new Date().toISOString(),
  gecerlilikTarihi: future(),
  kullanildiMi: false,
  ...extra,
});
const job = () =>
  createEmailJob(
    'atomic-company',
    'ACTIVATION',
    {
      from: 'sender@example.test',
      to: 'user@example.test',
      subject: 'Activation',
      html: '<p>Secret token</p>',
      text: 'Secret token',
    },
    future()
  );

beforeEach(() => {
  mocked.db = null;
  mocked.send.mockReset().mockResolvedValue({ basarili: true });
  saveIdentitySnapshot({ companies: [], users: [], invites: [], emailJobs: [] });
});
afterEach(() => vi.restoreAllMocks());

describe('Atomic local onboarding persistence', () => {
  it('publishes no company, account or mail job if the commit rename fails', async () => {
    const before = getIdentitySnapshot();
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('disk unavailable');
    });
    await expect(
      registerBoutique(company({ onayDurumu: 'BEKLEMEDE' }), user(), job())
    ).rejects.toThrow();
    expect(getIdentitySnapshot()).toEqual(before);
    expect(loadIdentitySnapshot()).toEqual(before);
    expect(mocked.send).not.toHaveBeenCalled();
  });

  it('persists registration, invitation and email jobs across a reload', async () => {
    await registerBoutique(company({ onayDurumu: 'BEKLEMEDE' }), user(), job());
    await activateUser('activation-token', {
      sifre_hash: 'test-hash',
      ad_soyad: 'User',
      telefon: '+994501010101',
    });
    await createInvite(invitation({ email: 'bound@example.test' }), 'PATRON', {
      ...job(),
      id: 'invite-mail-job',
      kind: 'INVITE',
    });
    const persisted = loadIdentitySnapshot();
    expect(persisted.users[0]).toMatchObject({ durum: 'AKTIF', aktivasyon_token: null });
    expect(persisted.companies[0].onayDurumu).toBe('AKTIF');
    expect(persisted.invites[0].email).toBe('bound@example.test');
    expect(persisted.emailJobs).toHaveLength(2);
  });

  it('keeps the activation token and company pending when persistence fails', async () => {
    await registerBoutique(company({ onayDurumu: 'BEKLEMEDE' }), user(), job());
    const before = getIdentitySnapshot();
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('disk unavailable');
    });
    await expect(
      activateUser('activation-token', { sifre_hash: 'test-hash', ad_soyad: 'User', telefon: '' })
    ).rejects.toThrow();
    expect(getIdentitySnapshot()).toEqual(before);
    expect(loadIdentitySnapshot()).toEqual(before);
  });

  it('keeps an invite available when account insertion or persistence fails', async () => {
    saveIdentitySnapshot({
      companies: [company()],
      users: [user()],
      invites: [invitation()],
      emailJobs: [],
    });
    const before = getIdentitySnapshot();
    await expect(
      acceptInvite(
        'invite-token',
        user({ id: 'another-user', email: 'USER@example.test', telefon: '' })
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(getIdentitySnapshot()).toEqual(before);
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('disk unavailable');
    });
    await expect(
      acceptInvite(
        'invite-token',
        user({ id: 'another-user', email: 'other@example.test', telefon: '' })
      )
    ).rejects.toThrow();
    expect(getIdentitySnapshot()).toEqual(before);
    expect(loadIdentitySnapshot()).toEqual(before);
  });

  it('serializes two invitations for the last role slot and never trusts cached counts', async () => {
    saveIdentitySnapshot({
      companies: [company()],
      users: [],
      invites: [invitation(), invitation({ token: 'second-token' })],
      emailJobs: [],
    });
    const results = await Promise.allSettled([
      acceptInvite(
        'invite-token',
        user({ id: 'one', email: 'one@example.test', telefon: '+994501000001' })
      ),
      acceptInvite(
        'second-token',
        user({ id: 'two', email: 'two@example.test', telefon: '+994501000002' })
      ),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const persisted = loadIdentitySnapshot();
    expect(persisted.users).toHaveLength(1);
    expect(persisted.users[0].rol).toBe('BAKU_KURYE');
    expect(persisted.invites.filter((invite) => !invite.kullanildiMi)).toHaveLength(1);
    expect(persisted.companies[0].aktifKullaniciSayilari?.BAKU_KURYE).toBe(1);
  });

  it('rejects normalized duplicate phone registration without adding a company', async () => {
    await registerBoutique(company(), user(), job());
    await expect(
      registerBoutique(
        company({ id: 'new-company' }),
        user({
          id: 'other-user',
          tenant_id: 'new-company',
          email: 'other@example.test',
          telefon: '994 50 101 01 01',
        }),
        { ...job(), tenant_id: 'new-company' }
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(loadIdentitySnapshot().companies).toHaveLength(1);
  });

  it('does not touch local disk after an authoritative Supabase transaction', async () => {
    const remote = { firma: company(), user: user() };
    mocked.db = { rpc: vi.fn().mockResolvedValue({ data: remote, error: null }) };
    const rename = vi.spyOn(fs, 'renameSync');
    await expect(registerBoutique(company(), user(), job())).resolves.toEqual(remote);
    expect(rename).not.toHaveBeenCalled();
    expect(getIdentitySnapshot().users).toEqual([]);
  });
});

describe('Durable onboarding email delivery', () => {
  it('allows only one in-process delivery of a pending local job', async () => {
    const pending = job();
    saveIdentitySnapshot({ companies: [company()], users: [], invites: [], emailJobs: [pending] });
    let finish: (value: any) => void;
    mocked.send.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const first = deliverOnboardingEmail(pending.id);
    await expect(deliverOnboardingEmail(pending.id)).resolves.toEqual({
      claimed: false,
      sent: false,
    });
    finish!({ basarili: true });
    await expect(first).resolves.toEqual({ claimed: true, sent: true });
    expect(mocked.send).toHaveBeenCalledTimes(1);
    expect(loadIdentitySnapshot().emailJobs[0].status).toBe('SENT');
  });

  it('retains failed delivery with backoff and reuses the same immutable payload and key', async () => {
    const pending = job();
    saveIdentitySnapshot({ companies: [company()], users: [], invites: [], emailJobs: [pending] });
    mocked.send
      .mockResolvedValueOnce({ basarili: false })
      .mockResolvedValueOnce({ basarili: true });
    await expect(deliverOnboardingEmail(pending.id)).resolves.toEqual({
      claimed: true,
      sent: false,
    });
    expect(loadIdentitySnapshot().emailJobs[0].status).toBe('PENDING');
    await expect(deliverOnboardingEmail(pending.id)).resolves.toEqual({
      claimed: false,
      sent: false,
    });
    const next = getIdentitySnapshot();
    next.emailJobs[0].next_attempt_at = new Date(Date.now() - 1).toISOString();
    saveIdentitySnapshot(next);
    await expect(deliverOnboardingEmail(pending.id)).resolves.toEqual({
      claimed: true,
      sent: true,
    });
    expect(mocked.send.mock.calls[1][0]).toEqual(mocked.send.mock.calls[0][0]);
    expect(mocked.send.mock.calls[0][0].idempotencyKey).toBe(`tomnap-onboarding/${pending.id}`);
  });

  it('does not send an expired token or a job whose lease could not persist', async () => {
    const expired = { ...job(), expires_at: new Date(Date.now() - 1).toISOString() };
    saveIdentitySnapshot({ companies: [company()], users: [], invites: [], emailJobs: [expired] });
    await expect(deliverOnboardingEmail(expired.id)).resolves.toEqual({
      claimed: false,
      sent: false,
    });
    const pending = job();
    saveIdentitySnapshot({ ...getIdentitySnapshot(), emailJobs: [pending] });
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('disk unavailable');
    });
    await expect(deliverOnboardingEmail(pending.id)).rejects.toThrow();
    expect(mocked.send).not.toHaveBeenCalled();
    expect(loadIdentitySnapshot().emailJobs[0].status).toBe('PENDING');
  });

  it('acknowledges against a fresh local snapshot without discarding intervening registration', async () => {
    const pending = job();
    saveIdentitySnapshot({ companies: [company()], users: [], invites: [], emailJobs: [pending] });
    mocked.send.mockImplementation(async () => {
      await registerBoutique(company({ id: 'new-company' }), user({ tenant_id: 'new-company' }), {
        ...job(),
        tenant_id: 'new-company',
      });
      return { basarili: true };
    });
    await deliverOnboardingEmail(pending.id);
    expect(loadIdentitySnapshot().companies).toHaveLength(2);
    expect(loadIdentitySnapshot().users).toHaveLength(1);
    expect(loadIdentitySnapshot().emailJobs).toHaveLength(2);
  });
});
