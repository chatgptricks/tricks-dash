// Presentation names only. Provider IDs remain stable for previews and saved choices.
const VOICE_NAMES = Object.freeze({
  alloy: 'Atlas',
  ash: 'Nox',
  ballad: 'Lyra',
  coral: 'Nova',
  echo: 'Orion',
  sage: 'Sora',
  shimmer: 'Luma',
  verse: 'Vega',
  marin: 'Aura',
  cedar: 'Onyx',
});

export const voiceDisplayName = id => Object.hasOwn(VOICE_NAMES, id) ? VOICE_NAMES[id] : '';
