import { llmJSON } from './llm.js';
import { searchDecisions, insertDecision, insertCommitment, setDecisionStatus, getDecision } from './db.js';
import { decisionCard, commitmentCard, precedentCard, loggedConfirmation } from './blocks.js';

const THRESHOLD = Number(process.env.CONFIDENCE_THRESHOLD || 0.6);

// Cheap prefilter so we don't send every message to the LLM.
const DECISION_CUES = /\b(decid\w*|let'?s go with|we('| a)?re going with|we'?ll (use|go|adopt|ship)|agreed|final call|settled on|approved|going ahead|we chose|verdict|sign(ed)? off)\b/i;
const COMMITMENT_CUES = /\b(i'?ll |i will |i can take|on it|i'?ve got (it|this)|by (mon|tues|wednes|thurs|fri|satur|sun)day|by (eod|eow|eoq|tomorrow|next week|end of)|deadline|due (on|by))\b/i;
// Re-litigation usually sounds like a QUESTION, not a decision — separate cues.
const RELITIGATION_CUES = /\b(reconsider|revisit|rethink|re-?open|second thoughts|why (did|do|don'?t|aren'?t) we|should we (switch|change|move|go|use|drop|really)|instead( of)?|change (course|our mind)|still (the right|a good) (call|choice|idea)|do we (really|still))\b/i;

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'should', 'would', 'could', 'have', 'has', 'was', 'were', 'are', 'you', 'our', 'use', 'using', 'instead', 'switch', 'change', 'reconsider', 'revisit', 'maybe', 'what', 'why', 'how', 'about', 'really', 'still', 'just', 'think', 'hey', 'team', 'guys']);

const CLASSIFY_SYSTEM = `You analyze a Slack message and decide whether it records a team DECISION (a choice was made between options) or a personal COMMITMENT (someone promised to do something, possibly by a date), or neither.
Respond with JSON: {"type": "decision"|"commitment"|"none", "confidence": 0.0-1.0, "title": "short imperative title", "summary": "1-2 sentence summary", "rationale": "why, if stated", "alternatives": "rejected options, if stated", "what": "for commitments: the promised action", "due_date": "ISO date YYYY-MM-DD or null"}.
Only classify as decision/commitment when the message itself states it — questions, proposals, and speculation are "none". Today's date is ${new Date().toISOString().slice(0, 10)}.`;

const SAME_TOPIC_SYSTEM = `Given a new Slack message and a previously logged decision, judge whether the new message is re-opening or re-discussing the SAME question that decision already settled. Respond JSON: {"same_topic": true|false}. Be conservative: only true when it is clearly the same question.`;

export async function classifyMessage(text) {
  return llmJSON(CLASSIFY_SYSTEM, `Slack message:\n"""${text.slice(0, 2000)}"""`);
}

export async function findPrecedent(text) {
  const cleaned = text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    .join(' ');
  const candidates = searchDecisions(cleaned, 3).filter((d) => d.status === 'active' && d._score >= 0.3);
  for (const cand of candidates) {
    try {
      const judge = await llmJSON(
        SAME_TOPIC_SYSTEM,
        `New message:\n"""${text.slice(0, 1500)}"""\n\nLogged decision:\nTitle: ${cand.title}\nSummary: ${cand.summary}\nRationale: ${cand.rationale}`
      );
      if (judge.same_topic) return cand;
    } catch {
      // judge failure on one candidate shouldn't kill detection
    }
  }
  return null;
}

export function registerDetector(app) {
  app.message(async ({ message, client, say }) => {
    if (message.subtype || message.bot_id || !message.text) return;
    if (message.channel_type === 'im') return; // DMs are handled by the assistant

    const text = message.text;
    const isDecisionCue = DECISION_CUES.test(text);
    const isCommitmentCue = COMMITMENT_CUES.test(text);
    const isRelitigationCue = RELITIGATION_CUES.test(text);
    if (!isDecisionCue && !isCommitmentCue && !isRelitigationCue) return;

    try {
      // Anything that sounds like deciding OR re-questioning gets a precedent
      // check first — re-litigation usually arrives phrased as a question.
      if (isDecisionCue || isRelitigationCue) {
        const prior = await findPrecedent(text);
        if (prior) {
          await say({
            thread_ts: message.thread_ts || message.ts,
            text: `This looks settled already: ${prior.title}`,
            blocks: precedentCard(prior),
          });
          return;
        }
      }
      if (!isDecisionCue && !isCommitmentCue) return; // relitigation cue only, no precedent found

      const extract = await classifyMessage(text);
      if (extract.type === 'none' || extract.confidence < THRESHOLD) return;

      const meta = { channel: message.channel, ts: message.ts, who: message.user };

      if (extract.type === 'decision') {
        await say({
          thread_ts: message.thread_ts || message.ts,
          text: `Looks like a decision: ${extract.title}`,
          blocks: decisionCard(extract, meta),
        });
      } else if (extract.type === 'commitment') {
        await say({
          thread_ts: message.thread_ts || message.ts,
          text: `Commitment spotted: ${extract.what}`,
          blocks: commitmentCard(extract, meta),
        });
      }
    } catch (err) {
      console.error('detector error:', err.message);
    }
  });

  // ✅ Log it
  app.action('log_decision_confirm', async ({ ack, body, action, client, respond }) => {
    await ack();
    const v = JSON.parse(action.value);
    let permalink = '';
    try {
      const p = await client.chat.getPermalink({ channel: v.channel, message_ts: v.ts });
      permalink = p.permalink;
    } catch { /* permalink is nice-to-have */ }
    const id = insertDecision({
      title: v.title,
      summary: v.summary,
      rationale: v.rationale,
      alternatives: v.alternatives,
      decided_by: v.who,
      channel_id: v.channel,
      message_ts: v.ts,
      permalink,
    });
    await respond({
      replace_original: true,
      text: `Logged decision #${id}`,
      blocks: loggedConfirmation('decision', id, v.title),
    });
  });

  // 📌 Track it
  app.action('log_commitment_confirm', async ({ ack, action, client, respond }) => {
    await ack();
    const v = JSON.parse(action.value);
    let permalink = '';
    try {
      const p = await client.chat.getPermalink({ channel: v.channel, message_ts: v.ts });
      permalink = p.permalink;
    } catch { /* permalink is nice-to-have */ }
    const id = insertCommitment({
      who: v.who,
      what: v.what,
      due_date: v.due_date,
      channel_id: v.channel,
      message_ts: v.ts,
      permalink,
    });
    await respond({
      replace_original: true,
      text: `Tracking commitment #${id}`,
      blocks: loggedConfirmation('commitment', id, v.what),
    });
  });

  // 🔓 Reopen a settled decision
  app.action('reopen_decision', async ({ ack, action, respond }) => {
    await ack();
    const id = Number(action.value);
    setDecisionStatus(id, 'reopened');
    const d = getDecision(id);
    await respond({
      replace_original: true,
      text: `Decision #${id} reopened`,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `🔓 *Decision #${id} reopened:* ${d.title}\nIt will no longer be flagged as settled. Log the new outcome when the team re-decides.` },
        },
      ],
    });
  });

  app.action('card_dismiss', async ({ ack, respond }) => {
    await ack();
    await respond({ delete_original: true });
  });

  // Message shortcut: "Log as decision"
  app.shortcut('log_decision_action', async ({ shortcut, ack, client }) => {
    await ack();
    const text = shortcut.message?.text || '';
    try {
      const extract = await classifyMessage(text);
      const meta = { channel: shortcut.channel.id, ts: shortcut.message.ts, who: shortcut.message.user || shortcut.user.id };
      const isCommitment = extract.type === 'commitment';
      // Manual invocation means the user wants it logged — trust them even at low confidence.
      if (!extract.title && !extract.what) {
        extract.title = text.slice(0, 140);
        extract.summary = text.slice(0, 250);
      }
      extract.confidence = Math.max(extract.confidence || 0, 0.9);
      await client.chat.postMessage({
        channel: shortcut.channel.id,
        thread_ts: shortcut.message.thread_ts || shortcut.message.ts,
        text: isCommitment ? `Commitment spotted: ${extract.what}` : `Looks like a decision: ${extract.title}`,
        blocks: isCommitment ? commitmentCard(extract, meta) : decisionCard(extract, meta),
      });
    } catch (err) {
      console.error('shortcut error:', err.message);
    }
  });
}
