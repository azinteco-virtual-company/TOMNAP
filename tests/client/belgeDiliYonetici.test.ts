// @vitest-environment jsdom
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiSession } from '../../src/lib/apiClient';
import { belgeDili, belgeT } from '../../src/i18n';
import { useBelgeCevirisi, useBelgeDili } from '../../src/i18n/belge';
import { DilYoneticisi } from '../../src/i18n/DilYoneticisi';
import { useAppStore } from '../../src/store/appStore';
import type { FirmaTenant } from '../../src/types';
import { render, waitFor } from '../helpers/dom';
import { dilHazirla } from '../helpers/i18n';

// Codex R5 A01: the administrator's `all` session has no boutique of its own, so the
// document language comes from the SELECTED boutique's metadata and follows every switch.
const firma = (id: string, butikDili: string): FirmaTenant => ({
  id,
  ad: id,
  sehir: 'Bakı',
  varsayilanParaBirimi: 'AZN',
  varsayilanKomisyonYuzdesi: 15,
  aciklama: '',
  butikDili,
});
const firmalar = [firma('butik-a', 'en'), firma('butik-b', 'az')];
const yanit = (liste: unknown) =>
  new Response(JSON.stringify({ basarili: true, firmalar: liste, siparis_sayilari: {} }), {
    headers: { 'Content-Type': 'application/json' },
  });

function Sonda() {
  const bt = useBelgeCevirisi();
  return React.createElement('p', { 'data-dil': useBelgeDili() }, bt('ortak.varsayilanSehir'));
}

beforeEach(async () => {
  setApiSession('csrf', 'all');
  await dilHazirla('az', ['belge']);
  useAppStore.setState({
    session: {
      id: 'u',
      adSoyad: 'U',
      email: 'u@example.invalid',
      rol: 'SUPER_ADMIN',
      tenantId: 'all',
    },
    sessionStatus: 'authenticated',
    aktifRol: 'SUPER_ADMIN',
    seciliFirmaId: 'all',
    butikDili: 'az',
    firmalar: [],
  });
});
afterEach(() => {
  document.body.replaceChildren();
  useAppStore.getState().clearSession();
  vi.unstubAllGlobals();
});

describe('administrator documents follow the selected boutique', () => {
  it('A (en) → B (az): the document language and strings switch with the selection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => yanit(firmalar))
    );
    const { container } = await render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(DilYoneticisi),
        React.createElement(Sonda)
      )
    );
    const dil = () => container.querySelector('p')?.getAttribute('data-dil');
    expect(dil()).toBe('az');

    await act(async () => useAppStore.getState().setFirmalar(firmalar));
    await act(async () => useAppStore.getState().setSeciliFirmaId('butik-a'));
    await act(async () => useAppStore.getState().setFirmalar(firmalar));
    // The English document strings load lazily: wait for them instead of a fixed delay.
    await waitFor(() => dil() === 'en' && container.textContent === 'Baku');
    expect([dil(), belgeDili(), container.textContent]).toEqual(['en', 'en', 'Baku']);
    expect(belgeT()('ortak.varsayilanSehir')).toBe('Baku');

    await act(async () => useAppStore.getState().setSeciliFirmaId('butik-b'));
    await act(async () => useAppStore.getState().setFirmalar(firmalar));
    await waitFor(() => dil() === 'az' && container.textContent === 'Bakı');
    expect([dil(), belgeDili(), container.textContent]).toEqual(['az', 'az', 'Bakı']);
    expect(belgeT()('ortak.varsayilanSehir')).toBe('Bakı');
  });

  it('a late company list for the old selection never overrides the new one', async () => {
    let gec!: (cevap: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((coz) => (gec = coz)))
    );
    useAppStore.getState().setFirmalar(firmalar);
    useAppStore.getState().setSeciliFirmaId('butik-a');
    useAppStore.getState().setFirmalar(firmalar);
    const eski = useAppStore.getState().firmalariYukle(); // issued while A is selected
    // The administrator moves on to B before A's answer arrives; A's list says B is `en`.
    useAppStore.getState().setFirmalar(firmalar);
    useAppStore.getState().setSeciliFirmaId('butik-b');
    useAppStore.getState().setFirmalar(firmalar);
    gec(yanit(firmalar.map((f) => ({ ...f, butikDili: 'en' }))));
    await eski;
    expect(useAppStore.getState().firmalar.map((f) => f.butikDili)).toEqual(['en', 'az']);
    expect(belgeDili()).toBe('az');
  });

  it('with no boutique selected (all) the session default applies', async () => {
    useAppStore.getState().setFirmalar(firmalar);
    await render(React.createElement(DilYoneticisi));
    expect(belgeDili()).toBe('az');
  });

  it('a boutique session keeps its own boutique language', async () => {
    useAppStore.setState({
      session: {
        id: 'p',
        adSoyad: 'P',
        email: 'p@example.invalid',
        rol: 'PATRON',
        tenantId: 'butik-a',
      },
      seciliFirmaId: 'butik-a',
      butikDili: 'en',
      firmalar: [{ ...firmalar[0], butikDili: 'az' }],
    });
    await render(React.createElement(DilYoneticisi));
    expect(belgeDili()).toBe('en');
  });
});
