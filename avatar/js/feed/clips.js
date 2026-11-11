/**
 * Clips for the "For You" feed. Each clip is a short script the user's own
 * avatar performs: a list of steps, each with a move (avatar motion) and an
 * on-screen caption. `kind: 'learn'` clips explain a money concept and pay a
 * small coin reward when watched to the end; `dance` / `emote` clips are just for fun.
 *
 * Moves: greet, celebrate, nod, shrug, dance, jump, coin, sad, shake, think,
 * giggle, heart, flex, mindBlown, shuffle, bounce, point, handsUp,
 * samba (the 3D model's own dance clip; other avatars shuffle instead).
 * Avatars that lack a move fall back to a similar one (see feed.js).
 */
const L = (en, de) => ({ en, de });

export const CLIPS = [
  {
    id: 'compound', kind: 'learn', bpm: 90,
    bg: ['#1b1b3a', '#6b2fd6'],
    title: L('Compound interest in 15 sec 📈', 'Zinseszins in 15 Sek. 📈'),
    tags: '#moneytok #finanzen #learnontiktok',
    steps: [
      { move: 'greet', text: L('POV: you finally get compound interest 🤯', 'POV: Du checkst endlich Zinseszins 🤯') },
      { move: 'think', text: L('You save €100 at 5% → after 1 year: €105', 'Du sparst 100 € zu 5 % → nach 1 Jahr: 105 €') },
      { move: 'coin', text: L('Year 2: the €5 ALSO earns interest 👀', 'Jahr 2: Die 5 € bringen AUCH Zinsen 👀') },
      { move: 'mindBlown', text: L('Money making money making money 🤯', 'Geld, das Geld macht, das Geld macht 🤯') },
      { move: 'celebrate', text: L('Start early – time does the heavy lifting ⏳✨', 'Früh starten – die Zeit macht die Arbeit ⏳✨') },
    ],
  },
  {
    id: 'payday-dance', kind: 'dance', bpm: 120,
    bg: ['#ff2d55', '#ff9f0a'],
    title: L('When the salary hits 💸', 'Wenn das Gehalt kommt 💸'),
    tags: '#paydayvibes #dance #fyp',
    steps: [
      { move: 'shuffle', text: L('*salary hits* 💸', '*Gehalt ist da* 💸') },
      { move: 'bounce', text: L('rent paid ✅ savings moved ✅', 'Miete bezahlt ✅ Sparrate weg ✅') },
      { move: 'dance', text: L('now we vibe 🕺', 'jetzt wird gevibet 🕺') },
      { move: 'handsUp', text: L('responsible AND fun 🙌', 'vernünftig UND fun 🙌') },
    ],
  },
  {
    id: 'samba', kind: 'dance', bpm: 100,
    bg: ['#f72585', '#ffb703'],
    title: L('Samba challenge 💃', 'Samba-Challenge 💃'),
    tags: '#samba #dancechallenge #fyp',
    steps: [
      { move: 'samba', text: L('when the cashback lands 💃', 'wenn das Cashback ankommt 💃') },
      { move: 'handsUp', text: L('your turn 👀 #dancechallenge', 'du bist dran 👀 #dancechallenge') },
    ],
  },
  {
    id: 'budget', kind: 'learn', bpm: 100,
    bg: ['#0f5132', '#20c997'],
    title: L('The 50/30/20 rule 💸', 'Die 50/30/20-Regel 💸'),
    tags: '#budgeting #moneytips #sparen',
    steps: [
      { move: 'point', text: L('Got paid? Split it like this 👇', 'Geld bekommen? So teilst du’s auf 👇') },
      { move: 'nod', text: L('50% needs – rent, food, travel pass 🏠', '50 % Fixkosten – Miete, Essen, Ticket 🏠') },
      { move: 'dance', text: L('30% wants – concerts, drip, games 🎤', '30 % Spaß – Konzerte, Klamotten, Games 🎤') },
      { move: 'coin', text: L('20% savings – pay yourself FIRST 🐷', '20 % Sparen – zuerst an dich selbst 🐷') },
      { move: 'flex', text: L('Budget? Handled. 💪', 'Budget? Läuft. 💪') },
    ],
  },
  {
    id: 'emotes', kind: 'emote', bpm: 110,
    bg: ['#b8a4ff', '#ff6f91'],
    title: L('Emote check 🎭', 'Emote-Check 🎭'),
    tags: '#emotes #mood #fyp',
    steps: [
      { move: 'heart', text: L('me looking at my savings 🫶', 'ich, wenn ich mein Sparkonto seh 🫶') },
      { move: 'flex', text: L('after sticking to my budget 💪', 'nachdem ich mein Budget gehalten hab 💪') },
      { move: 'sad', text: L('the ATM fee 😢', 'die Automatengebühr 😢') },
      { move: 'giggle', text: L('my bank account trying its best 😂', 'mein Konto, das sein Bestes gibt 😂') },
      { move: 'jump', text: L('free coffee reward unlocked ☕', 'Gratis-Kaffee freigeschaltet ☕') },
    ],
  },
  {
    id: 'bnpl', kind: 'learn', bpm: 95,
    bg: ['#2b1a12', '#d9480f'],
    title: L('“Buy now, pay later” = trap? 🪤', '„Jetzt kaufen, später zahlen“ = Falle? 🪤'),
    tags: '#bnpl #klarna #schulden',
    steps: [
      { move: 'think', text: L('€30 now, €30 later… what’s the harm? 🤔', '30 € jetzt, 30 € später… was soll’s? 🤔') },
      { move: 'shake', text: L('4 apps × 3 payments = chaos 😵‍💫', '4 Apps × 3 Raten = Chaos 😵‍💫') },
      { move: 'sad', text: L('Miss one → fees + bad credit score 😬', 'Eine verpasst → Gebühren + SCHUFA 😬') },
      { move: 'point', text: L('Rule: can’t pay today? Don’t buy today ☝️', 'Regel: Heute nicht bezahlbar? Heute nicht kaufen ☝️') },
    ],
  },
  {
    id: 'hype', kind: 'dance', bpm: 128,
    bg: ['#0a84ff', '#5e5ce6'],
    title: L('Savings goal hit 100% 🙌', 'Sparziel bei 100 % 🙌'),
    tags: '#goals #hype #dance',
    steps: [
      { move: 'handsUp', text: L('100% 🎯', '100 % 🎯') },
      { move: 'shuffle', text: L('new phone who dis 📱', 'neues Handy, wer da? 📱') },
      { move: 'celebrate', text: L('LET’S GOOO 🎉', 'LET’S GOOO 🎉') },
    ],
  },
  {
    id: 'emergency', kind: 'learn', bpm: 90,
    bg: ['#1d3557', '#457b9d'],
    title: L('Emergency fund 101 🛟', 'Notgroschen 101 🛟'),
    tags: '#emergencyfund #notgroschen #adulting',
    steps: [
      { move: 'shrug', text: L('Phone breaks. Now what? 📱💥', 'Handy kaputt. Und jetzt? 📱💥') },
      { move: 'coin', text: L('Emergency fund = ~3 months of costs 🛟', 'Notgroschen = ca. 3 Monatsausgaben 🛟') },
      { move: 'nod', text: L('Keep it in a separate account – hands off 🙅', 'Auf ein extra Konto – Finger weg 🙅') },
      { move: 'heart', text: L('Calm brain, zero panic 🧘', 'Ruhiger Kopf, null Panik 🧘') },
    ],
  },
  {
    id: 'scam', kind: 'learn', bpm: 100,
    bg: ['#3a0ca3', '#f72585'],
    title: L('Spot the scam 🚨', 'Erkenne den Betrug 🚨'),
    tags: '#scamalert #phishing #safety',
    steps: [
      { move: 'think', text: L('“Your account is locked, click here” 🤨', '„Ihr Konto ist gesperrt, hier klicken“ 🤨') },
      { move: 'shake', text: L('Banks NEVER ask for PIN/TAN by SMS or call 🚫', 'Banken fragen NIE per SMS/Anruf nach PIN/TAN 🚫') },
      { move: 'point', text: L('Don’t click. Call your bank directly ☎️', 'Nicht klicken. Bank direkt anrufen ☎️') },
      { move: 'flex', text: L('Scammers 0 · You 1 💅', 'Betrüger 0 · Du 1 💅') },
    ],
  },
  {
    id: 'bounce', kind: 'dance', bpm: 120,
    bg: ['#11998e', '#38ef7d'],
    title: L('Friday feeling 🎶', 'Freitagsgefühl 🎶'),
    tags: '#friday #vibes #dance',
    steps: [
      { move: 'bounce', text: L('no-spend week: done ✅', 'No-Spend-Woche: geschafft ✅') },
      { move: 'shuffle', text: L('treat budget: unlocked 🍕', 'Gönn-dir-Budget: frei 🍕') },
      { move: 'heart', text: L('love that for me 🫶', 'love that for me 🫶') },
    ],
  },
  {
    id: 'inflation', kind: 'learn', bpm: 95,
    bg: ['#3d2c8d', '#916bbf'],
    title: L('Inflation explained 🥙', 'Inflation erklärt 🥙'),
    tags: '#inflation #economics #learn',
    steps: [
      { move: 'greet', text: L('Why does my döner cost more every year? 🥙', 'Warum kostet mein Döner jedes Jahr mehr? 🥙') },
      { move: 'shrug', text: L('Inflation: prices go up, money buys less 📉', 'Inflation: Preise steigen, Geld kauft weniger 📉') },
      { move: 'sad', text: L('€100 under the mattress slowly loses value 😢', '100 € unterm Kopfkissen verlieren langsam Wert 😢') },
      { move: 'coin', text: L('Interest & investing can help you keep up 📈', 'Zinsen & Investieren helfen mitzuhalten 📈') },
    ],
  },
  {
    id: 'etf', kind: 'learn', bpm: 100,
    bg: ['#004e92', '#000428'],
    title: L('ETFs in 10 sec 🧺', 'ETFs in 10 Sek. 🧺'),
    tags: '#etf #investing #sparplan',
    steps: [
      { move: 'think', text: L('Can’t pick one stock? Buy the whole basket 🧺', 'Keine Ahnung, welche Aktie? Kauf den ganzen Korb 🧺') },
      { move: 'nod', text: L('1 ETF = hundreds of companies 🌍', '1 ETF = Hunderte Firmen 🌍') },
      { move: 'coin', text: L('Monthly savings plan from €25 🗓️', 'Monatlicher Sparplan ab 25 € 🗓️') },
      { move: 'flex', text: L('Long term + spread out = big W 🏆 (not financial advice)', 'Langfristig + breit gestreut = fetter W 🏆 (keine Anlageberatung)') },
    ],
  },
];
