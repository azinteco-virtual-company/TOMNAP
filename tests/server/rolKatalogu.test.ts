import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EKIP_ROLLERI,
  EKSIK_ANAHTAR_KOTASI,
  PAKET_ROL_LIMITLERI,
  ROLLER,
  ROL_GRUPLARI,
  VARSAYILAN_ROL_LIMITLERI,
  ekipRoluMu,
  gecerliRolMu,
  ilkKullaniciSayilari,
  rolGrubunda,
  rolKotasi,
} from '../../src/shared/roller';

const CATALOG = path.join('src', 'shared', 'roller.ts');
const ROLE = ROLLER.join('|');
const literal = new RegExp(`['"\`](${ROLE})['"\`]`, 'g');

/** Body of the newest migration that (re)defines the given SQL function. */
function latestSqlDefinition(name: string): string {
  const dir = path.join('supabase', 'migrations');
  const pattern = new RegExp(
    `FUNCTION public\\.${name}\\([^)]*\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`
  );
  const bodies = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => fs.readFileSync(path.join(dir, file), 'utf8').match(pattern))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => match[1]);
  expect(bodies.length, name).toBeGreaterThan(0);
  return bodies[bodies.length - 1];
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.(ts|tsx)$/.test(entry.name) ? [file] : [];
  });
}

/** Hand-written role lists: every role list must come from the catalog. */
function handWrittenRoleLists(source: string): string[] {
  const found: string[] = [];
  const add = (kind: string, text: string) =>
    found.push(`${kind}: ${text.replace(/\s+/g, ' ').slice(0, 90)}`);
  // Arrays and Set/includes arguments with two or more roles.
  for (const match of source.matchAll(/\[[^[\]]*\]/g))
    if ((match[0].match(literal) || []).length >= 2) add('dizi', match[0]);
  // Type unions such as 'SUPER_ADMIN' | 'PATRON'.
  for (const match of source.matchAll(
    new RegExp(`['"](${ROLE})['"]\\s*\\|\\s*['"](${ROLE})['"]`, 'g')
  ))
    add('birleşim', match[0]);
  // Quota defaults such as KANADA_SATINALMA: 2.
  for (const match of source.matchAll(new RegExp(`\\b(${ROLE})\\s*:\\s*\\d`, 'g')))
    add('kota', match[0]);
  // Group checks such as role === 'SUPER_ADMIN' || role === 'PATRON'.
  for (const match of source.matchAll(
    new RegExp(
      `===\\s*['"](${ROLE})['"][^;{}]{0,120}?\\|\\|[^;{}]{0,120}?===\\s*['"](${ROLE})['"]`,
      'gs'
    )
  ))
    add('grup', match[0]);
  return found;
}

describe('role catalog is the single source of roles (A4)', () => {
  it('has no hand-written role list anywhere else in src', () => {
    const violations = sourceFiles('src')
      .filter((file) => file !== CATALOG)
      .flatMap((file) =>
        handWrittenRoleLists(fs.readFileSync(file, 'utf8')).map((hit) => `${file} → ${hit}`)
      );
    expect(violations).toEqual([]);
  });

  it('detects each kind of hand-written list (scanner self-check)', () => {
    expect(handWrittenRoleLists("const a = ['PATRON', 'BAKU_KURYE'];")).toHaveLength(1);
    expect(handWrittenRoleLists("new Set(['SUPER_ADMIN', 'PATRON'])")).toHaveLength(1);
    expect(handWrittenRoleLists("type R = 'SUPER_ADMIN' | 'PATRON';")).toHaveLength(1);
    expect(handWrittenRoleLists('const q = { BAKU_KURYE: 10 };')).toHaveLength(1);
    expect(handWrittenRoleLists("r === 'SUPER_ADMIN' || r === 'PATRON'")).toHaveLength(1);
    expect(handWrittenRoleLists("r === 'BAKU_KURYE' ? a : b; const c = ['PATRON'];")).toEqual([]);
  });

  it('matches the latest SQL definitions (roles, quota defaults, AWB approvers)', () => {
    const quoted = (body: string) =>
      [...body.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]).sort();
    expect(quoted(latestSqlDefinition('tomnap_gecerli_rol'))).toEqual([...EKIP_ROLLERI].sort());
    const defaults = Object.fromEntries(
      [
        ...latestSqlDefinition('tomnap_rol_kota_varsayilani').matchAll(
          /WHEN '([A-Z_]+)' THEN (\d+)/g
        ),
      ].map((match) => [match[1], Number(match[2])])
    );
    expect(defaults).toEqual(EKSIK_ANAHTAR_KOTASI);
    const [creators, owners] = [
      ...latestSqlDefinition('tomnap_v2_siparis_olustur').matchAll(/rol IN \(([^)]*)\)/g),
    ].map((match) => quoted(match[1]));
    expect([creators, owners]).toEqual([
      [...ROL_GRUPLARI.SALES].sort(),
      [...ROL_GRUPLARI.ORDER_OWNERS].sort(),
    ]);
    const approvers = latestSqlDefinition('tomnap_approve_awb_matches').match(
      /u\.rol IN \(([^)]*)\)/
    );
    expect(approvers && quoted(approvers[1])).toEqual([...ROL_GRUPLARI.SHIPPING].sort());
  });

  it('keeps the team roles, groups and quota defaults consistent', () => {
    expect(ROLLER).toEqual(['SUPER_ADMIN', ...EKIP_ROLLERI]);
    expect(ekipRoluMu('SUPER_ADMIN')).toBe(false);
    expect(gecerliRolMu('SUPER_ADMIN')).toBe(true);
    for (const value of ['', 'patron', 'HACKER', null, undefined, 1])
      expect([gecerliRolMu(value), ekipRoluMu(value)]).toEqual([false, false]);
    for (const [grup, roller] of Object.entries(ROL_GRUPLARI))
      for (const rol of roller) expect(gecerliRolMu(rol), `${grup}:${rol}`).toBe(true);
    expect(rolGrubunda('BAKU_KURYE', 'STAFF')).toBe(false);
    expect(rolGrubunda('BAKU_KURYE', 'ALL')).toBe(true);
    for (const limits of [VARSAYILAN_ROL_LIMITLERI, ...Object.values(PAKET_ROL_LIMITLERI)])
      expect(Object.keys(limits).sort()).toEqual([...EKIP_ROLLERI].sort());
    expect(ilkKullaniciSayilari()).toEqual({
      ...Object.fromEntries(EKIP_ROLLERI.map((r) => [r, 0])),
      PATRON: 1,
    });
    // Each call returns a fresh object: callers may mutate it.
    expect(ilkKullaniciSayilari()).not.toBe(ilkKullaniciSayilari());
    // A missing key falls back only for ABD_SATINALMA (K18); other roles keep 0.
    expect(rolKotasi({ PATRON: 1 }, 'ABD_SATINALMA')).toBe(2);
    expect(rolKotasi({ PATRON: 1 }, 'KANADA_SATINALMA')).toBe(0);
    expect(rolKotasi({ ABD_SATINALMA: 1 }, 'ABD_SATINALMA')).toBe(1);
    expect(rolKotasi(undefined, 'ABD_SATINALMA')).toBe(2);
  });
});
