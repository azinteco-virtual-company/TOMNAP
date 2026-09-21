/** Offline by default. Never prints credentials; preserves the source for review/recovery. */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { migrateCargoSnapshot } from './lib/migrateCargo';
import { supabase } from '../src/server/services/supabase';
const argv = process.argv.slice(2);
const flags = new Set(['--apply', '--database', '--allow-legacy-default', '--allow-plaintext']);
const values = new Set(['--input', '--output', '--expected-sha', '--legacy-secret-env']);
const args = new Map<string, string>();
try {
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (args.has(key) || (!flags.has(key) && !values.has(key)))
      throw new Error('Invalid or duplicate option');
    if (values.has(key) && (!argv[i + 1] || argv[i + 1].startsWith('--')))
      throw new Error('Missing option value');
    args.set(key, flags.has(key) ? 'true' : argv[++i]);
  }
  if (!args.has('--input') || (args.has('--database') && args.has('--output')))
    throw new Error('Use --input PATH with --output NEW_PATH or --database');
  const input = path.resolve(args.get('--input')!);
  const stat = fs.lstatSync(input);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 10 * 1024 * 1024)
    throw new Error('Input must be a regular file up to 10 MiB');
  const raw = fs.readFileSync(input);
  const sourceSha = crypto.createHash('sha256').update(raw).digest('hex');
  const secretEnv = args.get('--legacy-secret-env');
  if (secretEnv && (!process.env[secretEnv] || args.has('--allow-legacy-default')))
    throw new Error('Use one explicit legacy key source');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new Error('Invalid cargo JSON');
  }
  const migrated = migrateCargoSnapshot(parsed, {
    legacySecret: secretEnv ? process.env[secretEnv] : undefined,
    allowLegacyDefault: args.has('--allow-legacy-default'),
    allowPlaintext: args.has('--allow-plaintext'),
  });
  const summary = {
    mode: args.has('--apply') ? 'apply' : 'dry-run',
    sourceSha,
    count: migrated.records.length,
    tenants: migrated.records.map((x) => ({
      tenantId: x.tenant_id,
      expectedRevision: x.revision - 1,
      newRevision: x.revision,
    })),
  };
  if (args.has('--apply')) {
    if (args.get('--expected-sha') !== sourceSha || !fs.readFileSync(input).equals(raw))
      throw new Error('Source hash changed or --expected-sha missing');
    if (args.has('--database')) {
      if (!supabase) throw new Error('Database configuration required');
      const { data, error } = await supabase.rpc('import_cargo_settings', {
        p_records: migrated.records,
      });
      if (error || data !== migrated.records.length)
        throw new Error(
          'Database import failed or revision changed; verify committed revisions before retry'
        );
    } else {
      if (!args.has('--output')) throw new Error('--output NEW_PATH required');
      const target = path.resolve(args.get('--output')!);
      if (target === input) throw new Error('Source must be retained; use a new output path');
      const fd = fs.openSync(target, 'wx', 0o600);
      try {
        fs.writeFileSync(fd, JSON.stringify(migrated, null, 2) + '\n');
        fs.fsyncSync(fd);
      } catch (error) {
        fs.closeSync(fd);
        fs.unlinkSync(target);
        throw error;
      }
      fs.closeSync(fd);
    }
  }
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
} catch (error) {
  process.stderr.write(
    `Cargo migration stopped: ${error instanceof Error ? error.message : 'unknown error'}\n`
  );
  process.exitCode = 1;
}
