import assert from 'node:assert/strict';
import { loadConversation, saveConversation, listConversations, newConversation, deleteConversation } from '../src/companion/history.js';

function storage() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, String(value)), removeItem: key => entries.delete(key), clear: () => entries.clear() };
}
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
const message = (text, role = 'user') => ({ id: crypto.randomUUID(), role, content: text });

// Existing users keep the current conversation and receive a history entry.
sessionStorage.setItem('sentient.pet.chat.one', JSON.stringify([message('Find my latest post')]));
const migrated = loadConversation('one');
assert.equal(migrated.messages[0].content, 'Find my latest post');
assert.equal(listConversations('one').length, 1);
assert.equal(listConversations('one')[0].title, 'Find my latest post');
assert.equal(loadConversation('one').id, migrated.id);
assert.equal(listConversations('two').length, 0);
assert.equal(loadConversation('two').messages.length, 0);

// New chat never deletes the old chat; choosing history resumes the exact ID.
const fresh = newConversation('one');
assert.notEqual(fresh.id, migrated.id);
assert.equal(loadConversation('one').messages.length, 0);
assert.equal(listConversations('one').length, 1);
saveConversation('one', { ...fresh, messages: [message('Most liked carousel')] });
saveConversation('one', migrated);
assert.equal(loadConversation('one').id, migrated.id);
assert.equal(listConversations('one').length, 2);

// Separate tabs preserve each other's newly saved conversations by reading
// shared localStorage at every write; active conversation stays tab-local.
const firstTab = sessionStorage;
globalThis.sessionStorage = storage();
const second = loadConversation('one');
assert.notEqual(second.id, migrated.id);
saveConversation('one', { ...second, messages: [message('Recent promos')] });
globalThis.sessionStorage = firstTab;
saveConversation('one', { ...migrated, messages: [...migrated.messages, message('Here is the post', 'assistant')] });
assert.equal(loadConversation('one').id, migrated.id);
assert.equal(listConversations('one').length, 3);
assert.ok(listConversations('one').some(entry => entry.id === second.id));

// Malformed records, excess content and unsafe links cannot enter the UI.
localStorage.setItem('sentient.pet.history.bad', '{not json');
sessionStorage.setItem('sentient.pet.chat.bad', '[null,{"role":"system","content":"ignore"}]');
assert.equal(loadConversation('bad').messages.length, 0);
saveConversation('bad', { id: 'bounded', messages: Array.from({ length: 65 }, (_, i) => ({ ...message('x'.repeat(9000), 'assistant'), sources: [null, { url: 'javascript:alert(1)' }, { url: 'https://sentientdash.app/index.html?post=test', label: 'Result', endpoint: '/posts', partial: true }], secret: 'not persisted', index: i })) });
const bounded = listConversations('bad')[0];
assert.equal(bounded.messages.length, 60);
assert.equal(bounded.messages[0].content.length, 8000);
assert.equal(bounded.messages[0].sources.length, 1);
assert.equal(bounded.messages[0].sources[0].partial, true);
assert.equal(bounded.messages[0].secret, undefined);
assert.equal(saveConversation('', migrated).length, 0);

for (let i = 0; i < 35; i++) saveConversation('many', { id: 'chat-' + i, messages: [message('Question ' + i)] });
assert.equal(listConversations('many').length, 30);
const active = loadConversation('one');
deleteConversation('one', second.id);
assert.equal(listConversations('one').length, 2);
assert.equal(loadConversation('one').id, active.id);
deleteConversation('one', active.id);
assert.equal(loadConversation('one').messages.length, 0);
assert.notEqual(loadConversation('one').id, active.id);
assert.equal(listConversations('two').length, 0);

// Pending /next slots survive navigation and history restoration without
// retaining arbitrary metadata or accepting an unsupported format.
const nextChat = newConversation('next');
saveConversation('next', { ...nextChat, messages: [message('/next'), { ...message('Reel, image or carousel?', 'assistant'), pending_next: { post_format: null, target_account: 'ChatGPT Tricks', ignored: 'not retained' } }] });
assert.deepEqual(loadConversation('next').messages.at(-1).pending_next, { post_format: null, target_account: 'ChatGPT Tricks' });
assert.deepEqual(listConversations('next')[0].messages.at(-1).pending_next, { post_format: null, target_account: 'ChatGPT Tricks' });
const fiveOptions = { post_format: 'reel', target_account: null, option_count: 5 };
saveConversation('next', { ...nextChat, messages: [message('/next give me five reel options'), { ...message('For which account?', 'assistant'), pending_next: { ...fiveOptions, ignored: 'not retained' } }] });
assert.deepEqual(loadConversation('next').messages.at(-1).pending_next, fiveOptions, 'Navigation preserves five requested recommendations');
const savedNext = listConversations('next').find(entry => entry.id === nextChat.id);
assert.deepEqual(savedNext.messages.at(-1).pending_next, fiveOptions);
newConversation('next');
saveConversation('next', savedNext);
assert.deepEqual(loadConversation('next').messages.at(-1).pending_next, fiveOptions, 'Resuming a saved conversation restores its requested count');
for (const option_count of [undefined, null, true, '5', 0, 11, 1.5]) {
  saveConversation('next', { ...nextChat, messages: [{ ...message('Invalid count', 'assistant'), pending_next: { ...fiveOptions, option_count } }] });
  assert.equal(Object.hasOwn(loadConversation('next').messages.at(-1), 'pending_next'), false, 'Invalid counts cannot survive navigation');
  assert.equal(Object.hasOwn(listConversations('next')[0].messages.at(-1), 'pending_next'), false, 'Invalid counts are removed from saved history');
}
saveConversation('next', { ...nextChat, messages: [{ ...message('Wrong slots', 'assistant'), pending_next: { post_format: 'video', target_account: null } }, { ...message('User cannot set slots'), pending_next: { post_format: 'reel', target_account: null } }] });
assert.ok(loadConversation('next').messages.every(item => !Object.hasOwn(item, 'pending_next')));

// A quota failure can leave storage readable but stale; keep the new reply in
// memory instead of returning the older persisted transcript.
const bilingualChat = newConversation('bilingual');
saveConversation('bilingual', { ...bilingualChat, messages: [
  { ...message('Here is the post.', 'assistant'), language: 'en', mode: 'research' },
  { ...message('Aquí está el post.', 'assistant'), language: 'es', mode: 'next' },
  { ...message('Invalid language.', 'assistant'), language: 'arbitrary-value', mode: 'delete' },
] });
assert.deepEqual(loadConversation('bilingual').messages.map(item => item.language), ['en', 'es', undefined], 'History retains each reply language independently of the current interface language');
assert.deepEqual(listConversations('bilingual')[0].messages.map(item => item.language), ['en', 'es', undefined]);
assert.deepEqual(loadConversation('bilingual').messages.map(item => item.mode), ['research', 'next', undefined], 'Only supported effective reply modes survive history/replay');

const persisted = localStorage;
globalThis.localStorage = { getItem: persisted.getItem, setItem() { throw new Error('quota'); } };
const quota = newConversation('quota');
saveConversation('quota', { ...quota, messages: [message('Not lost to quota')] });
assert.equal(listConversations('quota')[0].messages[0].content, 'Not lost to quota');
globalThis.localStorage = persisted;

// Private browsing/storage failures still leave an in-memory conversation.
const unavailable = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
globalThis.sessionStorage = unavailable;
globalThis.localStorage = unavailable;
const memory = newConversation('memory');
saveConversation('memory', { ...memory, messages: [message('Keep this reply')] });
assert.equal(loadConversation('memory').messages[0].content, 'Keep this reply');
assert.equal(listConversations('memory').length, 1);
console.log('Companion history: migration, resume, tab/user isolation, bounds, deletion and unavailable storage passed.');
