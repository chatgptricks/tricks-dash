import { useMemo } from 'react';
export function useTopicGroups(posts, catalogue = posts, sort = 'newest') {
  const groups = useMemo(() => {
    const grouped = new Map();
    for (const post of posts) {
      const key = post.postKey || `${post.account}:${post.shortcode}`;
      const id = post.stackId || key;
      if (!grouped.has(id)) grouped.set(id, { id, posts: [], total: post.stackSize || 1 });
      grouped.get(id).posts.push(post);
    }
    const full = new Map();
    for (const post of catalogue) {
      const id = post.stackId || post.postKey || `${post.account}:${post.shortcode}`;
      if (!grouped.has(id)) continue;
      if (!full.has(id)) full.set(id, []);
      full.get(id).push(post);
    }
    const result = [...grouped.values()].map((group) => ({ ...group, visiblePosts: group.posts, posts: full.get(group.id) || group.posts }));
    const newest = (group) => Math.max(...group.posts.map((post) => Number(post.timestamp) || Date.parse(post.postDate) || 0));
    if (sort === 'newest') result.sort((a,b) => newest(b) - newest(a) || a.id.localeCompare(b.id));
    if (sort === 'oldest') result.sort((a,b) => newest(a) - newest(b) || a.id.localeCompare(b.id));
    return result;
  }, [posts, catalogue, sort]);
  return { groups, loading: false, error: false };
}
