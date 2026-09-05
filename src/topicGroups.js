// Conservative caption matching. No network calls or changes to source posts.
const STOP = new Set(('the a an and or of to in on for with from by at is are was were be been this that these those it its as but you your we our they their has have had just new now more most how what when who why can could will would says said than into about after before all not only one out over up so do does did using use used follow swipe comment link bio ai de la el los las un una unos unas y o en con por para del al es son fue ser como que se su sus este esta esto lo le te tu tus ha han mas muy ya pero si no sobre entre hoy nuevo nueva aqui').split(' '));
function tokens(post) {
  return [...new Set(String(post.caption || post.headline || post.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/https?:\/\/\S+|[@#][\p{L}\p{N}_\.]+/gu, ' ').split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2 && !STOP.has(word)).slice(0, 65))];
}
export function performanceValue(post, metric = 'likes') {
  if (metric === 'interactions') return post.likes != null && Number(post.likes) >= 0 ? Number(post.likes) + Math.max(0, Number(post.comments) || 0) : -1;
  if (metric === 'comments') return Number.isFinite(Number(post.comments)) && post.comments != null ? Number(post.comments) : -1;
  if (metric === 'engagement') {
    const views = Number(post.videoViewCount ?? post.views ?? post.videoPlayCount ?? 0);
    if (views <= 0 || post.likes == null || Number(post.likes) < 0) return -1;
    return (Number(post.likes) + Math.max(0, Number(post.comments) || 0)) / views;
  }
  return post.likes != null && Number.isFinite(Number(post.likes)) && Number(post.likes) >= 0 ? Number(post.likes) : -1;
}
export function rankTopicPosts(posts, metric) {
  return [...posts].sort((a, b) => performanceValue(b, metric) - performanceValue(a, metric) || performanceValue(b, 'likes') - performanceValue(a, 'likes') || (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0) || String(a.postKey).localeCompare(String(b.postKey)));
}
export function groupTopics(posts, { separate = [] } = {}) {
  const excluded = new Set(separate);
  const docs = posts.map(tokens);
  const frequency = new Map();
  docs.forEach((words) => words.forEach((word) => frequency.set(word, (frequency.get(word) || 0) + 1)));
  const index = new Map(); const groups = [];
  posts.forEach((post, i) => {
    const words = docs[i]; const wordSet = new Set(words);
    const anchors = [...words].sort((a, b) => frequency.get(a) - frequency.get(b)).slice(0, 8);
    const candidates = new Set();
    if (!excluded.has(post.postKey) && words.length >= 6) anchors.forEach((word) => (index.get(word) || []).forEach((id) => candidates.add(id)));
    let winner = null; let best = 0;
    for (const id of candidates) {
      const group = groups[id];
      if (excluded.has(group.posts[0].postKey)) continue;
      const shared = group.words.filter((word) => wordSet.has(word)).length;
      const score = shared / (words.length + group.words.length - shared);
      const coverage = shared / Math.min(words.length, group.words.length);
      const sameWindow = Math.abs((Number(post.timestamp) || 0) - (Number(group.posts[0].timestamp) || 0)) <= 14 * 86400000;
      if (shared >= 6 && (score >= .58 || (coverage >= .85 && shared >= 10)) && (sameWindow || score >= .9) && score > best) { winner = id; best = score; }
    }
    if (winner == null) {
      winner = groups.length; groups.push({ id: post.postKey, posts: [post], words });
      if (!excluded.has(post.postKey) && words.length >= 6) anchors.forEach((word) => { const values = index.get(word) || []; if (values.length < 400) values.push(winner); index.set(word, values); });
    } else groups[winner].posts.push(post);
  });
  return groups.map(({ id, posts: members }) => ({ id, posts: members }));
}
export const editorialStates = { pool: 'In Pool', scheduled: 'Scheduled', in_progress: 'In production', completed: 'Ready to close', closed: 'Published', cancelled: 'Cancelled' };
