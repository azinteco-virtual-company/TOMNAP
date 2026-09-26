import fs from 'node:fs/promises';
import * as XLSX from 'xlsx';
import { test, expect, login, logout, api } from './support';
import { fixture, imagePath } from './data';

test('owner binds a courier explicitly, assignment counters update, and courier delivery leaves payments unchanged', async ({
  page,
  apiPaths,
}) => {
  await login(page, fixture.ownerA);
  const before = (await api(page, '/api/siparisler')).body.siparisler.find(
    (order) => order.id === fixture.orderA
  );
  expect(before).toBeTruthy();
  await page.goto('/kurye-masasi');
  await expect(
    page.getByRole('heading', { name: 'Kuryerlər və sifariş təyinatları' })
  ).toBeVisible();
  await page.getByLabel('Ad və soyad', { exact: true }).fill(fixture.courierName);
  await page.getByLabel('Telefon', { exact: true }).fill('+994500000001');
  await page.getByLabel('Bölgə', { exact: true }).fill('Synthetic District');
  const createReply = page.waitForResponse(
    (response) => response.url().endsWith('/api/kuryeler') && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Kuryer qeydi yarat' }).click();
  expect((await createReply).status()).toBe(201);
  const card = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: fixture.courierName, exact: true }) });
  await card.getByLabel('Giriş edə bilən kuryer hesabı').selectOption(fixture.courierUserId);
  const bindReply = page.waitForResponse((response) =>
    /\/api\/kuryeler\/[^/]+\/kullanici$/.test(new URL(response.url()).pathname)
  );
  await card.getByRole('button', { name: 'Bağı saxla' }).click();
  expect((await bindReply).status()).toBe(200);
  await expect(card.getByText('Hesaba bağlıdır', { exact: true })).toBeVisible();
  await page
    .getByRole('listitem')
    .filter({ hasText: fixture.customerA })
    .getByRole('button', { name: 'Sifariş detalı' })
    .click();
  await page
    .getByLabel('Təyin edilmiş kuryer')
    .selectOption({ label: `${fixture.courierName} · Synthetic District` });
  const assignReply = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `/api/siparisler/${fixture.orderA}/kurye`
  );
  await page.getByRole('button', { name: 'Kuryer təyinatını saxla' }).click();
  const assigned = await assignReply;
  expect(assigned.status()).toBe(200);
  expect((await assigned.json()).siparis.kurye_atama_surumu).toBe(1);
  // The phase4 browser regression: updated order cards must also refresh the
  // authoritative roster's counters, without requiring a manual page reload.
  await expect(card).toContainText('1 gözləyən · 1 təyin edilmiş sifariş');
  await page.goto('/app');
  await logout(page);
  expect((await api(page, imagePath(fixture.tenantA))).status).toBe(401);

  apiPaths.length = 0;
  await login(page, fixture.courier);
  await expect(page.getByRole('heading', { name: 'Çatdırılma tapşırıqlarım' })).toBeVisible();
  await expect(page.getByText(fixture.customerA, { exact: true })).toBeVisible();
  await expect(page.getByText(fixture.customerB, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Excel|PDF|Tahsil Et/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Təhvil verildi', exact: true }).click();
  await page.getByLabel('Bağlamanı təhvil alanın adı').fill('Synthetic Recipient Alpha');
  const deliverReply = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/kurye/gorevler/${fixture.orderA}/teslim`
  );
  await page.getByRole('button', { name: 'Təhvil verildiyini təsdiqlə' }).click();
  const delivered = await deliverReply;
  expect(delivered.status()).toBe(200);
  expect(delivered.request().postDataJSON()).toEqual({
    beklenen_atama_surumu: 1,
    teslim_alan: 'Synthetic Recipient Alpha',
  });
  expect(
    apiPaths.every((path) =>
      /^(GET|POST) \/api\/(auth\/(oturum|giris)|kurye\/gorevler(?:\/[^/]+\/teslim)?)$/.test(path)
    )
  ).toBe(true);
  await logout(page, true);
  expect((await api(page, '/api/kurye/gorevler')).status).toBe(401);
  expect((await api(page, imagePath(fixture.tenantA))).status).toBe(401);

  await login(page, fixture.ownerA);
  const after = (await api(page, '/api/siparisler')).body.siparisler.find(
    (order) => order.id === fixture.orderA
  );
  expect(after.lojistik_durumu).toBe('TESLIM_EDILDI');
  for (const field of [
    'toplam_tutar',
    'alinan_tutar',
    'kalan_tutar',
    'finans_durumu',
    'para_birimi',
  ])
    expect(after[field]).toBe(before[field]);
});

test('cargo editor makes two revision-aware saves and keeps credentials masked', async ({
  page,
}) => {
  await login(page, fixture.ownerA);
  await page.goto('/kargo-merkezi');
  await page
    .getByRole('button', { name: 'Kargo Provayder & API Parametrləri', exact: true })
    .click();
  const password = page.getByPlaceholder('••••••••', { exact: true });
  await page.getByPlaceholder('Kargo hesabınız').fill('Synthetic Carrier User');
  await password.fill(fixture.cargoPassword);
  await page.getByPlaceholder('Hesap numaranız').fill('SYNTHETIC-ACCOUNT');
  await page.getByPlaceholder('••••', { exact: true }).fill('9876');
  const save = page.getByRole('button', { name: 'Tənzimləmələri Yadda Saxla', exact: true });
  const firstReply = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/kargo/ayarlar' &&
      response.request().method() === 'POST'
  );
  await save.click();
  const first = await firstReply;
  expect(first.status()).toBe(200);
  expect(first.request().postDataJSON().revision).toBe(0);
  expect((await first.json()).ayarlar).toMatchObject({
    revision: 1,
    kimlikBilgileri: { sifre: '••••••••', pin: '••••••••' },
  });
  await expect(password).toHaveValue('••••••••');
  await page.getByPlaceholder('Hesap numaranız').fill('SYNTHETIC-ACCOUNT-UPDATED');
  const secondReply = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/kargo/ayarlar' &&
      response.request().method() === 'POST'
  );
  await save.click();
  const second = await secondReply;
  expect(second.status()).toBe(200);
  expect(second.request().postDataJSON()).toMatchObject({
    revision: 1,
    kimlikBilgileri: { sifre: '••••••••' },
  });
  expect((await second.json()).ayarlar.revision).toBe(2);
  await page.reload();
  await page
    .getByRole('button', { name: 'Kargo Provayder & API Parametrləri', exact: true })
    .click();
  await expect(password).toHaveValue('••••••••');
  await expect(page.getByPlaceholder('Hesap numaranız')).toHaveValue('SYNTHETIC-ACCOUNT-UPDATED');
  const stored = await api(page, '/api/kargo/ayarlar');
  expect(stored.status).toBe(200);
  expect(stored.body.ayarlar.revision).toBe(2);
  expect(JSON.stringify(stored.body)).not.toContain(fixture.cargoPassword);
});

test('two owners cannot cross tenant data or image boundaries and logout revokes both', async ({
  page,
  externalRequests,
}) => {
  const session = await login(page, fixture.ownerA);
  let orders = await api(page, '/api/siparisler');
  expect(orders.body.siparisler.map((order) => order.id)).toEqual([fixture.orderA]);
  const image = await api(page, imagePath(fixture.tenantA));
  expect(image.status).toBe(200);
  expect(image.cacheControl).toContain('no-store');
  expect((await api(page, imagePath(fixture.tenantB))).status).toBe(404);
  expect((await api(page, `/api/siparisler?tenant_id=${fixture.tenantB}`)).status).toBe(403);
  expect(
    (
      await api(page, `/api/siparisler/${fixture.orderB}`, {
        method: 'PATCH',
        body: { musteri_adi: 'Cross-tenant write' },
        csrf: session.csrfToken,
      })
    ).status
  ).toBe(404);
  expect(
    (
      await api(page, `/api/siparisler/${fixture.orderA}`, {
        method: 'PATCH',
        body: { musteri_adi: 'Missing CSRF write' },
      })
    ).status
  ).toBe(403);
  // The browser fence is active, not merely documented. It also covers popups
  // through context routing, while service workers and all websockets are blocked.
  expect(
    await page.evaluate(() =>
      fetch('https://blocked.example.invalid/should-not-leave-machine')
        .then(() => false)
        .catch(() => true)
    )
  ).toBe(true);
  expect(externalRequests).toContain('https://blocked.example.invalid');
  await logout(page);
  expect((await api(page, '/api/siparisler')).status).toBe(401);
  expect((await api(page, imagePath(fixture.tenantA))).status).toBe(401);

  await login(page, fixture.ownerB);
  orders = await api(page, '/api/siparisler');
  expect(orders.body.siparisler.map((order) => order.id)).toEqual([fixture.orderB]);
  expect(orders.body.siparisler[0].musteri_adi).toBe(fixture.customerB);
  expect((await api(page, imagePath(fixture.tenantB))).status).toBe(200);
  expect((await api(page, imagePath(fixture.tenantA))).status).toBe(404);
  await logout(page);
  expect((await api(page, imagePath(fixture.tenantB))).status).toBe(401);
});

test('normal login defers document packages and explicit exports download a workbook and manifesto PDF', async ({
  page,
}) => {
  const documentRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/optional-doc-/.test(request.url()))
      documentRequests.push(new URL(request.url()).pathname);
  });
  await login(page, fixture.ownerA);
  await page.goto('/baku-tahsilat');
  const exportButton = page.getByRole('button', { name: 'Excel İndir (.xlsx)', exact: true });
  await expect(exportButton).toBeVisible();
  expect(documentRequests).toEqual([]);
  const downloadReady = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadReady;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);
  const file = await download.path();
  const bytes = await fs.readFile(file!);
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  const workbook = XLSX.read(bytes, { type: 'buffer' });
  const rows = workbook.SheetNames.flatMap((name) =>
    XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 })
  );
  expect(JSON.stringify(rows)).toContain(fixture.customerA);
  expect(JSON.stringify(rows)).not.toContain(fixture.customerB);
  expect(documentRequests.some((name) => name.includes('optional-doc-spreadsheet'))).toBe(true);

  await page.goto('/kargo-manifest');
  await page.getByRole('button', { name: /^Bütün Sifarişlər/ }).click();
  const pdfButton = page.getByTitle('PDF', { exact: true });
  await expect(pdfButton).toBeEnabled();
  const pdfReady = page.waitForEvent('download');
  await pdfButton.click();
  const pdf = await pdfReady;
  expect(await pdf.failure()).toBeNull();
  expect(pdf.suggestedFilename()).toMatch(/^KNB_Ceki_Listesi_.*\.pdf$/);
  const pdfBytes = await fs.readFile((await pdf.path())!);
  expect(pdfBytes.length).toBeGreaterThan(1000);
  expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdfBytes.toString('latin1')).toContain('/Type /Page');
  expect(pdfBytes.toString('latin1')).toContain(fixture.customerA);
  expect(pdfBytes.toString('latin1')).not.toContain(fixture.customerB);
  expect(pdfBytes.subarray(-32).toString()).toContain('%%EOF');
  expect(documentRequests.some((name) => name.includes('optional-doc-pdf'))).toBe(true);
});

test('a missing document chunk shows an error, unlocks export, and succeeds after reload', async ({
  page,
}) => {
  const spreadsheetChunk = /\/optional-doc-spreadsheet[^/]*\.js(?:\?.*)?$/;
  let blocked = 0;
  const downloads: string[] = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await page.route(spreadsheetChunk, (route) => {
    blocked++;
    return route.abort('failed');
  });
  await login(page, fixture.ownerA);
  await page.goto('/baku-tahsilat');
  const exportButton = page.getByRole('button', { name: 'Excel İndir (.xlsx)', exact: true });
  await expect(exportButton).toBeVisible();
  const errorReady = page.waitForEvent('dialog');
  const click = exportButton.click();
  const error = await errorReady;
  expect(error.type()).toBe('alert');
  expect(error.message()).toBe('Sənəd hazırlanmadı. Bağlantını yoxlayıb yenidən cəhd edin.');
  await error.accept();
  await click;
  expect(blocked).toBeGreaterThan(0);
  await expect(exportButton).toBeEnabled();
  expect(downloads).toEqual([]);

  // Browsers cache a failed module evaluation in the current document. A reload
  // after connectivity is restored must make the real export usable again.
  await page.unroute(spreadsheetChunk);
  await page.reload();
  const downloadReady = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadReady;
  expect(await download.failure()).toBeNull();
  const bytes = await fs.readFile((await download.path())!);
  const workbook = XLSX.read(bytes, { type: 'buffer' });
  expect(workbook.SheetNames.length).toBeGreaterThan(0);
  expect(downloads).toHaveLength(1);
});

test('a failed detail refresh keeps its error visible instead of treating old orders as refreshed', async ({
  page,
  apiPaths,
}) => {
  await login(page, fixture.ownerB);
  await page.goto('/kurye-masasi');
  await page
    .getByRole('listitem')
    .filter({ hasText: fixture.customerB })
    .getByRole('button', { name: 'Sifariş detalı' })
    .click();
  const refresh = page.getByRole('button', { name: 'Sifarişi yenilə', exact: true });
  await expect(refresh).toBeEnabled();
  const rosterRequests = () => apiPaths.filter((path) => path === 'GET /api/kuryeler').length;
  const initialRosterRequests = rosterRequests();
  const ordersList = /\/api\/siparisler\?/;
  await page.route(ordersList, (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ basarili: false, hata: 'Synthetic list changed; reload required.' }),
    })
  );
  await refresh.click();
  const detailError = page
    .getByRole('alert')
    .filter({ hasText: 'Sifarişi yeniləyib son təyinatı yoxlayın.' });
  await expect(detailError).toContainText('Synthetic list changed; reload required.');
  await expect(page.getByLabel('Təyin edilmiş kuryer')).toBeDisabled();
  expect(rosterRequests()).toBe(initialRosterRequests);
  await expect(refresh).toBeEnabled();

  await page.unroute(ordersList);
  await refresh.click();
  await expect(detailError).toHaveCount(0);
  await expect(page.getByLabel('Təyin edilmiş kuryer')).toBeEnabled();
  expect(rosterRequests()).toBeGreaterThan(initialRosterRequests);
});
