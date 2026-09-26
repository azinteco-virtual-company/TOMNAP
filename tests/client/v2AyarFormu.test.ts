import { describe, expect, it } from 'vitest';
import { ayarDegisiklikleri, ayarFormu } from '../../src/components/v2/ayarFormu';

// Codex R3 F11: the settings form turned any text in the kg price into NaN, which JSON
// sends as null, so a typo silently cleared the stored price. Empty clears; invalid is
// an error and nothing is sent.
const ayarlar = { aylikBeyanSinirUsd: 300, varsayilanKgFiyatiAzn: 12, primOraniVarsayilan: 0.05 };
const form = (edits: Partial<ReturnType<typeof ayarFormu>>) => ({
  ...ayarFormu(ayarlar),
  ...edits,
});

describe('v2 settings form (Codex R3 F11)', () => {
  it('an invalid kg price is an error, never a cleared price', () => {
    for (const kg of ['abc', '12a', '-3', '1e3', '12.345', '.'])
      expect([kg, ayarDegisiklikleri(ayarlar, form({ kg })).hata]).toEqual([
        kg,
        expect.stringMatching(/kq qiyməti/i),
      ]);
  });

  it('an empty kg price clears it; a valid one is sent with a comma or a dot', () => {
    expect(ayarDegisiklikleri(ayarlar, form({ kg: '  ' }))).toEqual({
      degisiklik: { varsayilan_kg_fiyati_azn: null },
    });
    expect(ayarDegisiklikleri(ayarlar, form({ kg: '12,5' }))).toEqual({
      degisiklik: { varsayilan_kg_fiyati_azn: 12.5 },
    });
    const bos = { ...ayarlar, varsayilanKgFiyatiAzn: null };
    expect(ayarDegisiklikleri(bos, { ...ayarFormu(bos), kg: '' })).toEqual({ degisiklik: {} });
  });

  it('checks the declaration limit and the prim rate the same way', () => {
    expect(ayarDegisiklikleri(ayarlar, form({ beyan: '' })).hata).toMatch(/bəyan/i);
    expect(ayarDegisiklikleri(ayarlar, form({ beyan: 'üç yüz' })).hata).toMatch(/bəyan/i);
    expect(ayarDegisiklikleri(ayarlar, form({ prim: 'x' })).hata).toMatch(/prim/i);
    expect(ayarDegisiklikleri(ayarlar, form({ beyan: '450', prim: '7,5' }))).toEqual({
      degisiklik: { aylik_beyan_sinir_usd: 450, prim_orani_varsayilan: 0.075 },
    });
    expect(ayarDegisiklikleri(ayarlar, form({}))).toEqual({ degisiklik: {} });
  });

  it('never sends the prim rate for a user who does not see it', () => {
    const admin = { aylikBeyanSinirUsd: 300, varsayilanKgFiyatiAzn: null };
    expect(ayarDegisiklikleri(admin, { ...ayarFormu(admin), prim: '9' })).toEqual({
      degisiklik: {},
    });
  });
});
