// A local, bounded end-of-turn detector. It observes audio energy only; the
// recording remains in memory and the server transcribes the original speech.
export const END_OF_SPEECH_SILENCE_MS = 1400;
export const NO_SPEECH_TIMEOUT_MS = 12_000;
const MIN_SPEECH_MS = 180;
const NOISE_GAP_MS = 120;

export function createEndOfSpeechDetector(startedAt = 0) {
  let previous = startedAt, noiseFloor = 0.0025, candidateMs = 0;
  let lastCandidateAt = -Infinity, lastSpeechAt = startedAt, heardSpeech = false, finished = false;
  let steadySince = startedAt;
  const envelope = [];
  return {
    get heardSpeech() { return heardSpeech; },
    cancel() { finished = true; },
    observe(level, now) {
      if (finished) return null;
      const elapsed = Math.max(0, now - previous);
      previous = now;
      // A delayed browser timer is not evidence of sustained speech.
      const frameMs = Math.min(80, elapsed);
      const rms = Number.isFinite(level) ? Math.max(0, level) : 0;
      envelope.push({ level: rms, at: now });
      while (envelope.length && now - envelope[0].at > 600) envelope.shift();
      const low = Math.min(...envelope.map(frame => frame.level));
      const high = Math.max(...envelope.map(frame => frame.level));
      // A steady fan/hum is not a voice onset. Natural consonant/vowel energy
      // changes establish speech, while a stationary background becomes the
      // noise floor. Browser noise suppression is also requested at capture.
      const changing = high - low >= Math.max(0.003, high * 0.2);
      if (changing) steadySince = now;
      else if (now - steadySince >= 600) noiseFloor += (rms - noiseFloor) * 0.2;
      const threshold = Math.max(heardSpeech ? 0.005 : 0.008, noiseFloor * (heardSpeech ? 2 : 3));
      if (rms >= threshold && changing) {
        if (now - lastCandidateAt > NOISE_GAP_MS) candidateMs = 0;
        candidateMs += frameMs;
        lastCandidateAt = now;
        if (heardSpeech || candidateMs >= MIN_SPEECH_MS) {
          heardSpeech = true;
          lastSpeechAt = now;
        }
      } else {
        if (now - lastCandidateAt > NOISE_GAP_MS) candidateMs = 0;
        // Follow background noise slowly without learning the voice as noise.
        const weight = Math.min(0.1, frameMs / 2000);
        noiseFloor += (Math.max(0.0005, rms) - noiseFloor) * weight;
      }
      if (heardSpeech && now - lastSpeechAt >= END_OF_SPEECH_SILENCE_MS) {
        finished = true;
        return 'send';
      }
      if (!heardSpeech && now - startedAt >= NO_SPEECH_TIMEOUT_MS) {
        finished = true;
        return 'empty';
      }
      return null;
    },
  };
}

export function audioRootMeanSquare(samples) {
  let sum = 0;
  for (const value of samples) sum += value * value;
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}
