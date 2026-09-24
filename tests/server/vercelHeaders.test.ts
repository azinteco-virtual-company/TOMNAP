import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface HeaderRule {
  source: string;
  headers: Array<{ key: string; value: string }>;
}
interface VercelConfig {
  rewrites: Array<{ source: string; destination: string }>;
  headers?: HeaderRule[];
}

const config = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../vercel.json'), 'utf8')
) as VercelConfig;
const STATIC_SOURCE = '/((?!api/|uploads/).*)';

describe('Vercel static security headers', () => {
  const rule = config.headers?.find((item) => item.source === STATIC_SOURCE);

  it('covers exactly the paths the SPA rewrite serves, not the API or uploads', () => {
    expect(config.rewrites.map((item) => item.source)).toContain(STATIC_SOURCE);
    expect(rule).toBeDefined();
    // Vercel sources are path-to-regexp patterns; this one is also a plain regex.
    const pattern = new RegExp(`^${STATIC_SOURCE}$`);
    for (const url of ['/', '/index.html', '/assets/index-abc.js', '/siparisler'])
      expect(pattern.test(url)).toBe(true);
    for (const url of ['/api/health', '/api/kargo/manifesto-yukle', '/uploads/a.png'])
      expect(pattern.test(url)).toBe(false);
  });

  it('sends the four static headers with the requested values', () => {
    expect(Object.fromEntries(rule?.headers.map((item) => [item.key, item.value]) ?? [])).toEqual({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
  });

  it('leaves HSTS to Vercel instead of repeating it', () => {
    const keys = (config.headers ?? []).flatMap((item) => item.headers.map((header) => header.key));
    expect(keys.map((key) => key.toLowerCase())).not.toContain('strict-transport-security');
  });
});
