import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Render the repository's guide using its small, explicit Markdown vocabulary.
// Each language source keeps its downloadable reference and hosted guide in sync.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANGUAGES = {
  es: {
    source: 'api-guide.md', page: 'api-guide.html', title: 'Guía de la API de Sentient Dash',
    description: 'Documentación general de la API de Sentient Dash: autenticación, perfiles, métricas, posts, historial, ejemplos y conexión con websites, apps y reportes',
    skip: 'Ir a la guía', download: 'Descargar guía', example: 'Descargar ejemplo', api: 'Conexiones API',
    language: 'Idioma de la guía', nav: 'Contenido de la guía', contents: 'En esta guía', tag: 'Documentación de la API',
    markdown: 'Descargar versión Markdown', project: 'Descargar proyecto de referencia',
  },
  en: {
    source: 'api-guide.en.md', page: 'api-guide.en.html', title: 'Sentient Dash API guide',
    description: 'General Sentient Dash API documentation: authentication, profiles, metrics, posts, history, examples and integration with websites, apps and reports',
    skip: 'Skip to the guide', download: 'Download guide', example: 'Download example', api: 'API connections',
    language: 'Guide language', nav: 'Guide contents', contents: 'In this guide', tag: 'API documentation',
    markdown: 'Download Markdown version', project: 'Download reference project',
  },
};
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const hasControls = value => [...value].some(char => char.charCodeAt(0) < 32 && !'\t\n\r'.includes(char));
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
function renderGuide(language, labels) {
const markdown = fs.readFileSync(path.join(root, 'public', labels.source), 'utf8');
if (hasControls(markdown)) throw new Error(`Control characters in ${labels.source}`);
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
    if (fence[1] === 'js') {
      // Syntax check only: never execute documentation examples or network calls.
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      new AsyncFunction(code.join('\n'));
    }
    output.push(`<div class="code-label">${escape(fence[1] || 'code')}</div><pre><code>${escape(code.join('\n'))}</code></pre>`);
    i += 1; continue;
  }
  const heading = line.match(/^(#{1,3}) (.+)$/);
  if (heading) {
    const level = heading[1].length;
    let id = '';
    if (level === 1) id = 'guide-start';
    if (level === 2) {
      id = `section-${sections.length + 1}`;
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
    output.push(`<div class="table-wrap"><table class="columns-${header.length}"><thead><tr>${header.map(cell => `<th scope="col">${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`);
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
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escape(labels.description)}"><meta name="color-scheme" content="dark"><title>${escape(labels.title)}</title><link rel="alternate" hreflang="es" href="/api-guide.html?lang=es"><link rel="alternate" hreflang="en" href="/api-guide.en.html?lang=en"><link rel="icon" href="/favicon.svg"><script src="/api-guide-language.js?v=20261009-i18n1"></script><link rel="stylesheet" href="/api-guide.css?v=20261009-i18n1"></head>
<body><a class="skip" href="#guide-start">${escape(labels.skip)}</a><header class="top"><div class="top-inner"><div class="header-title"><a class="brand" href="/">Sentient Dash</a><nav class="language-selector" aria-label="${escape(labels.language)}"><a class="button language-option" data-guide-language="es" href="/api-guide.html?lang=es" lang="es" hreflang="es"${language === 'es' ? ' aria-current="page"' : ''}>Español</a><a class="button language-option" data-guide-language="en" href="/api-guide.en.html?lang=en" lang="en" hreflang="en"${language === 'en' ? ' aria-current="page"' : ''}>English</a></nav></div><div class="actions"><a class="button" href="/${labels.source}" download>${escape(labels.download)}</a><a class="button" href="/media-kit-example.zip" download>${escape(labels.example)}</a><a class="button primary" href="/api.html">${escape(labels.api)}</a></div></div></header><div class="layout"><nav class="contents" aria-label="${escape(labels.nav)}"><p>${escape(labels.contents)}</p>${sections.map(section => `<a href="#${section.id}">${escape(section.title)}</a>`).join('')}</nav><main><p class="tag">${escape(labels.tag)}</p>${output.join('\n')}<footer><a href="/${labels.source}" download>${escape(labels.markdown)}</a> · <a href="/media-kit-example.zip" download>${escape(labels.project)}</a></footer></main></div></body></html>
`;
if (hasControls(html)) throw new Error(`Control characters in ${labels.page}`);
if (sections.length !== 10) throw new Error(`Expected 10 guide sections in ${labels.source}`);
fs.writeFileSync(path.join(root, 'public', labels.page), html);
console.log(`API guide rendered (${language}): ${sections.length} sections`);
}

for (const [language, labels] of Object.entries(LANGUAGES)) renderGuide(language, labels);
