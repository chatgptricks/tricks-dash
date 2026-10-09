import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Render the repository's guide using its small, explicit Markdown vocabulary.
// One source keeps the downloadable reference and hosted guide in sync.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const markdown = fs.readFileSync(path.join(root, 'public/api-guide.md'), 'utf8');
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function inline(value) {
  const tokens = /`([^`]+)`|\[([^\]]+)\]\(([^\s)]+)\)|\*\*([^*]+)\*\*/g;
  let result = '', start = 0;
  for (const match of value.matchAll(tokens)) {
    result += escape(value.slice(start, match.index));
    if (match[1]) result += `<code>${escape(match[1])}</code>`;
    else if (match[2]) {
      if (!/^(https?:\/\/|\/|#)/.test(match[3])) throw new Error('Unexpected guide link');
      result += `<a href="${escape(match[3])}">${inline(match[2])}</a>`;
    } else result += `<strong>${inline(match[4])}</strong>`;
    start = match.index + match[0].length;
  }
  return result + escape(value.slice(start));
}
const lines = markdown.split('\n'), sections = [], output = [];
const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(value => value.trim());
let i = 0;
while (i < lines.length) {
  const line = lines[i];
  if (!line.trim()) { i += 1; continue; }
  const fence = line.match(/^```(\w*)$/);
  if (fence) {
    const code = [];
    i += 1;
    while (i < lines.length && lines[i] !== '```') code.push(lines[i++]);
    if (i === lines.length) throw new Error('Unclosed guide code block');
    if (fence[1] === 'json') JSON.parse(code.join('\n'));
    output.push(`<div class="code-label">${escape(fence[1] || 'code')}</div><pre><code>${escape(code.join('\n'))}</code></pre>`);
    i += 1; continue;
  }
  const heading = line.match(/^(#{1,3}) (.+)$/);
  if (heading) {
    const level = heading[1].length;
    let id = '';
    if (level === 1) id = 'inicio';
    if (level === 2) {
      id = `paso-${sections.length + 1}`;
      sections.push({ id, title: heading[2] });
    }
    output.push(`<h${level}${id ? ` id="${id}"` : ''}>${inline(heading[2])}</h${level}>`);
    i += 1; continue;
  }
  if (line.startsWith('|') && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
    const header = cells(line);
    i += 2;
    const rows = [];
    while (i < lines.length && lines[i].startsWith('|')) {
      const row = cells(lines[i++]);
      if (row.length !== header.length) throw new Error('Mismatched guide table columns');
      rows.push(`<tr>${row.map(cell => `<td>${inline(cell)}</td>`).join('')}</tr>`);
    }
    output.push(`<div class="table-wrap"><table><thead><tr>${header.map(cell => `<th scope="col">${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`);
    continue;
  }
  const list = line.match(/^(\d+\.|-) (.+)$/);
  if (list) {
    const ordered = list[1] !== '-', tag = ordered ? 'ol' : 'ul', items = [];
    const pattern = ordered ? /^\d+\. (.+)$/ : /^- (.+)$/;
    while (i < lines.length) {
      const item = lines[i].match(pattern);
      if (!item) break;
      items.push(`<li>${inline(item[1])}</li>`);
      i += 1;
    }
    output.push(`<${tag}>${items.join('')}</${tag}>`);
    continue;
  }
  const paragraph = [line];
  i += 1;
  while (i < lines.length && lines[i].trim() && !/^(#|```|\||\d+\. |- )/.test(lines[i])) paragraph.push(lines[i++]);
  output.push(`<p>${inline(paragraph.join(' '))}</p>`);
}
const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Documentación general de la API de Sentient Dash: autenticación, perfiles, métricas, posts, historial, ejemplos y conexión con websites, apps y reportes"><meta name="color-scheme" content="dark"><title>Guía de la API de Sentient Dash</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/api-guide.css"></head>
<body><a class="skip" href="#inicio">Ir a la guía</a><header class="top"><div class="top-inner"><a class="brand" href="/">Sentient Dash</a><div class="actions"><a class="button" href="/api-guide.md" download>Descargar guía</a><a class="button" href="/media-kit-example.zip" download>Descargar ejemplo</a><a class="button primary" href="/api.html">API connections</a></div></div></header><div class="layout"><nav class="contents" aria-label="Contenido de la guía"><p>En esta guía</p>${sections.map(section => `<a href="#${section.id}">${escape(section.title)}</a>`).join('')}</nav><main><p class="tag">Documentación de la API</p>${output.join('\n')}<footer><a href="/api-guide.md" download>Descargar versión Markdown</a> · <a href="/media-kit-example.zip" download>Descargar proyecto de referencia</a></footer></main></div></body></html>
`;
if ([...html].some(char => char.charCodeAt(0) < 32 && !'\t\n\r'.includes(char))) throw new Error('Control characters in guide');
fs.writeFileSync(path.join(root, 'public/api-guide.html'), html);
console.log(`API guide rendered: ${sections.length} sections`);
