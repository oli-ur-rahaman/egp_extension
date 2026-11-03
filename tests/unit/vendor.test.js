// Vendored libraries match their recorded SHA-256 (PROJECT_PLAN §7.3).
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const vendor = path.resolve(import.meta.dirname, '..', '..', 'vendor');
const lines = readFileSync(path.join(vendor, 'SHA256SUMS'), 'utf8').trim().split('\n');

describe('vendor/', () => {
  it.each(lines.map((l) => l.split(/\s+/)))('%s matches %s', (hash, file) => {
    const actual = createHash('sha256').update(readFileSync(path.join(vendor, file))).digest('hex');
    expect(actual).toBe(hash);
  });
});
