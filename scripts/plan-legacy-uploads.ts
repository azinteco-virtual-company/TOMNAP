import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  applyLegacyUploads,
  planLegacyUploads,
  readDatabaseUploadSnapshot,
  readMigrationManifest,
  readUploadSnapshot,
  sha256,
  writeMigrationManifest,
  type MigrationDatabase,
} from '../src/server/services/legacyUploads';

export const LEGACY_UPLOAD_HELP = `Legacy upload ownership migration (no owner is inferred)

Plan an explicit offline snapshot:
  tsx scripts/plan-legacy-uploads.ts plan --source-dir DIR --snapshot FILE --out MANIFEST
Plan the configured database using a bounded consistent inventory RPC:
  tsx scripts/plan-legacy-uploads.ts plan --source-dir DIR --database --out MANIFEST

Review the manifest. Fill mappings with explicit sourceName, sourceSha256 and
tenantId; one entry per source/tenant. Source companies must be AKTIF. SVG and
unreadable/unsafe files are reported and cannot be applied. No mapping is added
automatically, even when an image currently appears in only one tenant.

Dry-run (default; no files or records changed):
  tsx scripts/plan-legacy-uploads.ts apply --manifest FILE --source-dir DIR --snapshot FILE --destination-dir DIR
  tsx scripts/plan-legacy-uploads.ts apply --manifest FILE --source-dir DIR --database --destination-dir DIR
Add --apply only after reviewing the exact mapping. Keep the same manifest and
operationId for retries. Originals are never deleted. Private orphan copies may
remain after a failed/ambiguous write; an unchanged retry reuses verified copies.

Offline snapshot schema: {schemaVersion:1, companies:[{id,onay_durumu:"AKTIF"}],
orders:[{id,tenant_id,...}], inbox:[{id,tenant_id,...}]}. File mode rewrites that
OFFLINE export only; it does not persist the running server's in-memory orders.
Stop other writers to the offline file. A later import is a separate operation.

Destination must equal configured UPLOADS_DIR (default DATA_DIR/uploads) and be
private, persistent storage shared by the serving application. Vercel/ephemeral
serverless filesystems cannot host this migration; apply is refused on Vercel.
This tool does not provision cloud storage or delete/convert legacy originals.
Manifests contain source records; keep them private (created with mode 0600).
`;

function parseArguments(argv: string[]) {
  const command = argv[0];
  if (!command || ['--help', '-h', 'help'].includes(command))
    return { command: 'help', flags: new Map<string, string | boolean>() };
  if (!['plan', 'apply'].includes(command)) throw new Error('Expected plan or apply; use --help.');
  const flags = new Map<string, string | boolean>();
  const boolean = new Set(['--database', '--apply']);
  const allowed = new Set([
    '--source-dir',
    '--snapshot',
    '--out',
    '--manifest',
    '--destination-dir',
    ...boolean,
  ]);
  for (let index = 1; index < argv.length; index++) {
    const flag = argv[index];
    if (!allowed.has(flag) || flags.has(flag))
      throw new Error('Unknown or duplicate option; use --help.');
    if (boolean.has(flag)) flags.set(flag, true);
    else {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
      flags.set(flag, value);
    }
  }
  return { command, flags };
}
export async function legacyUploadsMain(argv: string[]): Promise<void> {
  const { command, flags } = parseArguments(argv);
  if (command === 'help') {
    console.log(LEGACY_UPLOAD_HELP);
    return;
  }
  const requiredPath = (flag: string) => {
    const value = flags.get(flag);
    if (typeof value !== 'string') throw new Error(`${flag} is required.`);
    return path.resolve(value);
  };
  const sourceDirectory = requiredPath('--source-dir');
  const usingDatabase = flags.get('--database') === true;
  if (usingDatabase === flags.has('--snapshot'))
    throw new Error('Choose exactly one explicit --snapshot or --database source.');
  const snapshotPath = usingDatabase ? undefined : requiredPath('--snapshot');
  let database: MigrationDatabase | undefined;
  if (usingDatabase) {
    const { supabase } = await import('../src/server/services/supabase');
    if (!supabase)
      throw new Error(
        'Database mode requires the configured service-role connection; there is no file fallback.'
      );
    database = supabase;
  }
  if (command === 'plan') {
    if (flags.has('--apply') || flags.has('--manifest') || flags.has('--destination-dir'))
      throw new Error('Apply options cannot be used with plan.');
    const output = requiredPath('--out');
    const loaded = snapshotPath ? readUploadSnapshot(snapshotPath) : undefined;
    const snapshot = loaded?.snapshot || (await readDatabaseUploadSnapshot(database!));
    const manifest = planLegacyUploads({
      sourceDirectory,
      snapshot,
      source: snapshotPath
        ? { kind: 'file', path: snapshotPath, snapshotHash: loaded!.bytesHash }
        : { kind: 'database', snapshotHash: sha256(JSON.stringify(snapshot)) },
    });
    writeMigrationManifest(output, manifest);
    console.log(
      JSON.stringify({
        manifest: output,
        files: manifest.files.length,
        sourceRecords: manifest.records.length,
        supportedFiles: manifest.files.filter((file) => file.status === 'supported').length,
        mappings: 0,
        next: 'Review exact references and add explicit tenant/sourceSha256 mappings.',
      })
    );
    return;
  }
  if (flags.has('--out')) throw new Error('--out is a plan option.');
  const manifest = readMigrationManifest(requiredPath('--manifest'));
  const destinationDirectory = requiredPath('--destination-dir');
  const { UPLOADS_DIR } = await import('../src/server/config');
  if (destinationDirectory !== path.resolve(UPLOADS_DIR))
    throw new Error('Destination must equal configured private UPLOADS_DIR.');
  if (flags.get('--apply') === true && process.env.VERCEL)
    throw new Error(
      'Apply requires a persistent writable uploads volume; Vercel filesystem migration is unsupported.'
    );
  const result = await applyLegacyUploads(manifest, {
    sourceDirectory,
    destinationDirectory,
    snapshotPath,
    database,
    apply: flags.get('--apply') === true,
  });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  legacyUploadsMain(process.argv.slice(2)).catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
