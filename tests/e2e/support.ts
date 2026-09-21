import { test as base, expect, type Page } from '@playwright/test';
import { fixture } from './data';

export const test = base.extend<{
  apiPaths: string[];
  externalRequests: string[];
  pageErrors: string[];
}>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      expect(errors, 'The real UI must not throw an uncaught browser error').toEqual([]);
    },
    { auto: true },
  ],
  apiPaths: async ({ page }, use) => {
    const paths: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) paths.push(`${request.method()} ${url.pathname}`);
    });
    await use(paths);
  },
  externalRequests: async ({}, use) => {
    await use([]);
  },
  context: async ({ context, baseURL, externalRequests }, use) => {
    await context.route('**/*', (route) => {
      if (new URL(route.request().url()).origin === baseURL) return route.continue();
      externalRequests.push(new URL(route.request().url()).origin);
      return route.abort('blockedbyclient');
    });
    await context.routeWebSocket('**/*', (socket) => socket.close());
    await use(context);
  },
});
export { expect };

export async function login(page: Page, email: string) {
  await page.goto('/app');
  await page.getByLabel('E-poçt və ya telefon', { exact: true }).fill(email);
  await page.getByLabel('Şifrə', { exact: true }).fill(fixture.password);
  const reply = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/giris') && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Daxil ol', exact: true }).click();
  const response = await reply;
  expect(response.status()).toBe(200);
  const body = await response.json();
  await expect(page.getByRole('dialog', { name: 'TOMNAP Giriş Paneli' })).toBeHidden();
  expect(
    (await page.context().cookies()).find((cookie) => cookie.name === 'tomnap_session')
  ).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
  expect(await page.evaluate(() => document.cookie)).not.toContain('tomnap_session');
  return body;
}

export async function logout(page: Page, courier = false) {
  const reply = page.waitForResponse((response) => response.url().endsWith('/api/auth/cikis'));
  await (
    courier
      ? page.getByRole('button', { name: 'Çıxış', exact: true })
      : page.getByTitle('Lock Workspace / İş masasını kilidlə')
  ).click();
  expect((await reply).status()).toBe(200);
  await expect
    .poll(async () =>
      (await page.context().cookies()).some((cookie) => cookie.name === 'tomnap_session')
    )
    .toBe(false);
}

export async function api(
  page: Page,
  url: string,
  init: { method?: string; body?: unknown; csrf?: string; tenant?: string } = {}
) {
  return page.evaluate(
    async ({ url, init }) => {
      if (!url.startsWith('/api/') && !url.startsWith('/uploads/'))
        throw new Error('Only local application API paths are allowed');
      const response = await fetch(url, {
        method: init.method || 'GET',
        credentials: 'same-origin',
        headers: {
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init.csrf ? { 'x-csrf-token': init.csrf } : {}),
          ...(init.tenant ? { 'x-tenant-id': init.tenant } : {}),
        },
        ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      });
      const text = await response.text();
      let body: any;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      return { status: response.status, body, cacheControl: response.headers.get('cache-control') };
    },
    { url, init }
  );
}
