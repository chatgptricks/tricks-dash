import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE, apiFetch } from './api';
const Context = createContext(null);
export const postIdentity = (post) => post.postKey || `${post.account}:${post.shortcode}`;
export const useStackActions = () => useContext(Context);
export function StackActions({ children, onSaved }) {
  const [selected, select] = useState([]);
  const [menu, setMenu] = useState(null);
  const [pending, setPending] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const propose = (keys) => { const unique = [...new Set(keys)]; if (unique.length < 2) return; setError(''); setMenu(null); setPending(unique); };
  const mutate = async (endpoint, field, value) => {
    const body = new FormData(); body.set(field, typeof value === 'string' ? value : JSON.stringify(value));
    const response = await apiFetch(`${API_BASE}/api/dashboard/stacks/${endpoint}`, { method: 'POST', body });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || 'Could not save the stack. Try again.');
    onSaved(result);
    return result;
  };
  const separate = async (keys) => {
    setError('');
    try { const result = await mutate('separate', 'keys', keys); select((current) => current.filter((key) => !keys.includes(key))); return result; }
    catch (err) { setError(err.message); throw err; }
  };
  const findSimilar = async (post) => {
    setError('');
    try { return await mutate('find-similar', 'post_key', postIdentity(post)); }
    catch (err) { setError(err.message); throw err; }
  };
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape' && !saving) { setMenu(null); setPending(null); select([]); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [saving]);
  const confirm = async () => {
    setSaving(true); setError('');
    try {
      await mutate('merge', 'keys', pending); select([]); setPending(null);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  return <Context.Provider value={{ selected, select, setMenu, propose, separate, findSimilar, drag, suppressClick }}>
    {children}
    {selected.length > 0 && createPortal(<div className="stack-selection-bar"><span>{selected.length} selected</span><button disabled={selected.length < 2} onClick={() => propose(selected)}>Group</button><button onClick={() => select([])}>Clear</button></div>, document.body)}
    {menu && createPortal(<div className="stack-menu-backdrop" onClick={() => setMenu(null)}><div className="stack-context-menu" role="menu" style={{ left: Math.min(menu.x, window.innerWidth - 230), top: Math.min(menu.y, window.innerHeight - 90) }}><button role="menuitem" disabled={menu.keys.length < 2} onClick={() => propose(menu.keys)}>Group {menu.keys.length} posts</button></div></div>, document.body)}
    {pending && createPortal(<div className="stack-confirm-backdrop"><section role="dialog" aria-modal="true" aria-label="Confirm grouping" className="stack-confirm"><h2>Group these posts?</h2><p>The selected posts and any existing stacks they belong to will become one shared stack for everyone. The newest post will be the cover.</p>{error && <p role="alert">{error}</p>}<footer><button disabled={saving} onClick={() => setPending(null)}>Cancel</button><button disabled={saving} onClick={confirm}>{saving ? 'Saving…' : 'Confirm grouping'}</button></footer></section></div>, document.body)}
  </Context.Provider>;
}
export function StackCard({ posts, children }) {
  const actions = useContext(Context);
  const [over, setOver] = useState(false);
  if (!actions) return children;
  const keys = posts.map(postIdentity);
  const selected = keys.some((key) => actions.selected.includes(key));
  return <div className={`stack-card-shell${selected ? ' is-multiselected' : ''}${over ? ' is-drop-target' : ''}`} draggable
    onDragStart={(event) => { actions.drag.current = keys; actions.suppressClick.current = true; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-sentient-posts', JSON.stringify(keys)); }}
    onDragEnd={() => { actions.drag.current = null; setOver(false); setTimeout(() => { actions.suppressClick.current = false; }, 0); }}
    onDragOver={(event) => { if (!actions.drag.current) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(true); }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOver(false); }}
    onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setOver(false); const source = actions.drag.current; actions.drag.current = null; if (source && !source.every((key) => keys.includes(key))) actions.propose([...source, ...keys]); }}
    onClickCapture={(event) => { if (actions.suppressClick.current) { event.preventDefault(); event.stopPropagation(); return; } if (event.shiftKey) { event.preventDefault(); event.stopPropagation(); actions.select((current) => selected ? current.filter((key) => !keys.includes(key)) : [...new Set([...current, ...keys])]); } }}
    onContextMenu={(event) => { if (!actions.selected.length) return; event.preventDefault(); event.stopPropagation(); actions.setMenu({ x: event.clientX, y: event.clientY, keys: [...new Set([...actions.selected, ...keys])] }); }}>
    {children}
  </div>;
}
