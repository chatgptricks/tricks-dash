import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { usePrefs } from './prefsContext';
import './stackIdentity.css';

function StackIdentityValue({ stackId }) {
  const { t } = usePrefs();
  const [status, setStatus] = useState('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(stackId);
      setStatus('Stack ID copied.');
    } catch {
      setStatus('Could not copy. Select the stack ID and copy it manually.');
    }
  };
  return <div className="stack-identity" data-stack-id={stackId}>
    <span className="stack-identity-label">{t('Stack ID')}</span>
    <div className="stack-identity-value"><code>{stackId}</code><button type="button" onClick={copy} aria-label={t('Copy stack ID')} title={t('Copy stack ID')}>{status === 'Stack ID copied.' ? <Check size={14} /> : <Copy size={14} />}</button></div>
    {status ? <small role={status === 'Stack ID copied.' ? 'status' : 'alert'}>{t(status)}</small> : null}
  </div>;
}

export default function StackIdentity({ stackId }) {
  const id = typeof stackId === 'string' ? stackId.trim() : '';
  return id ? <StackIdentityValue key={id} stackId={id} /> : null;
}
