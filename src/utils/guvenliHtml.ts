/**
 * Yazdırma şablonları için tek kaçışlama yolu (Codex R4 F20).
 *
 * `html` etiketli şablonu her ${değer}'i metin olarak kaçışlar: sipariş alanındaki
 * `<script>` ya da `<img onerror>` yazdırılan sayfada düz metin kalır. Başka bir `html`
 * parçası (ya da onların dizisi) olduğu gibi eklenir; böylece satırlar ve koşullu
 * bölümler iç içe kurulabilir. `false`, `null` ve `undefined` boş yazılır.
 * `safePrintHtml` yalnız bu tipi kabul eder: düz bir string yazdırılamaz.
 */
export class GuvenliHtml {
  constructor(readonly metin: string) {}
  toString(): string {
    return this.metin;
  }
}

const KACIS: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

/** Metni HTML içeriğinde ve tırnaklı öznitelik değerinde güvenli hale getirir. */
export function htmlKacis(deger: unknown): string {
  return String(deger).replace(/[&<>"'`]/g, (karakter) => KACIS[karakter]);
}

function parca(deger: unknown): string {
  if (deger instanceof GuvenliHtml) return deger.metin;
  if (Array.isArray(deger)) return deger.map(parca).join('');
  if (deger === null || deger === undefined || deger === false) return '';
  return htmlKacis(deger);
}

export function html(parcalar: TemplateStringsArray, ...degerler: unknown[]): GuvenliHtml {
  let metin = parcalar[0];
  for (let i = 0; i < degerler.length; i++) metin += parca(degerler[i]) + parcalar[i + 1];
  return new GuvenliHtml(metin);
}
