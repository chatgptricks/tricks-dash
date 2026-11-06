import { useEffect, useRef, useState } from 'react';
import { readVoiceSettings } from './voicePreference';

export const MAX_VOICE_SECONDS = 60;
export const MAX_VOICE_BYTES = 10 * 1024 * 1024;
const SILENCE = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA==';
const stopTracks = stream => stream?.getTracks().forEach(track => track.stop());

// The microphone is acquired only by start(), called from a user click. Audio
// and raw recordings never enter conversation storage or cross the host bridge.
export function useVoice({ request, apiBase, uid, language, onTranscript }) {
  const [phase, setPhase] = useState('idle'), [seconds, setSeconds] = useState(0);
  const [speech, setSpeech] = useState({ id: null, status: 'idle' }), [error, setError] = useState('');
  const active = useRef(true), recording = useRef(null), recordVersion = useRef(0);
  const audio = useRef(null), audioUrl = useRef(null), playback = useRef(null), speechVersion = useRef(0);
  const callbacks = useRef({ request, apiBase, language, onTranscript, uid });
  callbacks.current = { request, apiBase, language, onTranscript, uid };
  const supported = typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  const updateSpeech = value => { if (active.current) setSpeech(value); };
  const fail = code => { if (active.current) setError(code); };

  function releaseRecording(current) {
    clearInterval(current?.interval); clearTimeout(current?.timeout); clearTimeout(current?.maxTimer);
    stopTracks(current?.stream);
  }
  function cancelRecording() {
    recordVersion.current++;
    const current = recording.current; recording.current = null;
    if (current) {
      current.cancelled = true; current.controller?.abort(); releaseRecording(current);
      if (current.recorder?.state !== 'inactive') try { current.recorder?.stop(); } catch { /* Already stopped. */ }
    }
    if (active.current) { setPhase('idle'); setSeconds(0); }
  }
  function stopSpeech() {
    speechVersion.current++;
    clearTimeout(playback.current?.timeout);
    playback.current?.controller?.abort(); playback.current = null;
    if (audio.current) {
      audio.current.onplay = audio.current.onpause = audio.current.onended = audio.current.onerror = null;
      audio.current.pause(); audio.current.removeAttribute('src');
    }
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null;
    updateSpeech({ id: null, status: 'idle' });
  }
  function cancelAll() { cancelRecording(); stopSpeech(); }
  function unlock() {
    // Keep this same element for the eventual response. Safari can authorize
    // it during the click even though transcription/chat finish much later.
    if (typeof Audio === 'undefined') return;
    audio.current ||= new Audio();
    if (playback.current) return;
    audio.current.src = SILENCE;
    try { audio.current.play()?.catch(() => {}); } catch { /* A later play button remains available. */ }
  }
  function stopAndSend() {
    const current = recording.current;
    if (!current?.recorder || current.recorder.state !== 'recording') return;
    current.send = true;
    clearInterval(current.interval); clearTimeout(current.maxTimer);
    current.recorder.stop();
    stopTracks(current.stream);
  }
  async function start(meta = {}) {
    if (recording.current) return;
    cancelAll(); unlock(); setError('');
    if (!supported) { fail('voiceUnsupported'); return; }
    const version = ++recordVersion.current;
    const current = { version, chunks: [], bytes: 0, language: callbacks.current.language, meta };
    recording.current = current; setPhase('requesting'); setSeconds(0);
    const valid = () => active.current && recording.current === current && recordVersion.current === version && !current.cancelled;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!valid()) { stopTracks(stream); return; }
      current.stream = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported?.(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      current.recorder = recorder;
      recorder.ondataavailable = event => {
        if (!valid() || !event.data?.size) return;
        current.bytes += event.data.size;
        if (current.bytes > MAX_VOICE_BYTES) { cancelRecording(); fail('voiceTooLarge'); return; }
        current.chunks.push(event.data);
      };
      recorder.onerror = () => { if (valid()) { cancelRecording(); fail('voiceRecordError'); } };
      recorder.onstop = async () => {
        releaseRecording(current);
        if (!valid()) return;
        if (!current.send) { cancelRecording(); fail('voiceRecordError'); return; }
        const blob = new Blob(current.chunks, { type: recorder.mimeType || mimeType || current.chunks[0]?.type || 'audio/webm' });
        current.chunks = [];
        if (!blob.size) { cancelRecording(); fail('voiceEmpty'); return; }
        setPhase('transcribing');
        current.controller = new AbortController();
        current.timeout = setTimeout(() => current.controller.abort('timeout'), 60_000);
        const body = new FormData();
        body.append('file', blob, /mp4|m4a/i.test(blob.type) ? 'voice.m4a' : 'voice.webm');
        body.append('language', current.language);
        try {
          const response = await callbacks.current.request(callbacks.current.apiBase + '/api/dashboard/assistant/transcribe', { method: 'POST', body, signal: current.controller.signal });
          if (!valid()) return;
          if (current.controller.signal.aborted) throw new Error('timeout');
          if (!response.ok) {
            fail(response.status === 413 ? 'voiceTooLarge' : response.status === 422 ? 'voiceEmpty' : 'voiceTranscribeError');
            return;
          }
          const result = await response.json();
          if (!valid()) return;
          if (current.controller.signal.aborted) throw new Error('timeout');
          if (typeof result.text !== 'string' || !result.text.trim()) { fail('voiceEmpty'); return; }
          recording.current = null; setPhase('idle'); setSeconds(0);
          callbacks.current.onTranscript(result.text.trim().slice(0, 4000), current.meta);
        } catch {
          if (valid()) fail('voiceTranscribeError');
        } finally {
          clearTimeout(current.timeout);
          if (recording.current === current) { recording.current = null; if (active.current) setPhase('idle'); }
        }
      };
      recorder.start(250); current.started = Date.now(); setPhase('recording');
      current.maxTimer = setTimeout(stopAndSend, MAX_VOICE_SECONDS * 1000);
      current.interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - current.started) / 1000);
        if (valid()) setSeconds(Math.min(MAX_VOICE_SECONDS, elapsed));
        if (elapsed >= MAX_VOICE_SECONDS) stopAndSend();
      }, 250);
    } catch (reason) {
      if (!valid()) return;
      cancelRecording();
      fail(['NotAllowedError', 'SecurityError'].includes(reason?.name) ? 'voicePermission' : 'voiceRecordError');
    }
  }
  async function playLoaded(current) {
    if (!active.current || playback.current !== current) return;
    try { await audio.current.play(); }
    catch (reason) {
      if (playback.current !== current) return;
      if (reason?.name === 'NotAllowedError') updateSpeech({ id: current.id, status: 'blocked' });
      else { stopSpeech(); fail('voicePlaybackError'); }
    }
  }
  async function speak(message, { permit } = {}) {
    if (permit !== undefined && permit !== speechVersion.current) return;
    const { voice: chosenVoice, style: chosenStyle } = readVoiceSettings(callbacks.current.uid);
    if (playback.current?.id === message.id && playback.current.voice === chosenVoice && playback.current.style === chosenStyle && audioUrl.current) { await playLoaded(playback.current); return; }
    stopSpeech(); setError('');
    const current = { id: message.id, voice: chosenVoice, style: chosenStyle, message, controller: new AbortController() };
    playback.current = current;
    updateSpeech({ id: current.id, status: 'loading' });
    const valid = () => active.current && playback.current === current;
    const timeout = current.timeout = setTimeout(() => current.controller.abort('timeout'), 60_000);
    try {
      // Read at request time so a choice in another open tab applies to the
      // next reply without remounting the bot or changing an ongoing clip.
      const response = await callbacks.current.request(callbacks.current.apiBase + '/api/dashboard/assistant/speech', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: current.controller.signal,
        body: JSON.stringify({ text: message.text.slice(0, 12000), question: message.question.slice(0, 4000), language: message.language, mode: message.mode, ...(chosenVoice ? { voice: chosenVoice } : {}), ...(chosenStyle ? { style: chosenStyle } : {}) }),
      });
      if (!valid()) return;
      if (!response.ok || !response.headers.get('Content-Type')?.startsWith('audio/')) throw new Error('speech');
      const blob = await response.blob();
      if (!valid()) return;
      if (current.controller.signal.aborted) throw new Error('timeout');
      audio.current ||= new Audio();
      audioUrl.current = URL.createObjectURL(blob); audio.current.src = audioUrl.current;
      audio.current.onplay = () => { if (valid()) updateSpeech({ id: current.id, status: 'playing' }); };
      audio.current.onpause = () => { if (valid()) updateSpeech({ id: current.id, status: 'paused' }); };
      audio.current.onended = () => { if (valid()) stopSpeech(); };
      audio.current.onerror = () => { if (valid()) { stopSpeech(); fail('voicePlaybackError'); } };
      await playLoaded(current);
    } catch {
      if (valid()) { stopSpeech(); fail('voicePlaybackError'); }
    } finally { clearTimeout(timeout); }
  }
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; cancelAll(); };
  }, [uid]);
  return { phase, seconds, speech, error, supported, start, stopAndSend, cancelRecording, stopSpeech, cancelAll, unlock, speak,
    resumeSpeech: () => { if (playback.current && audioUrl.current) void speak(playback.current.message); },
    permit: () => speechVersion.current, clearError: () => setError('') };
}
