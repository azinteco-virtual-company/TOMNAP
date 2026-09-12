import { describe, it, expect, beforeEach } from 'vitest';
import { getPrioritizedModels, modelCooldownMap } from '../../../src/server/services/gemini';

describe('Gemini Servisi & Model Önceliklendirme', () => {
  beforeEach(() => {
    modelCooldownMap.clear();
  });

  it('cooldown yokken varsayılan modelleri hazır sırayla dönmeli', () => {
    const modeller = getPrioritizedModels();
    expect(modeller).toContain('gemini-2.5-flash');
    expect(modeller).toContain('gemini-3.1-flash-lite');
    expect(modeller).toContain('gemini-3.8-flash');
  });

  it('cooldown\'a giren modeli listenin sonuna ertelemeli', () => {
    // gemini-2.5-flash modeline 10 saniyelik cooldown ekle
    modelCooldownMap.set('gemini-2.5-flash', Date.now() + 10000);

    const modeller = getPrioritizedModels();
    // İlk model artık gemini-2.5-flash olmamalı
    expect(modeller[0]).not.toBe('gemini-2.5-flash');
    // Cooldown'daki model listenin sonunda yer almalı
    expect(modeller[modeller.length - 1]).toBe('gemini-2.5-flash');
  });

  it('süresi dolmuş cooldown kayıtlarını temizleyip modeli tekrar öne almalı', () => {
    // Geçmiş bir zaman ata (süresi dolmuş)
    modelCooldownMap.set('gemini-2.5-flash', Date.now() - 1000);

    const modeller = getPrioritizedModels();
    expect(modeller[0]).toBe('gemini-2.5-flash');
  });
});
