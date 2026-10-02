// @vitest-environment jsdom
import fs from 'node:fs';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import SatirTablosu from '../../src/components/v2/SatirTablosu';
import { htmlDiliniAyarla } from '../../src/i18n';
import { bosSatir } from '../../src/components/v2/siparisFormu';
import { render } from '../helpers/dom';
import { dilHazirla } from '../helpers/i18n';

// Codex R5 A05: v2 screens use Tailwind's logical classes (docs/i18n.md rule 4), so a
// right-to-left language mirrors them without a code change.
const FIZIKSEL =
  /(^|[\s"'`:])(text-left|text-right|-?(?:pl|pr|ml|mr|left|right)-(?:\d|\[)|border-[lr]\b|rounded-[lr]-)/;

beforeEach(async () => {
  await dilHazirla('az', ['v2']);
});
afterEach(() => {
  document.body.replaceChildren();
  htmlDiliniAyarla('az');
});

describe('v2 right-to-left', () => {
  it('the order lines table renders with logical classes under <html dir="rtl">', async () => {
    htmlDiliniAyarla('ar');
    expect(document.documentElement.dir).toBe('rtl');
    const { container } = await render(
      React.createElement(SatirTablosu, { satirlar: [bosSatir()], onChange: () => undefined })
    );
    const table = container.querySelector('table');
    expect(table?.className).toContain('text-start');
    expect(container.querySelectorAll('tbody td.pe-2').length).toBeGreaterThanOrEqual(6);
    const siniflar = [...container.querySelectorAll('[class]')].map((e) => e.getAttribute('class'));
    expect(siniflar.filter((c) => c && FIZIKSEL.test(c))).toEqual([]);
  });

  it('no v2 source uses a physical left/right class', () => {
    const bulunan: string[] = [];
    for (const dosya of fs.readdirSync('src/components/v2').filter((d) => /\.tsx$/.test(d))) {
      fs.readFileSync(`src/components/v2/${dosya}`, 'utf8')
        .split('\n')
        .forEach((satir, i) => {
          if (FIZIKSEL.test(satir)) bulunan.push(`${dosya}:${i + 1}`);
        });
    }
    expect(bulunan).toEqual([]);
  });
});
