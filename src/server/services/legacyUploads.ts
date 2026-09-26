import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeJsonAtomic } from './atomicJson';
import { tenantImageFilename } from './tenantImageNames';

const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_SNAPSHOT = 20 * 1024 * 1024;
const TENANT = /^[a-zA-Z0-9_-]{1,100}$/;
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const TABLES = ['siparisler', 'inbox_mesajlar'] as const;
type Table = (typeof TABLES)[number];
type Row = Record<string, any>;
export interface UploadSnapshot {
  schemaVersion: 1;
  companies: { id: string; onay_durumu: string }[];
  orders: Row[];
  inbox: Row[];
  legacyUploadMigrations?: { operationId: string; fingerprint: string; result: MigrationResult }[];
}
interface ImageReference {
  path: string[];
  offset: number;
  sourceUrl: string;
  name: string;
}
interface InventoryFile {
  name: string;
  sha256: string | null;
  bytes: number;
  mime: string | null;
  extension: 'png' | 'jpg' | 'webp' | null;
  status: 'supported' | 'unsupported' | 'unsafe' | 'oversize';
  note?: string;
}
interface SourceRecord {
  table: Table;
  id: string;
  tenantId: string | null;
  sourceHash: string;
  before: Row;
  references: ImageReference[];
}
export interface UploadMapping {
  sourceName: string;
  sourceSha256: string;
  tenantId: string;
}
export interface LegacyUploadManifest {
  version: 1;
  operationId: string;
  createdAt: string;
  source: { kind: 'file' | 'database'; snapshotHash: string; path?: string };
  companies: UploadSnapshot['companies'];
  files: InventoryFile[];
  records: SourceRecord[];
  mappings: UploadMapping[];
}
interface PreparedMapping {
  key: string;
  tenant_id: string;
  source_name: string;
  source_sha256: string;
  destination_name: string;
  destination_url: string;
  source_urls: string[];
}
interface ReferenceEdit {
  path: string[];
  mapping_key: string;
  prefix: string;
  source_url: string;
  suffix: string;
}
interface RecordChange {
  table: Table;
  id: string;
  tenant_id: string;
  before: Row;
  edits: ReferenceEdit[];
}
export interface MigrationResult {
  operationId: string;
  copied: number;
  rewrittenRows: number;
  rewrittenReferences: number;
  unmappedReferences: number;
  applied: boolean;
  retry: boolean;
}
export interface MigrationDatabase {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data?: any; error?: any }>;
}
export class UploadMigrationError extends Error {}
function fail(message: string): never {
  throw new UploadMigrationError(message);
}
const object = (value: unknown): value is Row =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
const rowHash = (value: unknown) => sha256(canonical(value));
const safeName = (name: unknown): name is string =>
  typeof name === 'string' &&
  !!name &&
  name !== '.' &&
  name !== '..' &&
  name.length <= 255 &&
  !/[\x00-\x1f\x7f/\\]/.test(name) &&
  path.basename(name) === name;
const concreteTenant = (id: unknown): id is string =>
  typeof id === 'string' && TENANT.test(id) && id !== 'all';

/** Explicit operator paths are allowed, but no component may be a symlink. */
export function assertNoSymlink(filename: string, allowMissing = false): string {
  const absolute = path.resolve(filename);
  const root = path.parse(absolute).root;
  let cursor = root;
  for (const part of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try {
      if (fs.lstatSync(cursor).isSymbolicLink())
        fail('Symbolic links are not allowed in migration paths.');
    } catch (error) {
      if (allowMissing && (error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
  }
  if (fs.existsSync(absolute) && fs.realpathSync(absolute) !== absolute)
    fail('Migration path must resolve to its exact real path.');
  return absolute;
}
function readSafe(filename: string, maximum: number): Buffer {
  const absolute = assertNoSymlink(filename);
  const descriptor = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size > maximum)
      fail('Migration source is not a regular file within the size limit.');
    const data = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor);
    if (data.length !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs)
      fail('Source file changed while it was being read.');
    assertNoSymlink(absolute);
    return data;
  } finally {
    fs.closeSync(descriptor);
  }
}
function hashOversizeFile(filename: string): { sha256: string; header: Buffer } {
  const absolute = assertNoSymlink(filename);
  const descriptor = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(descriptor);
    if (!before.isFile()) fail('Inventory source must be a regular file.');
    const hash = createHash('sha256');
    const chunk = Buffer.alloc(1024 * 1024);
    let offset = 0;
    let header = Buffer.alloc(0);
    while (offset < before.size) {
      const read = fs.readSync(
        descriptor,
        chunk,
        0,
        Math.min(chunk.length, before.size - offset),
        offset
      );
      if (!read) fail('Inventory source changed while hashing.');
      if (!offset) header = Buffer.from(chunk.subarray(0, Math.min(read, 16)));
      hash.update(chunk.subarray(0, read));
      offset += read;
    }
    const after = fs.fstatSync(descriptor);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
      fail('Inventory source changed while hashing.');
    assertNoSymlink(absolute);
    return { sha256: hash.digest('hex'), header };
  } finally {
    fs.closeSync(descriptor);
  }
}
function magic(data: Buffer): Pick<InventoryFile, 'mime' | 'extension'> {
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return { mime: 'image/png', extension: 'png' };
  if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255)
    return { mime: 'image/jpeg', extension: 'jpg' };
  if (
    data.length >= 12 &&
    data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP'
  )
    return { mime: 'image/webp', extension: 'webp' };
  return { mime: null, extension: null };
}
function validateSnapshot(value: unknown): asserts value is UploadSnapshot {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.companies) ||
    !Array.isArray(value.orders) ||
    !Array.isArray(value.inbox)
  )
    fail(
      'Expected an explicit schemaVersion:1 offline snapshot with companies, orders and inbox arrays.'
    );
  if (value.orders.length + value.inbox.length > 5000)
    fail('Snapshot exceeds 5000 records; split it explicitly.');
  const companies = new Set<string>();
  for (const company of value.companies) {
    if (
      !object(company) ||
      !concreteTenant(company.id) ||
      typeof company.onay_durumu !== 'string' ||
      companies.has(company.id)
    )
      fail('Snapshot company identity/status is invalid or duplicated.');
    companies.add(company.id);
  }
  for (const rows of [value.orders, value.inbox]) {
    const ids = new Set<string>();
    for (const row of rows) {
      if (!object(row) || typeof row.id !== 'string' || !row.id || ids.has(row.id))
        fail('Snapshot record IDs must be explicit and unique.');
      ids.add(row.id);
    }
  }
  if (value.legacyUploadMigrations !== undefined && !Array.isArray(value.legacyUploadMigrations))
    fail('Invalid migration receipt list.');
}
export function readUploadSnapshot(filename: string): {
  snapshot: UploadSnapshot;
  bytesHash: string;
} {
  const bytes = readSafe(filename, MAX_SNAPSHOT);
  const snapshot: unknown = JSON.parse(bytes.toString('utf8'));
  validateSnapshot(snapshot);
  return { snapshot, bytesHash: sha256(bytes) };
}
export async function readDatabaseUploadSnapshot(
  database: MigrationDatabase
): Promise<UploadSnapshot> {
  const result = await database.rpc('tomnap_legacy_upload_snapshot');
  if (result.error)
    fail('Database inventory failed; no local fallback or truncated inventory was used.');
  validateSnapshot(result.data);
  return result.data;
}

/** Inspect exact local URL tokens, including slash-escaped JSON in META strings.
 * Absolute external URLs and ambiguous traversal/encoded separators are ignored. */
function references(value: unknown): ImageReference[] {
  const found: ImageReference[] = [];
  const pending: { value: unknown; path: string[] }[] = [{ value, path: [] }];
  let count = 0;
  while (pending.length) {
    if (++count > 100000) fail('Source data is too complex.');
    const item = pending.pop()!;
    if (object(item.value) || Array.isArray(item.value)) {
      for (const [key, child] of Object.entries(item.value))
        pending.push({ value: child, path: [...item.path, key] });
    } else if (typeof item.value === 'string') {
      const matcher = /(?:\\?\/api)?\\?\/uploads\\?\/([^\s"'<>?#\\)]+)/g;
      for (const match of item.value.matchAll(matcher)) {
        const offset = match.index!;
        if (offset && !/[\s"'(<=>\[]/.test(item.value[offset - 1])) continue;
        let name: string;
        try {
          name = decodeURIComponent(match[1]);
        } catch {
          continue;
        }
        if (!safeName(name)) continue;
        if (/^t_[a-f0-9]{24}_[a-f0-9]{32}\.(png|jpg|webp)$/.test(name)) continue;
        found.push({ path: item.path, offset, sourceUrl: match[0], name });
      }
    }
  }
  return found.sort(
    (a, b) => canonical(a.path).localeCompare(canonical(b.path)) || a.offset - b.offset
  );
}
function inventory(directory: string): InventoryFile[] {
  const root = assertNoSymlink(directory);
  if (!fs.statSync(root).isDirectory()) fail('Source directory is invalid.');
  const names = fs.readdirSync(root).sort();
  if (names.length > 1000) fail('Inventory exceeds 1000 directory entries.');
  return names.map((name) => {
    const file = path.join(root, name);
    const stat = fs.lstatSync(file);
    if (!safeName(name) || !stat.isFile() || stat.isSymbolicLink())
      return {
        name,
        sha256: null,
        bytes: stat.size,
        mime: null,
        extension: null,
        status: 'unsafe',
        note: 'Not a safe regular file; never followed.',
      };
    if (stat.size > MAX_IMAGE) {
      const hashed = hashOversizeFile(file);
      return {
        name,
        sha256: hashed.sha256,
        bytes: stat.size,
        ...magic(hashed.header),
        status: 'oversize',
        note: 'Exceeds 10 MiB; streamed for inventory hash but excluded from apply.',
      };
    }
    const data = readSafe(file, MAX_IMAGE);
    const detected = magic(data);
    return {
      name,
      sha256: sha256(data),
      bytes: data.length,
      ...detected,
      status: detected.mime ? 'supported' : 'unsupported',
      ...(!detected.mime
        ? {
            note: 'Only JPEG/PNG/WebP magic bytes are supported. SVG requires a separate reviewed conversion.',
          }
        : {}),
    };
  });
}
export function planLegacyUploads(options: {
  sourceDirectory: string;
  snapshot: UploadSnapshot;
  source: LegacyUploadManifest['source'];
}): LegacyUploadManifest {
  validateSnapshot(options.snapshot);
  const records: SourceRecord[] = [];
  for (const [table, rows] of [
    ['siparisler', options.snapshot.orders],
    ['inbox_mesajlar', options.snapshot.inbox],
  ] as [Table, Row[]][]) {
    for (const row of rows) {
      const refs = references(row);
      if (!refs.length) continue;
      records.push({
        table,
        id: row.id,
        tenantId: concreteTenant(row.tenant_id) ? row.tenant_id : null,
        sourceHash: rowHash(row),
        before: structuredClone(row),
        references: refs,
      });
    }
  }
  return {
    version: 1,
    operationId: randomUUID(),
    createdAt: new Date().toISOString(),
    source: structuredClone(options.source),
    companies: structuredClone(options.snapshot.companies),
    files: inventory(options.sourceDirectory),
    records,
    mappings: [],
  };
}
export function writeMigrationManifest(filename: string, manifest: LegacyUploadManifest) {
  const target = assertNoSymlink(filename, true);
  if (target.split(path.sep).includes('public'))
    fail('Source manifests contain private records and cannot be written into public directories.');
  if (fs.existsSync(target)) fail('Manifest already exists; choose a new output path.');
  writeJsonAtomic(target, manifest);
}
export function readMigrationManifest(filename: string): LegacyUploadManifest {
  return JSON.parse(readSafe(filename, MAX_SNAPSHOT).toString('utf8'));
}
function leaf(row: any, segments: string[]): unknown {
  let value = row;
  for (const segment of segments) {
    if (!value || !Object.hasOwn(value, segment)) fail('Reference path does not exist.');
    value = value[segment];
  }
  return value;
}
function setLeaf(row: Row, segments: string[], value: string) {
  if (
    !segments.length ||
    ['id', 'tenant_id', 'tenantId'].includes(segments[0]) ||
    segments.some((part) => ['__proto__', 'prototype', 'constructor'].includes(part))
  )
    fail('Protected reference path.');
  let parent: any = row;
  for (const segment of segments.slice(0, -1)) parent = parent[segment];
  parent[segments[segments.length - 1]] = value;
}
function mappedUrl(mapping: PreparedMapping, source: string) {
  return source.includes('\\/')
    ? mapping.destination_url.replaceAll('/', '\\/')
    : mapping.destination_url;
}
function prepare(manifest: LegacyUploadManifest) {
  if (
    !object(manifest) ||
    manifest.version !== 1 ||
    !UUID.test(manifest.operationId) ||
    !object(manifest.source) ||
    !['file', 'database'].includes(manifest.source.kind) ||
    !SHA.test(manifest.source.snapshotHash) ||
    !Array.isArray(manifest.files) ||
    !Array.isArray(manifest.records) ||
    !Array.isArray(manifest.companies) ||
    !Array.isArray(manifest.mappings) ||
    !manifest.mappings.length
  )
    fail('Manifest needs at least one explicitly reviewed mapping.');
  if (manifest.mappings.length > 1000 || manifest.records.length > 5000)
    fail('Manifest exceeds migration limits.');
  const files = new Map(manifest.files.map((file) => [file.name, file]));
  if (files.size !== manifest.files.length) fail('Duplicate inventory filename.');
  const mappings: PreparedMapping[] = [];
  for (const mapping of manifest.mappings) {
    if (
      !object(mapping) ||
      !safeName(mapping.sourceName) ||
      !SHA.test(mapping.sourceSha256) ||
      !concreteTenant(mapping.tenantId)
    )
      fail('Every mapping must specify a safe sourceName, explicit sourceSha256 and tenantId.');
    const file = files.get(mapping.sourceName);
    if (
      !file ||
      file.sha256 !== mapping.sourceSha256 ||
      file.status !== 'supported' ||
      !['png', 'jpg', 'webp'].includes(file.extension!)
    )
      fail('Mapping does not match a supported inventoried file and SHA256.');
    if (
      !manifest.companies.some(
        (company) => company.id === mapping.tenantId && company.onay_durumu === 'AKTIF'
      )
    )
      fail('Mapped tenant must explicitly exist and be active in the source inventory.');
    const key = sha256(`${mapping.sourceName}\0${mapping.tenantId}`);
    if (mappings.some((item) => item.key === key)) fail('Duplicate source/tenant mapping.');
    const nonce = sha256(
      `${manifest.operationId}\0${mapping.tenantId}\0${mapping.sourceSha256}\0${mapping.sourceName}`
    ).slice(0, 32);
    const name = tenantImageFilename(mapping.tenantId, file.extension!, nonce);
    mappings.push({
      key,
      tenant_id: mapping.tenantId,
      source_name: mapping.sourceName,
      source_sha256: mapping.sourceSha256,
      destination_name: name,
      destination_url: `/uploads/${name}`,
      source_urls: [],
    });
  }
  const changes: RecordChange[] = [];
  let totalReferences = 0;
  const seen = new Set<string>();
  for (const record of manifest.records) {
    if (
      !object(record) ||
      !TABLES.includes(record.table) ||
      !object(record.before) ||
      record.before.id !== record.id ||
      record.sourceHash !== rowHash(record.before) ||
      record.tenantId !== (concreteTenant(record.before.tenant_id) ? record.before.tenant_id : null)
    )
      fail('Manifest source row hash or tenant identity is invalid.');
    const unique = `${record.table}\0${record.id}`;
    if (seen.has(unique)) fail('Duplicate source record.');
    seen.add(unique);
    const refs = references(record.before);
    if (canonical(refs) !== canonical(record.references))
      fail('Manifest references differ from exact source content.');
    totalReferences += refs.length;
    const rewritten = structuredClone(record.before);
    const edits: ReferenceEdit[] = [];
    for (const reference of [...refs].reverse()) {
      const mapping = mappings.find(
        (item) => item.source_name === reference.name && item.tenant_id === record.tenantId
      );
      if (!mapping) continue;
      const value = leaf(rewritten, reference.path);
      if (
        typeof value !== 'string' ||
        value.slice(reference.offset, reference.offset + reference.sourceUrl.length) !==
          reference.sourceUrl
      )
        fail('Exact source reference changed.');
      const prefix = value.slice(0, reference.offset),
        suffix = value.slice(reference.offset + reference.sourceUrl.length);
      edits.push({
        path: reference.path,
        mapping_key: mapping.key,
        prefix,
        source_url: reference.sourceUrl,
        suffix,
      });
      if (!mapping.source_urls.includes(reference.sourceUrl))
        mapping.source_urls.push(reference.sourceUrl);
      setLeaf(rewritten, reference.path, prefix + mappedUrl(mapping, reference.sourceUrl) + suffix);
    }
    if (edits.length)
      changes.push({
        table: record.table,
        id: record.id,
        tenant_id: record.tenantId!,
        before: record.before,
        edits,
      });
  }
  const fingerprint = rowHash({ mappings, changes });
  return { mappings, changes, fingerprint, totalReferences };
}
function rewrite(change: RecordChange, mappings: PreparedMapping[]): Row {
  const row = structuredClone(change.before);
  for (const edit of change.edits) {
    const mapping = mappings.find((item) => item.key === edit.mapping_key)!;
    if (leaf(row, edit.path) !== edit.prefix + edit.source_url + edit.suffix)
      fail('Source edit conflict.');
    setLeaf(row, edit.path, edit.prefix + mappedUrl(mapping, edit.source_url) + edit.suffix);
  }
  return row;
}
function copyVerified(source: string, destination: string, expectedHash: string): void {
  const bytes = readSafe(source, MAX_IMAGE);
  if (sha256(bytes) !== expectedHash || !magic(bytes).mime)
    fail('Source image hash or magic bytes changed.');
  assertNoSymlink(destination, true);
  if (fs.existsSync(destination)) {
    if (sha256(readSafe(destination, MAX_IMAGE)) !== expectedHash)
      fail('Destination exists with different content; it was not overwritten.');
    fs.chmodSync(destination, 0o600);
    return;
  }
  const temporary = path.join(
    path.dirname(destination),
    `.migration-${randomBytes(16).toString('hex')}.tmp`
  );
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    // link is atomic and refuses to overwrite any pre-existing destination.
    fs.linkSync(temporary, destination);
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code !== 'EEXIST' ||
      !fs.existsSync(destination) ||
      sha256(readSafe(destination, MAX_IMAGE)) !== expectedHash
    )
      throw error;
  } finally {
    if (descriptor !== undefined)
      try {
        fs.closeSync(descriptor);
      } catch {
        /* preserve write error */
      }
    try {
      fs.unlinkSync(temporary);
    } catch {
      /* private orphan is not referenced */
    }
  }
}

export async function applyLegacyUploads(
  manifest: LegacyUploadManifest,
  options: {
    sourceDirectory: string;
    destinationDirectory: string;
    snapshotPath?: string;
    database?: MigrationDatabase;
    apply?: boolean;
  }
): Promise<MigrationResult> {
  const prepared = prepare(manifest);
  const sourceRoot = assertNoSymlink(options.sourceDirectory);
  const destinationRoot = assertNoSymlink(options.destinationDirectory, true);
  if (sourceRoot === destinationRoot || destinationRoot.split(path.sep).includes('public'))
    fail('Destination must be a distinct private uploads directory.');
  for (const mapping of prepared.mappings) {
    const bytes = readSafe(path.join(sourceRoot, mapping.source_name), MAX_IMAGE);
    const detected = magic(bytes);
    if (
      sha256(bytes) !== mapping.source_sha256 ||
      !detected.mime ||
      !mapping.destination_name.endsWith(`.${detected.extension}`)
    )
      fail('Source file SHA256 or magic no longer matches the reviewed mapping.');
    const destination = path.join(destinationRoot, mapping.destination_name);
    if (
      fs.existsSync(destination) &&
      sha256(readSafe(destination, MAX_IMAGE)) !== mapping.source_sha256
    )
      fail('An existing destination has different content.');
  }
  const result: MigrationResult = {
    operationId: manifest.operationId,
    copied: prepared.mappings.length,
    rewrittenRows: prepared.changes.length,
    rewrittenReferences: prepared.changes.reduce((n, change) => n + change.edits.length, 0),
    unmappedReferences:
      prepared.totalReferences - prepared.changes.reduce((n, change) => n + change.edits.length, 0),
    applied: false,
    retry: false,
  };
  const verifyCommittedCopies = () => {
    for (const mapping of prepared.mappings) {
      const filename = path.join(destinationRoot, mapping.destination_name);
      if (!fs.existsSync(filename))
        fail(
          'Committed references have a missing private copy; repeat --apply on persistent storage to repair it.'
        );
      if (sha256(readSafe(filename, MAX_IMAGE)) !== mapping.source_sha256)
        fail('Private copy verification failed; migration success cannot be confirmed.');
    }
  };
  const copyAll = () => {
    assertNoSymlink(destinationRoot, true);
    fs.mkdirSync(destinationRoot, { recursive: true, mode: 0o700 });
    assertNoSymlink(destinationRoot);
    for (const mapping of prepared.mappings)
      copyVerified(
        path.join(sourceRoot, mapping.source_name),
        path.join(destinationRoot, mapping.destination_name),
        mapping.source_sha256
      );
    // Verify every published path again before any reference can commit.
    verifyCommittedCopies();
  };
  if (manifest.source.kind === 'database') {
    if (!options.database || options.snapshotPath)
      fail('Database manifest requires an explicit database adapter.');
    const invoke = async (dryRun: boolean) => {
      const response = await options.database!.rpc('tomnap_migrate_legacy_uploads', {
        p_operation_id: manifest.operationId,
        p_mappings: prepared.mappings,
        p_changes: prepared.changes,
        p_dry_run: dryRun,
      });
      if (response.error)
        fail(
          'Database migration failed or its outcome is unknown. Keep the manifest and retry unchanged; private copies may remain.'
        );
      if (
        !object(response.data) ||
        response.data.operationId !== manifest.operationId ||
        typeof response.data.applied !== 'boolean' ||
        typeof response.data.retry !== 'boolean' ||
        response.data.rewrittenRows !== result.rewrittenRows ||
        response.data.rewrittenReferences !== result.rewrittenReferences
      )
        fail('Database migration receipt could not be verified; retry the same manifest.');
      return response.data;
    };
    // Validate current tenant status and row CAS before producing private copies.
    const preview = await invoke(true);
    if (!options.apply) {
      if (preview.applied) verifyCommittedCopies();
      return { ...result, ...preview };
    }
    copyAll();
    const receipt = preview.applied ? preview : await invoke(false);
    if (!receipt.applied) fail('Database did not confirm a committed migration.');
    return { ...result, ...receipt };
  }
  if (
    options.database ||
    !options.snapshotPath ||
    path.resolve(options.snapshotPath) !== manifest.source.path
  )
    fail('File mode requires the exact explicitly selected offline snapshot path.');
  const target = assertNoSymlink(options.snapshotPath);
  const inspect = () => {
    const current = readUploadSnapshot(target);
    const receipt = current.snapshot.legacyUploadMigrations?.find(
      (item) => item.operationId === manifest.operationId
    );
    if (receipt) {
      if (receipt.fingerprint !== prepared.fingerprint)
        fail('Operation ID was used for a different mapping.');
      return { ...current, receipt };
    }
    if (current.bytesHash !== manifest.source.snapshotHash)
      fail('Offline snapshot changed after planning; no references were rewritten.');
    for (const mapping of prepared.mappings)
      if (
        !current.snapshot.companies.some(
          (company) => company.id === mapping.tenant_id && company.onay_durumu === 'AKTIF'
        )
      )
        fail('Mapped tenant is no longer active.');
    for (const change of prepared.changes) {
      const pool = change.table === 'siparisler' ? current.snapshot.orders : current.snapshot.inbox;
      const row = pool.find((item) => item.id === change.id && item.tenant_id === change.tenant_id);
      if (!row || canonical(row) !== canonical(change.before))
        fail('Offline source row does not match the reviewed manifest.');
    }
    return { ...current, receipt: undefined };
  };
  const preview = inspect();
  if (!options.apply) {
    if (preview.receipt) verifyCommittedCopies();
    return preview.receipt ? { ...preview.receipt.result, retry: true } : result;
  }
  const lock = `${target}.legacy-uploads.lock`;
  assertNoSymlink(lock, true);
  const lockDescriptor = fs.openSync(lock, 'wx', 0o600);
  try {
    const current = inspect();
    copyAll();
    if (current.receipt) return { ...current.receipt.result, retry: true };
    // A separately edited offline file must not be overwritten while copying.
    if (readUploadSnapshot(target).bytesHash !== current.bytesHash)
      fail('Offline snapshot changed during copying. Private copies remain unreferenced.');
    for (const change of prepared.changes) {
      const pool = change.table === 'siparisler' ? current.snapshot.orders : current.snapshot.inbox;
      const index = pool.findIndex((row) => row.id === change.id);
      pool[index] = rewrite(change, prepared.mappings);
    }
    result.applied = true;
    current.snapshot.legacyUploadMigrations = [
      ...(current.snapshot.legacyUploadMigrations || []),
      { operationId: manifest.operationId, fingerprint: prepared.fingerprint, result },
    ];
    writeJsonAtomic(target, current.snapshot);
    return result;
  } finally {
    try {
      fs.closeSync(lockDescriptor);
    } catch {
      /* preserve commit outcome */
    }
    try {
      fs.unlinkSync(lock);
    } catch {
      /* explicit stale lock needs operator review */
    }
  }
}
