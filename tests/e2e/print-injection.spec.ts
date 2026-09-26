import { test, expect, login, api } from './support';
import type { Frame, Page } from '@playwright/test';

// Codex R4 F20: print templates put order fields into HTML as markup, and the print
// surface (an iframe without sandbox, or a fallback window) is same-origin with the
// app. Order text with <script> or <img onerror> ran with the user's session.
// Each payload tries to mark the app window; none may run, and each must print as
// plain text. Printing itself must still happen.
const MARK = '(top.opener||top).__tomnapXss';
const payloads = {
  musteri_adi: `XSS Müştəri <img src=x onerror="${MARK}='musteri'">`,
  urun_aciklamasi: `<script>${MARK}='urun'</script>Çanta`,
  teslimat_adresi: `"><svg onload="${MARK}='adres'"></svg>`,
  ozel_not: `</div><img src=x onerror="${MARK}='not'">`,
  baku_tahsilat_notu: `<iframe srcdoc="<script>${MARK}='tahsilat'</script>"></iframe>`,
};

/** Counts print() calls on print iframes (and can make them fail to force the fallback). */
async function watchPrints(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __prints: string[]; __printFail?: boolean };
    w.__prints = [];
    new MutationObserver((changes) => {
      for (const change of changes)
        for (const node of change.addedNodes) {
          if (!(node instanceof HTMLIFrameElement) || !node.contentWindow) continue;
          const frame = node.contentWindow;
          const original = frame.print.bind(frame);
          frame.print = () => {
            if (w.__printFail) throw new Error('forced print failure');
            w.__prints.push(node.title);
            original();
          };
        }
    }).observe(document, { childList: true, subtree: true });
  });
}

async function expectPlainText(frame: Frame, fields: string[]) {
  const text = await frame.locator('body').innerText();
  for (const field of fields) expect(text).toContain(field.trim());
  // No element from a payload exists: the templates themselves use none of these.
  expect(await frame.locator('img, svg, script, iframe').count()).toBe(0);
  // Second line of defence: the printed page carries its own no-script policy.
  const policy = frame.locator('meta[http-equiv="Content-Security-Policy"]');
  expect(await policy.getAttribute('content')).toContain("script-src 'none'");
}

test('print templates show order text as plain text and run none of it (Codex R4 F20)', async ({
  page,
}) => {
  const blocked: string[] = [];
  page.on('console', (message) => {
    if (/Ignored call to 'print\(\)'/i.test(message.text())) blocked.push(message.text());
  });
  await watchPrints(page);
  const session = await login(page, 'owner-a@example.invalid');
  const created = await api(page, '/api/siparisler', {
    method: 'POST',
    csrf: session.csrfToken,
    body: { ...payloads, telefon_numarasi: '+994500000009', toplam_tutar: 30, alinan_tutar: 0 },
  });
  expect(created.status, JSON.stringify(created.body)).toBe(200);
  const orderId = created.body.siparis.id as string;
  const xss = () =>
    page.evaluate(() => (window as unknown as { __tomnapXss?: string }).__tomnapXss);
  const prints = () => page.evaluate(() => (window as unknown as { __prints: string[] }).__prints);

  try {
    const printFrame = async (title: string, click: () => Promise<void>) => {
      const attached = page.waitForSelector(`iframe[title="${title}"]`, { state: 'attached' });
      await click();
      const element = await attached;
      // Scripts never run in the print frame; printing stays allowed.
      expect(await element.getAttribute('sandbox')).toBe('allow-modals allow-same-origin');
      const frame = await element.contentFrame();
      expect(frame, `${title} print frame`).toBeTruthy();
      // Printing still happens (after the template is written) before the page moves on.
      await expect.poll(prints).toContain(title);
      return frame!;
    };

    await page.goto('/kargo-manifest');
    await page.getByRole('button', { name: /^Bütün Sifarişlər/ }).click();
    const manifest = await printFrame('Kargo_Manifestosu', () =>
      page.getByRole('button', { name: /^(Manifesto Çap Et|Print Manifest)$/ }).click()
    );
    await expectPlainText(manifest, Object.values(payloads));
    const labels = await printFrame('Kargo_Etiketleri', () =>
      page
        .getByRole('button', { name: /^(Paket Stikerləri \(Barkod\)|Package Labels \(Barcode\))$/ })
        .click()
    );
    await expectPlainText(labels, [payloads.musteri_adi, payloads.urun_aciklamasi]);

    await page.goto('/baku-tahsilat');
    const collection = await printFrame('Baki_Tahsilat_Hesabati', () =>
      page.getByRole('button', { name: 'Çap Et' }).click()
    );
    await expectPlainText(collection, [payloads.musteri_adi, payloads.baku_tahsilat_notu]);

    // Nothing ran in the app window, and no print call was refused by the sandbox.
    expect(await xss()).toBeUndefined();
    expect(blocked).toEqual([]);

    // The fallback window (used when the iframe cannot print) is covered too.
    await page.evaluate(() => {
      (window as unknown as { __printFail: boolean }).__printFail = true;
    });
    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Çap Et' }).click();
    const fallback = await popup;
    await fallback.waitForLoadState();
    await expectPlainText(fallback.mainFrame(), [payloads.musteri_adi, payloads.ozel_not]);
    await fallback.waitForTimeout(700);
    expect(await xss()).toBeUndefined();
    expect(
      await fallback.evaluate(() => (window as unknown as { __tomnapXss?: string }).__tomnapXss)
    ).toBeUndefined();
    await fallback.close();
  } finally {
    const removed = await api(page, `/api/siparisler/${orderId}`, {
      method: 'DELETE',
      csrf: session.csrfToken,
    });
    expect(removed.status).toBe(200);
  }
});
