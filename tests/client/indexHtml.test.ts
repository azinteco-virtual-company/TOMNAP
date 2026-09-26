import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].map(
  ([, attributes, body]) => ({
    module: /type="module"/.test(attributes),
    body,
  })
);

describe('index.html console override', () => {
  it('overrides console.error only inside a development-guarded module script', () => {
    const overriding = scripts.filter((script) => script.body.includes('console.error ='));
    expect(overriding).toHaveLength(1);
    // Vite replaces import.meta.env only in module scripts; production builds drop the block.
    expect(overriding[0].module).toBe(true);
    expect(overriding[0].body).toMatch(/if \(import\.meta\.env\.DEV\) \{[\s\S]*console\.error =/);
  });
});
