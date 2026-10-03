import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mountApp } from "./mountApp";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  Bookmark,
  Check,
  Copy,
  ExternalLink,
  Heart,
  LoaderCircle,
  Search,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { apiFetch, API_BASE } from "./api";
import {
  firebaseAuth,
  startGoogleSignIn,
  describeSignInError,
} from "./firebase";
import { clearSsoCookie, startSsoRefresh, trySsoSignIn } from "./sso";
import ProductHeader from "./ProductHeader";
import { PrefsProvider } from "./prefsContext";
import "./styles.css";
import "./hooks.css";

// Why a hook is in the results: every typed word, some of them, or only
// related meaning (Jev), which is always listed after the word matches.
const MATCH_LABELS = {
  exact: { label: "Exact words", title: "Contains every word you searched" },
  partial: { label: "Some words", title: "Contains some of the words you searched" },
  related: { label: "Related idea", title: "No matching words; suggested by Jev for its meaning" },
};

// VITE_HOOKS_API_BASE points at a local Hooks server for development. It is
// honored only when this page itself runs locally: a production build made
// on a machine with that .env.local once sent every live search to
// 127.0.0.1 instead of Cortex.
const IS_LOCAL_PAGE = ["localhost", "127.0.0.1", "[::1]"].includes(
  window.location.hostname,
);
const HOOKS_API_BASE = (
  (IS_LOCAL_PAGE && import.meta.env.VITE_HOOKS_API_BASE) || API_BASE
).replace(/\/$/, "");

function fmt(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: number >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(number);
}
function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
}
function human(value) {
  return String(value || "").replaceAll("_", " ");
}

async function request(path, options = {}) {
  const base = path.startsWith("/api/dashboard/hooks")
    ? HOOKS_API_BASE
    : API_BASE;
  const response = await apiFetch(`${base}${path}`, options);
  let body = {};
  try {
    body = await response.json();
  } catch {
    /* preserve status-only errors */
  }
  if (!response.ok)
    throw new Error(
      body.detail?.message ||
        body.detail ||
        `Request returned ${response.status}`,
    );
  return body;
}

function Login({ error }) {
  const [busy, setBusy] = useState(false);
  async function login() {
    setBusy(true);
    try {
      const issue = await startGoogleSignIn();
      if (issue) window.alert(describeSignInError(issue));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="hooks-gate">
      <section>
        <span>Sentient Dash · DEV tool</span>
        <h1>Hooks</h1>
        <p>Search proven openings and turn them into new drafts.</p>
        <button onClick={login} disabled={busy}>
          {busy ? "Signing in…" : "Sign in with Google"}
        </button>
        {error && <p role="alert">{error}</p>}
      </section>
    </main>
  );
}

function HookCard({ item, index, selected, onUse, onToggleSave, saving }) {
  return (
    <article className={`hook-card ${selected ? "is-selected" : ""}`}>
      <div className="hook-card-rank">{String(index + 1).padStart(2, "0")}</div>
      <div className="hook-card-body">
        <div className="hook-card-meta">
          <span className={`hook-origin is-${item.source_kind}`}>
            {item.source_kind === "ocr" ? "OCR" : "Caption"}
          </span>
          <span>@{item.account || "unknown"}</span>
          <span>{dateLabel(item.published_at)}</span>
        </div>
        <blockquote>{item.hook_text}</blockquote>
        <div className="hook-tags">
          {MATCH_LABELS[item.matchType] && (
            <span className={`hook-match is-${item.matchType}`} title={MATCH_LABELS[item.matchType].title}>
              {MATCH_LABELS[item.matchType].label}
            </span>
          )}
          {item.primary_topic && <span>{human(item.primary_topic)}</span>}
          {(item.categories || []).slice(0, 4).map((category) => (
            <span key={category}>{human(category)}</span>
          ))}
          {!item.categorized_at && (
            <span className="is-pending">JEV pending</span>
          )}
        </div>
        <div className="hook-performance">
          <strong>
            <Heart size={15} fill="currentColor" />
            {fmt(item.likes)}
          </strong>
          <span>
            {item.likes == null
              ? "Performance unavailable"
              : "Likes on original post"}
          </span>
          {item.contextScore != null && (
            <span>Context {Math.round(item.contextScore * 100)}%</span>
          )}
        </div>
        <div className="hook-card-actions">
          <button className="hook-use" onClick={() => onUse(item)}>
            <WandSparkles size={15} />
            Use this hook
          </button>
          <button
            className={item.saved ? "is-saved" : ""}
            aria-pressed={item.saved}
            disabled={saving}
            onClick={() => onToggleSave(item)}
          >
            <Bookmark size={15} fill={item.saved ? "currentColor" : "none"} />
            {item.saved ? "Saved" : "Save"}
          </button>
          {item.permalink && (
            <a href={item.permalink} target="_blank" rel="noreferrer">
              Original <ExternalLink size={13} />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function DraftList({ drafts, activeId, onOpen, onDelete }) {
  return (
    <section className="hook-drafts">
      <header>
        <div>
          <span>PRIVATE WORKSPACE</span>
          <h2>Draft hooks</h2>
        </div>
        <b>{drafts.length}</b>
      </header>
      {drafts.length ? (
        <div>
          {drafts.map((draft) => (
            <button
              className={draft.id === activeId ? "active" : ""}
              key={draft.id}
              onClick={() => onOpen(draft)}
            >
              <span>{draft.text}</span>
              <small>
                {draft.topic || "Untitled"} · {dateLabel(draft.updated_at)}
              </small>
              <i
                role="button"
                tabIndex={0}
                aria-label={`Delete ${draft.text}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(draft);
                }}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                    event.stopPropagation();
                    onDelete(draft);
                  }
                }}
              >
                <Trash2 size={13} />
              </i>
            </button>
          ))}
        </div>
      ) : (
        <p>
          Save a hook from the editor and it will stay private to your DEV
          account.
        </p>
      )}
    </section>
  );
}

function HookLab() {
  const session = useRef(0), searchSequence = useRef(0), draftsSequence = useRef(0), editorRevision = useRef(0);
  const savingSourceIds = useRef(new Set());
  const [user, setUser] = useState(undefined);
  const [viewer, setViewer] = useState(null);
  const [authError, setAuthError] = useState("");
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [savingSources, setSavingSources] = useState([]);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState({
    total: 0,
    captions: 0,
    ocr: 0,
    categorized: 0,
    pending: 0,
    drafts: 0,
  });
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [selected, setSelected] = useState([]);
  const [sourceSnapshots, setSourceSnapshots] = useState({});
  const [brief, setBrief] = useState("");
  const [editor, setEditor] = useState("");
  const [rewriteInstruction, setRewriteInstruction] = useState("");
  const [variants, setVariants] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [activeDraft, setActiveDraft] = useState(null);
  const [savedDraftText, setSavedDraftText] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);

  useEffect(() => {
    trySsoSignIn().catch(() => {});
    const unsubscribe = onAuthStateChanged(firebaseAuth, (value) => {
      session.current += 1;
      setUser(value || null);
      setViewer(null);
      setQuery(""); setSearchedQuery(""); setResults([]); setStatus({}); setWarning(""); setError("");
      savingSourceIds.current.clear(); setSavingSources([]);
      setSelected([]); setSourceSnapshots({}); setBrief(""); setEditor("");
      setRewriteInstruction(""); setVariants([]); setDrafts([]); setActiveDraft(null);
      setSavedDraftText(""); setLoading(false); setGenerating(false); setSavingDraft(false); setCategorizing(false); setCopied(false);
    });
    return () => { session.current += 1; unsubscribe(); };
  }, []);
  useEffect(() => (user ? startSsoRefresh() : undefined), [user]);
  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    request("/api/dashboard/me")
      .then((data) => {
        if (active) setViewer(data);
      })
      .catch((reason) => {
        if (active) setViewer({ accessError: reason.message });
      });
    return () => {
      active = false;
    };
  }, [user]);

  const loadDrafts = useCallback(async () => {
    const owner = session.current, sequence = ++draftsSequence.current;
    try {
      const data = await request("/api/dashboard/hooks/drafts");
      if (owner !== session.current || sequence !== draftsSequence.current) return;
      setDrafts(data.drafts || []);
    } catch (reason) {
      if (owner === session.current && sequence === draftsSequence.current) setError(reason.message);
    }
  }, []);

  const search = useCallback(
    async (nextQuery = query) => {
      const owner = session.current, sequence = ++searchSequence.current;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          q: nextQuery.trim(),
          mode: "hybrid",
          limit: "30",
        });
        const data = await request(`/api/dashboard/hooks?${params}`);
        if (owner !== session.current || sequence !== searchSequence.current) return;
        setResults(data.results || []);
        setSearchedQuery(nextQuery.trim());
        setStatus(data.status || {});
        setWarning(data.warning || "");
      } catch (reason) {
        if (owner === session.current && sequence === searchSequence.current) setError(reason.message || "Unable to search hooks.");
      } finally {
        if (owner === session.current && sequence === searchSequence.current) setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    if (!user || !viewer?.is_dev || viewer?.queue_role_preview_active) return;
    search("");
    loadDrafts();
  }, [user, viewer?.is_dev, viewer?.queue_role_preview_active]);

  const selectedItems = useMemo(
    () =>
      selected
        .map((id) => sourceSnapshots[id] || results.find((item) => item.id === id) || { id, source_kind: 'source', hook_text: `Saved source (${id})` }),
    [selected, results, sourceSnapshots],
  );

  function useHook(item) {
    editorRevision.current += 1;
    setSourceSnapshots(current => ({ ...current, [item.id]: item }));
    setSelected((current) =>
      current.includes(item.id) ? current : [...current.slice(-2), item.id],
    );
    setEditor(item.hook_text);
    setActiveDraft(null);
    setVariants([]);
    document
      .querySelector(".hook-studio")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function toggleSave(item) {
    if (savingSourceIds.current.has(item.id)) return;
    savingSourceIds.current.add(item.id);
    setSavingSources([...savingSourceIds.current]);
    const owner = session.current;
    const next = !item.saved;
    setResults((current) =>
      current.map((row) =>
        row.id === item.id ? { ...row, saved: next } : row,
      ),
    );
    try {
      await request(
        `/api/dashboard/hooks/${encodeURIComponent(item.id)}/save`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ saved: next }),
        },
      );
    } catch (reason) {
      if (owner !== session.current) return;
      setResults((current) =>
        current.map((row) =>
          row.id === item.id ? { ...row, saved: !next } : row,
        ),
      );
      setError(reason.message);
    } finally {
      if (owner === session.current) { savingSourceIds.current.delete(item.id); setSavingSources([...savingSourceIds.current]); }
    }
  }

  async function generate(rewrite = false) {
    const owner = session.current, revision = editorRevision.current;
    if (rewrite && !editor.trim()) {
      setError("Choose or write a hook before generating rewrite versions.");
      return;
    }
    if (!rewrite && !query.trim() && !brief.trim() && !selected.length) {
      setError(
        "Enter a topic, add a manual direction, or select a source hook.",
      );
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const data = await request("/api/dashboard/hooks/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: query.trim(),
          manual_input: brief.trim(),
          current_text: rewrite ? editor.trim() : "",
          instruction: rewrite ? rewriteInstruction.trim() : "",
          source_hook_ids: selected,
          count: 6,
        }),
      });
      if (owner !== session.current) return;
      setVariants(data.hooks || []);
      setWarning(data.warning || "");
      if (data.hooks?.[0] && revision === editorRevision.current) {
        editorRevision.current += 1;
        setEditor(data.hooks[0]);
        setActiveDraft(null);
      }
    } catch (reason) {
      if (owner === session.current) setError(reason.message);
    } finally {
      if (owner === session.current) setGenerating(false);
    }
  }

  async function copy() {
    const owner = session.current, revision = editorRevision.current;
    try {
      await navigator.clipboard.writeText(editor);
      if (owner !== session.current || revision !== editorRevision.current) return;
      setCopied(true);
      window.setTimeout(() => { if (owner === session.current) setCopied(false); }, 1500);
    } catch {
      if (owner === session.current) setError("Copy failed. Select the hook text and copy it manually.");
    }
  }

  async function saveDraft() {
    const owner = session.current, revision = editorRevision.current;
    if (!editor.trim()) {
      setError("Write or select a hook before saving.");
      return;
    }
    setSavingDraft(true);
    setError("");
    try {
      let saved;
      if (activeDraft) {
        saved = await request(`/api/dashboard/hooks/drafts/${activeDraft}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: query || brief, text: editor }),
        });
      } else {
        saved = await request("/api/dashboard/hooks/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: query || brief,
            text: editor,
            source_hook_ids: selected,
            generation_context: {
              searchMode: "words_and_context",
              rewriteInstruction,
            },
          }),
        });
      }
      if (owner !== session.current) return;
      if (revision === editorRevision.current) { setActiveDraft(saved.id); setSavedDraftText(editor); }
      await loadDrafts();
    } catch (reason) {
      if (owner === session.current) setError(reason.message);
    } finally {
      if (owner === session.current) setSavingDraft(false);
    }
  }

  async function deleteDraft(draft) {
    const owner = session.current;
    try {
      await request(`/api/dashboard/hooks/drafts/${draft.id}`, {
        method: "DELETE",
      });
      if (owner !== session.current) return;
      setActiveDraft(current => current === draft.id ? null : current);
      await loadDrafts();
    } catch (reason) {
      if (owner === session.current) setError(reason.message);
    }
  }

  async function categorize() {
    const owner = session.current;
    setCategorizing(true);
    setError("");
    try {
      await request("/api/dashboard/hooks/categorize?limit=8", {
        method: "POST",
      });
      if (owner !== session.current) return;
      await search();
    } catch (reason) {
      if (owner === session.current) setError(reason.message);
    } finally {
      if (owner === session.current) setCategorizing(false);
    }
  }

  async function useAnotherAccount() {
    // Open the chooser directly from the click. Awaiting Firebase sign-out
    // first would consume Safari's popup activation and leave the user stuck.
    clearSsoCookie();
    setAuthError("");
    const issue = await startGoogleSignIn();
    if (issue) setAuthError(describeSignInError(issue));
  }

  if (user === undefined)
    return <main className="hooks-loading">Loading Hooks…</main>;
  if (!user) return <Login error={authError} />;
  if (viewer?.accessError)
    return (
      <main className="hooks-gate">
        <section>
          <span>Sentient Dash · DEV tool</span>
          <h1>Hooks</h1>
          <p>Hooks could not verify your DEV access: {viewer.accessError}</p>
          {authError && (
            <p className="hooks-auth-error" role="alert">
              {authError}
            </p>
          )}
          <div className="hooks-gate-actions">
            <button onClick={useAnotherAccount}>
              Use another Google account
            </button>
            <button
              className="is-secondary"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        </section>
      </main>
    );
  if (viewer && (!viewer.is_dev || viewer.queue_role_preview_active))
    return (
      <main className="hooks-gate">
        <section>
          <span>Sentient Dash · DEV tool</span>
          <h1>Hooks</h1>
          <p>This tool is available only in DEV full access.</p>
          {authError && (
            <p className="hooks-auth-error" role="alert">
              {authError}
            </p>
          )}
          <button onClick={useAnotherAccount}>
            Use another Google account
          </button>
        </section>
      </main>
    );
  if (!viewer)
    return <main className="hooks-loading">Verifying DEV access…</main>;

  const signOutNow = () => {
    clearSsoCookie();
    signOut(firebaseAuth);
  };
  return (
    <main className="hooks-shell">
      <ProductHeader
        current="hooks"
        coordinator
        isDev
        account={
          <button className="hooks-account" onClick={signOutNow}>
            <span>
              {user.photoURL ? (
                <img src={user.photoURL} alt="" />
              ) : (
                user.email?.slice(0, 1).toUpperCase()
              )}
            </span>
            <b>{user.email}</b>
            <small>Sign out</small>
          </button>
        }
      >
        <h1>Hooks</h1>
      </ProductHeader>

      <section className="hooks-toolbar">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            search();
          }}
          className="hooks-search-form"
        >
          <label>
            <Search size={19} />
            <input
              aria-label="Search hooks"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try: prompts, AI jobs, creator growth…"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  search("");
                }}
              >
                <X size={16} />
              </button>
            )}
          </label>
          <button
            className="hooks-search-button"
            type="submit"
            disabled={loading}
          >
            {loading ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Search size={17} />
            )}
            {loading ? "Searching" : "Search hooks"}
          </button>
          <span className="hooks-search-method">Words + JEV context</span>
        </form>
      </section>

      <section className="hooks-stats" aria-label="Hook library status">
        <div>
          <strong>{fmt(status.total)}</strong>
          <span>Source hooks</span>
        </div>
        <div>
          <strong>{fmt(status.captions)}</strong>
          <span>Caption openings</span>
        </div>
        <div>
          <strong>{fmt(status.ocr)}</strong>
          <span>Clean OCR openings</span>
        </div>
        <div>
          <strong>{fmt(status.categorized)}</strong>
          <span>JEV categorized</span>
        </div>
        <button onClick={categorize} disabled={categorizing || !status.pending}>
          <Sparkles size={15} />
          {categorizing
            ? "Processing…"
            : status.pending
              ? `Process ${fmt(status.pending)} pending`
              : "JEV caught up"}
        </button>
      </section>
      {warning && <div className="hooks-notice is-warning">{warning}</div>}
      {error && (
        <div className="hooks-notice is-error" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="hooks-workspace">
        <section className="hooks-results">
          <header>
            <div>
              <span>PROVEN LIBRARY</span>
              <h2>
                {searchedQuery ? `Results for “${searchedQuery}”` : "Best-performing hooks"}
              </h2>
            </div>
            <b>{results.length}</b>
          </header>
          {results.length ? (
            results.map((item, index) => (
              <HookCard
                key={item.id}
                item={item}
                index={index}
                selected={selected.includes(item.id)}
                onUse={useHook}
                onToggleSave={toggleSave}
                saving={savingSources.includes(item.id)}
              />
            ))
          ) : (
            <div className="hooks-empty">
              <strong>{loading ? "Searching your hook library…" : error ? "Hook results could not be loaded." : "No hooks matched this search."}</strong>
              <span>
                {loading ? "Matching words and context." : error ? "Search again to retry. Your drafts remain available." : "Try a shorter phrase or a broader description of the topic."}
              </span>
            </div>
          )}
        </section>

        <aside className="hook-studio">
          <section className="hook-studio-panel">
            <header>
              <div>
                <span>CREATE</span>
                <h2>Build a new hook</h2>
              </div>
              <Sparkles size={20} />
            </header>
            <label className="hook-field">
              <span>Topic or your own direction</span>
              <textarea
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                placeholder="What is the post about? Add any angle, fact, or manual direction you want the AI to follow."
              />
            </label>
            <div className="hook-sources">
              <span>Inspiration sources</span>
              {selectedItems.length ? (
                <div>
                  {selectedItems.map((item) => (
                    <button
                      key={item.id}
                      title={item.hook_text}
                      onClick={() =>
                        setSelected((current) =>
                          current.filter((id) => id !== item.id),
                        )
                      }
                    >
                      <b>{item.source_kind.toUpperCase()}</b>
                      {item.hook_text.slice(0, 62)}
                      <X size={12} />
                    </button>
                  ))}
                </div>
              ) : (
                <p>
                  Select up to three proven hooks, or generate from the current
                  search.
                </p>
              )}
            </div>
            <button
              className="hook-generate"
              onClick={() => generate(false)}
              disabled={generating}
            >
              {generating ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Sparkles size={17} />
              )}
              {generating ? "Generating…" : "Generate 6 hooks"}
            </button>
          </section>

          <section className="hook-editor">
            <header>
              <div>
                <span>EDITABLE DRAFT</span>
                <h2>Your hook</h2>
              </div>
              {activeDraft && <em>{editor === savedDraftText ? "Saved" : "Unsaved changes"}</em>}
            </header>
            <textarea
              aria-label="Editable hook"
              value={editor}
              onChange={(event) => {
                setEditor(event.target.value);
                editorRevision.current += 1;
                setCopied(false);
              }}
              placeholder="Select a proven hook, choose a generated version, or write your own opening here."
            />
            <label>
              <span>
                Rewrite direction <small>optional</small>
              </span>
              <input
                value={rewriteInstruction}
                onChange={(event) => setRewriteInstruction(event.target.value)}
                placeholder="Shorter, more controversial, make it Spanish…"
              />
            </label>
            <div className="hook-editor-actions">
              <button
                onClick={() => generate(true)}
                disabled={generating || !editor.trim()}
              >
                <WandSparkles size={15} />
                Generate versions
              </button>
              <button
                onClick={saveDraft}
                disabled={savingDraft || !editor.trim()}
              >
                <Bookmark size={15} />
                {savingDraft
                  ? "Saving…"
                  : activeDraft
                    ? "Update draft"
                    : "Save draft"}
              </button>
              <button onClick={copy} disabled={!editor.trim()}>
                <Copy size={15} />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </section>

          {variants.length > 0 && (
            <section className="hook-variants">
              <header>
                <span>6 VERSIONS</span>
                <small>Click one to edit it</small>
              </header>
              {variants.map((variant, index) => (
                <button
                  className={variant === editor ? "active" : ""}
                  key={`${variant}-${index}`}
                  onClick={() => {
                    editorRevision.current += 1;
                    setEditor(variant);
                    setActiveDraft(null);
                  }}
                >
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <span>{variant}</span>
                  {variant === editor && <Check size={15} />}
                </button>
              ))}
            </section>
          )}
          <DraftList
            drafts={drafts}
            activeId={activeDraft}
            onOpen={(draft) => {
              editorRevision.current += 1;
              setEditor(draft.text);
              setSavedDraftText(draft.text);
              setQuery(draft.topic || "");
              setActiveDraft(draft.id);
              setSelected(draft.sourceHookIds || []);
            }}
            onDelete={deleteDraft}
          />
        </aside>
      </div>
    </main>
  );
}

mountApp(
  <PrefsProvider lang="en" theme="dark">
    <HookLab />
  </PrefsProvider>,
  { lang: 'en' },
);
