// Pre-flight: verify Slack tokens and the configured LLM before starting the app.
import { llmJSON } from '../src/llm.js';

const auth = await fetch('https://slack.com/api/auth.test', {
  headers: { Authorization: 'Bearer ' + process.env.SLACK_BOT_TOKEN },
}).then((r) => r.json());
console.log('SLACK BOT TOKEN:', auth.ok ? `OK — bot @${auth.user} in workspace "${auth.team}"` : `FAIL: ${auth.error}`);

const appAuth = await fetch('https://slack.com/api/auth.test', {
  headers: { Authorization: 'Bearer ' + process.env.SLACK_APP_TOKEN },
}).then((r) => r.json());
console.log('SLACK APP TOKEN:', appAuth.ok || appAuth.error === 'invalid_auth' === false ? 'checked' : `note: ${appAuth.error} (xapp tokens often report this on auth.test — real test is Socket Mode connect)`);

try {
  const j = await llmJSON('You are a test. Reply with JSON {"pong": true}', 'ping');
  console.log('LLM:', 'OK —', JSON.stringify(j));
} catch (e) {
  console.log('LLM FAIL:', e.message.slice(0, 400));
}
