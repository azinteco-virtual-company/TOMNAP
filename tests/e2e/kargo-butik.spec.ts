import { test, expect, login } from './support';
import { fixture } from './data';

// Deploy 2 (Deploy 1 note): with "Bütün Butiklər" selected the cargo screen asked for the
// settings of tenant "all" and showed the 400 "Kargo işlemi için firma seçin.". Cargo
// settings belong to one boutique: the screen asks for one first and sends nothing.
test('the cargo screen asks the platform admin for a boutique instead of failing', async ({
  page,
  apiPaths,
}) => {
  await login(page, fixture.platformAdmin);
  await page.goto('/kargo-merkezi');
  const secici = page.getByRole('combobox', { name: 'Kargo üçün butik' });
  await expect(secici).toBeVisible();
  expect(apiPaths.filter((entry) => entry.startsWith('GET /api/kargo/ayarlar'))).toEqual([]);
  const ayarlar = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/kargo/ayarlar'
  );
  await secici.selectOption(fixture.tenantA);
  expect((await ayarlar).status()).toBe(200);
  await expect(secici).toBeHidden();
});
