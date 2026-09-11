export const stackPostKey = (post) => post.postKey || `${post.account}:${post.shortcode}`;

export function resolveResearchPost(catalogue, filtered, key) {
  return key ? catalogue.find((post) => stackPostKey(post) === key) || null : filtered[0] || null;
}

// Keep expensive refresh jobs bounded, and keep going after a member fails.
export async function runStackOperation(posts, action, onProgress = () => {}) {
  const unique = [...new Map(posts.map((post) => [stackPostKey(post), post])).values()];
  const failures = [];
  let succeeded = 0;
  for (const [index, post] of unique.entries()) {
    onProgress(index, unique.length);
    try { await action(post); succeeded += 1; }
    catch (error) { failures.push({ key: stackPostKey(post), error }); }
  }
  onProgress(unique.length, unique.length);
  return { succeeded, failures, total: unique.length };
}
