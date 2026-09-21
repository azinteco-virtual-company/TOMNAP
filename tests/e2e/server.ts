import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import { fileURLToPath } from 'node:url';
import { fixture, imagePath } from './data';

const root = process.env.TOMNAP_E2E_ROOT;
if (
  !root ||
  !process.env.TOMNAP_E2E_NONCE ||
  fs.readFileSync(path.join(root, '.fixture-marker'), 'utf8') !== process.env.TOMNAP_E2E_NONCE ||
  process.env.NODE_ENV !== 'test' ||
  process.env.SUPABASE_URL ||
  process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  throw new Error('Isolated E2E runner environment required.');
}
// config.ts also calls dotenv.config() without a path. Its cwd must therefore
// be the fresh fixture directory before any application module is imported.
process.chdir(root);
const blocked = () => {
  throw new Error('Outbound network disabled in E2E fixture');
};
const originalLookup = dns.lookup;
net.Socket.prototype.connect = blocked as typeof net.Socket.prototype.connect;
globalThis.fetch = async () => blocked();
for (const api of [
  'lookup',
  'lookupService',
  'resolve',
  'resolve4',
  'resolve6',
  'resolveAny',
  'resolveCname',
  'resolveMx',
  'resolveNs',
  'resolveTxt',
  'reverse',
]) {
  (dns as any)[api] = blocked;
  (dnsPromises as any)[api] = async () => blocked();
}
// Node resolves even a literal listen address through dns.lookup. Permit only
// this literal loopback address; it performs no DNS query or outbound request.
dns.lookup = ((hostname: string, ...args: unknown[]) => {
  if (hostname !== '127.0.0.1') return blocked();
  return Reflect.apply(originalLookup, dns, [hostname, ...args]);
}) as typeof dns.lookup;
const { createApp, mountClientAssets } = await import('../../src/server/index');
const { saveIdentitySnapshot, setSiparislerVeritabani, setMusterilerVeritabani } =
  await import('../../src/server/services/state');
const { sifreHashle } = await import('../../src/server/services/crypto');
const created = '2026-09-17T09:00:00.000Z';
saveIdentitySnapshot({
  companies: [fixture.tenantA, fixture.tenantB].map((id, index) => ({
    id,
    ad: `Synthetic Boutique ${index ? 'B' : 'A'}`,
    sehir: 'Bakı',
    varsayilanParaBirimi: 'AZN',
    varsayilanKomisyonYuzdesi: 15,
    aciklama: '',
    onayDurumu: 'AKTIF',
  })),
  users: [
    {
      id: 'e2e-owner-a',
      tenant_id: fixture.tenantA,
      email: fixture.ownerA,
      rol: 'PATRON' as const,
    },
    {
      id: 'e2e-owner-b',
      tenant_id: fixture.tenantB,
      email: fixture.ownerB,
      rol: 'PATRON' as const,
    },
    {
      id: fixture.courierUserId,
      tenant_id: fixture.tenantA,
      email: fixture.courier,
      rol: 'BAKU_KURYE' as const,
    },
  ].map((user) => ({
    ...user,
    ad_soyad: user.id,
    durum: 'AKTIF' as const,
    sifre_hash: sifreHashle(fixture.password),
    olusturma_tarihi: created,
  })),
  invites: [],
  emailJobs: [],
});
fs.mkdirSync(process.env.UPLOADS_DIR!, { recursive: true, mode: 0o700 });
for (const tenant of [fixture.tenantA, fixture.tenantB]) {
  fs.writeFileSync(
    path.join(process.env.UPLOADS_DIR!, path.basename(imagePath(tenant))),
    Buffer.from(fixture.png, 'base64'),
    { mode: 0o600, flag: 'wx' }
  );
}
setSiparislerVeritabani(
  [fixture.tenantA, fixture.tenantB].map((tenant_id, index) => ({
    id: index ? fixture.orderB : fixture.orderA,
    tenant_id,
    musteri_adi: index ? fixture.customerB : fixture.customerA,
    telefon_numarasi: '+994500000000',
    teslimat_adresi: 'Synthetic Street 1',
    teslimat_sehri: 'Bakı',
    urun_aciklamasi: index ? 'Synthetic Parcel Beta' : 'Synthetic Parcel Alpha',
    adet: 1,
    toplam_tutar: 50,
    alinan_tutar: 10,
    kalan_tutar: 40,
    para_birimi: 'AZN',
    lojistik_durumu: 'BAKU_DAGITIM_ARKADAS',
    finans_durumu: 'KISMI_ODEME',
    olusturma_tarihi: created,
    guncellenme_tarihi: created,
    kurye_atama_surumu: 0,
    ham_mesaj: '',
    eksik_bilgiler: [],
    siparis_kaynagi: 'WHATSAPP',
    urunler: [],
    gorsel_urlleri: [imagePath(tenant_id)],
  }))
);
setMusterilerVeritabani([]);
const app = createApp();
const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
mountClientAssets(app, dist);
const server = app.listen(Number(process.env.PORT), '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
