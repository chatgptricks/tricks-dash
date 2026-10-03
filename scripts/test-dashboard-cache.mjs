import assert from 'node:assert/strict';

const stored = new Map();
let beforePut;
let beforeMatch;
globalThis.window = {
  caches: {
    async match(key, { cacheName }) {
      const value = stored.get(`${cacheName}:${key}`);
      await beforeMatch?.();
      return value ? new Response(value) : undefined;
    },
    async open(name) {
      return {
        async put(key, response) {
          await beforePut?.();
          stored.set(`${name}:${key}`, await response.text());
        },
        async delete(key) { return stored.delete(`${name}:${key}`); },
      };
    },
  },
};
const reload = (name) => import(`../src/dashboardCache.js?test=${name}`);
const snapshot = (shortcode) => ({ catalogueComplete: true, posts: [{ shortcode }], accounts: [] });
let cache = await reload('initial');
stored.set('sentient-complete-library-v1:/__sentient_complete_library__', JSON.stringify(snapshot('unowned-private-post')));
assert.equal(await cache.readDashboardSnapshot('new@example.test'), null, 'unowned legacy data must never be adopted');
await cache.writeDashboardSnapshot(snapshot('private-a'), ' A@example.test ');
await cache.writeDashboardSnapshot(snapshot('private-b'), 'b@example.test');
assert.equal((await cache.readDashboardSnapshot('a@example.test')).posts[0].shortcode, 'private-a');
assert.equal((await cache.readDashboardSnapshot('b@example.test')).posts[0].shortcode, 'private-b');
assert.equal(await cache.readDashboardSnapshot(), null, 'anonymous reads must never restore a catalogue');
const count = stored.size;
await cache.writeDashboardSnapshot(snapshot('anonymous'));
assert.equal(stored.size, count, 'anonymous writes must not create a shared cache');

cache = await reload('durable');
assert.equal((await cache.readDashboardSnapshot('a@example.test')).posts[0].shortcode, 'private-a', 'owned snapshots survive a reload');
stored.set('sentient-complete-library-v2:/__sentient_complete_library_v2__/c%40example.test', JSON.stringify({ ...snapshot('wrong-owner'), owner: 'a@example.test' }));
assert.equal(await cache.readDashboardSnapshot('c@example.test'), null, 'the stored owner must match the requested identity');

let finishPut;
let putStarted;
const started = new Promise((resolve) => { putStarted = resolve; });
beforePut = () => new Promise((resolve) => { finishPut = resolve; putStarted(); });
const writing = cache.writeDashboardSnapshot(snapshot('late-private-a'), 'a@example.test');
await started;
const clearing = cache.clearDashboardSnapshot('a@example.test');
finishPut();
await Promise.all([writing, clearing]);
beforePut = null;
cache = await reload('after-signout');
assert.equal(await cache.readDashboardSnapshot('a@example.test'), null, 'sign-out must remove even an in-flight write');
assert.equal((await cache.readDashboardSnapshot('b@example.test')).posts[0].shortcode, 'private-b', 'removal stays scoped to its owner');

let finishMatch;
let matchStarted;
const matching = new Promise((resolve) => { matchStarted = resolve; });
beforeMatch = () => new Promise((resolve) => { finishMatch = resolve; matchStarted(); });
cache = await reload('late-read');
const reading = cache.readDashboardSnapshot('b@example.test');
await matching;
await cache.clearDashboardSnapshot('b@example.test');
finishMatch();
assert.equal(await reading, null, 'an already-started read cannot return private data after sign-out');
beforeMatch = null;
window.caches = undefined;
cache = await reload('no-storage');
assert.equal(await cache.readDashboardSnapshot('a@example.test'), null);
await cache.writeDashboardSnapshot(snapshot('no-storage'), 'a@example.test');
console.log('Dashboard cache ownership, reload, sign-out races, and unavailable-storage checks passed.');
