// Block Kit builders for Precedent's cards.

const trunc = (s, n = 280) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');

// Interactive button values are capped at 2000 chars — keep the stash tight.
export function stash(obj) {
  return JSON.stringify({
    ...obj,
    title: trunc(obj.title, 150),
    summary: trunc(obj.summary, 250),
    rationale: trunc(obj.rationale, 250),
    alternatives: trunc(obj.alternatives, 200),
    what: trunc(obj.what, 250),
  });
}

export function decisionCard(extract, meta) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🏛️ *Looks like a decision was made.* Want me to log it?\n\n*${trunc(extract.title, 150)}*\n${trunc(extract.summary)}`,
      },
    },
    ...(extract.rationale
      ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Why:* ${trunc(extract.rationale)}` } }]
      : []),
    ...(extract.alternatives
      ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: `Alternatives considered: ${trunc(extract.alternatives, 200)}` }] }]
      : []),
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          style: 'primary',
          text: { type: 'plain_text', text: '✅ Log it' },
          action_id: 'log_decision_confirm',
          value: stash({ ...extract, ...meta }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Dismiss' },
          action_id: 'card_dismiss',
          value: 'dismiss',
        },
      ],
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Detected by Precedent · confidence ${(extract.confidence * 100).toFixed(0)}%` }],
    },
  ];
}

export function commitmentCard(extract, meta) {
  const due = extract.due_date ? ` by *${extract.due_date}*` : '';
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🤝 *Commitment spotted:* <@${meta.who}> will ${trunc(extract.what, 250)}${due}.\nTrack it so it doesn't slip?`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          style: 'primary',
          text: { type: 'plain_text', text: '📌 Track it' },
          action_id: 'log_commitment_confirm',
          value: stash({ ...extract, ...meta }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Dismiss' },
          action_id: 'card_dismiss',
          value: 'dismiss',
        },
      ],
    },
  ];
}

export function precedentCard(decision) {
  const when = decision.created_at?.slice(0, 10) || 'earlier';
  const by = decision.decided_by ? ` by <@${decision.decided_by}>` : '';
  const link = decision.permalink ? `\n<${decision.permalink}|View the original thread →>` : '';
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `⚖️ *Heads up — this looks settled already.*\n*Decision #${decision.id}: ${decision.title}* was decided on ${when}${by}.\n*Why:* ${trunc(decision.rationale || decision.summary)}${link}`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '🔓 Reopen decision' },
          action_id: 'reopen_decision',
          value: String(decision.id),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Dismiss' },
          action_id: 'card_dismiss',
          value: 'dismiss',
        },
      ],
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: 'Precedent flags discussions that revisit logged decisions.' }],
    },
  ];
}

export function loggedConfirmation(kind, id, title) {
  const emoji = kind === 'decision' ? '🏛️' : '📌';
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `${emoji} Logged as *${kind} #${id}* — _${trunc(title, 150)}_` },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: 'Ask me about it anytime: `/precedent search` or DM me.' }],
    },
  ];
}

export function decisionListBlocks(decisions) {
  if (decisions.length === 0) {
    return [{ type: 'section', text: { type: 'mrkdwn', text: 'No decisions logged yet. I listen for them automatically, or use the *Log as decision* message shortcut.' } }];
  }
  const blocks = [{ type: 'header', text: { type: 'plain_text', text: '🏛️ Decision registry' } }];
  for (const d of decisions) {
    const status = d.status === 'active' ? '' : ` · _${d.status}_`;
    const link = d.permalink ? ` <${d.permalink}|↗>` : '';
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*#${d.id} ${trunc(d.title, 120)}*${status}${link}\n${trunc(d.summary, 150)} · ${d.created_at?.slice(0, 10)}` },
    });
  }
  return blocks;
}
