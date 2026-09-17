import { apiFetch } from './apiClient';

// Retain the operation ID across a lost response and page refresh. Store only a
// digest and a random ID, never the backup contents or credentials.
export async function runOrderMaintenance(
  action: 'temizle' | 'demo-yukle' | 'yedek-yukle',
  body: Record<string, unknown>
) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify({ action, body }))
  );
  const signature = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(
    ''
  );
  const storageKey = `tomnap:maintenance:${signature}`;
  let operationId = sessionStorage.getItem(storageKey);
  if (!operationId) {
    operationId = crypto.randomUUID();
    // If retry identity cannot be retained, stop before sending a destructive request.
    sessionStorage.setItem(storageKey, operationId);
  }
  const response = await apiFetch(`/api/veritabani/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, islem_id: operationId }),
  });
  const result = await response.json();
  if (!result.basarili) throw new Error(result.hata || 'İşlem tamamlanamadı.');
  sessionStorage.removeItem(storageKey);
  return result;
}
