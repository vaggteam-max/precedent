// Minimal LLM abstraction over raw REST.
// Provider priority: Gemini → any OpenAI-compatible endpoint (Groq, OpenRouter,
// Ollama, OpenAI, GitHub Models) → Anthropic.

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
// Free-tier preview models 503 under load — fall back down this chain.
const GEMINI_FALLBACKS = [...new Set([GEMINI_MODEL, 'gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest'])];
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const OPENAI_BASE = process.env.OPENAI_COMPAT_BASE_URL; // e.g. https://api.groq.com/openai/v1
const OPENAI_KEY = process.env.OPENAI_COMPAT_API_KEY || 'none'; // Ollama needs no key
const OPENAI_MODEL = process.env.OPENAI_COMPAT_MODEL;

async function geminiOnce(model, system, user, jsonMode) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: jsonMode ? { responseMimeType: 'application/json' } : {},
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error(`Gemini ${model} ${res.status}: ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
}

async function gemini(system, user, jsonMode) {
  let lastErr;
  for (const model of GEMINI_FALLBACKS) {
    try {
      return await geminiOnce(model, system, user, jsonMode);
    } catch (err) {
      lastErr = err;
      // Overload/quota → try the next model; anything else is a real bug.
      if (err.status !== 503 && err.status !== 429) throw err;
      console.warn(`Gemini ${model} unavailable (${err.status}), trying next fallback…`);
    }
  }
  throw lastErr;
}

async function anthropic(system, user) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.map((b) => b.text || '').join('') ?? '';
}

async function openaiCompat(system, user, jsonMode) {
  const res = await fetch(`${OPENAI_BASE.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`LLM (${OPENAI_BASE}) ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

const NO_KEY_MSG =
  'No LLM configured. Set GEMINI_API_KEY, or OPENAI_COMPAT_BASE_URL + OPENAI_COMPAT_MODEL (Groq/OpenRouter/Ollama/OpenAI), or ANTHROPIC_API_KEY.';

export async function llmText(system, user) {
  if (GEMINI_KEY) return gemini(system, user, false);
  if (OPENAI_BASE && OPENAI_MODEL) return openaiCompat(system, user, false);
  if (ANTHROPIC_KEY) return anthropic(system, user);
  throw new Error(NO_KEY_MSG);
}

export async function llmJSON(system, user) {
  let raw;
  if (GEMINI_KEY) {
    raw = await gemini(system, user, true);
  } else if (OPENAI_BASE && OPENAI_MODEL) {
    raw = await openaiCompat(system + '\nRespond with ONLY a valid JSON object, no markdown fences.', user, true);
  } else if (ANTHROPIC_KEY) {
    raw = await anthropic(system + '\nRespond with ONLY a valid JSON object, no markdown fences.', user);
  } else {
    throw new Error(NO_KEY_MSG);
  }
  // Strip accidental fences and parse the first COMPLETE JSON object —
  // models occasionally emit two objects back-to-back, so slicing to the
  // last '}' is not safe. Walk braces, string-aware.
  const cleaned = raw.replace(/```(json)?/g, '').trim();
  return JSON.parse(extractFirstJsonObject(cleaned, raw));
}

function extractFirstJsonObject(s, raw) {
  const start = s.indexOf('{');
  if (start === -1) throw new Error(`LLM returned non-JSON: ${raw.slice(0, 200)}`);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = inString; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  throw new Error(`LLM returned truncated JSON: ${raw.slice(0, 200)}`);
}
