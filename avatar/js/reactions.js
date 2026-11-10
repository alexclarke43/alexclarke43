/**
 * Reaction catalogue shared by the UI, the postMessage bridge and both avatar types.
 * Animation itself lives in the avatar classes; this file only holds metadata + copy.
 */
export const REACTIONS = {
  greet: {
    emoji: '👋',
    label: { en: 'Hi', de: 'Hi' },
    say: { en: 'Hey! Good to see you 👋', de: 'Hey! Schön, dass du da bist 👋' },
  },
  celebrate: {
    emoji: '🎉',
    label: { en: 'Celebrate', de: 'Feiern' },
    say: { en: "Let's gooo! 🎉", de: 'Yesss, geschafft! 🎉' },
    confettiAt: 0.45, // seconds after start
  },
  nod: {
    emoji: '👍',
    label: { en: 'Nice', de: 'Top' },
    say: { en: 'Smart move 😉', de: 'Starke Entscheidung 😉' },
  },
  shrug: {
    emoji: '🤷',
    label: { en: 'Hmm', de: 'Hmm' },
    say: { en: 'Hmm… good question 🤔', de: 'Hmm… gute Frage 🤔' },
  },
  dance: {
    emoji: '🎶',
    label: { en: 'Vibe', de: 'Vibe' },
    say: { en: 'Good vibes only ✨', de: 'Good Vibes only ✨' },
  },
};

export const UI_TEXT = {
  hint: { en: 'Drag to spin · Tap me', de: 'Ziehen zum Drehen · Tipp mich an' },
  loading: { en: 'Loading avatar…', de: 'Avatar wird geladen…' },
  noWebgl: {
    en: 'Your browser can’t display 3D right now.',
    de: 'Dein Browser kann gerade kein 3D anzeigen.',
  },
  actionsLabel: { en: 'Avatar reactions', de: 'Avatar-Reaktionen' },
};
