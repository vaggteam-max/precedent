import { listCommitments, setCommitmentStatus } from './db.js';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly

async function checkCommitments(client) {
  const soon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  for (const c of listCommitments('open', 50)) {
    if (!c.due_date || !c.who || c.due_date > soon) continue;
    const overdue = c.due_date < new Date().toISOString().slice(0, 10);
    try {
      await client.chat.postMessage({
        channel: c.who, // DM by user id
        text: overdue
          ? `⏰ Your commitment is overdue: *${c.what}* (was due ${c.due_date}). ${c.permalink ? `<${c.permalink}|Original thread>` : ''}`
          : `👋 Friendly nudge: you committed to *${c.what}* — due *${c.due_date}*. ${c.permalink ? `<${c.permalink}|Original thread>` : ''}`,
      });
      setCommitmentStatus(c.id, 'nudged');
    } catch (err) {
      console.error(`nudge failed for commitment #${c.id}:`, err.message);
    }
  }
}

export function startNudges(client) {
  setInterval(() => checkCommitments(client).catch((e) => console.error('nudge sweep failed:', e.message)), CHECK_INTERVAL_MS);
  // One sweep shortly after boot so demos don't wait an hour.
  setTimeout(() => checkCommitments(client).catch(() => {}), 15 * 1000);
}
