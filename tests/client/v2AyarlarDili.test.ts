// @vitest-environment jsdom
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiSession } from '../../src/lib/apiClient';
import { DESTEKLENEN_DILLER } from '../../src/shared/diller';
import { useAppStore } from '../../src/store/appStore';
import V2Ayarlar from '../../src/components/v2/V2Ayarlar';
import { render, settle, stubApi, waitFor } from '../helpers/dom';
import { dilHazirla } from '../helpers/i18n';

// The boutique's default language (migration 20): only the owner changes it in the v2
// settings; the owner's own interface and documents follow at once.
const ayarlar = (dil: string, prim = true) => ({
  basarili: true,
  ayarlar: {
    kayitli: true,
    aylikBeyanSinirUsd: 300,
    varsayilanKgFiyatiAzn: null,
    ...(prim ? { primOraniVarsayilan: 0.05 } : {}),
    varsayilanDil: dil,
  },
});
const oturum = (rol: 'PATRON' | 'SUPER_ADMIN', tenantId: string) =>
  useAppStore.setState({
    aktifRol: rol,
    seciliFirmaId: 'tenant-1',
    butikDili: 'az',
    session: { id: 'u', adSoyad: 'U', email: 'u@example.invalid', rol, tenantId },
  });

beforeEach(async () => {
  setApiSession('csrf', 'tenant-1');
  await dilHazirla('az', ['v2']);
});
afterEach(() => {
  document.body.replaceChildren();
  useAppStore.setState({ aktifRol: null, session: null, butikDili: null });
  vi.unstubAllGlobals();
});

describe('boutique language in the v2 settings', () => {
  it('the owner changes it; the interface language source follows at once', async () => {
    oturum('PATRON', 'tenant-1');
    const { calls } = stubApi({
      'GET /api/v2/ayarlar': () => ayarlar('az'),
      'PATCH /api/v2/ayarlar': () => ayarlar('en'),
    });
    const { container } = await render(React.createElement(V2Ayarlar));
    const secim = await waitFor(() => container.querySelector('select'));
    expect(secim.disabled).toBe(false);
    expect([...secim.options].map((o) => o.value)).toEqual([...DESTEKLENEN_DILLER]);
    await act(async () => {
      secim.value = 'en';
      secim.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
    expect(calls.filter((c) => c.key === 'PATCH /api/v2/ayarlar').map((c) => c.body)).toEqual([
      { varsayilan_dil: 'en' },
    ]);
    expect(useAppStore.getState().butikDili).toBe('en');
    expect(container.textContent).toContain('Butikin dili yadda saxlanıldı.');
  });

  it('the administrator sees it but cannot change it', async () => {
    oturum('SUPER_ADMIN', 'all');
    stubApi({ 'GET /api/v2/ayarlar': () => ayarlar('az', false) });
    const { container } = await render(React.createElement(V2Ayarlar));
    const secim = await waitFor(() => container.querySelector('select'));
    expect(secim.disabled).toBe(true);
    expect(container.textContent).toContain('Yalnız butik sahibi dəyişə bilər.');
  });
});
