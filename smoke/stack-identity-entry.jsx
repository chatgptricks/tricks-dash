import { act } from 'react';
import { createRoot } from 'react-dom/client';
import StackIdentity from '../src/StackIdentity';
import TopicStack from '../src/TopicStack';
import { PostDetailPanel } from '../src/postDetail';
import { PrefsProvider } from '../src/prefsContext';
import { useTopicGroups } from '../src/useTopicGroups';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const originalId = 'b72ba3c7-9810-433f-a436-dd88d10ca65a';
const replacementId = 'ca59c450-e15d-4529-b1df-bd626af6d671';
const copied = [];
let failClipboard = false;
Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => {
  if (failClipboard) throw new Error('Clipboard access denied');
  copied.push(value);
} } });
globalThis.fetch = window.fetch = async (url) => {
  assert(String(url).startsWith('https://api.test/'), `Unexpected external request: ${url}`);
  return { ok: true, status: 200, json: async () => ({ preferences: {} }) };
};
const host = document.body.appendChild(document.createElement('div'));
const root = createRoot(host);
const render = async (children, lang = 'en') => act(async () => root.render(<PrefsProvider lang={lang}>{children}</PrefsProvider>));
const copyButton = (scope = host, lang = 'en') => scope.querySelector(`[aria-label="${lang === 'es' ? 'Copiar ID del stack' : 'Copy stack ID'}"]`);
const clickCopy = async (scope, lang) => {
  const button = copyButton(scope, lang);
  assert(button, 'Stack ID needs an accessible copy button');
  await act(async () => { button.click(); await Promise.resolve(); });
};
try {
  await render(<StackIdentity stackId={originalId} />);
  assert(host.textContent.includes(originalId), 'The complete persisted stack ID must be visible');
  await clickCopy(host);
  assert(copied.at(-1) === originalId, 'Copy must preserve every character of the persisted stack ID');
  assert(host.textContent.includes('Stack ID copied.'), 'Successful clipboard write needs visible feedback');

  await render(<StackIdentity stackId={replacementId} />);
  assert(host.textContent.includes(replacementId) && !host.textContent.includes(originalId), 'Switching stacks must show the current ID');
  assert(!host.textContent.includes('Stack ID copied.'), 'The new stack must not retain the previous copy success');
  await clickCopy(host);
  assert(copied.at(-1) === replacementId, 'After switching stacks, copy must use the new ID');
  failClipboard = true;
  await clickCopy(host);
  assert(host.querySelector('[role="alert"]')?.textContent.trim(), 'Denied clipboard access needs visible error feedback');
  failClipboard = false;
  await clickCopy(host);
  assert(copied.at(-1) === replacementId && host.textContent.includes('Stack ID copied.'), 'Clipboard failure must allow a successful retry');
  console.log('PASS complete stack ID, current-stack copying, feedback, clipboard denial and retry');

  await render(<StackIdentity stackId={originalId} />, 'es');
  assert(copyButton(host, 'es'), 'Spanish needs a translated accessible copy label');
  await clickCopy(host, 'es');
  assert(host.textContent.includes('ID del stack copiado.'), 'Spanish copy success must be translated');
  await render(<StackIdentity stackId={null} />);
  assert(!copyButton(host), 'An absent persisted ID must not create a fake post-based stack identity');
  console.log('PASS translated stack identity and missing-ID handling');

  const members = [
    { postKey: 'alpha:older', account: 'alpha', shortcode: 'older', stackId: originalId, stackSize: 3, timestamp: 1000, likes: 60, caption: 'Original story', postType: 'Image' },
    { postKey: 'beta:middle', account: 'beta', shortcode: 'middle', stackId: originalId, stackSize: 3, timestamp: 2000, likes: 120, caption: 'Second version', postType: 'Image' },
    { postKey: 'gamma:newer', account: 'gamma', shortcode: 'newer', stackId: originalId, stackSize: 3, timestamp: 3000, likes: 80, caption: 'Third version', postType: 'Image' },
  ];
  function FilteredGallery() {
    const { groups } = useTopicGroups([members[0]], [...members, { postKey: 'other:unrelated', timestamp: 4000 }]);
    return groups.map(group => <TopicStack key={group.id} stackId={group.id} posts={group.posts} visiblePosts={group.visiblePosts} total={group.total} renderCard={(post, expand) => <button className="identity-fixture-card" onClick={expand}>{post.postKey}</button>} />);
  }
  await render(<FilteredGallery />);
  assert(host.querySelector('.post-stack')?.dataset.stackId === originalId, 'Filtered stack container must retain its persisted ID');
  assert(host.querySelector('.post-stack-trigger')?.textContent === '+3', 'One matching post must retain all three stack members');
  await act(async () => host.querySelector('.post-stack-trigger').click());
  const modal = document.querySelector('.post-stack-modal');
  assert(modal?.dataset.stackId === originalId, 'Open stack must expose the same ID as the collapsed group');
  const shownKeys = [...modal.querySelectorAll('.identity-fixture-card')].map(node => node.textContent).sort();
  assert(shownKeys.join(',') === members.map(post => post.postKey).sort().join(','), 'Opening a filtered stack must include every member from the catalogue');
  assert(!shownKeys.includes('other:unrelated'), 'Unrelated posts must not enter the identified stack');
  await clickCopy(modal);
  assert(copied.at(-1) === originalId && document.querySelector('.post-stack-modal'), 'Copying the stack ID must keep the complete stack open');
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert(!document.querySelector('.post-stack-modal'), 'Stack dialog must remain dismissible with Escape');
  console.log('PASS one persisted ID and complete membership across filtered gallery and expanded stack');

  await render(<TopicStack posts={members} renderCard={(post, expand) => <button className="identity-fixture-card" onClick={expand}>{post.postKey}</button>} />);
  await act(async () => host.querySelector('.post-stack-trigger').click());
  assert(document.querySelector('.post-stack-modal')?.textContent.includes(originalId), 'Existing callers must recover the ID from persisted members');
  await render(<PostDetailPanel post={members[1]} />);
  assert(host.textContent.includes(originalId), 'An individual member detail must show the shared stack ID');
  await clickCopy(host);
  assert(copied.at(-1) === originalId, 'Individual post details must copy the same stack-wide ID');
  console.log('PASS legacy stack callers and shared post detail identity');
} finally {
  await act(async () => root.unmount());
  host.remove();
}
