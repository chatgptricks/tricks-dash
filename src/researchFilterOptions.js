// Used by both the actual Research controls and the companion action validator.
export const RESEARCH_POST_TYPES = ['All posts', 'Carousel', 'Video', 'Image'];
export const RESEARCH_SORT_OPTIONS = [
  { value: 'likes-desc', label: 'Most liked' },
  { value: 'comments-desc', label: 'Most commented' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'hot-rate', label: 'Hot rate' },
];
const fields = new Set(['query', 'min_likes', 'min_comments', 'accounts', 'from_date', 'to_date', 'sort', 'post_type', 'promos_only', 'collabs_only']);
export function validResearchFilters(filters) {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters) || Object.keys(filters).some(key => !fields.has(key))) return false;
  if (typeof filters.query !== 'string' || filters.query.length > 200) return false;
  if (!RESEARCH_POST_TYPES.includes(filters.post_type) || !RESEARCH_SORT_OPTIONS.some(option => option.value === filters.sort)) return false;
  if (!Array.isArray(filters.accounts) || filters.accounts.length > 100 || filters.accounts.some(a => typeof a !== 'string' || !/^[a-z0-9_.]{1,64}$/.test(a))) return false;
  if (typeof filters.promos_only !== 'boolean' || typeof filters.collabs_only !== 'boolean') return false;
  for (const key of ['min_likes', 'min_comments']) if (filters[key] !== null && (!Number.isSafeInteger(filters[key]) || filters[key] < 0 || filters[key] > 1e12)) return false;
  for (const key of ['from_date', 'to_date']) if (filters[key] !== null && !/^\d{4}-\d{2}-\d{2}$/.test(filters[key] || '')) return false;
  return true;
}
