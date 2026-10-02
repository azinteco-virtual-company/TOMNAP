// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiSession } from '../../src/lib/apiClient';
import { useAppStore } from '../../src/store/appStore';
import SiparisListesi from '../../src/components/v2/SiparisListesi';
import { render } from '../helpers/dom';
import { dilHazirla } from '../helpers/i18n';

// Codex R5 A06: the v2 list shows translated stage names; the raw code stays in the data.
const siparis = (lojistikDurumu: string) => ({
  id: 'order-1',
  musteriAdi: 'Aytən',
  sahipKullaniciId: 'u-1',
  toplamTutar: 5,
  lojistikDurumu,
  olusturmaTarihi: '2026-09-30T08:56:35.000Z',
  satirlar: [],
});

beforeEach(() => {
  setApiSession('csrf', 'tenant-1');
  useAppStore.setState({ aktifRol: 'PATRON' });
});
afterEach(async () => {
  document.body.replaceChildren();
  useAppStore.setState({ aktifRol: null });
  vi.unstubAllGlobals();
  await dilHazirla('az', ['v2']);
});

describe('v2 order list stage names', () => {
  it.each([
    ['az', 'KANADA_DEPO', 'Kanada anbarında'],
    ['en', 'KANADA_DEPO', 'In the Canada warehouse'],
    ['en', 'ULUSLARARASI_KARGO', 'In international cargo'],
    ['en', 'TESLIM_EDILDI', 'Delivered'],
  ])('%s: %s reads %s', async (dil, kod, ad) => {
    await dilHazirla(dil, ['v2']);
    const { container } = await render(
      React.createElement(SiparisListesi, {
        siparisler: [siparis(kod)],
        sahipAdi: () => 'Owner',
        onDegisti: async () => undefined,
      })
    );
    const hucre = container.querySelector('tbody tr td:nth-child(5) span');
    expect(hucre?.textContent).toBe(ad);
    expect(container.textContent).not.toContain(kod);
  });
});
