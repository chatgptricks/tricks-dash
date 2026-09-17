import assert from 'node:assert/strict';
import { applyStackMembershipResult, resolveResearchPost, runStackOperation } from '../src/stackOperations.js';
const cover = { postKey: 'costarica:cover', shortcode: 'cover' };
const member = { postKey: 'costarica:older', shortcode: 'older' };
assert.equal(resolveResearchPost([cover, member], [cover], member.postKey), member);
assert.equal(resolveResearchPost([cover, member], [], member.postKey), member);
assert.equal(resolveResearchPost([cover, member], [], `shortcode:${member.shortcode}`), member);
assert.equal(resolveResearchPost([cover], [cover], 'missing'), null);
const calls = [];
const result = await runStackOperation([cover, member, cover], async (post) => {
  calls.push(post.postKey);
  if (post === cover) throw new Error('Refresh failed');
});
assert.deepEqual(calls, [cover.postKey, member.postKey]);
assert.equal(result.succeeded, 1);
assert.equal(result.failures.length, 1);
assert.equal(result.total, 2);
const patched = applyStackMembershipResult(
  [cover, member, { postKey: 'other:one' }],
  { stackId: 'shared', stackSize: 2, postKeys: [cover.postKey, member.postKey] },
);
assert.equal(patched[0].stackId, 'shared');
assert.equal(patched[1].stackId, 'shared');
assert.equal(patched[2].stackId, undefined);
const separated = applyStackMembershipResult(patched, {
  members: [
    { postKey: cover.postKey, stackId: 'cover-only', stackSize: 1 },
    { postKey: member.postKey, stackId: 'member-only', stackSize: 1 },
  ],
});
assert.equal(separated[0].stackId, 'cover-only');
assert.equal(separated[1].stackId, 'member-only');
console.log('Stack selection and bounded batch regression tests passed');
