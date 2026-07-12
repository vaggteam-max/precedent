// App Home tab — the team's decision dashboard at a glance.

import { listDecisions, listOutstandingCommitments, setCommitmentStatus } from './db.js';

const trunc = (s, n = 150) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');

const STATUS_BADGE = { active: '', reopened: ' · 🔓 _reopened_', superseded: ' · ⏭️ _superseded_' };

function dueLabel(due_date) {
  if (!due_date) return '';
  const today = new Date().toISOString().slice(0, 10);
  if (due_date < today) return ` · 🔴 *overdue (${due_date})*`;
  if (due_date === today) return ` · 🟡 *due today*`;
  return ` · 🗓️ due ${due_date}`;
}

export function buildHomeView() {
  const decisions = listDecisions(10);
  const commitments = listOutstandingCommitments(10);

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '🏛️ Precedent — your team’s memory' } },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `*${decisions.length}* logged decision${decisions.length === 1 ? '' : 's'} · *${commitments.length}* open commitment${commitments.length === 1 ? '' : 's'}`,
        },
      ],
    },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: '*⚖️ Recent decisions*' } },
  ];

  if (decisions.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_Nothing logged yet. I watch your channels for decisions automatically — or use the *Log as decision* message shortcut._' },
    });
  }
  for (const d of decisions) {
    const by = d.decided_by ? ` — <@${d.decided_by}>` : '';
    const link = d.permalink ? ` <${d.permalink}|↗ thread>` : '';
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*#${d.id} ${trunc(d.title, 120)}*${STATUS_BADGE[d.status] ?? ''}\n${trunc(d.summary)}\n_${d.created_at?.slice(0, 10)}${by}_${link}`,
      },
    });
  }

  blocks.push({ type: 'divider' }, { type: 'section', text: { type: 'mrkdwn', text: '*🤝 Open commitments*' } });

  if (commitments.length === 0) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '_All clear — nothing outstanding._' } });
  }
  for (const c of commitments) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<@${c.who}> — ${trunc(c.what, 200)}${dueLabel(c.due_date)}${c.permalink ? ` <${c.permalink}|↗>` : ''}`,
      },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: '✅ Done' },
        action_id: 'commitment_done',
        value: String(c.id),
      },
    });
  }

  blocks.push(
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'Ask me anything in a DM · `/precedent list` · `/precedent search <query>` · I flag re-litigated decisions automatically ⚖️',
        },
      ],
    }
  );

  return { type: 'home', blocks };
}

async function publishHome(client, userId) {
  await client.views.publish({ user_id: userId, view: buildHomeView() });
}

export function registerHome(app) {
  app.event('app_home_opened', async ({ event, client }) => {
    if (event.tab !== 'home') return;
    try {
      await publishHome(client, event.user);
    } catch (err) {
      console.error('home publish error:', err.message);
    }
  });

  // ✅ Done button on the home tab — mark complete and refresh the view.
  app.action('commitment_done', async ({ ack, body, action, client }) => {
    await ack();
    setCommitmentStatus(Number(action.value), 'done');
    try {
      await publishHome(client, body.user.id);
    } catch (err) {
      console.error('home refresh error:', err.message);
    }
  });
}
