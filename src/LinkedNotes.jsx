// Render links without interpreting notes as HTML or changing the saved text.
const LINK_PATTERN = /\[([^\]\n]+)\]\(((?:https?:\/\/|www\.|(?:x|twitter)\.com\/)[^\s<>]+)\)|(?:https?:\/\/|www\.|(?:x|twitter)\.com\/)[^\s<>]+/gi;

export function noteSegments(value) {
  const text = String(value || '');
  const segments = [];
  let cursor = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    // Do not turn a domain embedded in another word into a link.
    if (match.index && /[\w@]/.test(text[match.index - 1])) continue;
    let url = match[2] || match[0];
    if (!match[2]) {
      url = url.replace(/[.,!?;:'"\u201d\u2019]+$/, '');
      while (/[)\]}]$/.test(url)) {
        const close = url.at(-1);
        const open = { ')': '(', ']': '[', '}': '{' }[close];
        if (url.split(close).length <= url.split(open).length) break;
        url = url.slice(0, -1);
      }
    }
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    try {
      const parsed = new URL(href);
      if (!parsed.hostname || !['https:', 'http:'].includes(parsed.protocol)) continue;
    } catch { continue; }
    const length = match[2] ? match[0].length : url.length;
    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index) });
    segments.push({ text: match[1] || url, href });
    cursor = match.index + length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}

export default function LinkedNotes({ text }) {
  return <p className="queue-linked-notes">{noteSegments(text).map((segment, index) => segment.href
    ? <a key={index} href={segment.href} target="_blank" rel="noopener noreferrer">{segment.text}</a>
    : segment.text)}</p>;
}
