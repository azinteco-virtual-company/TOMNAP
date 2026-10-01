// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiSession } from '../../src/lib/apiClient';
import { useAppStore } from '../../src/store/appStore';
import V2Kasa from '../../src/components/v2/V2Kasa';
import KuryeBakiyeleri from '../../src/components/v2/KuryeBakiyeleri';
import { buttonByText, click, render, stubApi, waitFor } from '../helpers/dom';

// Deploy 3 findings on the v2 cash desk (B5, B6).
const rauf = (bakiye: number, acik: boolean) => ({
  kuryeKullaniciId: 'kurye-1',
  adSoyad: 'Rauf Demo Kurye',
  tahsilatToplami: 2,
  teslimToplami: 2 - bakiye,
  bakiye,
  acikTahsilatlar: acik
    ? [
        {
          id: 'pay-1',
          siparisId: 'order-1',
          tutarAzn: 2,
          almaZamani: '2026-10-01T04:51:24.000Z',
          musteriAdi: 'DENEME Uçdan uca',
        },
      ]
    : [],
});

beforeEach(() => setApiSession('csrf-kasa', 'tenant-1'));
afterEach(() => {
  document.body.replaceChildren();
  useAppStore.setState({ aktifRol: null });
  vi.unstubAllGlobals();
});

describe('v2 cash desk order table (B5)', () => {
  it('keeps the amount due and the status in separate, spaced columns', async () => {
    useAppStore.setState({ aktifRol: 'BAKU_FINANS' });
    stubApi({
      'GET /api/v2/siparisler': () => ({
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
      }),
      'GET /api/v2/kasa/kurye-bakiyeleri': () => ({ basarili: true, kuryeler: [] }),
    });
    const { container } = await render(React.createElement(V2Kasa));
    const table = await waitFor(() => container.querySelector('table'));
    const headers = Array.from(table.querySelectorAll('thead th'));
    const cells = Array.from(table.querySelectorAll('tbody tr:first-child td'));
    const qalig = headers.findIndex((th) => th.textContent === 'Qalıq');
    expect(headers[qalig + 1]?.textContent).toBe('Vəziyyət');
    // The status column starts with its own padding, header and cells alike.
    for (const cell of [headers[qalig + 1], cells[qalig + 1]])
      expect(cell?.className.split(/\s+/)).toContain('ps-6');
    expect(cells[qalig + 1]?.textContent).toBe('Qismən');
  });
});

describe('Hand-over panel after the cash desk takes the cash (B6)', () => {
  it('closes the courier panel and keeps the confirmation', async () => {
    const { calls } = stubApi({
      'GET /api/v2/kasa/kurye-bakiyeleri': [
        () => ({ basarili: true, kuryeler: [rauf(2, true)] }),
        () => ({ basarili: true, kuryeler: [rauf(0, false)] }),
      ],
      'POST /api/v2/kasa/teslimler': () => ({
        status: 201,
        body: { basarili: true, teslim: { id: 'teslim-1', tutarAzn: 2 } },
      }),
    });
    const { container } = await render(
      React.createElement(KuryeBakiyeleri, { teslimAlabilir: true })
    );
    await click(await waitFor(() => buttonByText(container, 'Təhvil al')));
    await click(buttonByText(container, '2.00 AZN kassaya təhvil al'));
    await waitFor(() => container.textContent?.includes('2.00 AZN kassaya təhvil alındı.'));

    expect(calls.filter((c) => c.key === 'POST /api/v2/kasa/teslimler')).toHaveLength(1);
    expect(container.textContent).not.toContain('açıq ödənişlər');
    expect(buttonByText(container, /kassaya təhvil al$/)).toBeUndefined();
    expect(container.querySelector('tbody')?.textContent).toContain('0.00 AZN');
  });
});
