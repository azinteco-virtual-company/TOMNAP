import fs from 'node:fs';
import path from 'node:path';
import type { Response, Test } from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/server';
import { supabase } from '../../../src/server/services/supabase';
import type { KullaniciKaydi } from '../../../src/server/types';
import { loginFixture } from './session';

/**
 * Shared tenant isolation checks (pattern of the AWB tests from 00-A).
 * Two tenants each own one record; tenant A's session tries to read, list and
 * write tenant B's record. Every check is paired with a positive control (A on
 * its own record, B on its record), so an empty answer proves isolation rather
 * than a route that returns nothing at all.
 */
export const TENANT_A = 'kanada_shopper_baku';
export const TENANT_B = 'ayla_boutique';
export type Agent = Awaited<ReturnType<typeof loginFixture>>['agent'];

const PROJECT_FILES = [
  'identity.json',
  'firmalar.json',
  'kullanicilar.json',
  'kargo_ayarlari.json',
];
/** Repository data files; isolation tests must never change them. */
export function readProjectData(): Array<string | null> {
  return PROJECT_FILES.map((name) => {
    const filename = path.join(process.cwd(), 'data', name);
    return fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : null;
  });
}

/** Logs in one session per tenant with the same role. */
export async function tenantAgents(
  app: ReturnType<typeof createApp>,
  role: KullaniciKaydi['rol'] = 'PATRON'
): Promise<{ a: Agent; b: Agent }> {
  return {
    a: (await loginFixture(app, role, TENANT_A)).agent,
    b: (await loginFixture(app, role, TENANT_B)).agent,
  };
}

/** Denied means 403/404, or a 2xx answer that carries nothing of the other tenant. */
export function expectNoForeignData(response: Response, foreignMarkers: readonly string[]) {
  expect([200, 201, 403, 404]).toContain(response.status);
  const body = JSON.stringify(response.body ?? null);
  for (const marker of foreignMarkers) expect(body).not.toContain(marker);
}

export interface TenantIsolationCase {
  /** Session role for both tenants. */
  role?: KullaniciKaydi['rol'];
  /** Environment switches the routes need (for example feature flags). */
  env?: Record<string, string>;
  /** Resets state so each tenant owns exactly the records below; runs before every check. */
  seed: () => void | Promise<void>;
  /** Tenant A's record id and a string that appears only in its data. */
  own: { id: string; marker: string };
  /** Tenant B's record id and markers that appear only in its data. */
  foreign: { id: string; markers: string[] };
  /** Reads one record by id. */
  read?: (agent: Agent, id: string) => Test;
  /** Lists the tenant's records. */
  list?: (agent: Agent) => Test;
  /** Writes one record by id; must succeed on the caller's own record. */
  write?: (agent: Agent, id: string) => Test;
  /** Tenant B's stored record, to prove a rejected write changed nothing. */
  foreignState?: () => unknown;
}

/** Registers read, list and write isolation checks for one route group. */
export function describeTenantIsolation(name: string, spec: TenantIsolationCase) {
  describe(`${name}: tenant A cannot reach tenant B`, () => {
    const app = createApp();
    const dataBefore = readProjectData();
    let a: Agent;
    let b: Agent;
    beforeAll(async () => ({ a, b } = await tenantAgents(app, spec.role)));
    beforeEach(async () => {
      for (const [key, value] of Object.entries(spec.env ?? {})) vi.stubEnv(key, value);
      await spec.seed();
    });
    afterEach(() => vi.unstubAllEnvs());
    afterAll(() => {
      expect(supabase).toBeNull();
      expect(readProjectData()).toEqual(dataBefore);
    });

    const { read, list, write } = spec;
    if (read)
      it('reads its own record, but not the other tenant record', async () => {
        const own = await read(a, spec.own.id);
        expect(own.status).toBe(200);
        expect(JSON.stringify(own.body)).toContain(spec.own.marker);
        const visible = await read(b, spec.foreign.id);
        expect(JSON.stringify(visible.body)).toContain(spec.foreign.markers[0]);
        expectNoForeignData(await read(a, spec.foreign.id), [
          spec.foreign.id,
          ...spec.foreign.markers,
        ]);
      });

    if (list)
      it('lists its own records without the other tenant record', async () => {
        const own = await list(a);
        expect(own.status).toBe(200);
        expect(JSON.stringify(own.body)).toContain(spec.own.marker);
        expectNoForeignData(own, [spec.foreign.id, ...spec.foreign.markers]);
        const visible = await list(b);
        expect(JSON.stringify(visible.body)).toContain(spec.foreign.markers[0]);
      });

    if (write)
      it('writes its own record, but not the other tenant record', async () => {
        const own = await write(a, spec.own.id);
        expect(own.status, JSON.stringify(own.body)).toBeLessThan(300);
        expect(own.body?.basarili, JSON.stringify(own.body)).not.toBe(false);
        const before = structuredClone(spec.foreignState?.());
        const foreign = await write(a, spec.foreign.id);
        // Rejected: an error status, or a 2xx answer that reports failure.
        expect(
          foreign.status >= 400 || foreign.body?.basarili === false,
          JSON.stringify(foreign.body)
        ).toBe(true);
        expectNoForeignData(foreign, spec.foreign.markers);
        if (spec.foreignState) expect(spec.foreignState()).toEqual(before);
      });
  });
}
