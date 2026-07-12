// Try candidate Gemini models and report which respond right now.
const candidates = [
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-2.0-flash',
];

for (const model of candidates) {
  const t0 = Date.now();
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with the word: pong' }] }] }),
      }
    );
    const ms = Date.now() - t0;
    if (res.ok) {
      const d = await res.json();
      const txt = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim().slice(0, 20);
      console.log(`OK    ${model} (${ms}ms): ${txt}`);
    } else {
      const err = await res.json().catch(() => ({}));
      console.log(`FAIL  ${model} (${res.status}): ${err.error?.status || ''}`);
    }
  } catch (e) {
    console.log(`FAIL  ${model}: ${e.message.slice(0, 80)}`);
  }
}
