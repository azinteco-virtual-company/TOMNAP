import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { afterAll, vi } from 'vitest';

// The setup runs independently for every test file, before application imports.
// Never load local .env credentials or persisted company/carrier data in tests.
vi.mock('dotenv', () => ({ default: { config: () => ({ parsed: {} }) } }));

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tomnap-test-'));
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATA_DIR: path.join(testRoot, 'data'),
  UPLOADS_DIR: path.join(testRoot, 'uploads'),
  SUPABASE_URL: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  SUPABASE_ANON_KEY: '',
  RESEND_API_KEY: '',
  GEMINI_API_KEY: '',
  GOOGLE_API_KEY: '',
  API_SECRET_KEY: '',
  ENCRYPTION_KEY: 'tomnap-isolated-test-encryption-key-32-characters',
  APP_URL: 'http://localhost',
  EMAIL_FROM: 'TOMNAP Tests <noreply@example.invalid>',
  CORS_ORIGIN: '',
  ALLOW_GLOBAL_RESET: 'false',
});
fs.mkdirSync(process.env.DATA_DIR!, { recursive: true });
fs.mkdirSync(process.env.UPLOADS_DIR!, { recursive: true });

const isLoopback = (host: string) =>
  host === '127.0.0.1' || host === '::1' || host === '[::1]' || host === 'localhost';

// Guard the socket layer as well as fetch: SDKs and redirects must not reach
// external services. Loopback remains available for Supertest/local fixtures.
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args: unknown[]) {
  const normalized = Array.isArray(args[0]) ? args[0] : args;
  const first = normalized[0];
  const host =
    first && typeof first === 'object'
      ? (first as { host?: string }).host || 'localhost'
      : typeof normalized[1] === 'string'
        ? normalized[1]
        : 'localhost';
  if (!isLoopback(host)) {
    throw new Error(`External network is disabled in tests: ${host}`);
  }
  return Reflect.apply(originalConnect, this, args);
} as typeof originalConnect;

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!isLoopback(url.hostname)) {
    throw new Error(`External network is disabled in tests: ${url.hostname}`);
  }
  return originalFetch(input, init);
};

const cleanup = () => fs.rmSync(testRoot, { recursive: true, force: true });
process.once('exit', cleanup);
afterAll(() => {
  net.Socket.prototype.connect = originalConnect;
  globalThis.fetch = originalFetch;
  cleanup();
  process.removeListener('exit', cleanup);
});
