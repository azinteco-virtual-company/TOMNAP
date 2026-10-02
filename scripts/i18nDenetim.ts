import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/**
 * i18n kuralının denetimi (docs/i18n.md):
 *  - Taşınmış dosyalarda kullanıcıya görünen düz metin kalmaz; metin yalnız çeviri
 *    anahtarıyla yazılır.
 *  - Her dilin ad alanı dosyaları aynı anahtar kümesine sahiptir.
 *  - Statik `t('anahtar')` çağrılarının ad alanı ve anahtarı her dilin kaynağında vardır
 *    (iki dilden de silinen anahtar yalnız dilleri birbiriyle karşılaştırarak yakalanmaz).
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
/** JSX attributes that carry text the user reads: no "technical string" exemption. */
const GORUNUR_OZNITELIKLER = new Set([
  'title',
  'placeholder',
  'alt',
  'label',
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
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
  if (/^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+$/.test(m)) return true; // file or frame name: Kargo_Etiketleri
  if (/^![a-z]+$/.test(m)) return true; // spreadsheet keys: !cols
  if (/^[0-9][a-z0-9]*$/.test(m)) return true; // canvas context: 2d
  if (/^\^/.test(m) || /\\[dDwWsSb]/.test(m)) return true; // regular expression source
  if (/^[A-Z][a-z]+(?:[A-Z][a-z0-9]+)+$/.test(m)) return true; // PascalCase name: NotoSans
  if (/^[a-z][a-zA-Z0-9_.\-]*$/.test(m)) return true; // identifier, key, kebab, locale
  if (/^[/#.?&=:@]/.test(m) || /^https?:/.test(m) || /^[\w.+-]+\/[\w.+*-]+$/.test(m)) return true;
  if (/^[\w-]+\[[^\]]*\]$/.test(m)) return true; // CSS selector
  if (/^[A-Z][a-z]+(?:-[A-Z][a-z]+)+$/.test(m)) return true; // HTTP header (Content-Type)
  return sinifListesi(m);
}

/** Markup of an `html` template part: tags, inline CSS and entities are not user text. */
function isaretlemesiz(metin: string): string {
  return metin
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/^[^<]*?>/, ' ')
    .replace(/<[^>]*$/, ' ')
    .replace(/&[a-z]+;/gi, ' ');
}
/** The literal parts of an `html` tagged template, in order. */
function htmlParcalari(node: ts.TaggedTemplateExpression): ts.Node[] {
  const sablon = node.template;
  if (ts.isNoSubstitutionTemplateLiteral(sablon)) return [sablon];
  return [sablon.head, ...sablon.templateSpans.map((span) => span.literal)];
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
  const islenmis = new Set<ts.Node>();
  const gez = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isTaggedTemplateExpression(node) && node.tag.getText() === 'html') {
      // Markup is judged on the whole template: a part may sit inside a tag (" dir=").
      const parcalar = htmlParcalari(node);
      const ayrac = '\u0000';
      const temiz = isaretlemesiz(
        parcalar.map((p) => (p as ts.TemplateLiteralLikeNode).text).join(ayrac)
      ).split(ayrac);
      parcalar.forEach((parca, i) => {
        islenmis.add(parca);
        const metin = temiz[i] ?? '';
        if (HARF.test(metin) && !teknik(metin)) ekle(parca, metin);
      });
    }
    if (islenmis.has(node)) return;
    if (ts.isJsxText(node)) {
      // Visible text: a lowercase word like `save` is not "technical" between tags.
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
      const gorunur = oznitelik !== null && GORUNUR_OZNITELIKLER.has(oznitelik);
      const muaf =
        (gorunur ? !HARF.test(metin) : teknik(metin)) ||
        (oznitelik !== null &&
          (TEKNIK_OZNITELIKLER.has(oznitelik) || oznitelik.startsWith('data-'))) ||
        anahtarArgumani(node) ||
        konsolArgumani(node) ||
        (node.parent && ts.isElementAccessExpression(node.parent)) ||
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

export interface AnahtarKullanimi {
  dosya: string;
  satir: number;
  /** null: the namespace could not be resolved from the source (a `t` passed as argument). */
  adAlani: string | null;
  anahtar: string;
}

function dizgi(node: ts.Node | undefined): string | null {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : null;
}
/** The namespace a translator is bound to: `useTranslation('v2')` → v2, none → ortak. */
function baglananAdAlani(cagri: ts.CallExpression): string | null | undefined {
  const ad = ts.isIdentifier(cagri.expression)
    ? cagri.expression.text
    : ts.isPropertyAccessExpression(cagri.expression)
      ? cagri.expression.name.text
      : '';
  if (ad === 'useBelgeCevirisi' || ad === 'belgeT') return 'belge';
  if (ad === 'useTranslation') {
    const ilk = cagri.arguments[0];
    if (!ilk) return 'ortak';
    if (ts.isArrayLiteralExpression(ilk)) return dizgi(ilk.elements[0]) ?? null;
    return dizgi(ilk) ?? null;
  }
  if (ad === 'getFixedT') return dizgi(cagri.arguments[1]) ?? null;
  return undefined;
}

/** Static translation-key uses (`t('ns.key')`) with the namespace resolved when the source says. */
export function anahtarKullanimlari(dosya: string): AnahtarKullanimi[] {
  const kaynak = fs.readFileSync(dosya, 'utf8');
  const sf = ts.createSourceFile(
    dosya,
    kaynak,
    ts.ScriptTarget.Latest,
    true,
    dosya.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  // name → namespace (null: a translator received as a parameter, namespace unknown)
  const cevirmenler = new Map<string, string | null>();
  const tara = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      let ilk: ts.Expression = node.initializer;
      while (ts.isPropertyAccessExpression(ilk) || ts.isParenthesizedExpression(ilk))
        ilk = ts.isPropertyAccessExpression(ilk) ? ilk.expression : ilk.expression;
      if (ts.isCallExpression(ilk)) {
        const adAlani = baglananAdAlani(ilk);
        if (adAlani !== undefined) {
          if (ts.isIdentifier(node.name)) cevirmenler.set(node.name.text, adAlani);
          else if (ts.isObjectBindingPattern(node.name))
            for (const oge of node.name.elements) {
              const yerel = oge.name;
              const kaynakAd = oge.propertyName?.getText() ?? yerel.getText();
              if (kaynakAd === 't' && ts.isIdentifier(yerel)) cevirmenler.set(yerel.text, adAlani);
            }
        }
      }
    }
    if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.type?.getText() === 'TFunction')
      cevirmenler.set(node.name.text, null);
    ts.forEachChild(node, tara);
  };
  tara(sf);
  const sonuc: AnahtarKullanimi[] = [];
  const gez = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      let adAlani: string | null | undefined;
      if (ts.isIdentifier(callee)) adAlani = cevirmenler.get(callee.text);
      else if (ts.isPropertyAccessExpression(callee) && callee.name.text === 't') {
        const nesne = callee.expression.getText();
        if (nesne === 'i18n' || nesne === 'i18next') adAlani = null;
      }
      const anahtar = dizgi(node.arguments[0]);
      if (adAlani !== undefined && anahtar !== null) {
        let ad = adAlani;
        let temiz = anahtar;
        const onek = /^([a-zA-Z0-9_-]+):(.+)$/.exec(anahtar);
        if (onek) {
          ad = onek[1];
          temiz = onek[2];
        }
        const secenekler = node.arguments[1];
        if (secenekler && ts.isObjectLiteralExpression(secenekler))
          for (const ozellik of secenekler.properties)
            if (ts.isPropertyAssignment(ozellik) && ozellik.name.getText() === 'ns')
              ad = dizgi(ozellik.initializer) ?? ad;
        sonuc.push({
          dosya,
          satir: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          adAlani: ad,
          anahtar: temiz,
        });
      }
    }
    ts.forEachChild(node, gez);
  };
  gez(sf);
  return sonuc;
}

const ARTIL_SONEKLERI = ['', '_zero', '_one', '_two', '_few', '_many', '_other'];

/** Key uses with no matching entry in some language's source, per language. */
export function eksikAnahtarlar(dosyalar: readonly string[], kok = 'src/i18n/locales'): string[] {
  const diller = fs
    .readdirSync(kok, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const onbellek = new Map<string, { yapraklar: Set<string>; dallar: Set<string> } | null>();
  const oku = (dil: string, adAlani: string) => {
    const anahtar = `${dil}/${adAlani}`;
    if (!onbellek.has(anahtar)) {
      const dosya = path.join(kok, dil, `${adAlani}.json`);
      if (!fs.existsSync(dosya)) onbellek.set(anahtar, null);
      else {
        const yapraklar = new Set(anahtarlar(JSON.parse(fs.readFileSync(dosya, 'utf8')) as Agac));
        const dallar = new Set<string>();
        for (const y of yapraklar) {
          const parcalar = y.split('.');
          for (let i = 1; i < parcalar.length; i++) dallar.add(parcalar.slice(0, i).join('.'));
        }
        onbellek.set(anahtar, { yapraklar, dallar });
      }
    }
    return onbellek.get(anahtar) ?? null;
  };
  const varMi = (dil: string, adAlani: string, anahtar: string) => {
    const kayit = oku(dil, adAlani);
    if (!kayit) return false;
    return (
      kayit.dallar.has(anahtar) ||
      ARTIL_SONEKLERI.some((sonek) => kayit.yapraklar.has(anahtar + sonek))
    );
  };
  const adAlanlari = [
    ...new Set(
      diller.flatMap((dil) =>
        fs.readdirSync(path.join(kok, dil)).map((dosya) => dosya.replace(/\.json$/, ''))
      )
    ),
  ];
  const eksikler: string[] = [];
  for (const dosya of dosyalar)
    for (const kullanim of anahtarKullanimlari(dosya))
      for (const dil of diller) {
        const bulundu = kullanim.adAlani
          ? varMi(dil, kullanim.adAlani, kullanim.anahtar)
          : adAlanlari.some((ad) => varMi(dil, ad, kullanim.anahtar));
        if (!bulundu)
          eksikler.push(
            `${kullanim.dosya}:${kullanim.satir}  ${dil}/${kullanim.adAlani ?? '?'}: ${kullanim.anahtar} yok`
          );
      }
  return eksikler;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const dosyalar = process.argv.slice(2);
  const bulunan = dosyalar.flatMap(duzMetinler);
  for (const b of bulunan) console.log(`${b.dosya}:${b.satir}  ${b.metin}`);
  console.log(`${bulunan.length} düz metin`);
  const eksikler = eksikAnahtarlar(dosyalar);
  for (const e of eksikler) console.log(e);
  console.log(`${eksikler.length} eksik anahtar`);
}
