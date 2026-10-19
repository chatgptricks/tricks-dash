function postKey(post) {
  const account = String(post?.account || '').trim().toLowerCase();
  const shortcode = String(post?.shortcode || '').trim();
  return shortcode ? JSON.stringify([account, shortcode]) : null;
}

function sameValue(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
}

// Metric replay can finish after a user has edited the now-visible complete
// snapshot. Preserve only fields changed locally since that snapshot, allowing
// every other field to receive its fresh server value.
export function reconcileDashboardPosts(basePosts, currentPosts, incomingPosts) {
  if (basePosts === currentPosts || !basePosts?.length || !currentPosts?.length) return incomingPosts;
  const baseline = new Map(basePosts.map((post) => [postKey(post), post]));
  const edits = new Map();
  for (const current of currentPosts) {
    const key = postKey(current);
    const base = key && baseline.get(key);
    if (!base || base === current) continue;
    const fields = [...new Set([...Object.keys(base), ...Object.keys(current)])]
      .filter((field) => Object.hasOwn(base, field) !== Object.hasOwn(current, field) || !sameValue(base[field], current[field]));
    if (fields.length) edits.set(key, { current, fields });
  }
  if (!edits.size) return incomingPosts;
  let changed = false;
  const reconciled = incomingPosts.map((incoming) => {
    const edit = edits.get(postKey(incoming));
    if (!edit) return incoming;
    let result = incoming;
    for (const field of edit.fields) {
      const present = Object.hasOwn(edit.current, field);
      if (present === Object.hasOwn(incoming, field) && sameValue(incoming[field], edit.current[field])) continue;
      if (result === incoming) result = { ...incoming };
      if (present) result[field] = edit.current[field];
      else delete result[field];
    }
    changed ||= result !== incoming;
    return result;
  });
  return changed ? reconciled : incomingPosts;
}
