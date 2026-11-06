const COMMANDS = ['filter', 'research'];

// The explicit mode applies to this message only. Keep unknown commands intact
// so a slash inside an ordinary question never changes how it is handled.
export function parseCommand(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  const command = /^\/(filter|research)(?=\s|$)/i.exec(text);
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
