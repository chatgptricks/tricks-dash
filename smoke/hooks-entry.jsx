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
let drafts = [];
const calls = [];
window.fetch = async (url, options = {}) => {
  const path = String(url);
  const method = options.method || "GET";
  calls.push(`${method} ${path}`);
  let body;
  if (path.endsWith("/me"))
    body = { is_dev: globalThis.__HOOKS_TEST_ROLE === "dev" };
  else if (path.includes("/hooks/generate"))
    body = {
      hooks: Array.from(
        { length: 6 },
        (_, index) => `Generated prompt hook ${index + 1}`,
      ),
      model: "test-model",
      sources: sourceHooks,
    };
  else if (path.endsWith("/hooks/drafts") && method === "POST") {
    const input = JSON.parse(options.body);
    body = { ...input, id: "draft-1", updated_at: "2026-09-30T12:00:00Z" };
    drafts = [body];
  } else if (path.endsWith("/hooks/drafts")) body = { drafts };
  else if (/\/hooks\/[^/]+\/save/.test(path))
    body = { id: path.split("/").at(-2), saved: true };
  else if (path.includes("/hooks?"))
    body = {
      results: sourceHooks,
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
  else body = {};
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

try {
  await act(async () => {
    await import("../src/hooks.jsx");
    await tick(60);
  });
  if (globalThis.__HOOKS_TEST_ROLE !== "dev") {
    assert.equal(document.querySelectorAll(".hook-card").length, 0);
    assert.match(document.body.textContent, /DEV full access/);
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
  console.log(
    "PASS Hooks: hybrid search, source selection, six variants, editing and private drafts",
  );
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
