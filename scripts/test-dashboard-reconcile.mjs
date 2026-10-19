import assert from 'node:assert/strict';
import { reconcileDashboardPosts } from '../src/dashboardReconcile.js';

const post = (account, shortcode, extra = {}) => ({
  account, shortcode, likes: 10, comments: 1, hidden: false, is_promo: 0,
  stackId: 'old-stack', stackSize: 2, isCollab: true, collaborators: ['original'], ...extra,
});
const base = [post('ours', 'SHARED'), post('partner', 'SHARED'), post('ours', 'UNCHANGED')];
const incoming = base.map((value) => ({ ...value, likes: 500, comments: 15, collaborators: ['fresh-server-partner'] }));

assert.equal(reconcileDashboardPosts(base, base, incoming), incoming, 'An untouched snapshot keeps the incoming array identity');
assert.equal(reconcileDashboardPosts(base, structuredClone(base), incoming), incoming, 'Equivalent cloned fields are not mistaken for local changes');
const current = [
  { ...base[0], hidden: true, is_promo: 1, stackId: 'new-stack', stackSize: 4 },
  { ...base[1], isCollab: false, collaborators: [] },
  base[2],
];
const result = reconcileDashboardPosts(base, current, incoming);
assert.equal(result[0].hidden, true, 'An in-flight metric response preserves manual hiding');
assert.equal(result[0].is_promo, 1, 'An in-flight metric response preserves a promo toggle');
assert.equal(result[0].stackId, 'new-stack', 'An in-flight metric response preserves stack membership');
assert.equal(result[0].stackSize, 4);
assert.equal(result[0].likes, 500, 'Untouched likes receive the fresh metric value');
assert.equal(result[0].comments, 15, 'Untouched comments receive the fresh metric value');
assert.deepEqual(result[0].collaborators, ['fresh-server-partner'], 'A shared shortcode on another account cannot overwrite fresh metadata');
assert.equal(result[1].isCollab, false, 'Account-specific collaboration edits remain local to that account');
assert.deepEqual(result[1].collaborators, []);
assert.equal(result[2], incoming[2], 'Untouched rows keep their incoming object identity');
assert.equal(incoming[0].hidden, false, 'Reconciliation never mutates the server response');
assert.equal(current[0].likes, 10, 'Reconciliation never mutates the local snapshot');

const reload = [{ ...base[0], likes: 900, likesUpdatedAt: 'manual-reload' }, base[1], base[2]];
const reloaded = reconcileDashboardPosts(base, reload, incoming);
assert.equal(reloaded[0].likes, 900, 'A manual reload made during replay wins for the same metric field');
assert.equal(reloaded[0].likesUpdatedAt, 'manual-reload');
assert.equal(reloaded[0].comments, 15, 'Manual likes do not prevent an independent comment update');
const removedField = { ...base[0] };
delete removedField.stackId;
assert.equal(Object.hasOwn(reconcileDashboardPosts(base, [removedField, base[1], base[2]], incoming)[0], 'stackId'), false, 'A locally removed field is not resurrected');
assert.equal(reconcileDashboardPosts(base, current, result), result, 'An already reconciled response does not need another allocation');
assert.deepEqual(reconcileDashboardPosts(base, current, [incoming[1]]).map((value) => value.account), ['partner'], 'A removed server row is not resurrected from a local edit');
console.log('PASS dashboard reconciliation: local hide/promo/stack edits, account-scoped collaboration, fresh independent metrics, manual reload precedence and unchanged identity');
