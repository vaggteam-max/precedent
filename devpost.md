# Devpost submission — copy-paste pack

---

## Project name
**Precedent**

## Tagline
Never lose your decisions. Never miss a commitment.

## Track
New Slack Agent

---

## About the project

### 💡 Inspiration

Every team makes its most important decisions in Slack — and then loses them. Three weeks later nobody remembers *what* was decided, *why*, or who promised what. Teams re-argue settled questions, context leaves when people do, and commitments quietly die in the scrollback.

Slack AI in 2026 is great at *summarizing* conversations. But a summary is not a memory: it can't tell you why you chose Redis six months ago, warn you that today's "should we switch?" thread was settled in March, or chase the runbook someone promised by Friday. That gap — **decision memory** — is what Precedent fills.

### ⚙️ What it does

**Precedent is an institutional-memory agent that lives where decisions happen.**

- **🔍 Detects decisions & commitments in real time.** A cheap regex prefilter watches channel traffic; candidate messages go to an LLM that extracts the title, rationale, and rejected alternatives. The team confirms with one click — nothing is logged without a human in the loop.
- **🗄️ Builds a provenance-first registry.** Every entry stores who decided, when, why, what was rejected — and a permalink back to the exact Slack thread. Answers cite receipts, not vibes.
- **⚖️ Defends settled decisions.** When someone re-opens an old debate ("should we switch to Jenkins instead?"), Precedent interjects *before* the argument restarts: here's the decision, who made it, and the original thread. Re-litigation arrives phrased as a question, so it has its own detection path that checks the registry before anything else.
- **💬 Answers "why did we…?" in a native AI assistant thread.** Grounded in the registry plus Slack's Real-Time Search API, with suggested prompts, live status, and honest "nothing on record" answers.
- **⏰ Tracks follow-through.** Commitments get due dates; owners get a DM nudge before deadlines slip. The App Home dashboard shows everything outstanding with one-click ✅ Done.
- **🔌 Exposes the memory over MCP.** A five-tool MCP server lets Claude, Cursor, or any agent query the team's decisions from outside Slack. Your team's decisions become infrastructure.

### 🏗️ How we built it

Node.js + **Bolt for JavaScript v4** over Socket Mode. The **Assistant class** powers the AI DM experience (thread lifecycle, status, suggested prompts). The **Real-Time Search API** (`assistant.search.context`) enriches answers with workspace-wide context, degrading gracefully where unavailable. Storage is **node:sqlite** — zero native dependencies, trivially portable. The LLM layer is provider-agnostic: Gemini Flash primary with an automatic model-fallback chain on 503/429, then any OpenAI-compatible endpoint, then Anthropic — it survived a live Gemini outage mid-demo without dropping a detection. The **MCP server** uses the official SDK over stdio with zod-validated tools.

Uses all three qualifying technologies: **Slack AI assistant capabilities, the Real-Time Search API, and MCP.**

### 🧗 Challenges

- **Re-litigation isn't phrased like a decision.** "Should we reconsider X?" is a question, so decision cues never fire. We built a separate cue set and moved the precedent check *ahead* of classification.
- **Free-tier LLM reliability.** Preview models 503 under load; we built a fallback chain that steps down models only on overload/quota errors, so real bugs still surface.
- **Noise discipline.** An agent that comments on everything gets uninstalled. The two-stage detector (regex prefilter → LLM → confidence threshold → human confirmation) kept Precedent silent through ~20 messages of ordinary chatter in our tests and vocal only when it mattered.

### 🏆 What we're proud of

The ⚖️ re-litigation guard — we haven't seen another Slack agent that *defends* settled decisions with receipts. And the end-to-end provenance: every answer traces to a real thread.

### 🚀 What's next

Decision supersession chains (v2 replaces v1), Jira/Notion sync via MCP, weekly decision digests, and per-channel policies.

---

## Built with (tags)
`javascript` · `node.js` · `slack` · `bolt` · `block-kit` · `mcp` · `sqlite` · `gemini` · `socket-mode`

## Submission form fields
- **Demo video URL:** _(YouTube link — under 3:00)_
- **Architecture diagram:** upload screenshot of `video/architecture.html`
- **Sandbox URL:** https://slackagentbuilding.slack.com
- **Sandbox access:** invite `slackhack@salesforce.com` and `testing@devpost.com` to the workspace
- **Qualifying tech used:** Slack AI (Assistant), Real-Time Search API, MCP server — all three
- **App created:** July 10, 2026 (within submission period) — App ID A0BG58RH4VD
