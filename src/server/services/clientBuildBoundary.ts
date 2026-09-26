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
