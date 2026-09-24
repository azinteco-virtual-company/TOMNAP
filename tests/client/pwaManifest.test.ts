import fs from 'node:fs';
import path from 'node:path';
import { resolveConfig, type Plugin } from 'vite';
import { describe, expect, it } from 'vitest';
import type { VitePluginPWAAPI } from 'vite-plugin-pwa';

const root = path.resolve(__dirname, '../..');

// The manifest and link tag exactly as `vite build` emits them, without a full build.
async function builtPwa() {
  const config = await resolveConfig(
    { root, configFile: path.join(root, 'vite.config.ts'), logLevel: 'silent' },
    'build',
    'production'
  );
  const plugin = config.plugins.find((item) => item.name === 'vite-plugin-pwa') as
    (Plugin & { api: VitePluginPWAAPI }) | undefined;
  if (!plugin) throw new Error('vite-plugin-pwa is not active in the build config');
  const asset = plugin.api.generateBundle({})?.['manifest.webmanifest'];
  if (!asset || asset.type !== 'asset') throw new Error('manifest.webmanifest was not emitted');
  return {
    manifest: JSON.parse(String(asset.source)) as Record<string, unknown>,
    link: plugin.api.webManifestData()?.toLinkTag(),
  };
}

describe('PWA manifest', () => {
  it('carries the TOMNAP brand in the manifest the build emits', async () => {
    const { manifest } = await builtPwa();
    expect(manifest).toMatchObject({
      name: 'TOMNAP — Global Cross-Border Commerce & Parcel Logistics Platform',
      short_name: 'TOMNAP',
      description:
        'Global Cross-Border Commerce & Parcel Logistics Platform (Track, Order, Manage, Navigate, Automate, Parcel).',
      lang: 'az',
      start_url: '/',
      display: 'standalone',
    });
    expect(JSON.stringify(manifest)).not.toMatch(/Kanada|KanadaBaku/);
  });

  it('leaves exactly one manifest link in the built index.html', async () => {
    const { link } = await builtPwa();
    // VitePWA injects this tag; index.html itself must not add a second one.
    expect(link).toBe('<link rel="manifest" href="/manifest.webmanifest">');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    expect(html).not.toMatch(/rel=["']manifest["']/);
  });
});
