import { test, expect, login, api } from './support';
import { fixture } from './data';

// B1 (Deploy 3): from 768 px the manifest header put the title and seven buttons side by
// side and the button group could not shrink: the title squeezed into a narrow column and
// the last button was cut off (Safari). Now the title takes the full width and the buttons
// wrap. Checked with a long boutique name, a long address and long order text.
const uzun = {
  musteri_adi: 'Synthetic Müştəri Əbdülrəhmanzadə-Məmmədquliyeva Səbinə Nurməmməd qızı',
  teslimat_adresi:
    'Bakı, Nərimanov rayonu, Əhməd Rəcəbli küçəsi 123, bina 4, mənzil 56, giriş 2, mərtəbə 9 (domofon işləmir, zəng edin)',
  urun_aciklamasi:
    'Uzun adlı dəri çanta — qəhvəyi, böyük ölçü, qızılı tokalı, Kanada outlet endirimi ilə',
  telefon_numarasi: '+994500000077',
  toplam_tutar: 75,
  alinan_tutar: 0,
};

test('the manifest header neither squeezes nor overflows (B1)', async ({ page }) => {
  const session = await login(page, fixture.ownerB);
  const created = await api(page, '/api/siparisler', {
    method: 'POST',
    csrf: session.csrfToken,
    body: uzun,
  });
  expect(created.status, JSON.stringify(created.body)).toBe(200);
  const orderId = created.body.siparis.id as string;
  try {
    await page.goto('/kargo-manifest');
    await page.getByRole('button', { name: /^Bütün sifarişlər/ }).click();
    const ust = page.getByTestId('manifesto-ust');
    await expect(ust.getByText(fixture.boutiqueB, { exact: false })).toBeVisible();
    await expect(page.getByText(uzun.musteri_adi)).toBeVisible();

    for (const width of [768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const kutu = (await ust.boundingBox())!;
      const baslik = (await page.locator('#manifesto-baslik').boundingBox())!;
      // The title keeps a readable width (it used to shrink to a word per line).
      expect([width, baslik.width >= Math.min(320, kutu.width * 0.5)]).toEqual([width, true]);
      // Every action button sits inside the header box.
      const dugmeler = page.getByTestId('manifesto-eylemler').getByRole('button');
      for (let i = 0; i < (await dugmeler.count()); i++) {
        const b = (await dugmeler.nth(i).boundingBox())!;
        expect([width, i, b.x >= kutu.x - 0.5, b.x + b.width <= kutu.x + kutu.width + 0.5]).toEqual(
          [width, i, true, true]
        );
      }
      // The page itself never scrolls sideways (the table scrolls in its own box).
      const tasma = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect([width, tasma <= 1]).toEqual([width, true]);
    }
  } finally {
    const removed = await api(page, `/api/siparisler/${orderId}`, {
      method: 'DELETE',
      csrf: session.csrfToken,
    });
    expect(removed.status).toBe(200);
  }
});
