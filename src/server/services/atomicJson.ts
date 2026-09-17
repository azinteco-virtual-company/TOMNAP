import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export class JsonStorageError extends Error {
  readonly status = 503;
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'JsonStorageError';
  }
}

/** Only a genuinely missing file permits initialization; unreadable or invalid
 * persisted data must never silently turn into a new empty/default authority. */
export function readJsonFile<T>(
  filename: string,
  validate: (value: unknown) => value is T
): T | undefined {
  let serialized: string;
  try {
    serialized = fs.readFileSync(filename, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new JsonStorageError('Yerel veri dosyası okunamadı.', error);
  }
  try {
    const value: unknown = JSON.parse(serialized);
    if (!validate(value)) throw new Error('Invalid persisted data shape');
    return value;
  } catch (error) {
    throw new JsonStorageError(
      'Yerel veri dosyası geçersiz; mevcut veriler değiştirilmedi.',
      error
    );
  }
}

/** Write in the destination directory, flush the temporary file, then rename.
 * Rename is the commit point; no fallible post-commit work can report a failed
 * write after replacing the authoritative file. This does not coordinate
 * independent processes or promise directory durability after power loss. */
export function writeJsonAtomic(filename: string, value: unknown): void {
  let temporary: string | undefined;
  let descriptor: number | undefined;
  try {
    const serialized = JSON.stringify(value, null, 2);
    if (serialized === undefined) throw new Error('Value is not JSON serializable');
    const directory = path.dirname(filename);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    temporary = path.join(
      directory,
      `.${path.basename(filename)}.${randomBytes(16).toString('hex')}.tmp`
    );
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, serialized, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, filename);
    temporary = undefined;
  } catch (error) {
    throw new JsonStorageError('Yerel veriler kaydedilemedi; işlem tamamlanmadı.', error);
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        /* Preserve the original failure. */
      }
    }
    if (temporary) {
      try {
        fs.rmSync(temporary, { force: true });
      } catch {
        /* An orphan temp is never authoritative. */
      }
    }
  }
}
