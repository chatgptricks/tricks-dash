import { MessageCircleMore } from 'lucide-react';
import { usePrefs } from './prefsContext';
import LinkedNotes from './LinkedNotes';
import { manualQueueNotes } from './queueNoteText.js';
import './queueNotes.css';

export function QueueNotesBadge({ notes, compact = false, floating = false }) {
  const { t } = usePrefs();
  if (!manualQueueNotes(notes)) return null;
  return <span className={`queue-notes-badge${compact ? ' is-compact' : ''}${floating ? ' is-floating' : ''}`} title={t('Coordinator notes')} aria-label={t('Coordinator notes')}>
    <MessageCircleMore size={compact ? 13 : 14} aria-hidden="true" />
    {!compact ? <span>{t('Has notes')}</span> : null}
  </span>;
}

export function CoordinatorNotes({ notes, copyControl, noteRef, id }) {
  const { t } = usePrefs();
  const text = manualQueueNotes(notes);
  if (!text) return null;
  return <section className="queue-coordinator-notes" ref={noteRef} id={id} tabIndex={-1} aria-label={t('Coordinator notes')}>
    <header><div><span className="queue-notes-kicker">{t('Manual observations')}</span><h3><MessageCircleMore size={17} aria-hidden="true" />{t('Coordinator notes')}</h3></div>{copyControl}</header>
    <LinkedNotes text={text} />
  </section>;
}
