// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n, {
  dilDurumunuGuncelle,
  elleDilSec,
  elleSecimiSifirla,
  seciliDil,
} from '../../src/i18n';
import { dilHazirla } from '../helpers/i18n';

// Codex R5 A02: the manual choice is held in memory; localStorage only persists it. A
// storage that refuses writes (private mode, quota) must not lose it at login.
const bozukDepo = () =>
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {
      throw new Error('SecurityError');
    },
  });

beforeEach(async () => {
  elleSecimiSifirla();
  dilDurumunuGuncelle(false, null);
  await dilHazirla('en');
});
afterEach(() => {
  vi.unstubAllGlobals();
  elleSecimiSifirla();
  dilDurumunuGuncelle(false, null);
});

describe('manual language choice with a failing storage', () => {
  it('manual az survives login into an English boutique, and logout', async () => {
    bozukDepo();
    await i18n.loadLanguages('az');
    expect(seciliDil()).toBe('en'); // the jsdom device is English
    elleDilSec('az');
    expect(seciliDil()).toBe('az');
    dilDurumunuGuncelle(true, 'en');
    expect(seciliDil()).toBe('az');
    await vi.waitFor(() => expect(i18n.language).toBe('az'));
    dilDurumunuGuncelle(false, null);
    expect(seciliDil()).toBe('az');
  });

  it('a later choice replaces the earlier one', () => {
    bozukDepo();
    elleDilSec('az');
    elleDilSec('en');
    dilDurumunuGuncelle(true, 'az');
    expect(seciliDil()).toBe('en');
  });

  it('with a working storage the choice is also persisted', () => {
    elleDilSec('az');
    expect(localStorage.getItem('tomnap_dil')).toBe('az');
  });

  it('an unsupported language is ignored', () => {
    bozukDepo();
    elleDilSec('tr');
    dilDurumunuGuncelle(true, 'az');
    expect(seciliDil()).toBe('az'); // the boutique default: no manual choice was recorded
  });
});
