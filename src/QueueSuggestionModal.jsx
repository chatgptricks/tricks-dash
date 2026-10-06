import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, CalendarCheck, CheckCircle2, ClipboardList, Link2, LoaderCircle, X, XCircle } from 'lucide-react';
import { suggestedSlotLabel, suggestionSourceUrl } from './queueSuggestions';
import './queueSuggestions.css';

const COPY = {
  en: { title: 'Suggest a post', help: 'Bring an idea from any website or Research. A VC reviews it before it enters your Queue.', source: 'Source link', sourceHelp: 'Instagram, TikTok, YouTube, X, Reddit, an article, or any other website.', account: 'Account', chooseAccount: 'Choose an account', noAccounts: 'You don’t have any active managed accounts yet. Close this form and use Manage accounts in Queue settings to choose or request one.', postTitle: 'Title (optional)', titlePlaceholder: 'Give your idea a short name', type: 'Post type', reason: 'Why would this work?', reasonPlaceholder: 'Describe the idea and how you would adapt it for this account.', placement: 'VC approval required', placementHelp: 'After approval, this post is assigned to you for the selected account at your next available Queue slot. Pending suggestions do not reserve time.', submit: 'Send for approval', saving: 'Sending…', cancel: 'Cancel', close: 'Close', invalidUrl: 'Paste a valid http:// or https:// link.', requiredAccount: 'Choose one of your active managed accounts.', requiredReason: 'Explain why this post would work.', failed: 'Could not send your suggestion. Please retry.', success: 'Added to your Queue', duplicate: 'Already scheduled', successHelp: 'This post is assigned to you.', duplicateHelp: 'Your existing assignment is shown below. No duplicate was created.', assignee: 'Assigned to', scheduled: 'Scheduled', duration: 'Production time', minutes: 'minutes', open: 'Open in Queue', done: 'Done', zone: 'Time zone', you: 'You', sent: 'Sent for approval', waiting: 'Already awaiting approval', pendingHelp: 'Your VC will review this suggestion. It will be assigned and scheduled only after approval.', approved: 'Approved', rejected: 'Not approved', rejectedHelp: 'This suggestion was rejected and has not been scheduled.', approvedHelp: 'Your suggestion has been reviewed. Open the request for details.', status: 'Status', pendingStatus: 'Pending VC approval', suggestedBy: 'Suggested by', viewRequest: 'View request' },
  es: { title: 'Sugerir un post', help: 'Trae una idea de cualquier sitio web o de Research. Un VC la revisará antes de agregarla a tu Queue.', source: 'Link de origen', sourceHelp: 'Instagram, TikTok, YouTube, X, Reddit, un artículo o cualquier otro sitio.', account: 'Cuenta', chooseAccount: 'Elige una cuenta', noAccounts: 'Todavía no tienes cuentas activas asignadas. Cierra este formulario y usa Administrar cuentas en la configuración de Queue para elegir o solicitar una.', postTitle: 'Título (opcional)', titlePlaceholder: 'Dale un nombre corto a tu idea', type: 'Tipo de post', reason: '¿Por qué funcionaría?', reasonPlaceholder: 'Describe la idea y cómo la adaptarías para esta cuenta.', placement: 'Requiere aprobación de un VC', placementHelp: 'Después de aprobarla, se te asignará para la cuenta elegida en tu próximo espacio disponible en Queue. Las sugerencias pendientes no reservan tiempo.', submit: 'Enviar para aprobación', saving: 'Enviando…', cancel: 'Cancelar', close: 'Cerrar', invalidUrl: 'Pega un link válido con http:// o https://.', requiredAccount: 'Elige una de tus cuentas activas.', requiredReason: 'Explica por qué funcionaría este post.', failed: 'No se pudo enviar tu sugerencia. Intenta de nuevo.', success: 'Agregado a tu Queue', duplicate: 'Ya está programado', successHelp: 'Este post está asignado a ti.', duplicateHelp: 'Esta es tu asignación existente. No se creó un duplicado.', assignee: 'Asignado a', scheduled: 'Programado', duration: 'Tiempo de producción', minutes: 'minutos', open: 'Abrir en Queue', done: 'Listo', zone: 'Zona horaria', you: 'Tú', sent: 'Enviada para aprobación', waiting: 'Ya está pendiente de aprobación', pendingHelp: 'Tu VC revisará esta sugerencia. Solo se asignará y programará después de aprobarla.', approved: 'Aprobada', rejected: 'No aprobada', rejectedHelp: 'Esta sugerencia fue rechazada y no se ha programado.', approvedHelp: 'Tu sugerencia ya fue revisada. Abre la solicitud para ver los detalles.', status: 'Estado', pendingStatus: 'Pendiente de aprobación del VC', suggestedBy: 'Sugerida por', viewRequest: 'Ver solicitud' },
};

export default function QueueSuggestionModal({ accounts = [], viewerName, viewerEmail, initial = {}, language = 'en', timeZone = 'America/Costa_Rica', onClose, onSubmit, onOpenRequest, onOpenRequests }) {
  const copy = COPY[language] || COPY.en;
  const [sourceUrl, setSourceUrl] = useState(initial.sourceUrl || '');
  const [account, setAccount] = useState(accounts.length === 1 ? accounts[0].handle : '');
  const [title, setTitle] = useState('');
  const [postType, setPostType] = useState('Image');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const dialogRef = useRef(null);
  const sourceRef = useRef(null);
  const successRef = useRef(null);
  const busyRef = useRef(false);
  const attemptRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    dialog.showModal();
    sourceRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => { if (result) successRef.current?.focus(); }, [result]);

  async function submit(event) {
    event.preventDefault();
    if (busyRef.current || result) return;
    const url = suggestionSourceUrl(sourceUrl);
    if (!url) { setError(copy.invalidUrl); sourceRef.current?.focus(); return; }
    if (!accounts.some(item => item.handle === account)) { setError(copy.requiredAccount); return; }
    if (!reason.trim()) { setError(copy.requiredReason); return; }
    const unchangedSource = url === suggestionSourceUrl(initial.sourceUrl);
    const payload = { sourceUrl: url, account, reason: reason.trim(), title: title.trim(), postType, sourceAccount: unchangedSource ? initial.sourceAccount || '' : '', sourceShortcode: unchangedSource ? initial.sourceShortcode || '' : '' };
    const signature = JSON.stringify(payload);
    if (attemptRef.current?.signature !== signature) attemptRef.current = { signature, key: crypto.randomUUID() };
    busyRef.current = true;
    setSaving(true); setError('');
    try {
      const submitted = await onSubmit({ ...payload, idempotencyKey: attemptRef.current.key });
      setResult(submitted);
    } catch (issue) { setError(issue.message || copy.failed); }
    finally { busyRef.current = false; setSaving(false); }
  }

  const ticket = result?.ticket;
  const request = ticket?.status === 'approved' ? result?.request : null;
  const pending = ticket?.status === 'pending';
  const rejected = ticket?.status === 'rejected';
  const receiptTitle = pending ? (result?.alreadySubmitted ? copy.waiting : copy.sent) : rejected ? copy.rejected : request ? copy.duplicate : copy.approved;
  const receiptHelp = pending ? copy.pendingHelp : rejected ? copy.rejectedHelp : request ? copy.duplicateHelp : copy.approvedHelp;
  const resultAccounts = request?.recommendedAccounts || ticket?.requestedAccounts || [account];
  const requester = ticket?.requesterEmail || viewerEmail;
  const ReceiptIcon = pending ? ClipboardList : rejected ? XCircle : CheckCircle2;
  const close = () => { if (!busyRef.current) closeRef.current(); };
  return createPortal(<dialog ref={dialogRef} className="queue-suggestion-modal" aria-labelledby="queue-suggestion-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close(); } }}>
    <header className="queue-suggestion-header"><div><small>Queue</small><h2 id="queue-suggestion-title">{result ? receiptTitle : copy.title}</h2><p>{result ? receiptHelp : copy.help}</p></div><button type="button" className="queue-suggestion-close" aria-label={copy.close} onClick={close} disabled={saving}><X size={18} /></button></header>
    {result ? <section className="queue-suggestion-success" ref={successRef} tabIndex={-1} aria-label={receiptTitle}>
      <ReceiptIcon size={32} aria-hidden="true" />
      <h3>{request?.title || request?.post?.title || ticket?.suggestion?.title || title || sourceUrl}</h3>
      <dl>
        <div><dt>{copy.account}</dt><dd>{resultAccounts.map(value => `@${value}`).join(', ')}</dd></div>
        <div><dt>{request ? copy.assignee : copy.suggestedBy}</dt><dd>{request ? (request.designerEmail && request.designerEmail !== viewerEmail ? request.designerEmail : viewerName || request.designerEmail || copy.you) : requester && requester !== viewerEmail ? requester : viewerName || requester || copy.you}</dd></div>
        {request ? <div><dt>{copy.scheduled}</dt><dd>{suggestedSlotLabel(request, timeZone, language) || '—'}</dd></div> : <div><dt>{copy.status}</dt><dd>{pending ? copy.pendingStatus : rejected ? copy.rejected : copy.approved}</dd></div>}
        {request?.durationMinutes ? <div><dt>{copy.duration}</dt><dd>{request.durationMinutes} {copy.minutes}</dd></div> : null}
      </dl>
      {request ? <p className="queue-suggestion-hint">{copy.zone}: {timeZone.replaceAll('_', ' ')}</p> : null}
      {ticket?.reviewNote ? <p className="queue-suggestion-hint">{ticket.reviewNote}</p> : null}
      <footer className="queue-suggestion-actions"><button type="button" onClick={close}>{copy.done}</button>{request ? <button type="button" className="queue-suggestion-primary" onClick={() => onOpenRequest(request)}>{copy.open}<ArrowRight size={16} /></button> : onOpenRequests ? <button type="button" className="queue-suggestion-primary" onClick={() => onOpenRequests(ticket)}>{copy.viewRequest}<ArrowRight size={16} /></button> : null}</footer>
    </section> : <form onSubmit={submit} noValidate>
      <fieldset disabled={saving} className="queue-suggestion-fields">
        <label><span><Link2 size={14} aria-hidden="true" />{copy.source}</span><input ref={sourceRef} type="url" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder="https://…" required maxLength={2000} aria-describedby="queue-suggestion-source-help" /><small id="queue-suggestion-source-help">{copy.sourceHelp}</small></label>
        <label><span>{copy.account}</span><select value={account} onChange={event => setAccount(event.target.value)} required disabled={!accounts.length || saving}><option value="">{copy.chooseAccount}</option>{accounts.map(item => <option key={item.handle} value={item.handle}>@{item.handle}{item.label && item.label !== item.handle ? ` · ${item.label}` : ''}</option>)}</select></label>
        {!accounts.length ? <p className="queue-suggestion-empty" role="status">{copy.noAccounts}</p> : null}
        <div className="queue-suggestion-row"><label><span>{copy.postTitle}</span><input value={title} onChange={event => setTitle(event.target.value)} maxLength={160} placeholder={copy.titlePlaceholder} /></label><label><span>{copy.type}</span><select value={postType} onChange={event => setPostType(event.target.value)}>{['Image', 'Carousel', 'Reel', 'Story', 'Other'].map(type => <option key={type}>{type}</option>)}</select></label></div>
        <label><span>{copy.reason}</span><textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} maxLength={1000} placeholder={copy.reasonPlaceholder} required /></label>
      </fieldset>
      <aside className="queue-suggestion-placement"><CalendarCheck size={18} aria-hidden="true" /><div><strong>{copy.placement}</strong><p>{copy.placementHelp}</p></div></aside>
      {error ? <p className="queue-suggestion-error" role="alert">{error}</p> : null}
      <footer className="queue-suggestion-actions"><button type="button" onClick={close} disabled={saving}>{copy.cancel}</button><button type="submit" className="queue-suggestion-primary" disabled={saving || !accounts.length || !account || !sourceUrl.trim() || !reason.trim()}>{saving ? <LoaderCircle className="queue-suggestion-spinner" size={16} /> : <CalendarCheck size={16} />}{saving ? copy.saving : copy.submit}</button></footer>
    </form>}
  </dialog>, document.body);
}
