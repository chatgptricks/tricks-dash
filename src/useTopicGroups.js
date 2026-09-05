import { useEffect, useMemo, useState } from 'react';
import { groupTopics } from './topicGroups';
export function useTopicGroups(posts, enabled, separate) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const input = posts.map((post) => ({ postKey: post.postKey || `${post.account}:${post.shortcode}`, caption: post.caption || post.headline || post.title, timestamp: post.timestamp || new Date(post.postDate).getTime() }));
    const signature = input.map((post) => `${post.postKey}:${post.caption || ''}:${post.timestamp || ''}`).join('|');
    const cacheKey = `sentient.research.topic-cache.v2:${separate.join(',')}:${signature.length}:${input.length}`;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (cached?.groups && cached.signature === signature) { setResult({ posts, separate, groups: cached.groups }); return () => { active = false; }; }
    } catch {}
    const finish = (groups) => { try { localStorage.setItem(cacheKey, JSON.stringify({ signature, groups })); } catch {} if (active) setResult({ posts, separate, groups }); };
    if (typeof Worker === 'undefined') {
      finish(groupTopics(input, { separate }).map((group) => ({ id: group.id, keys: group.posts.map((post) => post.postKey) })));
      return () => { active = false; };
    }
    const worker = new Worker(new URL('./topicWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => finish(data);
    worker.onerror = () => { if (active) setResult({ posts, separate, groups: input.map((post) => ({ id: post.postKey, keys: [post.postKey] })), error: true }); };
    worker.postMessage({ posts: input, separate });
    return () => { active = false; worker.terminate(); };
  }, [posts, enabled, separate]);
  const ready = result?.posts === posts && result?.separate === separate;
  const groups = useMemo(() => {
    if (!enabled || !ready) return [];
    const byKey = new Map(posts.map((post) => [post.postKey || `${post.account}:${post.shortcode}`, post]));
    return result.groups.map((group) => ({ id: group.id, posts: group.keys.map((key) => byKey.get(key)).filter(Boolean) }));
  }, [result, ready, enabled, posts]);
  return { groups, loading: enabled && !ready, error: enabled && ready && result.error };
}
