import { act } from 'react';
import assert from 'node:assert/strict';
const fixture = [
  { id:'a', title:'First idea', url:'https://example.com/a', priority:0, discarded:0, tweet_text:'Readable tweet '+ 'text '.repeat(130), tweet_image:'https://pbs.twimg.com/media/test.jpg', source:'Role Switcher', shared_at:'2026-09-25T10:00:00Z', slack_url:'https://example.com/slack' },
  { id:'b', title:'Second idea', url:'https://example.com/b', priority:1, discarded:0, source:'Role Switcher', shared_at:'2026-09-24T10:00:00Z', slack_url:'' },
];
let items = structuredClone(fixture), writes = [], fail = false, failList = false, deferredBody = null;
window.fetch = async (url, options={}) => {
  const path = String(url), method = options.method || 'GET';
  let body;
  if (path.endsWith('/me')) body = {is_dev:globalThis.__VAULT_TEST_ROLE !== 'admin', queue_role_preview_active:globalThis.__VAULT_TEST_ROLE === 'preview'};
  else if (method === 'POST' && path.endsWith('/pool')) {
    body = Object.assign(items.find(item => item.id === path.split('/').at(-2)), {pool_request_id:42});
  } else if (method === 'PATCH') {
    if (fail) return {ok:false,status:403,json:async()=>({detail:'Access denied'})};
    const id = path.split('/').pop(), update = JSON.parse(options.body); writes.push(update);
    body = Object.assign(items.find(item => item.id === id), update);
  } else if (method === 'POST') {
    const input = JSON.parse(options.body); body = {...fixture[0], ...input, id:'c', priority:-1}; items.push(body);
  } else {
    if (failList) return {ok:false,status:403,json:async()=>({detail:'Vault temporarily unavailable'})};
    body = {items};
  }
  const pending = method === 'PATCH' ? deferredBody : null;
  return {ok:true,status:200,json:async()=>{ if (pending) await pending; return structuredClone(body); }};
};
const tick = () => new Promise(resolve => setTimeout(resolve,10));
const click = async element => { assert.ok(element); await act(async()=>{ element.click(); await tick(); }); };
try {
  await act(async()=>{ await import('../src/vault.jsx'); await tick(); });
  if (globalThis.__VAULT_TEST_ROLE !== 'dev') {
    assert.equal(document.querySelectorAll('.vault-card').length,0);
    assert.match(document.body.textContent,/DEV full access only/);
    console.log('PASS Vault: restricted role blocked'); process.exit(0);
  }
  assert.equal(document.querySelectorAll('.vault-card').length, 2);
  await act(async()=>{ const input = document.querySelector('[aria-label="Search links"]'); Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'Second'); input.dispatchEvent(new window.Event('input',{bubbles:true})); });
  assert.equal(document.querySelectorAll('.vault-card').length, 1);
  await act(async()=>{ const input = document.querySelector('[aria-label="Search links"]'); Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,''); input.dispatchEvent(new window.Event('input',{bubbles:true})); });
  assert.match(document.querySelector('.vault-tweet p').textContent,/Readable tweet/);
  assert.ok(document.querySelector('.vault-media-link img'));
  await click(document.querySelector('.vault-read-more'));
  assert.equal(document.querySelector('.vault-read-more').getAttribute('aria-expanded'),'true');
  await click(document.querySelector('[aria-label="Move Second idea up"]'));
  assert.equal(document.querySelector('.vault-card h2').textContent,'Second idea');
  assert.ok(writes[0].priority < 0);
  await click(document.querySelector('.vault-discard'));
  assert.equal(document.querySelectorAll('.vault-card').length,1);
  await click([...document.querySelectorAll('.vault-tabs button')][2]);
  assert.equal(document.querySelector('.vault-card h2').textContent,'Second idea');
  await click(document.querySelector('.vault-discard'));
  assert.equal(document.querySelectorAll('.vault-card').length,0);
  await click(document.querySelector('.vault-tabs button'));
  assert.equal(document.querySelectorAll('.vault-card').length,2);
  await click([...document.querySelectorAll('button')].find(button => button.textContent.trim() === '+ Add link'));
  for (const [input, value] of [[document.querySelector('input[type=url]'),'https://example.com/new'],[document.querySelector('.vault-add input:not([type])'),'New idea']]) {
    await act(async()=>{ Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value); input.dispatchEvent(new window.Event('input',{bubbles:true})); });
  }
  await act(async()=>{ document.querySelector('.vault-add').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})); await tick(); });
  assert.equal(document.querySelectorAll('.vault-card').length,3);
  assert.equal(document.querySelector('.vault-card h2').textContent,'New idea');
  await click(document.querySelector('.vault-done'));
  assert.equal(document.querySelectorAll('.vault-card').length,2);
  await click([...document.querySelectorAll('.vault-tabs button')][1]);
  assert.equal(document.querySelector('.vault-card h2').textContent,'New idea');
  assert.equal(document.querySelector('.vault-done').textContent,'Undo Done');
  await click(document.querySelector('.vault-done'));
  assert.equal(document.querySelectorAll('.vault-card').length,0);
  await click(document.querySelector('.vault-tabs button'));
  assert.equal(document.querySelectorAll('.vault-card').length,3);
  await click(document.querySelector('.vault-to-pool'));
  assert.match(document.querySelector('.vault-in-pool').getAttribute('href'),/queue.html\?r=/);
  assert.match(document.querySelector('.vault-in-pool').textContent,/In Queue/);
  fail = true;
  await click(document.querySelector('.vault-discard'));
  assert.equal(document.querySelectorAll('.vault-card').length,3);
  assert.match(document.querySelector('[role=alert]').textContent,/Access denied/);
  fail = false;
  let finishMutation;
  deferredBody = new Promise(resolve => { finishMutation = resolve; });
  await click(document.querySelector('.vault-discard'));
  await act(async()=>{ items = []; globalThis.__setToolTestUser('another-dev@example.com'); await tick(); });
  await act(async()=>{ finishMutation(); await tick(); });
  assert.equal(document.querySelectorAll('.vault-card').length, 0, 'A previous account response must not repopulate Vault');
  assert.equal(document.querySelector('[role=alert]'), null);
  deferredBody = null; failList = true;
  await act(async()=>{ globalThis.__setToolTestUser('third-dev@example.com'); await tick(); });
  assert.match(document.querySelector('.vault-empty').textContent,/could not be loaded/);
  assert.match(document.querySelector('[role=alert]').textContent,/Vault temporarily unavailable/);
  failList = false; items = structuredClone(fixture);
  await click(document.querySelector('[role=alert] button'));
  assert.equal(document.querySelectorAll('.vault-card').length, 2);
  console.log('PASS Vault: search, priority, discard, restore, add, failures, retry and session isolation'); process.exit(0);
} catch(error) { console.error(error); process.exit(1); }
