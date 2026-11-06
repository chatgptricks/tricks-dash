export const BOT_VOICES = Object.freeze(['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar']);
export const voicePreferenceKey = uid => 'sentient.pet.voice-choice.' + uid;
const validOwner = uid => typeof uid === 'string' && uid.length > 0 && uid.length <= 200;

const emptySettings = () => ({ voice: null, style: '' });
const validSettings = value => value && typeof value === 'object' && !Array.isArray(value)
  && (value.voice === null || BOT_VOICES.includes(value.voice))
  && typeof value.style === 'string' && value.style.length <= 1000;

export function readVoiceSettings(uid) {
  if (!validOwner(uid)) return emptySettings();
  try {
    const value = localStorage.getItem(voicePreferenceKey(uid));
    // Existing browser choices were stored as a bare voice ID. Read them
    // without mutation; the next save atomically upgrades the pair.
    if (BOT_VOICES.includes(value)) return { voice: value, style: '' };
    const parsed = JSON.parse(value);
    return validSettings(parsed) ? { voice: parsed.voice, style: parsed.style.trim() } : emptySettings();
  } catch { return emptySettings(); }
}

export function readVoicePreference(uid) { return readVoiceSettings(uid).voice; }

export function writeVoiceSettings(uid, settings) {
  if (!validOwner(uid) || !validSettings(settings)) return false;
  const next = { voice: settings.voice, style: settings.style.trim() };
  try {
    if (next.voice === null && !next.style) localStorage.removeItem(voicePreferenceKey(uid));
    else localStorage.setItem(voicePreferenceKey(uid), JSON.stringify(next));
    return true;
  } catch { return false; }
}

export function writeVoicePreference(uid, voice) {
  return writeVoiceSettings(uid, { voice, style: voice === null ? '' : readVoiceSettings(uid).style });
}
