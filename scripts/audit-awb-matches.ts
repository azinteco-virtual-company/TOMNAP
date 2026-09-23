import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AramexProvider } from '../src/server/services/kargo/providers/aramex';
import {
  manifestBulgulari,
  siralaBulgular,
  toAuditOrder,
  veritabaniBulgulari,
  type AuditOrder,
  type Bulgu,
  type ManifestDenetimi,
} from './lib/awbAudit';

export const AWB_AUDIT_HELP = `AWB eşleştirme denetimi — SALT OKUNUR (hiçbir kaydı değiştirmez)

Eski otomatik manifest eşleştirmesinin isim benzerliğiyle yanlış siparişe
yazmış olabileceği AWB kodlarını listeler. Çıktı manuel inceleme içindir.

  tsx scripts/audit-awb-matches.ts --tenant <firma-id> [--manifest <dosya>]... [--out <rapor.json>]
  tsx scripts/audit-awb-matches.ts --all-tenants [--manifest <dosya>]... [--out <rapor.json>]

Yalnız veritabanı sinyalleri (her zaman):
  AYNI_AWB_BIRDEN_FAZLA_SIPARISTE  aynı AWB aynı butikte birden fazla siparişte
  ESKI_ESLESTIRME_BOS_ISIM         eski normalizasyon müşteri adını boşaltıyordu
  ESKI_ESLESTIRME_KISA_ISIM        eski normalizasyon adı 1-3 karaktere indiriyordu
Orijinal manifest dosyası verilirse (--manifest, tekrarlanabilir):
  MANIFEST_ALICI_UYUSMUYOR / MANIFEST_ALICI_BENZER  manifest alıcısı ile AWB'nin
  yazıldığı siparişin müşterisi (Unicode-duyarlı ad + tam telefon) uyuşmuyor.
  MANIFEST_TELEFON_UYUSMUYOR  ad tutsa (katlanmış yazımı dahil) bile iki tarafta
  da okunabilen telefonlar normalize edildikten sonra farklı (YÜKSEK).
Veritabanı eski manifestlerdeki alıcı adını saklamaz; kesin karşılaştırma için
orijinal manifest dosyaları gerekir.

--dry-run varsayılandır ve tek moddur. --apply, --write, --fix ve --no-dry-run
reddedilir. Gerekli ortam: SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY; yalnız
SELECT sorguları çalıştırılır. --out dosyası 0600 izinle oluşturulur ve mevcut
bir dosyanın üzerine yazılmaz. Rapor kişisel veri içerir; özel tutun.
`;

const PAGE_SIZE = 1000;
const MAX_ORDERS = 200_000;
const AUDIT_COLUMNS =
  'id,tenant_id,musteri_adi,telefon_numarasi,lojistik_durumu,uluslararasi_kargo_kodu';
const WRITE_FLAGS = new Set(['--apply', '--write', '--fix', '--no-dry-run']);

export interface AuditArguments {
  tenantId: string | null;
  manifests: string[];
  out: string | null;
  help: boolean;
}

export function parseAuditArguments(argv: readonly string[]): AuditArguments {
  const result: AuditArguments = { tenantId: null, manifests: [], out: null, help: false };
  let allTenants = false;
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (WRITE_FLAGS.has(flag))
      throw new Error(`${flag} desteklenmez: bu script salt okunurdur ve hiçbir kaydı değiştirmez.`);
    if (flag === '--help' || flag === '-h') result.help = true;
    else if (flag === '--dry-run') continue;
    else if (flag === '--all-tenants') allTenants = true;
    else if (flag === '--tenant' || flag === '--manifest' || flag === '--out') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`${flag} için değer eksik.`);
      if (flag === '--tenant') {
        if (result.tenantId || !/^[a-zA-Z0-9_-]{1,100}$/.test(value) || value === 'all')
          throw new Error('Geçersiz veya tekrarlanan --tenant değeri.');
        result.tenantId = value;
      } else if (flag === '--manifest') result.manifests.push(value);
      else if (result.out) throw new Error('--out yalnız bir kez verilebilir.');
      else result.out = value;
    } else throw new Error(`Bilinmeyen seçenek: ${flag}. --help kullanın.`);
  }
  if (!result.help && (allTenants ? result.tenantId !== null : result.tenantId === null))
    throw new Error('--tenant <firma-id> veya --all-tenants seçeneklerinden tam olarak biri gerekli.');
  return result;
}

export interface OrderPageQuery {
  tenantId: string | null;
  afterId: string | null;
  limit: number;
}
export type OrderPageReader = (query: OrderPageQuery) => Promise<unknown[]>;

/** The only database access of this script: a SELECT chain, never a write. */
export function supabaseOrderPageReader(client: SupabaseClient): OrderPageReader {
  return async ({ tenantId, afterId, limit }) => {
    let query = client
      .from('siparisler')
      .select(AUDIT_COLUMNS)
      .not('uluslararasi_kargo_kodu', 'is', null)
      .order('id', { ascending: true })
      .limit(limit);
    if (tenantId) query = query.eq('tenant_id', tenantId);
    if (afterId) query = query.gt('id', afterId);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) throw new Error('Siparişler okunamadı (salt okunur sorgu).');
    return data;
  };
}

export async function readAuditOrders(
  readPage: OrderPageReader,
  tenantId: string | null
): Promise<AuditOrder[]> {
  const orders: AuditOrder[] = [];
  let afterId: string | null = null;
  for (;;) {
    const rows = await readPage({ tenantId, afterId, limit: PAGE_SIZE });
    for (const row of rows) {
      const order = toAuditOrder(row);
      if (order && (!tenantId || order.tenantId === tenantId)) orders.push(order);
    }
    if (orders.length > MAX_ORDERS) throw new Error('Denetim sınırı aşıldı; --tenant ile daraltın.');
    if (rows.length < PAGE_SIZE) return orders;
    const last = rows[rows.length - 1];
    const lastId =
      last && typeof last === 'object' && typeof (last as Record<string, unknown>).id === 'string'
        ? ((last as Record<string, unknown>).id as string)
        : null;
    if (!lastId) throw new Error('Sayfalama kimliği okunamadı.');
    afterId = lastId;
  }
}

export interface AuditDependencies {
  readPage: OrderPageReader | null;
  readFile: (file: string) => Buffer;
  createReport: (file: string, content: string) => void;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

/** Creates a private report file; an existing file is never overwritten. */
export function createPrivateReport(file: string, content: string): void {
  const descriptor = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, content, 'utf8');
  } finally {
    fs.closeSync(descriptor);
  }
}

export async function auditMain(argv: readonly string[], deps: AuditDependencies): Promise<number> {
  const args = parseAuditArguments(argv);
  if (args.help) {
    deps.stdout(AWB_AUDIT_HELP);
    return 0;
  }
  if (!deps.readPage)
    throw new Error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli; script yalnız okuma yapar.');
  const orders = await readAuditOrders(deps.readPage, args.tenantId);
  const manifests: ManifestDenetimi[] = [];
  const parser = new AramexProvider();
  for (const file of args.manifests) {
    const parsed = await parser.manifestoAyristir(deps.readFile(file), path.basename(file));
    if (!parsed.basarili) throw new Error(`${file} okunamadı: ${parsed.hatalar?.[0] || 'bilinmeyen hata'}`);
    manifests.push(manifestBulgulari(orders, parsed.satirlar, path.basename(file)));
  }
  const findings: Bulgu[] = siralaBulgular([
    ...veritabaniBulgulari(orders),
    ...manifests.flatMap((manifest) => manifest.bulgular),
  ]);
  const report = {
    olusturmaTarihi: new Date().toISOString(),
    mod: 'SALT_OKUNUR',
    kapsam: args.tenantId ? { tenantId: args.tenantId } : { tumButikler: true },
    awbliSiparisSayisi: orders.length,
    manifestler: manifests.map(({ bulgular, ...summary }) => ({ ...summary, bulguSayisi: bulgular.length })),
    ozet: {
      YUKSEK: findings.filter((item) => item.onem === 'YUKSEK').length,
      ORTA: findings.filter((item) => item.onem === 'ORTA').length,
    },
    bulgular: findings,
  };
  const json = JSON.stringify(report, null, 2) + '\n';
  if (args.out) deps.createReport(args.out, json);
  else deps.stdout(json);
  deps.stderr(
    `Salt okunur denetim: ${orders.length} AWB'li sipariş, ${report.ozet.YUKSEK} yüksek, ` +
      `${report.ozet.ORTA} orta önemde bulgu. Hiçbir kayıt değiştirilmedi.\n`
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  import('../src/server/services/supabase')
    .then(({ supabase }) =>
      auditMain(process.argv.slice(2), {
        readPage: supabase ? supabaseOrderPageReader(supabase) : null,
        readFile: (file) => fs.readFileSync(file),
        createReport: createPrivateReport,
        stdout: (text) => process.stdout.write(text),
        stderr: (text) => process.stderr.write(text),
      })
    )
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
