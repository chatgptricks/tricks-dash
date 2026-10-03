import { act } from "react";
import assert from "node:assert/strict";

const sourceHooks = [
  {
    id: "posts:1:caption",
    source_table: "posts",
    source_id: 1,
    source_kind: "caption",
    account: "chatgptricks",
    shortcode: "abc",
    permalink: "https://instagram.com/p/abc",
    published_at: "2026-09-01T10:00:00Z",
    likes: 12000,
    hook_text: "These 5 ChatGPT prompts save me hours every week.",
    primary_topic: "ai_tools",
    categories: ["list_number", "benefit"],
    categorized_at: "2026-09-30T10:00:00Z",
    saved: false,
  },
  {
    id: "dashboard_posts:2:ocr",
    source_table: "dashboard_posts",
    source_id: 2,
    source_kind: "ocr",
    account: "competitor",
    shortcode: "xyz",
    permalink: "https://instagram.com/p/xyz",
    published_at: "2026-09-02T10:00:00Z",
    likes: 6000,
    hook_text: "STOP WRITING PROMPTS LIKE THIS",
    primary_topic: "ai_tools",
    categories: ["direct_command", "contrarian"],
    categorized_at: "2026-09-30T10:00:00Z",
    saved: false,
  },
];
let drafts = [], failGenerate = false, failSave = false, deferredGeneration = null, resolveSearch = null;
const calls = [];
const writes = [];
let copiedText = '';
Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { copiedText = text; } } });
window.fetch = async (url, options = {}) => {
  const path = String(url);
  const method = options.method || "GET";
  calls.push(`${method} ${path}`);
  if (options.body) writes.push({ path, method, body: JSON.parse(options.body) });
  let body;
  if (path.endsWith("/me"))
    body = { is_dev: globalThis.__HOOKS_TEST_ROLE !== "admin", queue_role_preview_active: globalThis.__HOOKS_TEST_ROLE === "preview" };
  else if (path.includes("/hooks/generate")) {
    if (failGenerate) return { ok: false, status: 403, json: async () => ({ detail: 'Generation unavailable' }) };
    if (deferredGeneration) await deferredGeneration;
    body = {
      hooks: Array.from(
        { length: 6 },
        (_, index) => `Generated prompt hook ${index + 1}`,
      ),
      model: "test-model",
      sources: sourceHooks,
    };
  } else if (path.includes('/hooks/drafts/') && method === 'PATCH') {
    if (failSave) return { ok: false, status: 403, json: async () => ({ detail: 'Draft could not be saved' }) };
    body = Object.assign(drafts.find(draft => draft.id === path.split('/').pop()), JSON.parse(options.body));
  } else if (path.includes('/hooks/drafts/') && method === 'DELETE') {
    drafts = drafts.filter(draft => draft.id !== path.split('/').pop()); body = { deleted: true };
  } else if (path.endsWith("/hooks/drafts") && method === "POST") {
    const input = JSON.parse(options.body);
    body = { ...input, id: "draft-1", updated_at: "2026-09-30T12:00:00Z" };
    drafts = [body];
  } else if (path.endsWith("/hooks/drafts")) body = { drafts };
  else if (/\/hooks\/[^/]+\/save/.test(path))
    body = { id: path.split("/").at(-2), saved: true };
  else if (path.includes("/hooks?")) {
    const q = new URL(path).searchParams.get('q');
    if (q === 'slow') await new Promise(resolve => { resolveSearch = resolve; });
    body = {
      results: q === 'empty' || q === 'slow' ? [] : sourceHooks,
      warning: "",
      status: {
        total: 2,
        captions: 1,
        ocr: 1,
        categorized: 2,
        pending: 0,
        drafts: drafts.length,
      },
    };
  } else body = {};
  return { ok: true, status: 200, json: async () => structuredClone(body) };
};
const tick = (delay = 20) =>
  new Promise((resolve) => setTimeout(resolve, delay));
const click = async (element) => {
  assert.ok(element);
  await act(async () => {
    element.click();
    await tick();
  });
};
const input = async (element, value) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype, 'value').set.call(element, value);
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
};
const submitSearch = async value => {
  await input(document.querySelector('[aria-label="Search hooks"]'), value);
  await act(async () => { document.querySelector('.hooks-search-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await tick(); });
};

try {
  await act(async () => {
    await import("../src/hooks.jsx");
    await tick(60);
  });
  if (globalThis.__HOOKS_TEST_ROLE !== "dev") {
    assert.equal(document.querySelectorAll(".hook-card").length, 0);
    assert.match(document.body.textContent, /DEV full access/);
    assert.ok(!calls.some(call => call.includes('/hooks?') || call.includes('/hooks/drafts')));
    console.log("PASS Hooks: restricted role blocked");
    process.exit(0);
  }
  assert.equal(document.querySelectorAll(".hook-card").length, 2);
  assert.match(document.body.textContent, /These 5 ChatGPT prompts/);
  assert.ok(
    [...document.querySelectorAll(".product-nav a")].some(
      (link) => link.textContent === "Hooks",
    ),
  );
  assert.equal(document.querySelector(".hooks-hero"), null);
  assert.equal(document.querySelector(".hooks-mode"), null);
  assert.ok(calls.some((call) => call.includes("mode=hybrid")));
  await click(document.querySelector(".hook-use"));
  assert.match(
    document.querySelector(".hook-editor textarea").value,
    /These 5 ChatGPT prompts/,
  );
  await submitSearch('empty');
  assert.equal(document.querySelectorAll('.hook-card').length, 0);
  assert.match(document.querySelector('.hook-sources').textContent, /These 5 ChatGPT prompts/);
  assert.equal(document.querySelectorAll('.hook-sources button').length, 1);
  await submitSearch('slow');
  await click(document.querySelector('[aria-label="Clear search"]'));
  await act(async () => { resolveSearch(); await tick(); });
  assert.equal(document.querySelectorAll('.hook-card').length, 2, 'Late search must not replace newer results');
  await click(document.querySelector(".hook-generate"));
  assert.equal(document.querySelectorAll(".hook-variants>button").length, 6);
  await click(document.querySelectorAll(".hook-variants>button")[1]);
  assert.equal(
    document.querySelector(".hook-editor textarea").value,
    "Generated prompt hook 2",
  );
  await click(
    [...document.querySelectorAll(".hook-editor-actions button")].find(
      (button) => /Save draft/.test(button.textContent),
    ),
  );
  assert.equal(document.querySelectorAll(".hook-drafts>div>button").length, 1);
  await input(document.querySelector('[aria-label="Editable hook"]'), 'Edited private draft');
  assert.match(document.querySelector('.hook-editor em').textContent, /Unsaved changes/);
  await click([...document.querySelectorAll('.hook-editor-actions button')].find(button => /Update draft/.test(button.textContent)));
  assert.equal(drafts.length, 1, 'Editing an existing draft must update it, not duplicate it');
  assert.equal(drafts[0].text, 'Edited private draft');
  assert.ok(writes.some(call => call.method === 'PATCH' && call.path.endsWith('/drafts/draft-1')));
  await click([...document.querySelectorAll('.hook-editor-actions button')].find(button => button.textContent === 'Copy'));
  assert.equal(copiedText, 'Edited private draft');
  failSave = true;
  await input(document.querySelector('[aria-label="Editable hook"]'), 'Keep this unsaved text');
  await click([...document.querySelectorAll('.hook-editor-actions button')].find(button => /Update draft/.test(button.textContent)));
  assert.match(document.querySelector('[role=alert]').textContent, /Draft could not be saved/);
  assert.equal(document.querySelector('[aria-label="Editable hook"]').value, 'Keep this unsaved text');
  assert.equal(drafts[0].text, 'Edited private draft');
  failSave = false; failGenerate = true;
  await click(document.querySelector('.hook-generate'));
  assert.match(document.querySelector('[role=alert]').textContent, /Generation unavailable/);
  assert.equal(document.querySelector('[aria-label="Editable hook"]').value, 'Keep this unsaved text');
  failGenerate = false;
  let finishGeneration;
  deferredGeneration = new Promise(resolve => { finishGeneration = resolve; });
  await click(document.querySelector('.hook-generate'));
  await input(document.querySelector('[aria-label="Editable hook"]'), 'Typed while generation was pending');
  await act(async () => { finishGeneration(); await tick(); });
  assert.equal(document.querySelector('[aria-label="Editable hook"]').value, 'Typed while generation was pending');
  assert.equal(document.querySelectorAll('.hook-variants>button').length, 6);
  deferredGeneration = null;
  await act(async () => { drafts = []; globalThis.__setToolTestUser('another-dev@example.com'); await tick(60); });
  assert.equal(document.querySelector('[aria-label="Editable hook"]').value, '');
  assert.equal(document.querySelectorAll('.hook-sources button').length, 0);
  assert.equal(document.querySelectorAll('.hook-drafts>div>button').length, 0);
  console.log(
    "PASS Hooks: search races, retained sources, generation, copy, private draft updates, failures and account isolation",
  );
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
