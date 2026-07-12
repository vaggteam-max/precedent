import bolt from '@slack/bolt';
import { registerDetector } from './detector.js';
import { assistant } from './assistant.js';
import { startNudges } from './nudges.js';
import { registerHome } from './home.js';
import { listDecisions, searchDecisions } from './db.js';
import { decisionListBlocks } from './blocks.js';

const { App, LogLevel } = bolt;

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: LogLevel.INFO,
});

app.assistant(assistant);
registerDetector(app);
registerHome(app);

app.command('/precedent', async ({ command, ack, respond }) => {
  await ack();
  const [sub, ...rest] = (command.text || '').trim().split(/\s+/);
  const query = rest.join(' ');

  if (sub === 'search' && query) {
    const hits = searchDecisions(query, 10);
    await respond({
      text: `Search results for "${query}"`,
      blocks: decisionListBlocks(hits),
    });
  } else if (sub === 'list' || sub === '') {
    await respond({
      text: 'Recent decisions',
      blocks: decisionListBlocks(listDecisions(10)),
    });
  } else {
    await respond(
      '*Precedent commands*\n' +
        '`/precedent list` — recent decisions\n' +
        '`/precedent search <query>` — search the registry\n' +
        'Or just DM me a question like _"why did we choose Postgres?"_\n' +
        'I also watch channels for decisions & commitments automatically, and you can use the *Log as decision* message shortcut.'
    );
  }
});

(async () => {
  await app.start();
  startNudges(app.client);
  console.log('🏛️ Precedent is running (Socket Mode).');
})();
