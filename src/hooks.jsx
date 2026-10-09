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
import { SettingsMenu } from "./App";
import { PrefsProvider } from "./prefsContext";
import { useToolLanguage } from "./toolI18n";
import { LanguageSelector } from "./LanguageSelector";
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

function human(value) {
  return String(value || "").replaceAll("_", " ");
}

async function request(path, options = {}) {
  const base = path.startsWith("/api/dashboard/hooks")
    ? HOOKS_API_BASE
    : API_BASE;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  let response;
  try {
    response = await apiFetch(`${base}${path}`, { ...options, signal: controller.signal });
  } catch (reason) {
    if (controller.signal.aborted) throw new Error("Hooks took too long to respond. Please try again.", { cause: reason });
    throw reason;
  } finally {
    clearTimeout(timer);
  }
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
  const { lang, setLang, t, errorText } = useToolLanguage();
  const [busy, setBusy] = useState(false);
  async function login() {
    setBusy(true);
    try {
      const issue = await startGoogleSignIn();
      if (issue) window.alert(describeSignInError(issue, lang));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="hooks-gate">
      <section>
        <LanguageSelector {...{ lang, setLang, t }} />
        <span>{t('Sentient Dash · DEV tool')}</span>
        <h1>{t('Hooks')}</h1>
        <p>{t('Search proven openings and turn them into new drafts.')}</p>
        <button onClick={login} disabled={busy}>
          {t(busy ? "Signing in…" : "Sign in with Google")}
        </button>
        {error && <p role="alert">{errorText(error)}</p>}
      </section>
    </main>
  );
}

function HookCard({ item, index, selected, onUse, onToggleSave, saving }) {
  const { t, dateLabel, fmt } = useToolLanguage();
  return (
    <article className={`hook-card ${selected ? "is-selected" : ""}`}>
      <div className="hook-card-rank">{String(index + 1).padStart(2, "0")}</div>
      <div className="hook-card-body">
        <div className="hook-card-meta">
          <span className={`hook-origin is-${item.source_kind}`}>
            {t(item.source_kind === "ocr" ? "OCR" : "Caption")}
          </span>
          <span>@{item.account || t("unknown")}</span>
          <span>{dateLabel(item.published_at)}</span>
        </div>
        <blockquote>{item.hook_text}</blockquote>
        <div className="hook-tags">
          {MATCH_LABELS[item.matchType] && (
            <span className={`hook-match is-${item.matchType}`} title={t(MATCH_LABELS[item.matchType].title)}>
              {t(MATCH_LABELS[item.matchType].label)}
            </span>
          )}
          {item.primary_topic && <span>{human(item.primary_topic)}</span>}
          {(item.categories || []).slice(0, 4).map((category) => (
            <span key={category}>{human(category)}</span>
          ))}
          {!item.categorized_at && (
            <span className="is-pending">{t('JEV pending')}</span>
          )}
        </div>
        <div className="hook-performance">
          <strong>
            <Heart size={15} fill="currentColor" />
            {fmt(item.likes)}
          </strong>
          <span>
            {t(item.likes == null
              ? "Performance unavailable"
              : "Likes on original post")}
          </span>
          {item.contextScore != null && (
            <span>{t("Context {percent}%", { percent: Math.round(item.contextScore * 100) })}</span>
          )}
        </div>
        <div className="hook-card-actions">
          <button className="hook-use" onClick={() => onUse(item)}>
            <WandSparkles size={15} />
            {t('Use this hook')}
          </button>
          <button
            className={item.saved ? "is-saved" : ""}
            aria-pressed={item.saved}
            disabled={saving}
            onClick={() => onToggleSave(item)}
          >
            <Bookmark size={15} fill={item.saved ? "currentColor" : "none"} />
            {t(item.saved ? "Saved" : "Save")}
          </button>
          {item.permalink && (
            <a href={item.permalink} target="_blank" rel="noreferrer">
              {t('Original')} <ExternalLink size={13} />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function DraftList({ drafts, activeId, onOpen, onDelete }) {
  const { t, dateLabel } = useToolLanguage();
  return (
    <section className="hook-drafts">
      <header>
        <div>
          <span>{t('PRIVATE WORKSPACE')}</span>
          <h2>{t('Draft hooks')}</h2>
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
                {draft.topic || t("Untitled")} · {dateLabel(draft.updated_at)}
              </small>
              <i
                role="button"
                tabIndex={0}
                aria-label={t("Delete {text}", { text: draft.text })}
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
          {t('Save a hook from the editor and it will stay private to your account.')}
        </p>
      )}
    </section>
  );
}

function HookLab() {
  const { lang, setLang, t, fmt, errorText } = useToolLanguage("Hooks");
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
  const [indexBuilding, setIndexBuilding] = useState(false);
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
      setSavedDraftText(""); setIndexBuilding(false); setLoading(false); setGenerating(false); setSavingDraft(false); setCategorizing(false); setCopied(false);
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
        setIndexBuilding(Boolean(data.sync?.busy));
        setWarning(data.sync?.busy ? "Preparing the OCR library. Results will refresh automatically." : data.warning || "");
      } catch (reason) {
        if (owner === session.current && sequence === searchSequence.current) setError(reason.message || "Unable to search hooks.");
      } finally {
        if (owner === session.current && sequence === searchSequence.current) setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    if (!user || !(viewer?.is_dev || viewer?.can_access_hooks) || viewer?.queue_role_preview_active) return;
    search("");
    loadDrafts();
  }, [user, (viewer?.is_dev || viewer?.can_access_hooks), viewer?.queue_role_preview_active]);

  useEffect(() => {
    if (!indexBuilding || !user || loading) return undefined;
    const timer = setTimeout(() => search(searchedQuery), 4000);
    return () => clearTimeout(timer);
  }, [indexBuilding, user, loading, search, searchedQuery]);

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
    if (issue) setAuthError({ signInCode: issue.code || '' });
  }

  if (user === undefined)
    return <main className="hooks-loading">{t('Loading Hooks…')}</main>;
  if (!user) return <Login error={authError} />;
  if (viewer?.accessError)
    return (
      <main className="hooks-gate">
        <section>
          <LanguageSelector {...{ lang, setLang, t }} />
          <span>{t('Sentient Dash · DEV tool')}</span>
          <h1>{t('Hooks')}</h1>
          <p>{t("Hooks could not verify your access:")} {errorText(viewer.accessError)}</p>
          {authError && (
            <p className="hooks-auth-error" role="alert">
              {errorText(authError)}
            </p>
          )}
          <div className="hooks-gate-actions">
            <button onClick={useAnotherAccount}>
              {t('Use another Google account')}
            </button>
            <button
              className="is-secondary"
              onClick={() => window.location.reload()}
            >
              {t('Retry')}
            </button>
          </div>
        </section>
      </main>
    );
  if (viewer && (!(viewer.is_dev || viewer.can_access_hooks) || viewer.queue_role_preview_active))
    return (
      <main className="hooks-gate">
        <section>
          <LanguageSelector {...{ lang, setLang, t }} />
          <span>{t('Sentient Dash · DEV tool')}</span>
          <h1>{t('Hooks')}</h1>
          <p>{t('This tool is available only to authorized accounts.')}</p>
          {authError && (
            <p className="hooks-auth-error" role="alert">
              {errorText(authError)}
            </p>
          )}
          <button onClick={useAnotherAccount}>
            {t('Use another Google account')}
          </button>
        </section>
      </main>
    );
  if (!viewer)
    return <main className="hooks-loading">{t('Verifying access…')}</main>;

  const signOutNow = () => {
    clearSsoCookie();
    signOut(firebaseAuth);
  };
  return (
    <main className="hooks-shell product-page">
      <ProductHeader
        current="hooks"
        canAccessHooks={Boolean(viewer.can_access_hooks)}
        coordinator={Boolean(viewer.is_admin || viewer.is_dev || ["admin", "vc"].includes(viewer.operating_role))}
        isDev={Boolean(viewer.is_dev)}
        account={<SettingsMenu email={user.email} avatarUrl={user.photoURL || viewer.avatar_url} isAdmin={Boolean(viewer.is_admin)} isDev={Boolean(viewer.is_dev)} onSignOut={signOutNow} />}
      >
        <h1>{t('Hooks')}</h1>
      </ProductHeader>

      <section className="hooks-toolbar product-page-controls">
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
              aria-label={t('Search hooks')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('Try: prompts, AI jobs, creator growth…')}
            />
            {query && (
              <button
                type="button"
                aria-label={t('Clear search')}
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
            {t(loading ? "Searching" : "Search hooks")}
          </button>
          <span className="hooks-search-method">{t('Words + JEV context')}</span>
        </form>
      </section>

      <section className="hooks-stats" aria-label={t('Hook library status')}>
        <div>
          <strong>{fmt(status.total)}</strong>
          <span>{t('Source hooks')}</span>
        </div>
        <div>
          <strong>{fmt(status.ocr)}</strong>
          <span>{t('Clean OCR openings')}</span>
        </div>
        <div>
          <strong>{fmt(status.categorized)}</strong>
          <span>{t('JEV categorized')}</span>
        </div>
        <button onClick={categorize} disabled={categorizing || !status.pending}>
          <Sparkles size={15} />
          {categorizing ? t("Processing…") : status.pending ? t("Process {count} pending", { count: fmt(status.pending) }) : t("JEV caught up")}
        </button>
      </section>
      {warning && <div className="hooks-notice is-warning">{errorText(warning)}</div>}
      {error && (
        <div className="hooks-notice is-error" role="alert">
          {errorText(error)}
          <button aria-label={t('Dismiss error')} onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="hooks-workspace">
        <section className="hooks-results">
          <header>
            <div>
              <span>{t('PROVEN LIBRARY')}</span>
              <h2>
                {searchedQuery ? t("Results for “{query}”", { query: searchedQuery }) : t("Best-performing hooks")}
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
              <strong>{t(loading ? "Searching your hook library…" : error ? "Hook results could not be loaded." : "No hooks matched this search.")}</strong>
              <span>
                {t(loading ? "Matching words and context." : error ? "Search again to retry. Your drafts remain available." : "Try a shorter phrase or a broader description of the topic.")}
              </span>
            </div>
          )}
        </section>

        <aside className="hook-studio">
          <section className="hook-studio-panel">
            <header>
              <div>
                <span>{t('CREATE')}</span>
                <h2>{t('Build a new hook')}</h2>
              </div>
              <Sparkles size={20} />
            </header>
            <label className="hook-field">
              <span>{t('Topic or your own direction')}</span>
              <textarea
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                placeholder={t('What is the post about? Add any angle, fact, or manual direction you want the AI to follow.')}
              />
            </label>
            <div className="hook-sources">
              <span>{t('Inspiration sources')}</span>
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
                      <b>{t(item.source_kind === "ocr" ? "OCR" : "Caption").toUpperCase()}</b>
                      {item.hook_text.slice(0, 62)}
                      <X size={12} />
                    </button>
                  ))}
                </div>
              ) : (
                <p>
                  {t('Select up to three proven hooks, or generate from the current search.')}
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
              {t(generating ? "Generating…" : "Generate 6 hooks")}
            </button>
          </section>

          <section className="hook-editor">
            <header>
              <div>
                <span>{t('EDITABLE DRAFT')}</span>
                <h2>{t('Your hook')}</h2>
              </div>
              {activeDraft && <em>{t(editor === savedDraftText ? "Saved" : "Unsaved changes")}</em>}
            </header>
            <textarea
              aria-label={t('Editable hook')}
              value={editor}
              onChange={(event) => {
                setEditor(event.target.value);
                editorRevision.current += 1;
                setCopied(false);
              }}
              placeholder={t('Select a proven hook, choose a generated version, or write your own opening here.')}
            />
            <label>
              <span>
                {t('Rewrite direction')} <small>{t('optional')}</small>
              </span>
              <input
                value={rewriteInstruction}
                onChange={(event) => setRewriteInstruction(event.target.value)}
                placeholder={t('Shorter, more controversial, make it Spanish…')}
              />
            </label>
            <div className="hook-editor-actions">
              <button
                onClick={() => generate(true)}
                disabled={generating || !editor.trim()}
              >
                <WandSparkles size={15} />
                {t('Generate versions')}
              </button>
              <button
                onClick={saveDraft}
                disabled={savingDraft || !editor.trim()}
              >
                <Bookmark size={15} />
                {t(savingDraft
                  ? "Saving…"
                  : activeDraft
                    ? "Update draft"
                    : "Save draft")}
              </button>
              <button onClick={copy} disabled={!editor.trim()}>
                <Copy size={15} />
                {t(copied ? "Copied" : "Copy")}
              </button>
            </div>
          </section>

          {variants.length > 0 && (
            <section className="hook-variants">
              <header>
                <span>{t('6 VERSIONS')}</span>
                <small>{t('Click one to edit it')}</small>
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
  <PrefsProvider theme="dark">
    <HookLab />
  </PrefsProvider>,
);
