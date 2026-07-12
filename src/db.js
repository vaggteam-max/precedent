import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const db = new DatabaseSync(process.env.DB_PATH || './precedent.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    summary TEXT DEFAULT '',
    rationale TEXT DEFAULT '',
    alternatives TEXT DEFAULT '',
    decided_by TEXT DEFAULT '',
    channel_id TEXT DEFAULT '',
    message_ts TEXT DEFAULT '',
    permalink TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS commitments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    who TEXT DEFAULT '',
    what TEXT NOT NULL,
    due_date TEXT,
    channel_id TEXT DEFAULT '',
    message_ts TEXT DEFAULT '',
    permalink TEXT DEFAULT '',
    status TEXT DEFAULT 'open',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Fresh deployments boot on an empty disk — import the committed registry
// snapshot (ids preserved so citations like "Decision #5" stay valid).
const isEmpty = db.prepare('SELECT COUNT(*) AS n FROM decisions').get().n === 0
  && db.prepare('SELECT COUNT(*) AS n FROM commitments').get().n === 0;
if (isEmpty) {
  try {
    const seed = JSON.parse(readFileSync(new URL('../data/registry-seed.json', import.meta.url), 'utf8'));
    const dStmt = db.prepare(`INSERT INTO decisions (id, title, summary, rationale, alternatives, decided_by, channel_id, message_ts, permalink, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const d of seed.decisions) dStmt.run(d.id, d.title, d.summary, d.rationale, d.alternatives, d.decided_by, d.channel_id, d.message_ts, d.permalink, d.status, d.created_at);
    const cStmt = db.prepare(`INSERT INTO commitments (id, who, what, due_date, channel_id, message_ts, permalink, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const c of seed.commitments) cStmt.run(c.id, c.who, c.what, c.due_date, c.channel_id, c.message_ts, c.permalink, c.status, c.created_at);
    console.log(`Registry seeded from snapshot: ${seed.decisions.length} decisions, ${seed.commitments.length} commitments`);
  } catch {
    // no snapshot bundled — start empty
  }
}

export function insertDecision(d) {
  const stmt = db.prepare(
    `INSERT INTO decisions (title, summary, rationale, alternatives, decided_by, channel_id, message_ts, permalink)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const r = stmt.run(
    d.title, d.summary || '', d.rationale || '', d.alternatives || '',
    d.decided_by || '', d.channel_id || '', d.message_ts || '', d.permalink || ''
  );
  return Number(r.lastInsertRowid);
}

export function insertCommitment(c) {
  const stmt = db.prepare(
    `INSERT INTO commitments (who, what, due_date, channel_id, message_ts, permalink)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const r = stmt.run(c.who || '', c.what, c.due_date || null, c.channel_id || '', c.message_ts || '', c.permalink || '');
  return Number(r.lastInsertRowid);
}

export function getDecision(id) {
  return db.prepare('SELECT * FROM decisions WHERE id = ?').get(id);
}

export function listDecisions(limit = 10) {
  return db.prepare('SELECT * FROM decisions ORDER BY id DESC LIMIT ?').all(limit);
}

export function listCommitments(status = 'open', limit = 25) {
  return db.prepare('SELECT * FROM commitments WHERE status = ? ORDER BY due_date IS NULL, due_date LIMIT ?').all(status, limit);
}

// Everything not yet done — 'open' plus already-'nudged' ones.
export function listOutstandingCommitments(limit = 25) {
  return db
    .prepare("SELECT * FROM commitments WHERE status IN ('open', 'nudged') ORDER BY due_date IS NULL, due_date LIMIT ?")
    .all(limit);
}

export function setDecisionStatus(id, status) {
  db.prepare('UPDATE decisions SET status = ? WHERE id = ?').run(status, id);
}

export function setCommitmentStatus(id, status) {
  db.prepare('UPDATE commitments SET status = ? WHERE id = ?').run(status, id);
}

// Lightweight keyword search: score every row by term overlap.
// Registry stays small (hundreds of rows), so a full scan is fine.
export function searchDecisions(query, limit = 5) {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  if (terms.length === 0) return [];
  const rows = db.prepare('SELECT * FROM decisions').all();
  const scored = rows
    .map((row) => {
      const hay = `${row.title} ${row.summary} ${row.rationale} ${row.alternatives}`.toLowerCase();
      const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
      return { row, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.row.id - a.row.id);
  return scored.slice(0, limit).map((x) => ({ ...x.row, _score: x.score / terms.length }));
}

export default db;
