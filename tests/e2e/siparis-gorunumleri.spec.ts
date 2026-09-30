import { test, expect, login } from './support';
import { fixture } from './data';

// Codex R4 T1–T3 (order table views). The fixture order A owes 40 of 50 AZN and carries
// no Baku collection fields.

// T1: the mobile card computed its balance from the Baku collection fields, the table
// from total − received; the debtor order showed "Tam Ödənildi" on the card.
// T3: on a phone in table mode the cards and the table were both on screen.
test('on a phone the order list is one list, with the same balance as the table', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, fixture.ownerA);
  await page.goto('/app');
  const musteri = page.getByText(fixture.customerA, { exact: true }).filter({ visible: true });
  await expect(musteri).toHaveCount(1);
  await expect(page.getByRole('table').filter({ visible: true })).toHaveCount(0);
  await expect(page.getByText(/Qalıq: 40\.00 AZN/).filter({ visible: true })).toHaveCount(1);
  await expect(page.getByText(/Tam Ödənildi/).filter({ visible: true })).toHaveCount(0);
});

// T2: the Kanban showed every order while the search/filter narrowed the list.
test('the Kanban shows the filtered list, like the table and the cards', async ({ page }) => {
  await login(page, fixture.ownerA);
  await page.goto('/app');
  const gorunen = () =>
    page.getByText(fixture.customerA, { exact: true }).filter({ visible: true });
  await expect(gorunen().first()).toBeVisible();
  await page.getByRole('button', { name: 'Kanban 5', exact: true }).click();
  await expect(gorunen().first()).toBeVisible();
  await page.locator('#input-tablo-arama').fill('bele-bir-sifaris-yoxdur');
  await expect(gorunen()).toHaveCount(0);
  await page.locator('#input-tablo-arama').fill('');
  await expect(gorunen().first()).toBeVisible();
});
