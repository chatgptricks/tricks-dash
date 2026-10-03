// Review triage uses the evidence already loaded by Promos. It never changes a
// detector result or treats a review priority as a probability of sponsorship.
export const CLASSIFICATION_LABELS = Object.freeze({
  disclosed: 'Disclosed promotion', likely: 'Likely promotion',
  needs_review: 'Needs review', not_promo: 'Not a promotion',
});

export const RELATIONSHIP_LABELS = Object.freeze({
  paid_sponsorship: 'Sponsored or paid-placement language',
  affiliate_offer: 'Affiliate or referral offer',
  gifted_or_brand_relationship: 'Gifted product or brand relationship',
  own_product_or_service: 'Own product or service',
  organic_recommendation: 'Organic recommendation',
  editorial_mention: 'Editorial mention without an offer',
  unclear: 'Unclear relationship',
});

const text = value => typeof value === 'string' ? value.trim() : '';
const list = value => Array.isArray(value) ? value : [];
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const fold = value => text(value).normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
const UNKNOWN_CLIENTS = new Set(['unknown', 'unknown client', 'unknown brand', 'not specified', 'n/a', 'none', 'null', 'unassigned']);
const PROMOTION_CLASSES = new Set(['disclosed', 'likely']);

export function promoKey(value) {
  const item = record(value);
  return `${text(item.account)}:${text(item.shortcode)}`;
}

export function normalizeClient(value) {
  const name = fold(value).replace(/^@+/, '').trim();
  return UNKNOWN_CLIENTS.has(name) ? '' : name;
}

export function safeExternalUrl(value) {
  try {
    const url = new URL(text(value));
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function uniquePromos(items) {
  const rows = new Map();
  for (const item of list(items)) {
    if (!item || typeof item !== 'object' || !text(item.account) || !text(item.shortcode)) continue;
    rows.set(promoKey(item), item);
  }
  return [...rows.values()];
}

function evidenceRows(item) {
  return list(item.evidence).map(record).filter(entry => text(entry.text) || text(entry.rule));
}

function candidateNames(item) {
  return [...new Set(list(item.client_candidates).map(candidate => normalizeClient(record(candidate).name)).filter(Boolean))];
}

function searchTextFor(item) {
  const jev = record(item.jev_review);
  const cta = record(item.cta);
  return fold([
    item.client, item.product, item.account, item.caption, item.shortcode,
    item.classification, CLASSIFICATION_LABELS[item.classification], item.review_status,
    item.promo_code, item.account_group, item.account_group_label, cta.action, cta.keyword,
    ...list(item.signals),
    ...list(item.client_candidates).flatMap(value => { const candidate = record(value); return [candidate.name, candidate.source]; }),
    ...evidenceRows(item).flatMap(value => [value.family, value.rule, value.source, value.text]),
    ...list(item.links).map(value => record(value).url),
    jev.contextExcerpt, jev.contextSource, jev.guidance, jev.recommendation,
    jev.commercialRelationship, RELATIONSHIP_LABELS[jev.commercialRelationship],
  ].map(text).filter(Boolean).join(' '));
}

export function inspectPromo(value) {
  const item = record(value);
  const jev = record(item.jev_review);
  const evidence = evidenceRows(item);
  const evidenceFamilies = [...new Set(evidence.map(entry => text(entry.family)).filter(Boolean))];
  const missingClient = !normalizeClient(item.client);
  const missingEvidence = !evidence.some(entry => text(entry.text)) && !text(jev.contextExcerpt);
  const hasStrongEvidence = evidenceFamilies.some(family => ['explicit', 'metadata', 'affiliate'].includes(family));
  const ambiguousClient = candidateNames(item).length > 1;
  const activePromotion = PROMOTION_CLASSES.has(item.classification);
  const negativeJev = jev.recommendation === 'conflicting_evidence' || jev.recommendation === 'no_promotion_signal'
    || ['organic_recommendation', 'editorial_mention'].includes(jev.commercialRelationship);
  // A human correction to not_promo must not conflict with an old JEV snapshot.
  const jevConflict = activePromotion && negativeJev;
  const negation = evidenceFamilies.includes('negation') || evidence.some(entry =>
    /\b(?:not\s+(?:a\s+)?(?:sponsored|paid|advertisement)|no\s+es\s+publicidad|sin\s+patrocinio)\b/i.test(text(entry.text)));
  const hasConflict = jevConflict || (activePromotion && negation);
  const reasons = [];
  const add = (code, label, detail) => reasons.push({ code, label, detail });
  if (jevConflict) add('conflict', 'JEV and label disagree', 'The saved semantic assessment reads this differently from the current promotion label. Compare both with the original post.');
  if (activePromotion && negation) add('negation', 'Denial in the evidence', 'A denial of sponsorship appears alongside a promotion label. Check its context and any separate affiliate offer.');
  if (item.classification === 'needs_review') add('needs_review', 'Classification needs review', 'The available detection has not established a clear promotion classification.');
  if (item.classification_source === 'jev_semantic_scan' && item.classification === 'needs_review') add('jev_candidate', 'JEV discovery candidate', 'Semantic discovery surfaced this post for human review; it does not establish a paid relationship.');
  if (jev.needsReview === true && item.classification !== 'not_promo') add('jev_review', 'JEV requests review', 'The saved assessment reports ambiguity in the available post context.');
  if (missingClient) add('missing_client', 'Brand not identified', 'Identify the promoted brand from the source if it is present; leave it unknown otherwise.');
  if (ambiguousClient) add('multi_brand', 'Multiple brand candidates', 'Several extracted names are possible candidates. Check which, if any, is actually being promoted.');
  if (missingEvidence) add('missing_evidence', 'No saved evidence excerpt', 'No rule excerpt or JEV context excerpt is available in this result. Open the post before deciding.');
  else if (!hasStrongEvidence && item.classification !== 'not_promo') add('weak_evidence', 'Indirect evidence only', 'The saved rules do not include explicit disclosure, partnership metadata or affiliate evidence. Inspect the commercial context.');
  const closed = ['reviewed', 'dismissed'].includes(item.review_status) || item.classification === 'not_promo';
  const urgent = hasConflict || item.classification === 'needs_review' || jev.needsReview === true;
  const priority = closed ? 'low' : urgent ? 'high' : reasons.length ? 'normal' : 'low';
  return {
    key: promoKey(item), priority, priorityRank: { high: 3, normal: 2, low: 1 }[priority],
    reasons, hasConflict, hasStrongEvidence, missingClient, missingEvidence,
    ambiguousClient, evidenceFamilies, searchText: searchTextFor(item),
  };
}

function timestamp(item) {
  const value = Date.parse(text(item.published_at) || text(item.first_detected_at));
  return Number.isFinite(value) ? value : 0;
}

export function getRelatedPromos(value, items) {
  const current = record(value);
  const client = normalizeClient(current.client);
  const product = fold(current.product);
  const stack = text(current.stack_id);
  return uniquePromos(items).filter(item => promoKey(item) !== promoKey(current)).flatMap(item => {
    if (stack && stack === text(item.stack_id)) return [{ item, relation: 'stack', label: 'Same topic stack' }];
    if (!client || client !== normalizeClient(item.client)) return [];
    if (product && product === fold(item.product)) return [{ item, relation: 'product', label: 'Same brand and product' }];
    return [{ item, relation: 'brand', label: 'Same brand' }];
  }).sort((a, b) => ({ stack: 0, product: 1, brand: 2 }[a.relation] - { stack: 0, product: 1, brand: 2 }[b.relation])
    || timestamp(b.item) - timestamp(a.item) || promoKey(a.item).localeCompare(promoKey(b.item)));
}

export function selectPromos(items, options = {}) {
  const rows = uniquePromos(items);
  const query = fold(options.search).split(' ').filter(Boolean);
  const account = fold(options.account).replace(/^@/, '');
  const client = normalizeClient(options.client);
  const focus = options.focus || 'all';
  const inspected = rows.map(item => ({ item, inspection: inspectPromo(item) }));
  const selected = inspected.filter(({ item, inspection }) => {
    if (account && fold(item.account).replace(/^@/, '') !== account) return false;
    if (client && normalizeClient(item.client) !== client) return false;
    if (!query.every(token => inspection.searchText.includes(token))) return false;
    switch (focus) {
      case 'conflicts': return inspection.hasConflict;
      case 'missing_client': return inspection.missingClient;
      case 'weak_evidence': return !inspection.hasStrongEvidence;
      case 'multi_brand': return inspection.ambiguousClient;
      case 'related': return getRelatedPromos(item, rows).length > 0;
      case 'unreviewed_jev': return !Object.keys(record(item.jev_review)).length;
      case 'needs_review': return item.classification === 'needs_review';
      default: return true;
    }
  });
  return selected.sort((a, b) => {
    if (options.sort === 'priority' || !options.sort) {
      const priority = b.inspection.priorityRank - a.inspection.priorityRank;
      if (priority) return priority;
    }
    return (options.sort === 'oldest' ? timestamp(a.item) - timestamp(b.item) : timestamp(b.item) - timestamp(a.item))
      || promoKey(a.item).localeCompare(promoKey(b.item));
  }).map(({ item }) => item);
}

export function summarizePromos(items) {
  const rows = uniquePromos(items);
  const inspections = rows.map(inspectPromo);
  return {
    loaded: rows.length,
    new: rows.filter(item => !item.review_status || item.review_status === 'new').length,
    reviewed: rows.filter(item => item.review_status === 'reviewed').length,
    dismissed: rows.filter(item => item.review_status === 'dismissed').length,
    highPriority: inspections.filter(item => item.priority === 'high').length,
    conflicts: inspections.filter(item => item.hasConflict).length,
    needsReview: rows.filter(item => item.classification === 'needs_review').length,
    unknownClients: inspections.filter(item => item.missingClient).length,
    brands: new Set(rows.map(item => normalizeClient(item.client)).filter(Boolean)).size,
    accounts: new Set(rows.map(item => fold(item.account).replace(/^@/, ''))).size,
    jevChecked: rows.filter(item => Object.keys(record(item.jev_review)).length > 0).length,
  };
}

export function buildReviewBrief(value, items = []) {
  const item = record(value);
  const inspection = inspectPromo(item);
  const jev = record(item.jev_review);
  const evidence = evidenceRows(item);
  const related = getRelatedPromos(item, items);
  const sourceUrl = safeExternalUrl(item.permalink);
  const lines = [
    'PROMOS REVIEW BRIEF',
    `Brand: ${inspection.missingClient ? 'Unknown client' : text(item.client)}`,
    `Product: ${text(item.product) || 'Not specified'}`,
    `Account: @${text(item.account).replace(/^@/, '') || 'unknown'}`,
    `Post: ${sourceUrl || 'Link unavailable'}`,
    `Published: ${text(item.published_at) || 'Date unavailable'}`,
    `Classification: ${CLASSIFICATION_LABELS[item.classification] || 'Needs review'}`,
    `Review status: ${text(item.review_status) || 'new'}`,
    `Review priority: ${inspection.priority} (triage only; not a probability)`,
    '', 'REVIEW CHECKS',
    ...(inspection.reasons.length ? inspection.reasons.map(reason => `- ${reason.label}: ${reason.detail}`) : ['- No additional issues surfaced in the loaded evidence.']),
    '', 'SAVED RULE EVIDENCE',
    ...(evidence.length ? evidence.map(entry => `- ${text(entry.rule) || text(entry.family) || 'Signal'} [${text(entry.source) || 'source unspecified'}]: ${text(entry.text) || 'Excerpt unavailable'}`) : ['- No saved rule evidence.']),
  ];
  if (list(item.client_candidates).length) lines.push('', 'EXTRACTED BRAND CANDIDATES', ...list(item.client_candidates).map(record).filter(candidate => text(candidate.name)).map(candidate => `- ${text(candidate.name)} (${text(candidate.source) || 'source unspecified'})`));
  if (Object.keys(jev).length) {
    lines.push('', 'SAVED JEV ASSESSMENT',
      `Relationship reading: ${RELATIONSHIP_LABELS[jev.commercialRelationship] || 'Unclear relationship'}`,
      `Recommendation: ${text(jev.recommendation).replaceAll('_', ' ') || 'Assessment available'}`,
      `Rules at JEV review: ${CLASSIFICATION_LABELS[jev.deterministicClassification] || 'Unavailable'}`,
      `Guidance: ${text(jev.guidance) || 'Unavailable'}`);
    if (text(jev.contextExcerpt)) lines.push(`Reviewed excerpt [${text(jev.contextSource) || 'stored context'}]: ${text(jev.contextExcerpt)}`);
  }
  const links = list(item.links).map(record).map(link => ({ ...link, url: safeExternalUrl(link.url) })).filter(link => link.url);
  if (links.length) lines.push('', 'OBSERVED LINKS', ...links.map(link => `- ${link.url} (${text(link.source) || 'source unspecified'})`));
  if (text(record(item.cta).keyword)) lines.push(`Observed CTA keyword: ${text(record(item.cta).keyword)}`);
  if (text(item.promo_code)) lines.push(`Observed promo code: ${text(item.promo_code)}`);
  if (related.length) lines.push('', 'RELATED LOADED POSTS', ...related.map(({ item: sibling, label }) => `- ${label}: @${text(sibling.account)} / ${text(sibling.shortcode)} · ${CLASSIFICATION_LABELS[sibling.classification] || 'Needs review'} · ${safeExternalUrl(sibling.permalink) || 'Link unavailable'}`));
  lines.push('', 'Scope: this brief uses loaded evidence and saved assessments. Related posts are comparisons, not proof of a shared campaign. Promotion signals do not verify payment.');
  return lines.join('\n');
}

// Group the loaded collection without changing any post's brand or verdict.
// A topic containing several brands stays together as a topic comparison.
export function groupPromos(items) {
  const rows = uniquePromos(items);
  const stackKey = item => item.stack_id && Number(item.stack_size) > 1 ? String(item.stack_id) : '';
  const brandKey = item => {
    const client = normalizeClient(item.client);
    // A domain and disclosure-derived brand can share a group only when the
    // record itself supplies that exact brand candidate (e.g. brand.ai/#BrandPartner).
    const explicit = list(item.client_candidates).map(record).find(candidate => {
      const name = normalizeClient(candidate.name);
      return ['hashtag', 'relationship'].includes(candidate.source) && name && client.startsWith(`${name}.`) && /^[a-z]{2,}$/.test(client.slice(name.length + 1));
    });
    return explicit ? normalizeClient(explicit.name) : client;
  };
  const stackBrands = new Map();
  rows.forEach(item => {
    const stack = stackKey(item), brand = brandKey(item);
    if (stack && !stackBrands.has(stack)) stackBrands.set(stack, new Set());
    if (stack && brand) stackBrands.get(stack).add(brand);
  });
  const groups = new Map();
  rows.forEach(item => {
    const stack = stackKey(item), ownBrand = brandKey(item), brands = stackBrands.get(stack);
    const mixedTopic = brands?.size > 1;
    const brand = ownBrand || (brands?.size === 1 ? [...brands][0] : '');
    const key = mixedTopic ? `stack:${stack}` : brand ? `brand:${brand}` : stack ? `stack:${stack}` : `post:${promoKey(item)}`;
    if (!groups.has(key)) groups.set(key, { key, kind: key.startsWith('brand:') ? 'brand' : stack ? 'stack' : 'post', label: brand || 'Same topic', items: [] });
    groups.get(key).items.push(item);
  });
  return [...groups.values()];
}
