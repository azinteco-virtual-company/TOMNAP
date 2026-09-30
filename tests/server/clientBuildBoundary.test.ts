import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, mountClientAssets } from '../../src/server/index';
import {
  assertClientBuildSafe,
  assertServiceWorkerNavigation,
} from '../../src/server/services/clientBuildBoundary';

const root = path.join(process.env.DATA_DIR!, 'client-build');
const privateMarker = 'PRIVATE-SERVER-SOURCE-SENTINEL';
function write(relative: string, contents = privateMarker) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}
beforeEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  write('index.html', '<div>PUBLIC-CLIENT-ENTRY</div>');
  write('assets/app.js', 'console.log("PUBLIC-CLIENT-SCRIPT")');
});

describe('production client/server artifact boundary', () => {
  it.each([
    '/server.cjs',
    '/server.cjs.map',
    '/server.js',
    '/%73erver.cjs',
    '/server.cjs%2emap',
    '/SERVER.CJS',
    '/build/server.cjs',
    '/build/server.cjs.map',
    '/%62uild/server.cjs',
    '/build%2Fserver.cjs',
    '/build/../server.cjs',
    '/src/server/config.ts',
    '/assets/server.js',
    '/assets/app.js.map',
  ])('never serves server source anonymously even when stale artifacts exist: %s', async (url) => {
    for (const file of [
      'server.cjs',
      'server.cjs.map',
      'server.js',
      'build/server.cjs',
      'build/server.cjs.map',
      'src/server/config.ts',
      'assets/server.js',
      'assets/app.js.map',
    ])
      write(file);
    const app = createApp();
    mountClientAssets(app, root);
    const response = await request(app).get(url);
    expect(response.status).toBe(404);
    expect(response.text).not.toContain(privateMarker);
    expect(response.text).not.toContain('PUBLIC-CLIENT-ENTRY');
  });
  it('denies HEAD source requests while retaining the health probe and client application', async () => {
    write('server.cjs');
    const app = createApp();
    mountClientAssets(app, root);
    expect((await request(app).head('/server.cjs')).status).toBe(404);
    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await request(app).get('/siparisler')).text).toContain('PUBLIC-CLIENT-ENTRY');
    expect((await request(app).get('/assets/app.js')).text).toContain('PUBLIC-CLIENT-SCRIPT');
  });
  it.each([
    'server.cjs',
    'server.cjs.map',
    'server.js',
    'assets/server.js',
    'assets/entry.js.map',
    'build/server.cjs',
    'api/index.js',
    'data/identity.json',
    'uploads/image.png',
    '.env.production',
  ])('fails the deployment artifact check for %s', (file) => {
    write(file);
    expect(() => assertClientBuildSafe(root)).toThrow(/Private or unsafe artifact/);
  });
  it('rejects symlinks instead of following a private source under a public-looking name', () => {
    const privateFile = path.join(process.env.DATA_DIR!, 'private-source.js');
    fs.writeFileSync(privateFile, privateMarker);
    fs.symlinkSync(privateFile, path.join(root, 'assets', 'innocent.js'));
    expect(() => assertClientBuildSafe(root)).toThrow(/unsafe artifact/);
  });
  it('accepts the browser bundle and harmless empty upload directory', () => {
    fs.mkdirSync(path.join(root, 'uploads'));
    write('sw.js', '/* client service worker */');
    write('manifest.webmanifest', '{}');
    expect(() => assertClientBuildSafe(root)).not.toThrow();
  });
});

// Deploy 2 finding 3: the service worker answered every address-bar navigation with the
// app shell, API and upload URLs included (an opened /uploads/ link showed the app).
describe('service worker navigation fallback', () => {
  // The minified text workbox writes (String.raw keeps the regex escapes).
  const sw = (options: string) =>
    String.raw`e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("index.html")` +
    options +
    String.raw`)),e.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i,new e.CacheFirst({}),"GET")`;

  it('fails when the app-shell fallback also answers API or upload URLs', () => {
    write('sw.js', sw(''));
    expect(() => assertServiceWorkerNavigation(root)).toThrow(/navigateFallbackDenylist/);
    write('sw.js', sw(String.raw`,{denylist:[/^\/api\//]}`));
    expect(() => assertServiceWorkerNavigation(root)).toThrow(/navigateFallbackDenylist/);
    // Denying the app itself is no fix either.
    write('sw.js', sw(String.raw`,{denylist:[/^\//]}`));
    expect(() => assertServiceWorkerNavigation(root)).toThrow(/navigateFallbackDenylist/);
  });

  it('accepts a fallback that leaves /api/ and /uploads/ to the network, or none at all', () => {
    write('sw.js', sw(String.raw`,{denylist:[/^\/api\//,/^\/uploads\//]}`));
    expect(() => assertServiceWorkerNavigation(root)).not.toThrow();
    write('sw.js', '/* no navigation route */');
    expect(() => assertServiceWorkerNavigation(root)).not.toThrow();
    fs.rmSync(path.join(root, 'sw.js'));
    expect(() => assertServiceWorkerNavigation(root)).not.toThrow();
  });

  // CI builds before the unit tests, so this checks the real configuration there.
  it.skipIf(!fs.existsSync(path.resolve('dist', 'sw.js')))('holds for the real build', () => {
    expect(() => assertServiceWorkerNavigation(path.resolve('dist'))).not.toThrow();
  });
});
