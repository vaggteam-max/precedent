// Dump the live registry to data/registry-seed.json so a fresh deployment
// (empty DB on an ephemeral disk) boots with the same decision memory.
import { writeFileSync, mkdirSync } from 'node:fs';
import db from '../src/db.js';

const out = {
  exported_at: new Date().toISOString(),
  decisions: db.prepare('SELECT * FROM decisions ORDER BY id').all(),
  commitments: db.prepare('SELECT * FROM commitments ORDER BY id').all(),
};

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/registry-seed.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(`Exported ${out.decisions.length} decisions, ${out.commitments.length} commitments → data/registry-seed.json`);
