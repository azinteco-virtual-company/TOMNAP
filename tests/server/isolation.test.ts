import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  DATA_DIR,
  UPLOADS_DIR,
  FIRMALAR_DOSYA_YOLU,
  KULLANICILAR_DOSYA_YOLU,
  SUPABASE_URL,
  SUPABASE_KEY,
  GEMINI_API_KEY,
  RESEND_API_KEY,
} from '../../src/server/config';
import {
  IDENTITY_DOSYA_YOLU,
  firmalariKaydetDosyaya,
  kullanicilariKaydetDosyaya,
} from '../../src/server/services/state';
import { kargoMerkezi } from '../../src/server/services/kargo/kargoMerkezi';
import { supabase } from '../../src/server/services/supabase';

describe('Test environment isolation', () => {
  it('writes all persisted records and uploads to temporary directories', () => {
    const filenames = [
      'identity.json',
      'firmalar.json',
      'kullanicilar.json',
      'kargo_ayarlari.json',
    ];
    const readProjectFiles = () =>
      filenames.map((name) => {
        const filename = path.join(process.cwd(), 'data', name);
        return fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : null;
      });
    const before = readProjectFiles();
    expect(path.dirname(DATA_DIR)).toBe(path.dirname(UPLOADS_DIR));
    expect(fs.realpathSync(path.dirname(path.dirname(DATA_DIR)))).toBe(
      fs.realpathSync(os.tmpdir())
    );
    expect(DATA_DIR).not.toBe(path.join(process.cwd(), 'data'));

    firmalariKaydetDosyaya([]);
    kullanicilariKaydetDosyaya([]);
    kargoMerkezi.kaydetAyarlar({ tenantId: 'isolated-fixture', aktif: false });
    fs.writeFileSync(path.join(UPLOADS_DIR, 'fixture.txt'), 'temporary upload');

    expect(JSON.parse(fs.readFileSync(IDENTITY_DOSYA_YOLU, 'utf8'))).toEqual(
      expect.objectContaining({ companies: [], users: [] })
    );
    expect(JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'kargo_ayarlari.json'), 'utf8'))).toEqual(
      expect.arrayContaining([expect.objectContaining({ tenantId: 'isolated-fixture' })])
    );
    expect(readProjectFiles()).toEqual(before);
  });

  it('has no live service credentials or Supabase client', () => {
    expect([SUPABASE_URL, SUPABASE_KEY, GEMINI_API_KEY, RESEND_API_KEY]).toEqual(['', '', '', '']);
    expect(supabase).toBeNull();
  });

  it('blocks external fetch, HTTP(S), and direct socket requests before connecting', async () => {
    await expect(fetch('https://example.invalid/test')).rejects.toThrow(
      'External network is disabled'
    );
    expect(() => http.get('http://example.invalid/test')).toThrow('External network is disabled');
    expect(() => https.get('https://example.invalid/test')).toThrow('External network is disabled');
    expect(() => net.connect({ host: '203.0.113.1', port: 443 })).toThrow(
      'External network is disabled'
    );
  });

  it('allows Supertest requests to a local HTTP server', async () => {
    const server = http.createServer((_req, res) => res.end('local fixture'));
    const response = await request(server).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toBe('local fixture');
  });
});
