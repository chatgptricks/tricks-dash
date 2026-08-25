import { createRoot } from 'react-dom/client';
import { act } from 'react';
import App from '../src/App.jsx';

let previewCalls = 0;
const stub = async (u) => {
  const s = String(u);
  if (s.includes('/accounts/preview')) {
    previewCalls++;
    return { ok: true, status: 200, json: async () => ({ handle: 'technology', full_name: 'Technology', followers_count: 9002762, profile_pic_url: null }) };
  }
  if (s.includes('/api/dashboard/posts')) return { ok: true, status: 200, json: async () => ({ posts: [], summary: {}, ranges: {} }) };
  if (s.includes('/api/dashboard/accounts')) return { ok: true, status: 200, json: async () => ({ accounts: [] }) };
  if (s.includes('/api/dashboard/lists')) return { ok: true, status: 200, json: async () => ({ lists: [] }) };
  if (s.includes('/api/dashboard/me')) return { ok: true, status: 200, json: async () => ({ is_admin: true }) };
  return { ok: true, status: 200, json: async () => ({}) };
};
globalThis.fetch = stub; window.fetch = stub;

const el = document.getElementById('root');
(async () => {
 try {
  const root = createRoot(el);
  await act(async () => { root.render(<App />); });
  await act(async () => { await new Promise(r => setTimeout(r, 400)); });

  const openBtn = [...document.querySelectorAll('button')].find(b => /Add account/i.test(b.getAttribute('title') || b.textContent));
  const ok = {};
  // The wizard lives behind the account popover; drive it directly instead.
  const acct = [...document.querySelectorAll('.filter-trigger')].find(b => /Account/.test(b.textContent));
  if (acct) await act(async () => { acct.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await act(async () => { await new Promise(r => setTimeout(r, 200)); });
  const addBtn = [...document.querySelectorAll('.account-multiselect-add')][0];
  if (addBtn) await act(async () => { addBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await act(async () => { await new Promise(r => setTimeout(r, 300)); });

  const input = document.querySelector('.wizard-handle-input input');
  ok['wizard opens'] = Boolean(input);
  ok['has a Check button'] = Boolean([...document.querySelectorAll('.wizard-handle-input button')].length);

  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  for (const v of ['t','te','tec','tech','techn','techno','technol','technolo','technolog','technology']) {
    await act(async () => { setter.call(input, v); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
  }
  await act(async () => { await new Promise(r => setTimeout(r, 2000)); });
  ok['typing fires no lookups'] = previewCalls === 0;
  console.log('   lookups after typing 10 chars:', previewCalls);

  await act(async () => { input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  await act(async () => { await new Promise(r => setTimeout(r, 400)); });
  ok['Enter fires exactly one'] = previewCalls === 1;
  ok['shows the result'] = /Technology|9M|9,002,762/.test(document.body.textContent);

  const check = [...document.querySelectorAll('.wizard-handle-input button')][0];
  await act(async () => { check.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await act(async () => { await new Promise(r => setTimeout(r, 400)); });
  ok['Check button fires one more'] = previewCalls === 2;


  // --- HOT threshold field --------------------------------------------------
  // Move to step 2, where the threshold lives.
  const next = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Next');
  if (next) await act(async () => { next.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await act(async () => { await new Promise(r => setTimeout(r, 250)); });
  const num = [...document.querySelectorAll('.modal-field input[type=number]')][0];
  ok['threshold field found'] = Boolean(num);
  ok['starts at 600'] = num?.value === '600';

  const setV = (v) => act(async () => { setter.call(num, v); num.dispatchEvent(new window.Event('input', { bubbles: true })); });
  await setV('');
  ok['clearing leaves it empty'] = num.value === '';
  await setV('1200');
  ok['typing gives exactly what you typed'] = num.value === '1200';
  await act(async () => { num.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })); });
  ok['blur keeps a valid number'] = num.value === '1200';
  await setV('');
  await act(async () => { num.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })); });
  ok['blank on blur falls back, not to 0'] = num.value === '600';


  // --- Date range toggle ----------------------------------------------------
  const crashes = [];
  window.addEventListener('error', (e) => crashes.push(e.message));
  const rangeBtn = [...document.querySelectorAll('.wizard-scope-option')].find(b => /Date range/.test(b.textContent));
  ok['Date range button exists'] = Boolean(rangeBtn);
  if (rangeBtn) await act(async () => { rangeBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await act(async () => { await new Promise(r => setTimeout(r, 300)); });
  const dates = [...document.querySelectorAll('.wizard-scope-dates input[type=date]')];
  ok['two date inputs appear'] = dates.length === 2;
  ok['wizard still rendered'] = Boolean(document.querySelector('.wizard-panel'));
  ok['no crash on Date range'] = crashes.length === 0;
  if (crashes.length) console.log('   crash:', crashes[0]);


  // --- Post count mode ------------------------------------------------------
  const countBtn = [...document.querySelectorAll('.wizard-scope-option')].find(b => /Post count/.test(b.textContent));
  ok['Post count option exists'] = Boolean(countBtn);
  if (countBtn) await act(async () => { countBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  await act(async () => { await new Promise(r => setTimeout(r, 250)); });
  const countInput = [...document.querySelectorAll('.modal-field input[type=number]')].pop();
  ok['count field defaults to 2000'] = countInput?.value === '2000';
  ok['shows the estimated cost'] = /\$4\.60/.test(document.body.textContent);
  const setC = (v) => act(async () => { setter.call(countInput, v); countInput.dispatchEvent(new window.Event('input', { bubbles: true })); });
  await setC('');
  ok['count clears'] = countInput.value === '';
  await setC('500');
  ok['cost tracks the count'] = /\$1\.15/.test(document.body.textContent);
  await setC('99999');
  await act(async () => { countInput.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })); });
  ok['caps at 5000 on blur'] = countInput.value === '5000';
  ok['date inputs hidden in count mode'] = document.querySelectorAll('.wizard-scope-dates input[type=date]').length === 0;

  for (const [k,v] of Object.entries(ok)) console.log(`${v?'PASS':'FAIL'}  ${k}`);
  process.exit(Object.values(ok).every(Boolean) ? 0 : 1);
 } catch (e) { console.log('HARNESS ERROR:', e && e.message); process.exit(1); }
})();
