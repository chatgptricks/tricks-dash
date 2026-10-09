import assert from 'node:assert/strict';
import { PROMO_BRIEF_ES } from '../src/promoBriefCopy.js';
import {
  CLASSIFICATION_LABELS, RELATIONSHIP_LABELS, promoKey, normalizeClient,
  safeExternalUrl, inspectPromo, selectPromos, summarizePromos,
  getRelatedPromos, buildReviewBrief,
} from '../src/promosIntelligence.js';

const post = (shortcode, values = {}) => ({
  account: 'creator', shortcode, client: 'Example Brand', product: null,
  classification: 'disclosed', review_status: 'new',
  published_at: '2026-10-01T12:00:00Z', first_detected_at: '2026-10-02T12:00:00Z',
  evidence: [{ family: 'explicit', rule: 'sponsored', source: 'caption', text: 'Sponsored by Example Brand.' }],
  permalink: `https://www.instagram.com/p/${shortcode}/`,
  ...values,
});

assert.equal(CLASSIFICATION_LABELS.not_promo, 'Not a promotion');
assert.equal(RELATIONSHIP_LABELS.editorial_mention, 'Editorial mention without an offer');
assert.equal(promoKey(post('one')), 'creator:one');

for (const unknown of ['', 'unknown', ' Unknown Client ', 'N/A', null, undefined, {}, []]) {
  assert.equal(normalizeClient(unknown), '', `Unknown client: ${unknown}`);
  assert.equal(inspectPromo(post('one', { client: unknown })).missingClient, true);
}
assert.equal(normalizeClient('@Example   Brand'), 'example brand');
assert.notEqual(normalizeClient('Example Brand'), normalizeClient('ExampleBrand'), 'Do not guess brand aliases');

for (const url of ['javascript:alert(1)', 'data:text/html,hello', '//example.com', '/relative', 'mailto:hello@example.com', 'https://secret:password@example.com', null, {}, []]) {
  assert.equal(safeExternalUrl(url), '', `Unsafe or non-web URL: ${url}`);
}
assert.equal(safeExternalUrl(' https://example.com/path?q=1 '), 'https://example.com/path?q=1');
assert.equal(safeExternalUrl('http://example.com'), 'http://example.com/');

const clear = post('clear');
assert.equal(inspectPromo(clear).missingEvidence, false, 'List rows need not include caption');
assert.equal(inspectPromo(clear).priority, 'low');
assert.equal(inspectPromo(clear).hasStrongEvidence, true);

const conflict = post('conflict', {
  jev_review: { recommendation: 'no_promotion_signal', commercialRelationship: 'editorial_mention', deterministicClassification: 'disclosed', contextExcerpt: 'A report about the new product.' },
});
assert.equal(inspectPromo(conflict).hasConflict, true);
assert.equal(inspectPromo(conflict).priority, 'high');
assert.equal(inspectPromo({ ...conflict, review_status: 'reviewed' }).priority, 'low', 'Completed review must not jump back to the head of the queue');
assert.equal(inspectPromo({ ...conflict, review_status: 'dismissed' }).priority, 'low');
const corrected = { ...conflict, shortcode: 'corrected', classification: 'not_promo', overrides: { classification: 'not_promo' } };
assert.equal(inspectPromo(corrected).hasConflict, false, 'A correction must not disagree with the historical rule result');
assert.equal(inspectPromo(corrected).priority, 'low');
assert.equal(inspectPromo(post('organic', { jev_review: { commercialRelationship: 'organic_recommendation' } })).hasConflict, true);

const negated = post('negated', { classification: 'likely', evidence: [{ family: 'affiliate', text: 'Not sponsored. Use my affiliate link.' }] });
assert.equal(inspectPromo(negated).hasConflict, true, 'Preserve denial as a review check without discarding the affiliate offer');
assert.equal(inspectPromo(negated).hasStrongEvidence, true);
assert.equal(inspectPromo(post('negative-family', { evidence: [{ family: 'negation', text: 'Not an ad.' }] })).hasConflict, true);

const candidate = post('candidate', {
  classification: 'needs_review', classification_source: 'jev_semantic_scan',
  evidence: [], jev_review: { contextExcerpt: 'Try Example today.', needsReview: true },
});
assert.equal(inspectPromo(candidate).priority, 'high');
assert.equal(inspectPromo(candidate).missingEvidence, false, 'Saved JEV excerpt is context');
assert.equal(inspectPromo(candidate).hasStrongEvidence, false, 'Semantic discovery is not a disclosure');
assert.ok(inspectPromo(candidate).reasons.some(reason => reason.code === 'jev_candidate'));

const ambiguous = post('ambiguous', { client_candidates: [{ name: 'Example Brand', source: 'mention' }, { name: '@example brand', source: 'mention' }, { name: 'Different Brand', source: 'url' }, { name: 'unknown' }] });
assert.equal(inspectPromo(ambiguous).ambiguousClient, true);
assert.equal(inspectPromo({ ...ambiguous, client_candidates: ambiguous.client_candidates.slice(0, 2) }).ambiguousClient, false, 'Case and @ variants are one candidate');
const missing = post('missing', { client: null, evidence: null });
assert.equal(inspectPromo(missing).missingEvidence, true);
assert.equal(inspectPromo(missing).priority, 'normal');

const malformed = post('malformed', {
  client: {}, product: [], evidence: [null, 'x', {}, { text: {} }], signals: {},
  client_candidates: [null, 'x', {}, { name: {} }], links: 'bad', cta: [], jev_review: [],
});
assert.equal(inspectPromo(malformed).hasStrongEvidence, false);
assert.equal(inspectPromo(malformed).missingEvidence, true);
assert.doesNotThrow(() => buildReviewBrief(malformed, [null, {}, malformed]));
assert.doesNotThrow(() => inspectPromo(null));

const evidenceSearch = post('search', {
  evidence: [{ family: 'affiliate', rule: 'commission', source: 'first_comment', text: 'Earn a commission for Nebula referrals.' }],
  cta: { keyword: 'NEBULA' }, promo_code: 'SAVE20', client_candidates: [{ name: 'Hidden Brand' }],
  jev_review: { contextExcerpt: 'Introducing Stellar Studio.', commercialRelationship: 'affiliate_offer' },
});
for (const query of ['nebula save20', 'hidden brand', 'stellar studio', 'first_comment', 'affiliate offer']) {
  assert.deepEqual(selectPromos([clear, evidenceSearch], { search: query }), [evidenceSearch], `Search all available evidence fields: ${query}`);
}
assert.deepEqual(selectPromos([clear, evidenceSearch], { search: 'unseen caption text' }), [], 'Do not pretend to search captions not returned by the list endpoint');
assert.deepEqual(selectPromos([clear, conflict, corrected], { focus: 'conflicts' }), [conflict]);
assert.deepEqual(selectPromos([clear, candidate], { focus: 'needs_review' }), [candidate]);
assert.deepEqual(selectPromos([clear, candidate], { focus: 'unreviewed_jev' }), [clear]);
assert.deepEqual(selectPromos([clear, candidate], { focus: 'weak_evidence' }), [candidate]);
assert.deepEqual(selectPromos([clear, missing], { focus: 'missing_client' }), [missing]);
assert.deepEqual(selectPromos([clear, ambiguous], { focus: 'multi_brand' }), [ambiguous]);
assert.deepEqual(selectPromos([clear, { ...clear, account: 'different' }], { account: '@creator' }), [clear]);
assert.deepEqual(selectPromos([clear, missing], { client: '@EXAMPLE BRAND' }), [clear]);

const newer = post('newer', { published_at: '2026-10-03T12:00:00Z' });
assert.deepEqual(selectPromos([clear, newer, conflict], { sort: 'priority' }), [conflict, newer, clear]);
assert.deepEqual(selectPromos([clear, newer], { sort: 'oldest' }), [clear, newer]);
assert.deepEqual(selectPromos([clear, newer], { sort: 'newest' }), [newer, clear]);
assert.deepEqual(selectPromos([newer, clear], { sort: 'newest' }), selectPromos([clear, newer], { sort: 'newest' }), 'Ordering must not depend on loaded page order');
assert.deepEqual(selectPromos([clear, { ...clear, client: 'Updated Brand' }]), [{ ...clear, client: 'Updated Brand' }], 'Deduplicate exact post identities and keep latest loaded fields');

const origin = post('origin', { stack_id: 'stack-a', stack_size: 50, product: 'Studio' });
const sameStack = post('same-stack', { stack_id: 'stack-a', client: 'Different Brand' });
const sameProduct = post('same-product', { account: 'second', product: 'Studio' });
const sameBrand = post('same-brand');
const unknownA = post('unknown-a', { client: null });
const unknownB = post('unknown-b', { client: 'Unknown client' });
const relatedRows = [origin, sameStack, sameProduct, sameBrand, unknownA, unknownB];
assert.deepEqual(getRelatedPromos(origin, relatedRows).map(({ item, relation }) => [item.shortcode, relation]), [
  ['same-stack', 'stack'], ['same-product', 'product'], ['same-brand', 'brand'],
]);
assert.deepEqual(getRelatedPromos(unknownA, relatedRows), [], 'Unknown clients are not related brands');
assert.deepEqual(getRelatedPromos(origin, [origin]), [], 'stack_size includes unseen posts; never invent loaded siblings');
assert.equal(selectPromos(relatedRows, { focus: 'related' }).length, 4);

const summary = summarizePromos([clear, clear, conflict, missing, { ...candidate, review_status: 'reviewed' }, { ...newer, review_status: 'dismissed' }, null]);
assert.deepEqual(summary, { loaded: 5, new: 3, reviewed: 1, dismissed: 1, highPriority: 1, conflicts: 1, needsReview: 1, unknownClients: 1, brands: 1, accounts: 1, jevChecked: 2 });
assert.equal(summary.loaded, 5, 'Summary is observed loaded posts, never stack_size or global catalogue');

const brief = buildReviewBrief({ ...origin, links: [{ url: 'javascript:alert(1)' }, { url: 'https://example.com/offer', source: 'caption' }], ...{ jev_review: conflict.jev_review } }, relatedRows);
assert.ok(brief.includes('Rules at JEV review: Disclosed promotion'));
assert.ok(brief.includes('https://example.com/offer'));
assert.ok(!brief.includes('javascript:'), 'Unsafe commercial URLs must not appear as links in briefs');
assert.ok(brief.includes('Same topic stack: @creator / same-stack'));
assert.ok(brief.includes('not proof of a shared campaign'));
assert.ok(brief.includes('Promotion signals do not verify payment'));
assert.ok(!brief.includes('50 related'), 'Do not imply unseen siblings were reviewed');

const spanishSource = {
  ...origin,
  client: 'Brand', product: 'Product',
  evidence: [{ rule: 'sponsored', family: 'explicit', source: 'caption', text: 'Unknown client' }],
  links: [{ url: 'https://example.com/offer', source: 'custom_saved_source' }],
  client_candidates: [{ name: 'Candidate Brand', source: 'mention' }],
  jev_review: {
    commercialRelationship: 'editorial_mention', recommendation: 'conflicting_evidence',
    deterministicClassification: 'disclosed', guidance: 'Needs review',
    contextSource: 'first_comment', contextExcerpt: 'Promotion signals do not verify payment.',
  },
  cta: { keyword: 'BUY_NOW' }, promo_code: 'SAVE20',
};
const originalSpanishSource = structuredClone(spanishSource);
const spanishBrief = buildReviewBrief(spanishSource, relatedRows, copy => PROMO_BRIEF_ES[copy] ?? copy);
for (const expected of [
  'BRIEF DE REVISIÓN DE PROMOCIONES', 'Marca: Brand', 'Producto: Product',
  'Clasificación: Promoción declarada', 'Estado de revisión: nuevo',
  'Prioridad de revisión: alta (solo priorización; no es una probabilidad)',
  'JEV y la etiqueta no coinciden', 'Compara ambas con la publicación original.',
  'EVIDENCIA GUARDADA DE REGLAS', '- sponsored [Texto de la publicación]: Unknown client',
  'Recomendación: Evidencia contradictoria', 'Lectura de la relación: Mención editorial sin una oferta',
  'Orientación: Needs review', 'Fragmento revisado [Primer comentario]: Promotion signals do not verify payment.',
  'Candidate Brand (Mención)', 'https://example.com/offer (custom_saved_source)',
  'Palabra clave de llamada a la acción observada: BUY_NOW', 'Código promocional observado: SAVE20',
  'Mismo grupo temático: @creator / same-stack', 'no pruebas de una campaña compartida',
]) assert.ok(spanishBrief.includes(expected), `Spanish brief preserves meaning and source values: ${expected}`);
assert.equal(spanishBrief.includes('SAVED JEV ASSESSMENT'), false);
assert.deepEqual(spanishSource, originalSpanishSource, 'Localization must not modify detector or source data');
const unknownStatusBrief = buildReviewBrief({ ...spanishSource, review_status: 'future_review_state' }, [], copy => PROMO_BRIEF_ES[copy] ?? copy);
assert.ok(unknownStatusBrief.includes('Estado de revisión: future_review_state'), 'Unknown enum values stay available verbatim');
assert.equal(buildReviewBrief(spanishSource, relatedRows), buildReviewBrief(spanishSource, relatedRows, copy => copy), 'Default brief behavior remains English');

console.log('PASS Promos intelligence: evidence triage, corrected labels, bounded summaries, safe links, search, deterministic ordering, related-post semantics and faithful briefs');

const { groupPromos } = await import('../src/promosIntelligence.js');
const grouped = groupPromos([
  { account: 'one', shortcode: '1', client: 'Acme.ai', client_candidates: [{ name: 'Acme', source: 'hashtag' }], stack_id: 'a', stack_size: 2 },
  { account: 'two', shortcode: '2', client: null, stack_id: 'a', stack_size: 2 },
  { account: 'three', shortcode: '3', client: '@acme' },
  { account: 'four', shortcode: '4', client: null },
  { account: 'five', shortcode: '5', client: null },
]);
assert.equal(grouped.length, 3, 'Known brand and its single-brand topic share one stack; unknown singles stay separate');
assert.equal(grouped[0].items.length, 3);
assert.equal(grouped[0].items[1].client, null, 'Grouping must never assign an inferred brand');
const mixed = groupPromos([
  { account: 'one', shortcode: '1', client: 'Acme', stack_id: 'mixed', stack_size: 3 },
  { account: 'two', shortcode: '2', client: 'Other', stack_id: 'mixed', stack_size: 3 },
  { account: 'three', shortcode: '3', client: null, stack_id: 'mixed', stack_size: 3 },
  { account: 'four', shortcode: '4', client: 'Acme' },
]);
assert.equal(mixed.length, 2, 'A multi-brand topic must not collapse unrelated brand groups');
assert.equal(mixed[0].kind, 'stack');
assert.equal(mixed[0].items.length, 3);
assert.equal(groupPromos([{ account: 'one', shortcode: '1', client: 'Acme.ai' }, { account: 'two', shortcode: '2', client: 'Acme' }]).length, 2, 'No guessed domain aliases');
console.log('PASS Promos automatic brand/topic grouping, explicit aliases, unknown brands and mixed-topic boundaries');
