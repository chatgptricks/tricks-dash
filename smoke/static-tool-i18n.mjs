import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const helper = fs.readFileSync('public/tool-translations.js', 'utf8');
function fixture(tool) {
  const source = fs.readFileSync(`public/${tool}.html`, 'utf8');
  assert.match(source, /<script src="\/tool-translations\.js\?/);
  const dom = new JSDOM(source, { runScripts: 'outside-only', url: `https://example.test/${tool}.html`, pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false });
  w.setInterval = () => 0;
  w.fetch = () => { throw new Error('Language change must not fetch'); };
  w.Chart = class {
    static defaults = { font: {} };
    constructor(canvas, config) { this.canvas = canvas; this.config = config; this.data = config.data; this.options = config.options; }
    update() {}
    destroy() {}
  };
  w.localStorage.setItem('sentient.language', 'es');
  const scripts = [...w.document.scripts].filter(script => !script.src && script.type !== 'module').map(script => script.textContent);
  const bridge = tool === 'tracker'
    ? 'window.__test={summary:value=>{SUMMARY=value},detail:value=>{DETAIL_CACHE.fixture=value},charts:()=>CHARTS};'
    : 'window.__test={seed:value=>{ACCOUNTS=value.accounts;SEL=new Set(value.selected);RAW=value.posts;FOLLOWER_GROWTH=value.growth},charts:()=>CHARTS};';
  // Real classic scripts share one global lexical scope; evaluate together.
  w.eval(helper + '\n' + scripts.join('\n') + '\n' + bridge);
  const describe = source.split('function describeSignInError(err) {')[1].split('const gate =')[0];
  w.eval('function describeSignInError(err) {' + describe);
  return { dom, w };
}
{
  const { dom, w } = fixture('tracker');
  try {
    assert.equal(w.document.documentElement.lang, 'es');
    const attributes = new w.MutationObserver(() => {});
    attributes.observe(w.document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    w.__applyI18n(); w.__applyI18n();
    assert.equal(attributes.takeRecords().length, 0, 'Unchanged language must not trigger the navigation observer again');
    attributes.disconnect();
    w.__test.summary({ tracking_since: '2026-10-01', accounts: [{ handle: 'fixture', full_name: 'Date', group: 'sentient', followers: 1234, captured_at: '2026-10-09T14:00:00Z' }] });
    w.render(); w.__applyI18n();
    assert.match(w.document.querySelector('#app').textContent, /Cuentas en esta vista/);
    assert.equal(w.document.querySelector('#trackerSearch').placeholder, 'Buscar cuentas…');
    assert.equal(w.document.querySelector('#trackerGroup').getAttribute('aria-label'), 'Grupo de cuentas');
    assert.equal(w.document.querySelector('[data-i18n-skip]').textContent, 'Date');
    assert.match(w.document.querySelector('.note').textContent, /día.*historial/);
    w.__test.detail({ followers_history: [{ date: '2026-10-08T14:00:00Z', followers: 1200 }, { date: '2026-10-09T14:00:00Z', followers: 1234 }], engagement_weekly: [{ week_start: '2026-10-01', avg_likes: 25, post_count: 3 }] });
    w.writeAcc('fixture'); w.render(); w.__applyI18n(); w.__charts = w.__test.charts();
    assert.match(w.document.querySelector('#app').textContent, /Estadísticas históricas/);
    assert.match(w.document.querySelector('.tracker-history-head .sub').textContent, /lecturas diarias/);
    assert.equal(w.__charts[0].data.datasets[0].label, 'Seguidores');
    assert.equal(w.__charts[0].options.plugins.tooltip.callbacks.label({ parsed: { y: 1234 }, dataIndex: 0 }), '1 234 seguidores (estimado)');
    w.document.querySelector('[data-lang="en"]').click();
    assert.equal(w.document.documentElement.lang, 'en');
    assert.match(w.document.querySelector('#app').textContent, /Historical Stats/);
    w.__charts = w.__test.charts();
    assert.equal(w.__charts[0].data.datasets[0].label, 'Followers');
    assert.equal(w.localStorage.getItem('sentient.lang'), 'en');
    assert.equal(w.localStorage.getItem('sentient.language'), 'en');
    w.dispatchEvent(new w.StorageEvent('storage', { key: 'sentient.lang', newValue: 'es' }));
    assert.match(w.document.querySelector('#app').textContent, /Estadísticas históricas/);
  } finally { dom.window.close(); }
}
{
  const { dom, w } = fixture('insights');
  try {
    const insightData = { accounts: [{ handle: 'fixture', label: 'Date', group: 'sentient' }], selected: ['fixture'],
      posts: [{ a: 'fixture', ts: Date.parse('2026-10-01T12:00:00Z'), l: 200, c: 5, v: 1000, t: 'Video', pt: 'clips', ocr: 'Date', u: 'https://instagram.com/p/fixture/', dur: 25, hour: 12, dow: 4 }],
      growth: { accounts: [{ handle: 'fixture', eligible_intervals: 8, baseline_ready_intervals: 1, snapshot_days: 9, peaks: [{ date: '2026-10-01', captured_at: '2026-10-01T14:00:00Z', followers_gained: 200, baseline_median: 20, growth_pct: 1.2, candidate_posts: [{ format: 'Video', cover_text: 'Date', permalink: 'https://instagram.com/p/fixture/' }] }] }] } };
    w.__test.seed(insightData); w.render(); w.__applyI18n(); w.__charts = w.__test.charts();
    const app = w.document.querySelector('#app').textContent;
    assert.match(app, /Análisis de seguidores/);
    assert.match(app, /Qué formato funciona mejor/);
    assert.match(app, /Temas y lenguaje que funcionan/);
    assert.match(app, /Cuándo publicar/);
    assert.match(app, /Las 25 mejores publicaciones/);
    assert.match(app, /nunca una conversión de seguidores confirmada/);
    assert.match(app, /Un intervalo diario debe durar entre 12 y 36 horas/);
    assert.equal(w.document.querySelector('.insight-post-row [data-i18n-skip]').textContent, 'Date');
    assert.equal(w.document.querySelector('.growth-candidates a').textContent, 'Video · Date');
    assert.equal(w.__charts[0].data.datasets[0].label, 'Seguidores ganados');
    assert.equal(w.__charts[0].options.plugins.tooltip.callbacks.afterLabel({ dataIndex: 0 })[1], 'Una publicación en la ventana');
    assert.equal(w.document.querySelector('#pdfBtn').textContent.trim(), 'Exportar PDF');
    assert.equal(w.document.querySelector('#ftype option[value="Carousel"]').textContent, 'Carrusel');
    assert.equal(w.document.querySelector('#ftype option[value="Carousel"]').value, 'Carousel', 'Translated option copy must not change the API format value');
    const gate = w.document.querySelector('#authGateText');
    gate.textContent = w.describeSignInError({ code: 'auth/popup-blocked' }); w.__applyI18n();
    assert.match(gate.textContent, /Tu navegador bloqueó/);
    w.document.querySelector('[data-lang="en"]').click();
    assert.match(w.document.querySelector('#app').textContent, /Follower intelligence/);
    assert.match(w.document.querySelector('#app').textContent, /never a confirmed Instagram follower conversion/);
    w.__charts = w.__test.charts();
    assert.equal(w.__charts[0].data.datasets[0].label, 'Followers gained');
    assert.equal(w.document.querySelector('#pdfBtn').textContent.trim(), 'Export PDF');
    assert.match(gate.textContent, /Your browser blocked/);
    // Later render mutations get translated, while account content is retained.
    w.document.querySelector('[data-lang="es"]').click();
    w.__test.seed({ ...insightData, posts: [] }); w.render(); w.__applyI18n();
    assert.match(w.document.querySelector('#app').textContent, /No hay publicaciones que coincidan/);
  } finally { dom.window.close(); }
}
console.log('PASS Tracker/Insights EN/ES: shared preferences, English restore, methodology, empty states, chart labels/tooltips and original account/post text');
