export const stackPostKey = (post) => post.postKey || `${post.account}:${post.shortcode}`;

export function resolveResearchPost(catalogue, filtered, key) {
  if (!key) return filtered[0] || null;
  const exact = catalogue.find((post) => stackPostKey(post) === key);
  if (exact) return exact;
  // Legacy Queue rows can retain the original Instagram permalink even when
  // their source account was not persisted. Instagram shortcodes are global,
  // so this still resolves one exact post from the complete catalogue.
  if (String(key).startsWith('shortcode:')) {
    const shortcode = String(key).slice('shortcode:'.length);
    return catalogue.find((post) => String(post.shortcode || '') === shortcode) || null;
  }
  return null;
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
