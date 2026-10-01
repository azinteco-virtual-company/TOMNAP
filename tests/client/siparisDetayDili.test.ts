// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiSession } from '../../src/lib/apiClient';
import { useAppStore } from '../../src/store/appStore';
import { SiparisDetayModal } from '../../src/components/SiparisDetayModal';
import type { Siparis } from '../../src/types';
import { buttonByText, render, stubApi, waitFor } from '../helpers/dom';
import { dilHazirla } from '../helpers/i18n';

// B2 (Deploy 3): the v1 order detail mixed Turkish, Azerbaijani and English. It is now on
// translation keys; the customer's WhatsApp template uses the boutique's document language,
// not the interface language.
const siparis: Siparis = {
  id: 'order-1',
  olusturma_tarihi: '2026-09-30T08:56:35.000Z',
  ham_mesaj: 'DENEME',
  musteri_adi: 'DENEME Uçdan uca',
  urun_aciklamasi: 'DENEME çanta',
  adet: 1,
  toplam_tutar: 5,
  alinan_tutar: 2,
  kalan_tutar: 3,
  para_birimi: 'AZN',
  finans_durumu: 'KISMI_ODEME',
  lojistik_durumu: 'BAKU_DAGITIM_ARKADAS',
  eksik_bilgiler: [],
  siparis_kaynagi: 'INSTAGRAM_DM',
};
const modal = () =>
  React.createElement(SiparisDetayModal, {
    siparis,
    onKapat: () => undefined,
    onGuncelle: async () => true,
    onAtamaKaydedildi: () => undefined,
    onSiparisYenile: async () => undefined,
  });
const sablon = (container: HTMLElement) =>
  (container.querySelector('input[readonly]') as HTMLInputElement | null)?.value ?? '';

beforeEach(() => {
  setApiSession('csrf', 'tenant-1');
  stubApi({ 'GET /api/kuryeler': () => ({ basarili: true, kuryeler: [] }) });
  useAppStore.setState({ aktifRol: 'PATRON', seciliFirmaId: 'tenant-1' });
});
afterEach(() => {
  document.body.replaceChildren();
  useAppStore.setState({ butikDili: null, aktifRol: null });
  vi.unstubAllGlobals();
});

describe('order detail language (B2)', () => {
  it('reads entirely in Azerbaijani, with translated statuses and one money format', async () => {
    useAppStore.setState({ butikDili: 'az' });
    await dilHazirla('az', ['siparis', 'belge']);
    const { container } = await render(modal());
    const metin = await waitFor(() => container.textContent);
    expect(metin).toContain('Sifariş təfərrüatı: DENEME Uçdan uca');
    expect(metin).toContain('Yaradılıb: 30.09.2026 12:56 • Kanal: INSTAGRAM_DM');
    expect(metin).toContain('Qismən ödənilib');
    expect(metin).toContain('Bakıda paylanmada');
    expect(metin).toContain('Qalıq borc: 3.00 AZN');
    expect(buttonByText(container, 'Yadda saxla')).toBeTruthy();
    // The Turkish and English leftovers of the old screen are gone.
    for (const eski of ['Sipariş Detayı', 'Oluşturulma', 'Kalan Borç', 'Save Details', 'Close'])
      expect([eski, metin.includes(eski)]).toEqual([eski, false]);
  });

  it('reads in English for an English interface', async () => {
    useAppStore.setState({ butikDili: 'az' });
    await dilHazirla('en', ['siparis', 'belge']);
    const { container } = await render(modal());
    const metin = await waitFor(() => container.textContent);
    expect(metin).toContain('Order details: DENEME Uçdan uca');
    expect(metin).toContain('Partly paid');
    expect(metin).toContain('Out for delivery in Baku');
    expect(buttonByText(container, 'Save')).toBeTruthy();
  });

  it('writes the customer message in the boutique language, whatever the interface', async () => {
    useAppStore.setState({ butikDili: 'az' });
    await dilHazirla('en', ['siparis', 'belge']);
    const ingilizceArayuz = await render(modal());
    expect(await waitFor(() => sablon(ingilizceArayuz.container))).toMatch(
      /^Salam hörmətli DENEME Uçdan uca, .* Qalan borcunuz: 3\.00 AZN\./
    );
    await ingilizceArayuz.unmount();

    useAppStore.setState({ butikDili: 'en' });
    await dilHazirla('az', ['siparis', 'belge']);
    const azArayuz = await render(modal());
    expect(await waitFor(() => sablon(azArayuz.container))).toMatch(
      /^Hello DENEME Uçdan uca, .* Balance due: 3\.00 AZN\./
    );
  });
});
