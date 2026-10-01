import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/**
 * i18n kuralının denetimi (docs/i18n.md):
 *  - Taşınmış dosyalarda kullanıcıya görünen düz metin kalmaz; metin yalnız çeviri
 *    anahtarıyla yazılır.
 *  - Her dilin ad alanı dosyaları aynı anahtar kümesine sahiptir.
 * Bir satırın sonundaki `// i18n-teknik` yorumu o satırdaki metni bilerek muaf tutar
 * (ör. belge biçim kalıbı, marka adı).
 */

/** JSX attributes that never carry user-visible text. */
const TEKNIK_OZNITELIKLER = new Set([
  'className',
  'id',
  'key',
  'type',
  'href',
  'src',
  'role',
  'name',
  'htmlFor',
  'autoComplete',
  'inputMode',
  'rel',
  'target',
  'method',
  'action',
  'accept',
  'pattern',
  'form',
  'lang',
  'dir',
  'd',
  'viewBox',
  'fill',
  'stroke',
  'xmlns',
  'strokeWidth',
  'strokeLinecap',
  'strokeLinejoin',
  'aria-hidden',
  'aria-labelledby',
  'aria-describedby',
  'aria-controls',
  'aria-live',
  'aria-current',
  'aria-expanded',
  'aria-pressed',
  'aria-haspopup',
  'enterKeyHint',
  'loading',
  'decoding',
  'sandbox',
  'referrerPolicy',
]);
/** Calls whose first argument is a translation key, not text. */
const ANAHTAR_CAGRILARI = new Set(['t', 'belgeT', 'useTranslation', 'getFixedT', 'loadNamespaces']);

const HARF = /\p{L}/u;
const ASCII = /^[\x20-\x7e]*$/;
/** Tailwind-like class lists: ASCII tokens with at least one '-' or ':' somewhere. */
function sinifListesi(metin: string) {
  const parcalar = metin.trim().split(/\s+/);
  return (
    parcalar.length > 0 &&
    parcalar.every((p) => /^!?-?[a-z0-9][a-z0-9:_\-/.[\]%#()&>,=+*'"]*$/.test(p)) &&
    parcalar.some((p) => /[-:]/.test(p))
  );
}
/** Technical strings: identifiers, enum values, paths, codes, class lists. */
function teknik(metin: string) {
  const m = metin.trim();
  if (!HARF.test(m)) return true;
  if (!ASCII.test(m)) return false;
  if (/^[A-Z0-9_]+$/.test(m)) return true; // ENUM_VALUE
  if (/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(m)) return true; // code sample: TOR-ZARA-9821
  if (/^[a-z][a-zA-Z0-9_.\-]*$/.test(m)) return true; // identifier, key, kebab, locale
  if (/^[/#.?&=:@]/.test(m) || /^https?:/.test(m) || /^[\w.+-]+\/[\w.+*-]+$/.test(m)) return true;
  if (/^[\w-]+\[[^\]]*\]$/.test(m)) return true; // CSS selector
  if (/^[A-Z][a-z]+(?:-[A-Z][a-z]+)+$/.test(m)) return true; // HTTP header (Content-Type)
  return sinifListesi(m);
}

function oznitelikAdi(node: ts.Node): string | null {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isJsxAttribute(n)) return n.name.getText();
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) return null;
  }
  return null;
}
function anahtarArgumani(node: ts.Node) {
  const parent = node.parent;
  if (!parent || !ts.isCallExpression(parent) || parent.arguments[0] !== node) return false;
  const callee = parent.expression;
  const ad = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : '';
  return ANAHTAR_CAGRILARI.has(ad);
}
function konsolArgumani(node: ts.Node) {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isCallExpression(n)) {
      const text = n.expression.getText();
      if (/^console\./.test(text)) return true;
    }
    if (ts.isBlock(n) || ts.isSourceFile(n)) return false;
  }
  return false;
}

export interface DuzMetin {
  dosya: string;
  satir: number;
  metin: string;
}

/** User-visible literal text left in a TS/TSX file. */
export function duzMetinler(dosya: string): DuzMetin[] {
  const kaynak = fs.readFileSync(dosya, 'utf8');
  const satirlar = kaynak.split('\n');
  const sf = ts.createSourceFile(
    dosya,
    kaynak,
    ts.ScriptTarget.Latest,
    true,
    dosya.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const sonuc: DuzMetin[] = [];
  const ekle = (node: ts.Node, metin: string) => {
    const satir = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
    if (/\/\/\s*i18n-teknik\b/.test(satirlar[satir] ?? '')) return;
    sonuc.push({ dosya, satir: satir + 1, metin: metin.trim().slice(0, 80) });
  };
  const gez = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isJsxText(node)) {
      if (HARF.test(node.text)) ekle(node, node.text);
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      const metin = node.text;
      const oznitelik = oznitelikAdi(node);
      const muaf =
        teknik(metin) ||
        (oznitelik !== null &&
          (TEKNIK_OZNITELIKLER.has(oznitelik) || oznitelik.startsWith('data-'))) ||
        anahtarArgumani(node) ||
        konsolArgumani(node) ||
        (node.parent && ts.isLiteralTypeNode(node.parent));
      if (!muaf) ekle(node, metin);
    }
    ts.forEachChild(node, gez);
  };
  gez(sf);
  return sonuc;
}

type Agac = { [anahtar: string]: string | Agac };
function anahtarlar(agac: Agac, onek = ''): string[] {
  return Object.entries(agac).flatMap(([k, v]) =>
    typeof v === 'string' ? [onek + k] : anahtarlar(v, `${onek}${k}.`)
  );
}

/** Missing keys per language and namespace, relative to the union over all languages. */
export function anahtarFarklari(kok = 'src/i18n/locales'): string[] {
  const diller = fs
    .readdirSync(kok, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const adAlanlari = [
    ...new Set(diller.flatMap((dil) => fs.readdirSync(path.join(kok, dil)))),
  ].sort();
  const farklar: string[] = [];
  for (const adAlani of adAlanlari) {
    const kumeler = new Map<string, Set<string>>();
    for (const dil of diller) {
      const dosya = path.join(kok, dil, adAlani);
      if (!fs.existsSync(dosya)) {
        farklar.push(`${dil}/${adAlani}: dosya yok`);
        continue;
      }
      kumeler.set(dil, new Set(anahtarlar(JSON.parse(fs.readFileSync(dosya, 'utf8')) as Agac)));
    }
    const birlesim = new Set([...kumeler.values()].flatMap((k) => [...k]));
    for (const [dil, kume] of kumeler)
      for (const anahtar of birlesim)
        if (!kume.has(anahtar)) farklar.push(`${dil}/${adAlani}: ${anahtar} yok`);
  }
  return farklar;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const dosyalar = process.argv.slice(2);
  const bulunan = dosyalar.flatMap(duzMetinler);
  for (const b of bulunan) console.log(`${b.dosya}:${b.satir}  ${b.metin}`);
  console.log(`${bulunan.length} düz metin`);
}
