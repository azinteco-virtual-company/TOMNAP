import fs from 'node:fs';
import path from 'node:path';

/** Server artifacts and private inputs never belong in the public client build. */
export function isPrivateBuildPath(filename: string): boolean {
  const normalized = path.posix.normalize(filename.replace(/\\/g, '/')).toLowerCase();
  const parts = normalized.split('/').filter(Boolean);
  return (
    parts.some((part) =>
      [
        'build',
        'api',
        'src',
        'server',
        'scripts',
        'tests',
        'data',
        'uploads',
        'node_modules',
        '.git',
        '.vercel',
      ].includes(part)
    ) ||
    parts.some((part) => part === '.env' || part.startsWith('.env.')) ||
    /\.(?:cjs|mjs|map|ts|tsx|jsx|pem|key|sql)$/i.test(normalized) ||
    /(?:^|\/)server(?:[.-][^/]*)?\.js$/i.test(normalized)
  );
}

export function assertClientBuildSafe(directory: string): void {
  const root = path.resolve(directory);
  const rootStat = fs.lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory())
    throw new Error('Client build must be a real directory.');
  const visit = (relative: string) => {
    for (const name of fs.readdirSync(path.join(root, relative))) {
      const entry = path.join(relative, name);
      const stat = fs.lstatSync(path.join(root, entry));
      if (
        stat.isSymbolicLink() ||
        (!stat.isDirectory() && isPrivateBuildPath(entry)) ||
        (!stat.isDirectory() && !stat.isFile())
      )
        throw new Error(`Private or unsafe artifact in client build: ${entry}`);
      if (stat.isDirectory()) visit(entry);
    }
  };
  visit('');
  if (!fs.statSync(path.join(root, 'index.html')).isFile())
    throw new Error('Client entry is missing.');
}

/**
 * The service worker answers address-bar navigations with the app shell. API and upload
 * URLs must stay with the network (Deploy 2 finding 3): an opened /uploads/ link or an
 * /api/ address must never show the app. Every NavigationRoute needs a denylist that
 * covers both and still lets the app through. No sw.js, or no fallback, is fine.
 */
export function assertServiceWorkerNavigation(directory: string): void {
  const file = path.join(path.resolve(directory), 'sw.js');
  if (!fs.existsSync(file)) return;
  const source = fs.readFileSync(file, 'utf8');
  for (const route of source.matchAll(/NavigationRoute\(/g)) {
    const tail = source.slice(route.index, route.index + 600);
    const list = /denylist:\[([^\]]*)\]/.exec(tail)?.[1] ?? '';
    const patterns = [...list.matchAll(/\/((?:\\\/|[^/])+)\/([a-z]*)/g)].map(
      (match) => new RegExp(match[1], match[2])
    );
    const denied = (url: string) => patterns.some((pattern) => pattern.test(url));
    if (
      !['/api/v2/durum', '/uploads/t_ab12_cd34.png'].every(denied) ||
      ['/', '/app', '/v2/', '/gorsel-giris'].some(denied)
    )
      throw new Error(
        'The service worker answers API or upload URLs with the app shell; set workbox.navigateFallbackDenylist.'
      );
  }
}
