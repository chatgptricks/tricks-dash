# Smoke test

Renders the real `<App />` in jsdom with Firebase and `fetch` stubbed, then
asserts the header, filters and favicons actually work. `vite build` only
proves the code parses; this proves it runs.

It exists because a past change shipped a blank page: a TDZ error
(`Cannot access 'Tn' before initialization`) that built cleanly and only
failed at render.

## Run

```bash
npm i -D jsdom esbuild     # first time only
node smoke/run.mjs         # exits non-zero on any FAIL or console error
node smoke/favicons.mjs    # emoji favicon per section
```

## What it covers

- Header renders: search field, results count, tool links, account menu
- Tracker and Insights carry `target="_blank"`
- Six filter popovers open, portal to `document.body`, and close on Escape
- Choosing a filter marks its trigger active and adds an active chip
- Clicking a chip clears just that filter
- Search adds a chip; the clear button replaces the ⌘K hint
- ⌘K focuses the search box
- Sign out only reachable through the account menu
- Account list renders inline in its popover, not behind a second trigger
- Favicon and title follow the subdomain (`hot.` → 🔥, `archive.` → 📦, …)
- No `filter-group-card` / "Dash explorer" left over from the old header

## Notes

`smoke/stub-firebase-*.js` replace the real SDK via an esbuild alias, so no
network or real project is touched. `entry.jsx` stubs `globalThis.fetch` **and**
`window.fetch` — `apiFetch` calls `window.fetch`, and stubbing only the former
makes every request fail and the app render its error state instead of the
dashboard.
