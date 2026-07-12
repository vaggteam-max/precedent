import bolt from '@slack/bolt';
import { llmText } from './llm.js';
import { searchDecisions, listDecisions, listOutstandingCommitments } from './db.js';
import { rtsSearch, formatRtsResults } from './rts.js';

const { Assistant } = bolt;

const ANSWER_SYSTEM = `You are Precedent, a Slack agent that is the team's institutional memory.
Answer the user's question using ONLY the decision registry entries and Slack search results provided.
Always cite decisions as "Decision #<id>" and include the permalink as a Slack link like <URL|original thread> when available.
If nothing in the context answers the question, say so plainly and suggest logging the decision when it gets made.
Format for Slack mrkdwn: *bold*, _italic_, <link|text>. Be concise — a few sentences plus links.`;

function registryContext(question) {
  const hits = searchDecisions(question, 5);
  const recent = hits.length ? hits : listDecisions(5);
  const decisions = recent
    .map(
      (d) =>
        `Decision #${d.id} (${d.status}, ${d.created_at?.slice(0, 10)}): ${d.title}\n  Summary: ${d.summary}\n  Rationale: ${d.rationale}\n  Alternatives: ${d.alternatives}\n  Decided by: <@${d.decided_by}>\n  Permalink: ${d.permalink || 'n/a'}`
    )
    .join('\n');
  const commitments = listOutstandingCommitments(10)
    .map((c) => `Commitment #${c.id}: <@${c.who}> — ${c.what}${c.due_date ? ` (due ${c.due_date})` : ''} ${c.permalink || ''}`)
    .join('\n');
  return { decisions: decisions || '(registry is empty)', commitments: commitments || '(none tracked)' };
}

export const assistant = new Assistant({
  threadStarted: async ({ say, setSuggestedPrompts }) => {
    await say("Hi — I'm *Precedent*, your team's institutional memory. Ask me what was decided, why, or who committed to what.");
    await setSuggestedPrompts({
      prompts: [
        { title: 'Recent decisions', message: 'What decisions has the team made recently?' },
        { title: 'Why did we…?', message: 'Why did we make our most recent decision?' },
        { title: 'Open commitments', message: 'What open commitments does the team have?' },
      ],
    });
  },

  userMessage: async ({ client, message, say, setStatus, setTitle }) => {
    const question = message.text || '';
    try {
      await setStatus('consulting the registry…');

      const ctx = registryContext(question);
      // Enrich with live Slack context via the Real-Time Search API when available.
      const rts = await rtsSearch(client, question);
      const rtsBlock = rts.length ? `\n\nLive Slack search results (RTS API):\n${formatRtsResults(rts)}` : '';

      const answer = await llmText(
        ANSWER_SYSTEM,
        `User question: ${question}\n\nDecision registry:\n${ctx.decisions}\n\nOpen commitments:\n${ctx.commitments}${rtsBlock}`
      );

      await setTitle(question.slice(0, 50));
      await say(answer);
    } catch (err) {
      console.error('assistant error:', err.message);
      await say(`Sorry, I hit an error: ${err.message}`);
    }
  },
});
