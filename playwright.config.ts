import { defineConfig } from '@playwright/test';

if (!process.env.TOMNAP_E2E_ROOT || !process.env.TOMNAP_E2E_NONCE) {
  throw new Error('Use npm run test:e2e to allocate an isolated fixture and port.');
}
const baseURL = process.env.APP_URL!;
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    viewport: { width: 1440, height: 1000 },
    locale: 'az-AZ',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      // Context routing fences page traffic; this also prevents Chromium's own
      // background traffic from reaching external hosts.
      proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1,localhost' },
      args: ['--disable-background-networking', '--disable-component-update', '--disable-sync'],
    },
  },
  webServer: {
    command: 'node --import tsx tests/e2e/server.ts',
    url: `${baseURL}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
