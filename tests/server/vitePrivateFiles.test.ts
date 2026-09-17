import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';

let vite: ViteDevServer;
let base: string;
const sentinel = 'PRIVATE-VITE-REGRESSION-SENTINEL';
const filename = path.join(process.env.DATA_DIR!, 'private-fixture.json');
beforeAll(async () => {
  fs.writeFileSync(filename, JSON.stringify({ secret: sentinel }));
  vite = await createServer({
    root: process.cwd(),
    envDir: process.env.DATA_DIR,
    server: { host: '127.0.0.1', port: 0, hmr: false },
    logLevel: 'silent',
  });
  await vite.listen();
  base = `http://127.0.0.1:${(vite.httpServer!.address() as any).port}`;
}, 30000);
afterAll(async () => {
  await vite?.close();
});
describe('development server private filesystem boundary', () => {
  it.each([
    () => `/@fs${filename}`,
    () => `/@fs${filename}?raw`,
    () => `/@fs${filename}?raw&import`,
    () => '/data/firmalar.json',
    () => '/data/kullanicilar.json?raw',
    () => `/@fs${process.cwd()}/data/firmalar.json`,
    () => '/src/server/services/sessions.ts?raw',
    () => '/scripts/bootstrap-admin.ts?raw',
  ])('does not serve private data or server source (%#)', async (getPath) => {
    const response = await fetch(base + getPath());
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain(sentinel);
  });
  it('still serves the application entry and Vite client', async () => {
    for (const url of ['/', '/@vite/client']) expect((await fetch(base + url)).status).toBe(200);
  });
});
