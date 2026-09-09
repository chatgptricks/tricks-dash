import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/mobile-redirect.js', import.meta.url), 'utf8');
const agents = {
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
};
const encode = (state) => Buffer.from(JSON.stringify(state)).toString('base64url');
const route = (url) => JSON.parse(Buffer.from(url.searchParams.get('r'), 'base64url').toString());
function run(path, { agent = 'mac', narrow = true, coarse = true, standalone = false, maxTouchPoints = 10, userAgentData, forceDesktop = false, blockedStorage = false } = {}) {
  const url = new URL(path, 'https://sentientdash.app');
  const storage = new Map(forceDesktop ? [['sentient.forceDesktop', '1']] : []);
  let destination = null;
  vm.runInNewContext(source, {
    location: { pathname: url.pathname, search: url.search, hash: url.hash, origin: url.origin, replace(value) { destination = new URL(value); } },
    navigator: { userAgent: agents[agent] || agent, userAgentData, maxTouchPoints },
    window: { matchMedia(query) { return { matches: query.includes('standalone') ? standalone : query.includes('pointer') ? coarse : narrow }; } },
    sessionStorage: {
      getItem(key) { if (blockedStorage) throw new Error('blocked'); return storage.get(key); },
      setItem(key, value) { if (blockedStorage) throw new Error('blocked'); storage.set(key, value); },
      removeItem(key) { if (blockedStorage) throw new Error('blocked'); storage.delete(key); },
    },
    URL, URLSearchParams, TextEncoder, TextDecoder, Uint8Array, atob, btoa,
  });
  return destination;
}

let checks = 0;
for (const agent of ['mac', 'windows', 'linux']) {
  for (const path of ['/', '/queue.html', '/tracker.html', '/insights.html', '/settings.html', '/?mobile=1']) {
    assert.equal(run(path, { agent }), null, `${agent} must stay desktop even in a narrow touch window: ${path}`);
    checks++;
  }
}
assert.equal(run('/queue.html', { userAgentData: { platform: 'macOS', mobile: true }, maxTouchPoints: 10 }), null);
checks++;
for (const agent of ['iphone', 'android', 'ipad']) {
  const destination = run('/queue.html?task=42', { agent, narrow: false, coarse: false });
  assert.equal(destination.pathname, '/mobile/');
  assert.deepEqual(route(destination), { tab: 'queue', task: '42' });
  assert.equal(run('/mobile/?task=42', { agent }), null);
  assert.equal(run('/queue.html?desktop=1', { agent }), null);
  assert.equal(run('/queue.html', { agent, forceDesktop: true }), null);
  assert.equal(run('/queue.html?mobile=1', { agent, forceDesktop: true }).pathname, '/mobile/');
  checks += 5;
}
assert.equal(run('/', { agent: 'Mozilla/5.0', userAgentData: { platform: 'Android', mobile: true } }).pathname, '/mobile/');
checks++;
for (const [tab, path] of Object.entries({ home: '/', dashboard: '/', queue: '/queue.html', tracker: '/tracker.html', insights: '/insights.html', settings: '/settings.html' })) {
  assert.equal(run(`/mobile/?r=${encode({ tab })}`).pathname, path);
  checks++;
}
const taskDestination = run(`/mobile/?r=${encode({ tab: 'queue', task: 42 })}`);
assert.deepEqual(route(taskDestination), { task: 42 });
const postDestination = run(`/mobile/?r=${encode({ tab: 'dashboard', post: 'cuenta:á-42' })}#details`);
assert.deepEqual(route(postDestination), { post: 'cuenta:á-42' });
assert.equal(postDestination.hash, '#details');
assert.equal(run('/mobile?tab=queue&task=42').pathname, '/queue.html');
assert.equal(run('/mobile/?view=queue').pathname, '/queue.html');
assert.equal(run('/mobile/?desktop=1&r=invalid', { agent: 'iphone', blockedStorage: true }).pathname, '/');
assert.equal(run('/queue.html', { agent: 'android', blockedStorage: true }).pathname, '/mobile/');
checks += 7;

for (const entry of ['index.html', 'queue.html', 'settings.html', 'public/tracker.html', 'public/insights.html', 'mobile/index.html']) {
  const html = fs.readFileSync(new URL(`../${entry}`, import.meta.url), 'utf8');
  assert.match(html, /<script src="\/mobile-redirect\.js\?v=20260908-device"><\/script>/, `${entry} must run the current device gate before app startup`);
  checks++;
}
console.log(`Mobile routing: ${checks} checks passed.`);
