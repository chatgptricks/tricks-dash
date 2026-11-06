export const BOT_VOICES = Object.freeze(['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar']);
export const voicePreferenceKey = uid => 'sentient.pet.voice-choice.' + uid;
const validOwner = uid => typeof uid === 'string' && uid.length > 0 && uid.length <= 200;

export function readVoicePreference(uid) {
  if (!validOwner(uid)) return null;
  try {
    const value = localStorage.getItem(voicePreferenceKey(uid));
    return BOT_VOICES.includes(value) ? value : null;
  } catch { return null; }
}

export function writeVoicePreference(uid, voice) {
  if (!validOwner(uid) || (voice !== null && !BOT_VOICES.includes(voice))) return false;
  try {
    if (voice === null) localStorage.removeItem(voicePreferenceKey(uid));
    else localStorage.setItem(voicePreferenceKey(uid), voice);
    return true;
  } catch { return false; }
}
