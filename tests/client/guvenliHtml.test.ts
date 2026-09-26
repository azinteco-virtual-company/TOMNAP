import { describe, expect, it } from 'vitest';
import { GuvenliHtml, html, htmlKacis } from '../../src/utils/guvenliHtml';

// Codex R4 F20: every dynamic print field goes through one escaper.
describe('html print templates (Codex R4 F20)', () => {
  it('escapes every interpolated value as text, in content and in quoted attributes', () => {
    const ad = `<img src=x onerror="alert(1)">'&\``;
    expect(html`<td title="${ad}">${ad}</td>`.metin).toBe(
      '<td title="&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&amp;&#96;">' +
        '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&amp;&#96;</td>'
    );
    expect(htmlKacis('</script><script>x()</script>')).toBe(
      '&lt;/script&gt;&lt;script&gt;x()&lt;/script&gt;'
    );
  });

  it('keeps nested html parts and arrays of them as markup, never plain strings', () => {
    // prettier-ignore
    const satirlar = ['<b>A</b>', 'B'].map((ad) => html`<tr><td>${ad}</td></tr>`);
    // prettier-ignore
    const sayfa = html`<table>${satirlar}${false}${null}${undefined}${0}</table>`;
    expect(sayfa).toBeInstanceOf(GuvenliHtml);
    expect(sayfa.metin).toBe(
      '<table><tr><td>&lt;b&gt;A&lt;/b&gt;</td></tr><tr><td>B</td></tr>0</table>'
    );
    // A joined string loses its markup status and is escaped.
    expect(html`<div>${satirlar.join('')}</div>`.metin).toContain('&lt;tr&gt;');
  });
});
