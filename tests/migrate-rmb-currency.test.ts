import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../scripts/migrate-rmb-currency.mjs', import.meta.url));
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rmb-migration-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
const run = (...args: string[]) => execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: 'pipe' });
const quote = (currency: string) => ({ id: 'captured-quote', currency, capturedAt: '2026-10-11T00:00:00Z', basis: 'marginal', source: 'fixture', rules: [{ meter: 'output', perMillion: 4 }] });
const charge = (currency: string) => ({ quote: quote(currency), amount: 4, knownAmount: 4, missing: [], lines: [{ meter: 'output', quantity: 1000000, perMillion: 4, amount: 4 }] });

describe('RMB currency migration', () => {
  it('previews both ledger formats and preserves every byte without writing a backup', () => {
    const file = join(dir, 'usage.jsonl');
    const original = '\uFEFF' + JSON.stringify({ version: 2, recordId: 'legacy', charges: [charge('RMB')] }) + '\r\n\r\n'
      + JSON.stringify({ version: 2, recordId: 'attempt', attempt: { charges: [charge('RMB')] }, text: 'RMB' }) + '\r\n{torn';
    writeFileSync(file, original);
    expect(JSON.parse(run(file))).toMatchObject({ mode: 'preview', changedQuotes: 2, damagedLines: 1 });
    expect(readFileSync(file, 'utf8')).toBe(original);
    expect(readdirSync(dir)).toEqual(['usage.jsonl']);
  });

  it('backs up the original ledger and changes only RMB quote labels, preserving damaged lines and line endings', () => {
    const file = join(dir, 'usage.jsonl');
    const records = [
      { version: 2, recordId: 'legacy', charges: [charge('RMB'), charge('USD')] },
      { version: 2, recordId: 'attempt', attempt: { charges: [charge('RMB')] }, note: 'RMB' },
    ];
    const original = '\uFEFF' + records.map(record => JSON.stringify(record)).join('\r\n') + '\r\n\r\n{torn';
    writeFileSync(file, original);
    const result = JSON.parse(run('--write', file));
    expect(readFileSync(result.backup, 'utf8')).toBe(original);
    records[0].charges![0].quote.currency = 'CNY';
    records[1].attempt!.charges[0].quote.currency = 'CNY';
    expect(readFileSync(file, 'utf8')).toBe('\uFEFF' + records.map(record => JSON.stringify(record)).join('\r\n') + '\r\n\r\n{torn');
    const files = readdirSync(dir);
    expect(JSON.parse(run('--write', file))).toMatchObject({ changedQuotes: 0 });
    expect(readdirSync(dir)).toEqual(files);
  });

  it('migrates standalone and embedded custom quotes without altering other currencies or config fields', () => {
    const endpoint = join(dir, 'endpoint.json');
    const config = join(dir, 'config.json');
    const originalEndpoint = { kind: 'fixture', pricing: [{ ...quote('RMB'), models: ['*'] }], options: { currency: 'RMB' } };
    const originalConfig = { providers: { endpoint: originalEndpoint, other: { pricing: [{ ...quote('USD'), models: ['*'] }] } }, timezone: 'UTC' };
    writeFileSync(endpoint, JSON.stringify(originalEndpoint));
    writeFileSync(config, JSON.stringify(originalConfig));
    const results = run('--write', endpoint, config).trim().split('\n').map(line => JSON.parse(line));
    expect(results.map(result => result.changedQuotes)).toEqual([1, 1]);
    originalEndpoint.pricing[0].currency = 'CNY';
    expect(JSON.parse(readFileSync(endpoint, 'utf8'))).toEqual(originalEndpoint);
    expect(JSON.parse(readFileSync(config, 'utf8'))).toEqual(originalConfig);
    expect(JSON.parse(readFileSync(results[0].backup, 'utf8')).pricing[0].currency).toBe('RMB');
  });

  it('does not modify an earlier file when a later config cannot be parsed', () => {
    const endpoint = join(dir, 'endpoint.json');
    const invalid = join(dir, 'invalid.json');
    const original = JSON.stringify({ pricing: [quote('RMB')] });
    writeFileSync(endpoint, original);
    writeFileSync(invalid, '{torn');
    expect(() => run('--write', endpoint, invalid)).toThrow();
    expect(readFileSync(endpoint, 'utf8')).toBe(original);
    expect(readdirSync(dir)).toEqual(['endpoint.json', 'invalid.json']);
  });
});
