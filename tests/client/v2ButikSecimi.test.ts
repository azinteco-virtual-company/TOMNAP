import { describe, expect, it } from 'vitest';
import { v2ButikSecimi } from '../../src/components/v2/butikSecimi';
import { v2MenuGorunur } from '../../src/lib/v2Menu';

// Deploy 2 finding 2: /v2 opened by address reloads the page, the v1 boutique choice was
// lost and v2 had no picker, so a platform admin stayed on "all boutiques" and every v2
// request answered "Bir butik seçilmelidir". v2 now offers the v1 list and mechanism.
describe('v2 boutique choice for the platform admin', () => {
  const firmalar = [
    { id: 'kanada_shopper_baku', ad: 'TOMNAP Demo Boutique' },
    { id: 'ayla_boutique', ad: 'Ayla' },
  ];

  it('asks the platform admin for a boutique until one of the list is chosen', () => {
    expect(v2ButikSecimi('SUPER_ADMIN', 'all', firmalar)).toEqual({
      secici: true,
      secimGerekli: true,
      secenekler: firmalar,
    });
    expect(v2ButikSecimi('SUPER_ADMIN', 'ayla_boutique', firmalar).secimGerekli).toBe(false);
    expect(v2ButikSecimi('SUPER_ADMIN', 'silinmis', firmalar).secimGerekli).toBe(true);
  });

  it('shows no picker to team members; their session boutique is fixed', () => {
    for (const rol of ['PATRON', 'SATIS_SORUMLUSU', 'KANADA_SATINALMA', 'BAKU_FINANS'])
      expect(v2ButikSecimi(rol, 'kanada_shopper_baku', firmalar)).toEqual({
        secici: false,
        secimGerekli: false,
        secenekler: [],
      });
  });
});

// A client-side link keeps the v1 choice (no reload); the same roles as the /v2 route.
describe('v2 link in the v1 menu', () => {
  it('appears only with the flag on and for the roles that open /v2', () => {
    expect(v2MenuGorunur('PATRON', true)).toBe(true);
    expect(v2MenuGorunur('SUPER_ADMIN', true)).toBe(true);
    expect(v2MenuGorunur('BAKU_FINANS', true)).toBe(true);
    expect(v2MenuGorunur('BAKU_KURYE', true)).toBe(false);
    expect(v2MenuGorunur('PATRON', false)).toBe(false);
    expect(v2MenuGorunur(null, true)).toBe(false);
  });
});
