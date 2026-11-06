export const COMMANDS = ['filter', 'research', 'next'];

// The explicit mode applies to this message only. Keep unknown commands intact
// so a slash inside an ordinary question never changes how it is handled.
export function parseCommand(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  const command = /^\/(filter|research|next)(?=\s|$)/i.exec(text);
  return command
    ? { mode: command[1].toLowerCase(), query: text.slice(command[0].length).trim() }
    : { mode: 'auto', query: text };
}

// Suggestions disappear once the user adds a space or starts the query.
export function suggestCommands(value) {
  const text = typeof value === 'string' ? value.trimStart() : '';
  const partial = /^\/([a-z]*)$/i.exec(text);
  if (!partial || partial[0] !== text) return [];
  return COMMANDS.filter(command => command.startsWith(partial[1].toLowerCase()));
}

// Keep only the two bounded clarification slots returned by the assistant.
// This also validates saved conversations before a continuation is sent.
export function sanitizeNextContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !Object.hasOwn(value, 'post_format') || !Object.hasOwn(value, 'target_account')
      || ![null, 'reel', 'image', 'carousel'].includes(value.post_format)
      || (value.target_account !== null && (typeof value.target_account !== 'string'
        || !value.target_account.trim() || value.target_account.length > 64))) return null;
  return { post_format: value.post_format, target_account: value.target_account?.trim() ?? null };
}

export function pendingNextContext(messages, value = '') {
  // A new slash command always leaves the pending clarification, including an
  // unknown shortcut. A failed ordinary reply can safely retry the same slots.
  if (typeof value !== 'string' || value.trimStart().startsWith('/')) return null;
  for (let index = messages.length - 1; index >= 0; index--) {
    const item = messages[index];
    if (item.role === 'user' && item.content.trimStart().startsWith('/')) return null;
    if (item.role === 'assistant' && !item.failed) return sanitizeNextContext(item.pending_next);
  }
  return null;
}
