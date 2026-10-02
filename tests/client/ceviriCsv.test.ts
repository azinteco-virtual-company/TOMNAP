import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ceviriCsv } from '../../scripts/ceviriCsv';
import dilListesi from '../../src/i18n/diller.json';

// The review table (docs/i18n.md) is generated from the language files: a stale table fails.
describe('translation review table', () => {
  const csv = fs.readFileSync('docs/i18n/ceviri-inceleme.csv', 'utf8').replace(/^﻿/, '');

  it('is up to date with the language files (run: npm run i18n:csv)', () => {
    expect(csv).toBe(ceviriCsv());
  });
  it('has a column per supported language, in list order', () => {
    expect(csv.split('\n')[0]).toBe(['anahtar', ...dilListesi.desteklenen].join(','));
  });
});
