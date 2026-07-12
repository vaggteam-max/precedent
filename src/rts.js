// Slack Real-Time Search API wrapper. Degrades gracefully when the
// sandbox/workspace doesn't have RTS enabled.

export async function rtsSearch(client, query, contentTypes = ['messages']) {
  try {
    const res = await client.apiCall('assistant.search.context', {
      query,
      content_types: contentTypes,
      limit: 10,
    });
    return res.results?.messages || [];
  } catch (err) {
    console.warn(`RTS search unavailable (${err.data?.error || err.message}) — continuing without it.`);
    return [];
  }
}

export function formatRtsResults(messages) {
  return messages
    .slice(0, 5)
    .map((m) => `- [${m.channel?.name || m.channel_id || 'channel'}] ${m.author_name || m.author_user_id || ''}: ${(m.content || m.text || '').slice(0, 300)} ${m.permalink ? `(${m.permalink})` : ''}`)
    .join('\n');
}
