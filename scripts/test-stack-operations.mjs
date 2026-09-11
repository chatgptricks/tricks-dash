import assert from 'node:assert/strict';
import { resolveResearchPost, runStackOperation } from '../src/stackOperations.js';
const cover = { postKey: 'costarica:cover' };
const member = { postKey: 'costarica:older' };
assert.equal(resolveResearchPost([cover, member], [cover], member.postKey), member);
assert.equal(resolveResearchPost([cover, member], [], member.postKey), member);
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
console.log('Stack selection and bounded batch regression tests passed');
