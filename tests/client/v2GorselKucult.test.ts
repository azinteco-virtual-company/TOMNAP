import { describe, expect, it } from 'vitest';
import { KUCULTME, base64, hedefBoyut } from '../../src/components/v2/gorselKucult';

describe('v2 screenshot downscaling (A9b)', () => {
  it('scales the long edge down to the limit and never enlarges', () => {
    expect(hedefBoyut(3000, 1500, 1600)).toEqual({ genislik: 1600, yukseklik: 800 });
    expect(hedefBoyut(1170, 2532, 1600)).toEqual({ genislik: 739, yukseklik: 1600 });
    expect(hedefBoyut(800, 600, 1600)).toEqual({ genislik: 800, yukseklik: 600 });
  });

  it('stays well under the 4.5 MB request limit with three images', () => {
    const base64Size = (bytes: number) => Math.ceil(bytes / 3) * 4;
    expect(KUCULTME.adet * base64Size(KUCULTME.hedefBayt)).toBeLessThan(3_300_000);
    // The server refuses anything above 1 MB per image, so the target leaves room.
    expect(KUCULTME.hedefBayt).toBeLessThan(1_000_000);
  });

  it('encodes bytes as standard base64, also above the chunk size', () => {
    expect(base64(new Uint8Array([0xff, 0xd8, 0xff]))).toBe('/9j/');
    const big = new Uint8Array(100_000).map((_, i) => i % 256);
    expect(base64(big)).toBe(Buffer.from(big).toString('base64'));
  });
});
