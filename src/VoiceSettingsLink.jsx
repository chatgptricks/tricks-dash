import { AudioLines, ChevronRight } from 'lucide-react';

export function VoiceSettingsLink({ language = 'en' }) {
  const spanish = language === 'es';
  return <section className="settings-menu-section settings-menu-connections settings-menu-voice">
    <span>Sentient Bot</span>
    <a className="settings-menu-link" href={`${import.meta.env.BASE_URL}voice-lab.html`} target="sentient-voice-lab">
      <span className="settings-menu-link-icon"><AudioLines size={17} /></span>
      <span className="settings-menu-link-copy"><strong>{spanish ? 'Voz del bot' : 'Bot voice'}</strong><small>{spanish ? 'Probá y elegí tu voz' : 'Preview and choose your voice'}</small></span>
      <ChevronRight size={15} className="settings-menu-link-arrow" />
    </a>
  </section>;
}
