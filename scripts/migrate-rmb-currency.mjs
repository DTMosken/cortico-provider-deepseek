import { readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

function pricingCurrencies(pricing) {
  let changed = 0;
  for (const price of Array.isArray(pricing) ? pricing : []) {
    if (typeof price?.currency === 'string' && price.currency.trim() === 'RMB') {
      price.currency = 'CNY';
      changed++;
    }
  }
  return changed;
}

function migrateConfig(config) {
  let changed = pricingCurrencies(config.pricing);
  for (const entry of Object.values(config.providers ?? {})) changed += pricingCurrencies(entry?.pricing);
  return changed;
}

function migrateUsage(record) {
  let changed = 0;
  for (const charges of [record?.charges, record?.attempt?.charges]) {
    for (const charge of Array.isArray(charges) ? charges : []) changed += pricingCurrencies([charge?.quote]);
  }
  return changed;
}

function plan(file) {
  const original = readFileSync(file);
  const text = original.toString('utf8');
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const body = text.slice(bom.length);
  let changedQuotes = 0;
  let damagedLines = 0;
  let updated;
  if (extname(file) === '.jsonl') {
    updated = bom + body.split(/(\r?\n)/).map(line => {
      if (!line.trim()) return line;
      let record;
      try { record = JSON.parse(line); } catch { damagedLines++; return line; }
      const changed = migrateUsage(record);
      changedQuotes += changed;
      return changed ? JSON.stringify(record) : line;
    }).join('');
  } else if (extname(file) === '.json') {
    const config = JSON.parse(body);
    changedQuotes = migrateConfig(config);
    const newline = body.includes('\r\n') ? '\r\n' : '\n';
    updated = bom + JSON.stringify(config, null, 2).replaceAll('\n', newline) + (body.endsWith('\n') ? newline : '');
  } else {
    throw new Error(`Expected a .json endpoint/config file or .jsonl usage ledger: ${file}`);
  }
  return { file, original, updated, changedQuotes, damagedLines };
}

function writePlan(item) {
  if (!readFileSync(item.file).equals(item.original)) throw new Error(`File changed after preview: ${item.file}`);
  const suffix = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`;
  const backup = `${item.file}.rmb-backup-${suffix}.bak`;
  const temporary = `${item.file}.${suffix}.tmp`;
  writeFileSync(backup, item.original, { flag: 'wx' });
  writeFileSync(temporary, item.updated, { flag: 'wx' });
  try { renameSync(temporary, item.file); }
  catch (error) { unlinkSync(temporary); throw error; }
  return backup;
}

function main(args) {
  if (!args.length || args.includes('--help')) {
    console.log('Usage: node scripts/migrate-rmb-currency.mjs [--write] <config.json|usage.jsonl> ...');
    console.log('Preview by default. --write backs up each changed file before replacing RMB with CNY. Stop the bot before writing its usage ledger.');
    if (!args.length) process.exitCode = 1;
    return;
  }
  const write = args.includes('--write');
  const files = args.filter(arg => arg !== '--write');
  if (!files.length || files.some(arg => arg.startsWith('--'))) throw new Error('Supply file paths and only the optional --write flag.');
  const plans = [...new Set(files.map(file => resolve(file)))].map(plan);
  for (const item of plans) {
    const backup = write && item.changedQuotes ? writePlan(item) : undefined;
    console.log(JSON.stringify({ mode: write ? 'write' : 'preview', file: item.file, changedQuotes: item.changedQuotes, damagedLines: item.damagedLines, ...(backup ? { backup } : {}) }));
  }
}

try { main(process.argv.slice(2)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
