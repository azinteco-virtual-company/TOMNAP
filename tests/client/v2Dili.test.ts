// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiSession } from '../../src/lib/apiClient';
import { useAppStore } from '../../src/store/appStore';
import V2Kasa from '../../src/components/v2/V2Kasa';
import { bosForm, formdanIstek } from '../../src/components/v2/siparisFormu';
import { render, stubApi, waitFor } from '../helpers/dom';
import { dilHazirla } from '../helpers/i18n';

// PR-C: the v2 screens read their texts from the translation files, so the same screen
// follows the interface language (docs/i18n.md). Amounts and dates keep their fixed look.
const siparisler = () => ({
  basarili: true,
  siparisler: [
    {
      id: 'order-1',
      musteriAdi: 'DENEME Uçdan uca',
      toplamTutar: 5,
      alinanTutar: 2,
      kalanTutar: 3,
      finansDurumu: 'KISMI_ODEME',
      olusturmaTarihi: '2026-09-30T08:56:35.000Z',
    },
  ],
});

beforeEach(() => {
  setApiSession('csrf-kasa', 'tenant-1');
  useAppStore.setState({ aktifRol: 'BAKU_FINANS' });
});
afterEach(async () => {
  document.body.replaceChildren();
  useAppStore.setState({ aktifRol: null });
  vi.unstubAllGlobals();
  await dilHazirla('az', ['v2']);
});

describe('v2 screens follow the interface language', () => {
  it.each([
    ['az', 'Kassa (v2)', ['Tarix', 'Müştəri', 'Cəm', 'Ödənib', 'Qalıq', 'Vəziyyət'], 'Qismən'],
    ['en', 'Cash desk (v2)', ['Date', 'Customer', 'Total', 'Paid', 'Balance', 'Status'], 'Partial'],
  ])('%s: the cash desk title, columns and status', async (dil, baslik, sutunlar, durum) => {
    await dilHazirla(dil, ['v2']);
    stubApi({
      'GET /api/v2/siparisler': siparisler,
      'GET /api/v2/kasa/kurye-bakiyeleri': () => ({ basarili: true, kuryeler: [] }),
    });
    const { container } = await render(React.createElement(V2Kasa));
    const table = await waitFor(() => container.querySelector('table'));
    expect(container.querySelector('h2')?.textContent).toBe(baslik);
    expect(Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual(
      sutunlar
    );
    const cells = Array.from(table.querySelectorAll('tbody tr:first-child td')).map(
      (td) => td.textContent
    );
    expect(cells).toEqual([
      '30.09.2026',
      'DENEME Uçdan uca',
      '5.00 AZN',
      '2.00 AZN',
      '3.00 AZN',
      durum,
    ]);
  });

  it('form problems from the plain helpers follow the language too', async () => {
    await dilHazirla('en', ['v2']);
    const en = formdanIstek(bosForm()).hatalar;
    await dilHazirla('az', ['v2']);
    const az = formdanIstek(bosForm()).hatalar;
    expect(en.length).toBeGreaterThan(0);
    expect(en).toHaveLength(az.length);
    expect(en).not.toEqual(az);
  });
});
