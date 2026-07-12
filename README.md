# 🏛️ Precedent — institutional memory for Slack

**Slack Agent Builder Challenge 2026 · New Slack Agent track**

Teams make decisions in Slack every day — then lose them. Threads scroll away, people
re-ask settled questions, commitments quietly slip. Slack search finds *messages*, but it
doesn't know a message **was a decision**, who made it, or what alternatives were rejected.

Precedent is a Slack agent that gives your team a memory:

| Capability | How it works |
|---|---|
| 🏛️ **Detects decisions** | Watches channel messages (heuristic prefilter → LLM extraction), asks one-tap confirmation, logs to a structured registry with a permalink to the original thread |
| 🤝 **Tracks commitments** | Spots "I'll ship it by Friday", tracks it, and DMs a nudge before the deadline |
| ⚖️ **Stops re-litigation** | When a new discussion re-opens a settled question, Precedent interjects with the original decision, rationale, and link — with an explicit "Reopen" escape hatch |
| 💬 **Answers "why?"** | DM the agent "why did we choose Postgres?" — grounded answers with provenance, enriched by Slack's **Real-Time Search API** |
| 🔌 **Feeds other agents** | An **MCP server** exposes the registry (`search_decisions`, `list_open_commitments`, …) so Claude, Cursor, or any MCP client can query your team's decisions |

**Qualifying technologies used: all three** — Slack AI/agent capabilities (assistant threads),
Real-Time Search API (`assistant.search.context`), and MCP integration.

## Architecture

```
Slack workspace
  │  Socket Mode (events, actions, assistant threads)
  ▼
Bolt JS app (src/app.js)
  ├─ detector.js    message → cue regex → LLM classify → confirmation card
  │                  └─ findPrecedent() → re-litigation interjection
  ├─ assistant.js   assistant thread Q&A → registry + RTS API → grounded answer
  ├─ nudges.js      hourly sweep → DM commitment reminders
  └─ db.js          SQLite (node:sqlite) decision & commitment registry
                        ▲
mcp/server.js  ────────┘   stdio MCP server for external agents
LLM: Gemini (REST) with Anthropic fallback — src/llm.js
```

## Setup

1. **Create the Slack app**: at [api.slack.com/apps](https://api.slack.com/apps) → *Create New App* → *From a manifest* → paste `manifest.json`. Install to your workspace/sandbox.
2. **Tokens**: copy `.env.example` to `.env`; fill in
   - `SLACK_BOT_TOKEN` (OAuth & Permissions → Bot User OAuth Token, `xoxb-…`)
   - `SLACK_APP_TOKEN` (Basic Information → App-Level Tokens → create with `connections:write` scope, `xapp-…`)
   - `GEMINI_API_KEY` (from [aistudio.google.com](https://aistudio.google.com/apikey))
3. **Run**:
   ```
   npm install
   npm run seed     # optional: demo data
   npm start
   ```
4. Invite the bot to a channel: `/invite @Precedent`, then say something like
   *"After comparing options, we decided to go with Redis for caching — Memcached lacks persistence."*

## MCP server

Add to any MCP client (e.g. Claude Code `.mcp.json`):

```json
{
  "mcpServers": {
    "precedent": {
      "command": "node",
      "args": ["--env-file=.env", "mcp/server.js"],
      "cwd": "<path to this repo>"
    }
  }
}
```
