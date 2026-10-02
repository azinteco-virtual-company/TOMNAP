// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiSession } from '../../src/lib/apiClient';
import i18n, { elleSecimiSifirla, htmlDiliniAyarla, seciliDil } from '../../src/i18n';
import { AccessGateModal } from '../../src/components/AccessGateModal';
import { buttonByText, click, render, stubApi, typeInto, waitFor } from '../helpers/dom';
import { dilHazirla } from '../helpers/i18n';

// Before login the language comes from the device (jsdom: en-US), then the manual choice;
// the login page has the selector. Server errors show the translation of their code.
const giris = () =>
  React.createElement(AccessGateModal, {
    acik: true,
    hedef: 'panel',
    onBasariliGiris: () => undefined,
    onKapat: () => undefined,
    onQeydiyyatAc: () => undefined,
  });

beforeEach(async () => {
  elleSecimiSifirla();
  localStorage.clear();
  setApiSession(null);
  await dilHazirla(seciliDil(), ['giris']);
});
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('login page language', () => {
  it('follows an English device before login', async () => {
    expect(navigator.languages[0]).toMatch(/^en/);
    expect(seciliDil()).toBe('en');
    const { container } = await render(giris());
    expect(container.querySelector('#login-title')?.textContent).toBe('TOMNAP Sign-in');
    expect(buttonByText(container, 'Sign in')).toBeTruthy();
    expect(document.documentElement.lang).toBe('en');
  });

  it('switches with the selector, remembers it on this device and sets <html lang>', async () => {
    const { container } = await render(giris());
    await click(container.querySelector('#btn-dil-secici'));
    await click(container.querySelector('button[lang="az"]'));
    await waitFor(() => buttonByText(container, 'Daxil ol'));
    expect(container.querySelector('#login-title')?.textContent).toBe('TOMNAP Giriş Paneli');
    expect(localStorage.getItem('tomnap_dil')).toBe('az');
    expect(document.documentElement.lang).toBe('az');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('shows the translated server error from its code', async () => {
    stubApi({
      'POST /api/auth/giris': () => ({
        status: 401,
        body: {
          basarili: false,
          hata: 'Daxil edilmiş şifrə yanlışdır.',
          kod: 'GIRIS_SIFRE_YANLIS',
        },
      }),
    });
    const { container } = await render(giris());
    await typeInto(container.querySelector('input[name="username"]'), 'x@example.invalid');
    await typeInto(container.querySelector('input[name="password"]'), 'wrong-password');
    await click(buttonByText(container, 'Sign in'));
    const uyari = await waitFor(() => container.querySelector('[role="alert"]'));
    expect(uyari.textContent).toBe('The password is incorrect.');
  });
});

describe('writing direction', () => {
  it('sets dir="rtl" for a right-to-left language and back', () => {
    htmlDiliniAyarla('ar');
    expect([document.documentElement.lang, document.documentElement.dir]).toEqual(['ar', 'rtl']);
    htmlDiliniAyarla('en');
    expect([document.documentElement.lang, document.documentElement.dir]).toEqual(['en', 'ltr']);
  });
  it('follows every language change of the interface', async () => {
    await i18n.changeLanguage('az');
    expect(document.documentElement.lang).toBe('az');
    await i18n.changeLanguage('en');
    expect(document.documentElement.lang).toBe('en');
  });
});
