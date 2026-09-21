import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const cli = fileURLToPath(new URL('../../../scripts/migrate-cargo-settings.ts', import.meta.url));
const loader = fileURLToPath(new URL('../../../node_modules/tsx/dist/loader.mjs', import.meta.url));
const canary = 'SYNTHETIC_CREDENTIAL_CANARY';
const credentials = {
  kullaniciAdi: 'SYNTHETIC_USER',
  sifre: canary,
  hesapNo: 'SYNTHETIC_ACCOUNT',
  pin: '1234',
  entity: 'YYZ',
  testModu: true,
};
const legacy = [
  {
    tenantId: 'cli-tenant',
    revision: 0,
    saglayici: 'ARAMEX',
    aktif: true,
    cikisUlkesi: 'CA',
    cikisSehri: 'Toronto',
    varisUlkesi: 'AZ',
    varisHavalimani: 'Baku',
    kimlikBilgileri: credentials,
    otomatikSenkronizasyon: true,
    guncellenmeTarihi: '',
  },
];
const raw = JSON.stringify(legacy, null, 2) + '\n';
const sha = crypto.createHash('sha256').update(raw).digest('hex');
const encryptionKey = 'a1'.repeat(32);
// Child processes do not inherit Vitest's network guard. Offline migration must
// work with every socket/fetch blocked, including accidentally configured SDKs.
const networkGuard = `data:text/javascript,${encodeURIComponent(
  "import net from 'node:net'; net.Socket.prototype.connect = function () { throw new Error('Network disabled in CLI tests'); }; globalThis.fetch = async function () { throw new Error('Network disabled in CLI tests'); };"
)}`;

describe('offline cargo migration CLI safety', () => {
  let directory: string;
  let input: string;
  let output: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tomnap-cargo-cli-'));
    // Spaces and shell metacharacters are literal arguments, never shell code.
    input = path.join(directory, "legacy cargo ' $(not-a-command).json");
    output = path.join(directory, 'encrypted cargo.json');
    fs.writeFileSync(input, raw, { mode: 0o600 });
  });

  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  function run(...args: string[]) {
    const result = spawnSync(
      process.execPath,
      ['--import', networkGuard, '--import', loader, cli, '--input', input, ...args],
      {
        cwd: directory,
        encoding: 'utf8',
        timeout: 20_000,
        maxBuffer: 1024 * 1024,
        // Do not inherit host credentials, NODE_OPTIONS, or a project .env.
        env: {
          PATH: process.env.PATH,
          NODE_ENV: 'test',
          DATA_DIR: path.join(directory, 'runtime'),
          UPLOADS_DIR: path.join(directory, 'uploads'),
          DOTENV_CONFIG_PATH: path.join(directory, '.missing-env'),
          DOTENV_CONFIG_QUIET: 'true',
          SUPABASE_URL: '',
          SUPABASE_SERVICE_ROLE_KEY: '',
          SUPABASE_ANON_KEY: '',
          RESEND_API_KEY: '',
          APP_URL: 'http://localhost',
          CARGO_ENCRYPTION_KEYS: JSON.stringify({ cli_test: encryptionKey }),
          CARGO_ENCRYPTION_ACTIVE_KEY_ID: 'cli_test',
          NO_COLOR: '1',
        },
      }
    );
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.stdout + result.stderr).not.toContain(canary);
    return result;
  }

  function expectNoChanges(expectedRaw = raw) {
    expect(fs.readFileSync(input, 'utf8')).toBe(expectedRaw);
    expect(fs.readdirSync(directory)).toEqual([path.basename(input)]);
    expect(fs.existsSync(output)).toBe(false);
  }

  it('dry-run reports the source hash and revisions without writing any file', () => {
    const result = run('--output', output, '--allow-plaintext');

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      mode: 'dry-run',
      sourceSha: sha,
      count: 1,
      tenants: [{ tenantId: 'cli-tenant', expectedRevision: 0, newRevision: 1 }],
    });
    expectNoChanges();
  });

  it('apply requires the source hash and writes only a new encrypted 0600 output', () => {
    const result = run('--output', output, '--allow-plaintext', '--apply', '--expected-sha', sha);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout).mode).toBe('apply');
    expect(fs.readFileSync(input, 'utf8')).toBe(raw);
    expect(fs.statSync(output).mode & 0o777).toBe(0o600);
    const written = fs.readFileSync(output, 'utf8');
    expect(written).not.toContain(canary);
    expect(written).not.toContain(credentials.kullaniciAdi);
    expect(written).not.toContain(credentials.hesapNo);
    const snapshot = JSON.parse(written);
    expect(snapshot.version).toBe(2);
    expect(snapshot.records).toHaveLength(1);
    const record = snapshot.records[0];
    expect(record.tenant_id).toBe('cli-tenant');
    expect(record.revision).toBe(1);

    // Verify the actual CLI output preserves credentials inside its authenticated
    // envelope, rather than accepting a mere encrypted-looking marker string.
    const [marker, version, keyId, iv, tag, ciphertext] = record.encrypted_credentials.split(':');
    expect([marker, version, keyId]).toEqual(['enc', 'v2', 'cli_test']);
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(encryptionKey, 'hex'),
      Buffer.from(iv, 'hex')
    );
    decipher.setAAD(
      Buffer.from(JSON.stringify(['TOMNAP:cargo:v2', keyId, 'cli-tenant', 'ARAMEX']))
    );
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'hex')),
      decipher.final(),
    ]).toString('utf8');
    expect(JSON.parse(plaintext)).toEqual(credentials);
  });

  it.each(['0'.repeat(64), undefined])(
    'rejects an incorrect or absent expected SHA (%s)',
    (expected) => {
      const result = run(
        '--output',
        output,
        '--allow-plaintext',
        '--apply',
        ...(expected ? ['--expected-sha', expected] : [])
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Source hash changed or --expected-sha missing');
      expect(result.stdout).toBe('');
      expectNoChanges();
    }
  );

  it('never overwrites an existing output file', () => {
    const sentinel = 'existing output must be retained\n';
    fs.writeFileSync(output, sentinel);

    const result = run('--output', output, '--allow-plaintext', '--apply', '--expected-sha', sha);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(fs.readFileSync(input, 'utf8')).toBe(raw);
    expect(fs.readFileSync(output, 'utf8')).toBe(sentinel);
    expect(fs.readdirSync(directory).sort()).toEqual(
      [path.basename(input), path.basename(output)].sort()
    );
  });

  it('redacts malformed JSON parser excerpts and preserves the malformed source', () => {
    fs.writeFileSync(input, canary);

    const result = run('--output', output, '--allow-plaintext', '--apply', '--expected-sha', sha);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe('Cargo migration stopped: Invalid cargo JSON\n');
    expect(result.stderr).not.toContain('SYNTHETIC_');
    expect(result.stdout).toBe('');
    expectNoChanges(canary);
  });

  it('requires the explicit plaintext import flag before using legacy plaintext credentials', () => {
    const result = run('--output', output, '--apply', '--expected-sha', sha);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Plaintext credentials require --allow-plaintext');
    expect(result.stdout).toBe('');
    expectNoChanges();
  });

  it('rejects using the original source as the output path', () => {
    const result = run('--output', input, '--allow-plaintext', '--apply', '--expected-sha', sha);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Source must be retained; use a new output path');
    expectNoChanges();
  });
});
