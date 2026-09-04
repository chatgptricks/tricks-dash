import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/userAdmin.js'], bundle: true, write: false, format: 'esm',
  define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'isolated-auth', setup(builder) {
    builder.onLoad({ filter: /\/src\/firebase\.js$/ }, () => ({ contents: 'export const firebaseAuth = { currentUser: null };', loader: 'js' }));
  } }],
});
const { saveUserProfile, mergeUserDrafts, userProfileDraft } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const person = { email: 'pd@example.com', display_name: 'Designer', operating_role: 'pd', role: 'viewer', slack_user_id: '', time_zone: '', minutes_per_pp: '' };
const response = (users) => new Response(JSON.stringify({ users }), { headers: { 'Content-Type': 'application/json' } });
let writes = 0;
let reads = 0;
const states = [];
const recovered = await saveUserProfile(person, {
  onStatus: (state) => states.push(state),
  fetcher: async (url, options) => {
    if (options.method === 'POST') {
      writes += 1;
      assert.equal(options.body.get('clear_fields'), 'slack_user_id,time_zone,minutes_per_pp');
      throw new TypeError('Lost response after commit');
    }
    reads += 1;
    return response([person]);
  },
});
assert.equal(recovered.users[0].email, person.email);
assert.equal(writes, 1);
assert.equal(reads, 1);
assert.deepEqual(states, ['saving', 'checking']);

await assert.rejects(saveUserProfile(person, { fetcher: async (url, options) => {
  if (options.method === 'POST') throw new TypeError('Offline');
  return response([{ ...person, display_name: 'Old name' }]);
} }), /draft is kept/);

for (const status of [400, 401, 403, 422]) {
  let attempts = 0;
  await assert.rejects(saveUserProfile(person, { fetcher: async () => {
    attempts += 1;
    return new Response(JSON.stringify({ detail: 'Validation or access denied' }), { status });
  } }));
  assert.equal(attempts, 1, 'validation/access failures must not be reconciled as success');
}

for (const changes of [{ display_name: ' ' }, { minutes_per_pp: '0' }, { minutes_per_pp: '1.5' }, { slack_user_id: 'bad' }]) {
  await assert.rejects(saveUserProfile({ ...person, ...changes }, { fetcher: async () => assert.fail('invalid form sent to server') }));
}

await assert.rejects(saveUserProfile(person, {
  timeoutMs: 5,
  fetcher: async (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true });
  }),
}), /draft is kept/);

const other = { ...person, email: 'other@example.com', display_name: 'Other' };
await assert.rejects(saveUserProfile(person, { timeoutMs: 5, fetcher: () => new Promise(() => {}) }), /draft is kept/);
const baselines = Object.fromEntries([person, other].map((user) => [user.email, userProfileDraft(user)]));
const drafts = { ...baselines, [other.email]: { ...baselines[other.email], display_name: 'Unsaved other edit' } };
const merged = mergeUserDrafts(baselines, [{ ...person, display_name: 'Saved' }, other], drafts, person.email);
assert.equal(merged[person.email].display_name, 'Saved');
assert.equal(merged[other.email].display_name, 'Unsaved other edit');
assert.equal(userProfileDraft({ ...person, slack_user_id: 'U12345678', stored_slack_user_id: '' }).slack_user_id, '');
console.log('User admin: lost-response reconciliation, draft isolation, validation, access errors and bounded timeouts passed.');
