import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const source = fs.readFileSync('examples/media-kit/index.html', 'utf8');
const client = fs.readFileSync('examples/media-kit/client.js', 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
const response = (status, data) => ({ ok: status < 400, status, json: async () => data });
const report = {
  data_updated_at: { profile: '2026-10-09T14:00:00Z', engagement: null },
  data: {
    account: { handle: 'fixture', public_name: 'Date', public_bio: 'Following', followers: 1234, profile_url: 'https://www.instagram.com/fixture/' },
    summary: { all_time: { post_count: 2, metrics: { likes: { average: 100 }, comments: { average: 5 } }, engagement_rate_pct: 1.25 } },
    best_posts: { all_time: [{ public_caption: '<img src=x onerror=alert(1)>Date', metrics: { likes: 10 }, permalink: 'javascript:alert(1)' }] },
  },
};
function fixture(saved = 'en', status = 200) {
  const dom = new JSDOM(source, { runScripts: 'outside-only', url: 'https://example.test/' });
  const w = dom.window, calls = [];
  if (saved) w.localStorage.setItem('sentient.language', saved);
  w.fetch = async path => {
    calls.push(path);
    if (path === '/api/media-kit') return response(status, report);
    if (path.startsWith('/api/posts')) return response(200, { data: [{ caption: 'Date', likes: 12, permalink: 'https://instagram.com/p/fixture/' }], pagination: { total: 1 } });
    if (path.startsWith('/api/followers')) return response(200, { data: [{ date: '2026-10-09', captured_at: '2026-10-09T14:00:00Z', followers: 1234 }], pagination: { total: 1 } });
    throw new Error('Unexpected route');
  };
  w.eval(client);
  return { dom, w, calls };
}
{
  const { dom, w, calls } = fixture();
  try {
    await tick();
    assert.equal(w.document.documentElement.lang, 'en');
    assert.equal(w.document.querySelector('#audience-title').textContent, 'Audience and performance');
    assert.match(w.document.querySelector('#metrics').textContent, /Followers/);
    assert.match(w.document.querySelector('#freshness').textContent, /No capture date available/);
    assert.equal(w.document.querySelector('#best-posts img'), null, 'Source captions must remain text');
    assert.equal(w.document.querySelector('#best-posts a'), null, 'Unsafe post URLs are rejected');
    const originalHistory = w.document.querySelector('#history').textContent;
    const requestCount = calls.length;
    w.document.querySelector('[data-language="es"]').click();
    assert.equal(w.document.documentElement.lang, 'es');
    assert.equal(w.document.querySelector('#audience-title').textContent, 'Audiencia y rendimiento');
    assert.match(w.document.querySelector('#metrics').textContent, /Seguidores/);
    assert.match(w.document.querySelector('#freshness').textContent, /Sin fecha de captura disponible/);
    assert.match(w.document.querySelector('#history-status').textContent, /muestras guardadas/);
    assert.equal(w.document.querySelector('#name').textContent, 'Date');
    assert.equal(w.document.querySelector('#bio').textContent, 'Following');
    assert.equal(w.document.querySelector('#posts .post p').textContent, 'Date');
    assert.equal(w.localStorage.getItem('sentient.lang'), 'es');
    assert.equal(w.localStorage.getItem('sentient.language'), 'es');
    assert.equal(calls.length, requestCount, 'Language changes use already loaded data');
    w.document.querySelector('[data-language="en"]').click();
    assert.equal(w.document.querySelector('#history').textContent, originalHistory);
    assert.match(w.document.querySelector('#posts-status').textContent, /stored posts/);
    w.dispatchEvent(new w.StorageEvent('storage', { key: 'sentient.lang', newValue: 'es' }));
    assert.equal(w.document.documentElement.lang, 'es');
  } finally { dom.window.close(); }
}
{
  const { dom, w } = fixture('es', 429);
  try {
    await tick();
    assert.equal(w.document.documentElement.lang, 'es', 'Legacy preference alias is honored');
    assert.equal(w.document.querySelector('#content').hidden, true);
    assert.match(w.document.querySelector('#status').textContent, /límite de consultas/);
    w.document.querySelector('[data-language="en"]').click();
    assert.match(w.document.querySelector('#status').textContent, /request limit/);
  } finally { dom.window.close(); }
}
console.log('PASS bilingual media-kit example: persistence, English restore, localized errors/dates/metrics, no refetch and safe source text');
