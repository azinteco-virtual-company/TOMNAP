import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertNoSymlink, sha256 } from '../src/server/services/legacyUploads';
import { inspectImage } from '../src/server/services/imageValidation';
import { MAX_IMAGE_BYTES } from '../src/server/services/publicFetch';

// Keep planning independent of configured database credentials and remote clients.
const CANONICAL_NAME = /^t_[a-f0-9]{24}_[a-f0-9]{32}\.(png|jpg|webp)$/;
const BUCKET = 'tomnap-private-images';
const MAX_FILES = 10000;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
interface FileEntry {
  name: string;
  sha256: string;
  bytes: number;
  mimeType: string;
}
export interface PrivateUploadManifest {
  version: 1;
  sourceDirectory: string;
  destinationBucket: typeof BUCKET;
  createdAt: string;
  files: FileEntry[];
}
export interface PrivateUploadDestination {
  verifyPrivateBucket(): Promise<void>;
  readPrivateImage(name: string): Promise<{ buffer: Buffer }>;
  writePrivateImage(name: string, bytes: Buffer): Promise<void>;
}
interface FileResult extends FileEntry {
  status: 'pending' | 'verified-upload' | 'verified-existing' | 'failed';
}
function readSafe(filename: string, limit: number): Buffer {
  const absolute = assertNoSymlink(filename);
  const descriptor = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(descriptor);
    if (!before.isFile() || before.size > limit)
      throw new Error('Source must be a regular file within the size limit.');
    const bounded = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < bounded.length) {
      const count = fs.readSync(descriptor, bounded, length, bounded.length - length, null);
      if (!count) break;
      length += count;
    }
    const bytes = bounded.subarray(0, length);
    const after = fs.fstatSync(descriptor);
    const current = fs.lstatSync(absolute);
    if (
      bytes.length !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      current.ino !== before.ino ||
      current.dev !== before.dev
    )
      throw new Error('Source changed during read.');
    assertNoSymlink(absolute);
    return bytes;
  } finally {
    fs.closeSync(descriptor);
  }
}
function fileEntry(directory: string, name: string): FileEntry {
  if (!CANONICAL_NAME.test(name))
    throw new Error('Source contains a noncanonical entry; resolve legacy ownership separately.');
  const bytes = readSafe(path.join(directory, name), MAX_IMAGE_BYTES);
  const image = inspectImage(bytes);
  if (!name.endsWith('.' + image.ext)) throw new Error('Image magic does not match its filename.');
  return { name, sha256: sha256(bytes), bytes: bytes.length, mimeType: image.mimeType };
}
function inventory(directory: string): FileEntry[] {
  assertNoSymlink(directory);
  if (!fs.statSync(directory).isDirectory()) throw new Error('Source must be a directory.');
  const names = fs.readdirSync(directory).sort();
  if (names.length > MAX_FILES) throw new Error('Source exceeds the 10000-file migration limit.');
  return names.map((name) => fileEntry(directory, name));
}
function sameInventory(manifest: PrivateUploadManifest) {
  if (JSON.stringify(inventory(manifest.sourceDirectory)) !== JSON.stringify(manifest.files))
    throw new Error(
      'Source inventory changed (new, missing or modified files); create and review a new manifest.'
    );
}
export function planPrivateUploads(sourceDirectory: string): PrivateUploadManifest {
  const source = assertNoSymlink(sourceDirectory);
  return {
    version: 1,
    sourceDirectory: source,
    destinationBucket: BUCKET,
    createdAt: new Date().toISOString(),
    files: inventory(source),
  };
}
export function writePrivateUploadManifest(
  filename: string,
  manifest: PrivateUploadManifest
): string {
  const absolute = assertNoSymlink(filename, true);
  const relative = path.relative(manifest.sourceDirectory, absolute);
  if (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
    throw new Error('Keep the manifest outside the upload source directory.');
  // Parent must already exist. Exclusive creation avoids replacing a reviewed manifest.
  const descriptor = fs.openSync(absolute, 'wx', 0o600);
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  return sha256(bytes);
}
function validateManifest(value: any): asserts value is PrivateUploadManifest {
  if (
    !value ||
    value.version !== 1 ||
    value.destinationBucket !== BUCKET ||
    typeof value.sourceDirectory !== 'string' ||
    !path.isAbsolute(value.sourceDirectory) ||
    path.resolve(value.sourceDirectory) !== value.sourceDirectory ||
    typeof value.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !Array.isArray(value.files) ||
    value.files.length > MAX_FILES ||
    Object.keys(value).sort().join() !== 'createdAt,destinationBucket,files,sourceDirectory,version'
  )
    throw new Error('Invalid private upload manifest.');
  let previous = '';
  for (const file of value.files) {
    if (
      !file ||
      typeof file.name !== 'string' ||
      !CANONICAL_NAME.test(file.name) ||
      file.name <= previous ||
      typeof file.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 1 ||
      file.bytes > MAX_IMAGE_BYTES ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.mimeType) ||
      Object.keys(file).sort().join() !== 'bytes,mimeType,name,sha256'
    )
      throw new Error('Invalid, duplicate or unsorted manifest file.');
    previous = file.name;
  }
}
export function readPrivateUploadManifest(
  filename: string,
  expectedSha256: string
): PrivateUploadManifest {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256))
    throw new Error('An explicit manifest SHA256 is required.');
  const bytes = readSafe(filename, MAX_MANIFEST_BYTES);
  if (sha256(bytes) !== expectedSha256) throw new Error('Reviewed manifest SHA256 does not match.');
  let manifest: unknown;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('Invalid private upload manifest JSON.');
  }
  validateManifest(manifest);
  // Normalize the property order used by exact inventory comparisons.
  manifest.files = manifest.files.map((file: FileEntry) => ({
    name: file.name,
    sha256: file.sha256,
    bytes: file.bytes,
    mimeType: file.mimeType,
  }));
  return manifest;
}
export async function applyPrivateUploads(
  manifest: PrivateUploadManifest,
  options: { apply: boolean; destination?: PrivateUploadDestination }
) {
  validateManifest(manifest);
  sameInventory(manifest);
  const results: FileResult[] = manifest.files.map((file) => ({ ...file, status: 'pending' }));
  if (!options.apply)
    return { applied: false, completed: false, inventoryVerified: true, files: results };
  if (process.env.UPLOAD_STORAGE_BACKEND !== 'supabase')
    throw new Error('Apply requires UPLOAD_STORAGE_BACKEND=supabase in this maintenance process.');
  const destination =
    options.destination ?? (await import('../src/server/services/privateImageStorage'));
  await destination.verifyPrivateBucket();
  let failure: string | undefined;
  for (const result of results) {
    try {
      const source = readSafe(path.join(manifest.sourceDirectory, result.name), MAX_IMAGE_BYTES);
      if (sha256(source) !== result.sha256) throw new Error('Source changed after preflight.');
      let remote: Buffer | undefined;
      try {
        remote = (await destination.readPrivateImage(result.name)).buffer;
      } catch (error: any) {
        if (error?.status !== 404) throw error;
      }
      if (remote) {
        if (sha256(remote) !== result.sha256)
          throw new Error('Destination exists with different bytes.');
        result.status = 'verified-existing';
        continue;
      }
      // An ambiguous upload response is recoverable only by reading the exact expected bytes.
      try {
        await destination.writePrivateImage(result.name, source);
      } catch {
        /* Verify below; never overwrite an existing object. */
      }
      const downloaded = (await destination.readPrivateImage(result.name)).buffer;
      if (sha256(downloaded) !== result.sha256) throw new Error('Destination verification failed.');
      result.status = 'verified-upload';
    } catch {
      result.status = 'failed';
      failure =
        'Copy or verification failed. Inspect the destination; unchanged manifests can be retried safely.';
      break;
    }
  }
  try {
    sameInventory(manifest);
  } catch {
    failure =
      'Source inventory changed during apply. Keep uploads paused and review a new manifest.';
  }
  return {
    applied: true,
    completed: !failure,
    files: results,
    ...(failure ? { error: failure } : {}),
  };
}

export const PRIVATE_UPLOAD_HELP = `Migrate already tenant-owned private uploads to Supabase Storage.

Plan without network or cloud writes (source must contain canonical images only):
  tsx scripts/migrate-private-uploads.ts plan --source-dir DIR --out MANIFEST
Validate the exact reviewed manifest without cloud writes (default):
  tsx scripts/migrate-private-uploads.ts apply --manifest MANIFEST --sha256 SHA256
Copy only after review, with UPLOAD_STORAGE_BACKEND=supabase for this process:
  tsx scripts/migrate-private-uploads.ts apply --manifest MANIFEST --sha256 SHA256 --apply

Pause application upload writes before the final inventory and throughout apply.
Keep serving from the old backend until EVERY file is verified, then switch the
application backend to supabase. Plan/apply read the explicit source directory;
they never delete originals or change tenant ownership or database references.
Provision the private bucket first. The configured service-role connection is
required only for apply. Retries use the same names without upsert and require
matching downloaded SHA256. Missing/new/modified files require a new review.
Resolve noncanonical/legacy files with the separate legacy ownership tool first.
Symlinks, non-images and files above 10 MiB are refused. Use persistent local
storage for the source and keep the 0600 manifest outside that directory.
The maintenance pause is an operational requirement; this CLI cannot lock other
processes. This does not provision cloud storage or migrate Vercel ephemeral data.
`;
export async function privateUploadsMain(argv: string[]) {
  if (!argv.length || ['--help', '-h', 'help'].includes(argv[0])) {
    console.log(PRIVATE_UPLOAD_HELP);
    return;
  }
  const command = argv[0];
  if (!['plan', 'apply'].includes(command)) throw new Error('Expected plan or apply; use --help.');
  const allowed = new Set(
    command === 'plan' ? ['--source-dir', '--out'] : ['--manifest', '--sha256', '--apply']
  );
  const flags = new Map<string, string | boolean>();
  for (let index = 1; index < argv.length; index++) {
    const flag = argv[index];
    if (!allowed.has(flag) || flags.has(flag)) throw new Error('Unknown or duplicate flag.');
    if (flag === '--apply') flags.set(flag, true);
    else {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('Missing flag value.');
      flags.set(flag, value);
    }
  }
  const required = (flag: string) => {
    const value = flags.get(flag);
    if (typeof value !== 'string') throw new Error(`${flag} is required.`);
    return value;
  };
  if (command === 'plan') {
    const manifest = planPrivateUploads(required('--source-dir'));
    const filename = path.resolve(required('--out'));
    const hash = writePrivateUploadManifest(filename, manifest);
    console.log(
      JSON.stringify({
        manifest: filename,
        sha256: hash,
        files: manifest.files.length,
        applied: false,
      })
    );
    return;
  }
  const manifest = readPrivateUploadManifest(required('--manifest'), required('--sha256'));
  const result = await applyPrivateUploads(manifest, { apply: flags.get('--apply') === true });
  console.log(JSON.stringify(result));
  if (result.applied && !result.completed) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  privateUploadsMain(process.argv.slice(2)).catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
