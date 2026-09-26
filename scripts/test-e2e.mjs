import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const cli = path.join(repository, 'node_modules/@playwright/test/cli.js');
const browsers = path.join(repository, 'node_modules/.cache/ms-playwright');
const install = process.argv[2] === '--install';
const installArgs = process.argv.slice(3);
if ((!install && process.argv.length > 2) || installArgs.some((arg) => arg !== '--with-deps')) {
  throw new Error('Use npm run test:e2e, or npm run test:e2e:install [-- --with-deps].');
}
if (!install && !fs.existsSync(path.join(repository, 'dist/index.html'))) {
  throw new Error('Production UI build missing. Run npm run build before npm run test:e2e.');
}
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tomnap-e2e-'));
const nonce = crypto.randomBytes(24).toString('hex');
fs.writeFileSync(path.join(root, '.fixture-marker'), nonce, { mode: 0o600 });
const reserve = net.createServer();
await new Promise((resolve, reject) => {
  reserve.once('error', reject);
  reserve.listen(0, '127.0.0.1', resolve);
});
const port = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));

// Explicit environment: neither the app nor Playwright inherits database/mail/
// cloud credentials, NODE_OPTIONS, proxies, or a developer's dotenv configuration.
const env = {
  PATH: process.env.PATH,
  ...(process.env.CI ? { CI: 'true' } : {}),
  NODE_ENV: 'test',
  DOTENV_CONFIG_PATH: path.join(root, '.missing-env'),
  DOTENV_CONFIG_QUIET: 'true',
  DATA_DIR: path.join(root, 'data'),
  UPLOADS_DIR: path.join(root, 'uploads'),
  UPLOAD_STORAGE_BACKEND: 'local',
  SUPABASE_URL: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  SUPABASE_ANON_KEY: '',
  RESEND_API_KEY: '',
  GEMINI_API_KEY: '',
  GOOGLE_API_KEY: '',
  API_SECRET_KEY: '',
  CORS_ORIGIN: '',
  EMAIL_FROM: 'E2E <noreply@example.invalid>',
  ALLOW_GLOBAL_RESET: 'false',
  CARGO_ENCRYPTION_KEYS: JSON.stringify({ e2e: 'b7'.repeat(32) }),
  CARGO_ENCRYPTION_ACTIVE_KEY_ID: 'e2e',
  APP_URL: `http://127.0.0.1:${port}`,
  PORT: String(port),
  TOMNAP_E2E_ROOT: root,
  TOMNAP_E2E_NONCE: nonce,
  PLAYWRIGHT_BROWSERS_PATH: browsers,
};
const args = install
  ? [cli, 'install', 'chromium', ...installArgs]
  : [cli, 'test', '--config', path.join(repository, 'playwright.config.ts')];
const child = spawn(process.execPath, args, { cwd: repository, env, stdio: 'inherit' });
const stop = (signal) => child.kill(signal);
const onInterrupt = () => stop('SIGINT');
const onTerminate = () => stop('SIGTERM');
process.on('SIGINT', onInterrupt);
process.on('SIGTERM', onTerminate);
try {
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
} finally {
  process.off('SIGINT', onInterrupt);
  process.off('SIGTERM', onTerminate);
  fs.rmSync(root, { recursive: true, force: true });
}
