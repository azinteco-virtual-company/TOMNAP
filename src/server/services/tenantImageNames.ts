import { createHash, randomBytes } from 'node:crypto';

export function tenantImagePrefix(tenantId: string): string {
  return `t_${createHash('sha256').update(tenantId).digest('hex').slice(0, 24)}_`;
}

export function tenantImageFilename(
  tenantId: string,
  extension: 'png' | 'jpg' | 'webp',
  nonce = randomBytes(16).toString('hex')
): string {
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw new Error('Invalid image nonce');
  return `${tenantImagePrefix(tenantId)}${nonce}.${extension}`;
}
