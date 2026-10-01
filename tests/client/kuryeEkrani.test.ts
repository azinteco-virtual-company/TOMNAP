// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiSession } from '../../src/lib/apiClient';
import type { CourierTask } from '../../src/lib/courierApi';
import { buttonByText, click, render, stubApi, typeInto, waitFor } from '../helpers/dom';

// Deploy 3 findings on the courier screen (B3, B4).
const task = (extra: Partial<CourierTask> = {}): CourierTask => ({
  id: 'order-1',
  musteri_adi: 'DENEME Uçdan uca',
  urun_aciklamasi: 'DENEME çanta',
  adet: 1,
  lojistik_durumu: 'BAKU_DAGITIM_ARKADAS',
  kalan_tutar: 5,
  para_birimi: 'AZN',
  kurye_atama_surumu: 1,
  ...extra,
});
const gorevler = (list: CourierTask[]) => () => ({
  basarili: true,
  kurye: { id: 'courier-1', ad_soyad: 'Rauf Demo Kurye', bolge: 'Bakı' },
  gorevler: list,
});
const kart = (container: HTMLElement, musteri: string) =>
  Array.from(container.querySelectorAll('article')).find((a) =>
    a.querySelector('h3')?.textContent?.includes(musteri)
  );

async function kuryeEkrani() {
  // The cash section is a v2 chunk: the flag is read when the module loads.
  vi.stubEnv('VITE_FF_V2_FLOW', 'true');
  vi.resetModules();
  const { KuryeCalismaAlani } = await import('../../src/components/KuryeCalismaAlani');
  return KuryeCalismaAlani;
}

beforeEach(() => setApiSession('csrf-courier', 'tenant-1'));
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Courier screen after recording cash (B3)', () => {
  it('shows the new amount due on the order card at once', async () => {
    const { calls } = stubApi({
      'GET /api/kurye/gorevler': gorevler([task()]),
      'GET /api/v2/kurye/nakit': [
        () => ({
          basarili: true,
          bakiye: 0,
          acikTahsilatlar: [],
          siparisler: [
            {
              id: 'order-1',
              musteriAdi: 'DENEME Uçdan uca',
              lojistikDurumu: 'BAKU_DAGITIM_ARKADAS',
              toplamTutar: 5,
              kalanTutar: 5,
            },
          ],
        }),
        () => ({
          basarili: true,
          bakiye: 2,
          acikTahsilatlar: [],
          siparisler: [
            {
              id: 'order-1',
              musteriAdi: 'DENEME Uçdan uca',
              lojistikDurumu: 'BAKU_DAGITIM_ARKADAS',
              toplamTutar: 5,
              kalanTutar: 3,
            },
          ],
        }),
      ],
      'POST /api/v2/kurye/tahsilat': () => ({
        status: 201,
        body: {
          basarili: true,
          tekrar: false,
          odeme: { id: 'pay-1', siparisId: 'order-1', tutarAzn: 2 },
          ozet: {
            siparisId: 'order-1',
            toplamTutar: 5,
            odenenTutar: 2,
            kalanTutar: 3,
            durum: 'KISMI_ODEME',
          },
        },
      }),
    });
    const Ekran = await kuryeEkrani();
    const { container } = await render(
      React.createElement(Ekran, { userName: 'Rauf', onLogout: () => undefined })
    );
    expect(kart(container, 'DENEME')?.textContent).toContain('5.00 AZN');

    const tutar = await waitFor(() =>
      container.querySelector('input[aria-label="DENEME Uçdan uca üçün alınan nağd"]')
    );
    await typeInto(tutar, '2');
    await click(buttonByText(container, 'Nağd aldım'));
    await waitFor(() => container.textContent?.includes('2.00 AZN nağd yazıldı.'));

    expect(calls.filter((c) => c.key === 'POST /api/v2/kurye/tahsilat')).toHaveLength(1);
    expect(container.textContent).toContain('2.00 AZN nağd yazıldı.');
    expect(kart(container, 'DENEME')?.textContent).toContain('Qalıq məbləğ: 3.00 AZN');
    // The task list was not reloaded from scratch: the cash notice stays visible.
    expect(calls.filter((c) => c.key === 'GET /api/kurye/gorevler')).toHaveLength(1);
  });
});

describe('Courier task filter (B4)', () => {
  it('counts delivered tasks as well as pending ones', async () => {
    stubApi({
      'GET /api/kurye/gorevler': gorevler([
        task(),
        task({ id: 'order-2', musteri_adi: 'Teslim', lojistik_durumu: 'TESLIM_EDILDI' }),
        task({ id: 'order-3', musteri_adi: 'Teslim 2', lojistik_durumu: 'TESLIM_EDILDI' }),
      ]),
      'GET /api/v2/kurye/nakit': () => ({
        basarili: true,
        bakiye: 0,
        acikTahsilatlar: [],
        siparisler: [],
      }),
    });
    const Ekran = await kuryeEkrani();
    const { container } = await render(
      React.createElement(Ekran, { userName: 'Rauf', onLogout: () => undefined })
    );
    const filtre = container.querySelector('[aria-label="Tapşırıq filtri"]');
    expect(buttonByText(filtre!, 'Gözləyən (1)')).toBeTruthy();
    expect(buttonByText(filtre!, 'Təhvil verilən (2)')).toBeTruthy();
  });
});
