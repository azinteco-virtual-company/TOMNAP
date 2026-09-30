import { test, expect, login } from './support';
import { fixture } from './data';

// Deploy 2 finding 6: after the AI auto-save ("Doğrudan Veritabanına Ekle") the draft
// and its "Bu Taslağı Onayla & Siparişlere Ekle" button stayed open; a click wrote the
// same order a second time (it happened once on production demo data).
test('the visual desk closes the draft after an automatic save, so the order is written once', async ({
  page,
  apiPaths,
}) => {
  await login(page, fixture.ownerA);
  // A synthetic AI answer: nothing reaches Gemini in the isolated run.
  await page.route('**/api/ayristir-siparis', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        basarili: true,
        kaydedildi: true,
        kaynak: 'bellek',
        musteri_adaylari: [],
        siparis: {
          id: 'sip-e2e-otomatik',
          tenant_id: fixture.tenantA,
          musteri_adi: 'Otomatik Kayıt',
          urun_aciklamasi: 'Qara çanta',
          adet: 1,
          toplam_tutar: 20,
          alinan_tutar: 0,
          kalan_tutar: 20,
          para_birimi: 'AZN',
          finans_durumu: 'BEKLIYOR',
          lojistik_durumu: 'KANADA_SATINALIM_BEKLIYOR',
          olusturma_tarihi: new Date().toISOString(),
          ham_mesaj: 'DENEME: 1 qara çanta, 20 AZN',
          eksik_bilgiler: [],
          siparis_kaynagi: 'WHATSAPP',
          urunler: [],
          gorsel_urlleri: [],
        },
      }),
    })
  );
  await page.goto('/gorsel-giris');
  await page.locator('#ham-metin').fill('DENEME: 1 qara çanta, 20 AZN');
  await page.getByRole('button', { name: 'Doğrudan Veritabanına Ekle', exact: true }).click();
  await expect(page.getByText('Sipariş başarıyla işlendi ve veritabanına eklendi!')).toBeVisible();
  await expect(page.getByRole('button', { name: /Bu Taslağı Onayla/ })).toHaveCount(0);
  expect(apiPaths.filter((entry) => entry === 'POST /api/siparisler')).toEqual([]);
});
