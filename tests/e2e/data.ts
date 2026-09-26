import crypto from 'node:crypto';

// Deliberately synthetic, fixed test identities. Never used by production seeds.
export const fixture = {
  password: 'Synthetic-E2E-password!42',
  tenantA: 'e2e_tenant_a',
  tenantB: 'e2e_tenant_b',
  ownerA: 'owner-a@example.invalid',
  ownerB: 'owner-b@example.invalid',
  courier: 'courier-a@example.invalid',
  courierUserId: 'e2e-courier-user-a',
  courierName: 'E2E Courier Profile',
  orderA: '11111111-1111-4111-8111-111111111111',
  orderB: '22222222-2222-4222-8222-222222222222',
  customerA: 'Synthetic Customer Alpha',
  customerB: 'Synthetic Customer Beta',
  cargoPassword: 'Synthetic-carrier-secret!42',
  png: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
};
export const imagePath = (tenant: string) =>
  `/uploads/t_${crypto.createHash('sha256').update(tenant).digest('hex').slice(0, 24)}_${'c4'.repeat(16)}.png`;
