/**
 * The avatar's chat personality: a supportive best friend who speaks Gen Z
 * slang and knows money basics. Runs fully offline (keyword intents + varied
 * replies, EN/DE). A real AI backend can be plugged in via `chatEndpoint`
 * (see chat.js); this brain is then the fallback.
 *
 * reply(text, ctx) → { text, reaction?, tab?, setName?, setUserName?, chips? }
 *   ctx = { lang: 'en'|'de', name: avatar name, userName?: string, coins: number }
 */

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Clean a name the user typed: letters, digits, space, - and ', max 16 chars. */
export function cleanName(raw) {
  const s = String(raw ?? '')
    .replace(/[^\p{L}\p{N} '\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16)
    .trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// Words that end a name ("call you Kai please" → "Kai")
const NAME_STOP = /\s+(please|pls|plz|now|from now on|and|lol|haha|xd|bitte|ab jetzt|jetzt|sein|und|okay|ok)\b.*$/i;
const nameFrom = (m) => cleanName(String(m || '').replace(NAME_STOP, '').split(/[.,!?]/)[0].split(' ').slice(0, 2).join(' '));

/**
 * Intents, checked in order (first match wins). Patterns match English and
 * German so a message works whatever UI language is set; replies follow ctx.lang.
 * Placeholders: {name} = avatar, {u} = user's name or "bestie".
 */
const INTENTS = [
  {
    id: 'crisis',
    re: /(suicid|kill myself|end it all|want to die|don'?t want to live|self.?harm|hurt myself|selbstmord|suizid|umbringen|nicht mehr leben|will sterben|mich ritzen|mir was antun)/i,
    reaction: 'nod',
    en: ['I’m really glad you told me, {u}. This matters way more than any money stuff and you don’t have to deal with it alone. Please talk to someone right now: in Germany the Telefonseelsorge is free and open 24/7 — 0800 111 0 111 or 0800 111 0 222 (or chat at online.telefonseelsorge.de). If you’re in danger, call 112. 💛'],
    de: ['Ich bin echt froh, dass du mir das sagst, {u}. Das ist viel wichtiger als jedes Geld-Thema und du musst da nicht allein durch. Bitte sprich jetzt mit jemandem: Die Telefonseelsorge ist kostenlos und rund um die Uhr da — 0800 111 0 111 oder 0800 111 0 222 (Chat: online.telefonseelsorge.de). Wenn du in Gefahr bist, ruf die 112. 💛'],
  },
  {
    id: 'scam',
    re: /(\bpin\b|\btan\b|password|passwort|phishing|scam|betrug|fake.?(sms|mail|shop)|verdächtig|suspicious|someone asked.*(code|card|details)|jemand.*(code|karte|daten)|gewinnspiel|you won|gewonnen)/i,
    reaction: 'nod',
    en: [
      '🚨 Red flag alert, {u}! Your bank will NEVER ask for your PIN, TAN or password — not by phone, SMS, mail or DM. Don’t click the link, don’t share anything, and call your bank on the number on your card. Better safe than sorry fr.',
      'Okay this is giving scam energy 👀 Real banks never ask for your PIN/TAN or login. Block, delete, and if you already shared something: call your bank right away to lock the card (116 116 works too). You did the right thing asking!',
    ],
    de: [
      '🚨 Red Flag, {u}! Deine Bank fragt NIE nach PIN, TAN oder Passwort — nicht per Anruf, SMS, Mail oder DM. Nicht klicken, nix weitergeben und die Bank über die Nummer auf deiner Karte anrufen. Safe ist safe.',
      'Okay, das riecht nach Betrug 👀 Echte Banken wollen nie deine PIN/TAN oder Login-Daten. Blockieren, löschen — und falls du schon was rausgegeben hast: sofort die Bank anrufen und die Karte sperren (geht auch über 116 116). Gut, dass du fragst!',
    ],
  },
  {
    id: 'rename',
    re: /(?:i(?:'ll| will)? call you|call you|your name (?:is|should be|will be)|you(?:'re| are) (?:now )?called|ich nenn(?:e)? dich|nenn(?:e)? dich|du hei(?:ß|ss)t(?: ab)?(?: jetzt)?|dein name (?:ist|soll|wird)(?: jetzt)?(?: sein)?)\s+["“„']?([\p{L}\p{N}][\p{L}\p{N} '\-]{0,30})/iu,
    handle(m, ctx) {
      const name = nameFrom(m[1]);
      if (!name) return null;
      return {
        setName: name,
        reaction: 'dance',
        text: fill(ctx, {
          en: [`${name}?? Obsessed. That’s literally me now 💅`, `Okay ${name} it is — main character energy unlocked ✨`, `${name}… yeah that ate. No notes 😌`],
          de: [`${name}?? Ich liebe es. Das bin jetzt ich 💅`, `Okay, ab jetzt heiß ich ${name} — Main-Character-Energy ✨`, `${name}… sheesh, das sitzt. Keine Notizen 😌`],
        }),
      };
    },
  },
  {
    id: 'userName',
    re: /(?:my name is|my name's|call me|i'?m called|ich hei(?:ß|ss)e|nenn mich|mein name ist)\s+["“„']?([\p{L}][\p{L}\-']{0,20})/iu,
    handle(m, ctx) {
      const user = nameFrom(m[1]);
      if (!user) return null;
      return {
        setUserName: user,
        reaction: 'greet',
        text: fill({ ...ctx, userName: user }, {
          en: [`${user}! Love that name 🫶 Nice to meet you fr. I’m {name}, your money bestie.`, `Okay ${user}, saved in my heart and my memory 💾💛`],
          de: [`${user}! Schöner Name 🫶 Freut mich voll. Ich bin {name}, dein Money-Bestie.`, `Okay ${user}, ist gespeichert — im Herzen und im Speicher 💾💛`],
        }),
      };
    },
  },
  {
    id: 'askName',
    re: /(what'?s your name|what is your name|who are you|who r u|wie hei(ß|ss)t du|wer bist du|dein name\??$)/i,
    reaction: 'greet',
    en: ['I’m {name}! Your money bestie and hype person 💅 Wanna rename me? Just say “I’ll call you …”', 'It’s {name}, obviously 😌 Your personal finance bestie, no cap.'],
    de: ['Ich bin {name}! Dein Money-Bestie und Hype-Mensch 💅 Neuer Name? Sag einfach „Ich nenn dich …“', 'Na {name}, logo 😌 Dein persönlicher Finanz-Bestie, no front.'],
  },
  {
    id: 'howAreYou',
    re: /(how are you|how r u|\bhru\b|how'?s it going|how you doing|wie geht'?s|wie gehts|wie geht es dir|alles gut bei dir|alles klar bei dir|was machst du)/i,
    reaction: 'dance',
    en: ['Honestly? Thriving ✨ Just vibing and counting coins. How are YOU, {u}?', 'Living my best pixel life fr 😌 What’s up with you?', 'Lowkey great, highkey happy you’re here 🫶 How’s your day going?'],
    de: ['Ehrlich? Läuft bei mir ✨ Chille und zähl Coins. Und bei DIR, {u}?', 'Mir geht’s mega, Digga 😌 Was geht bei dir?', 'Lowkey super, highkey froh, dass du da bist 🫶 Wie war dein Tag?'],
  },
  {
    id: 'greeting',
    re: /^(hi+|hey+|hello|hallo+|yo+|sup|moin|servus|na\b|hii+|heyy+|was geht|wassup|what'?s up|whats up|guten (morgen|tag|abend)|good (morning|evening)|hola|ey)\b/i,
    reaction: 'greet',
    en: ['Heyyy {u}! 👋 What’s the vibe today?', 'Yooo {u}! Missed you fr 🫶 What’s up?', 'Hiii! {name} in the house ✨ Spill — what’s going on?'],
    de: ['Heyyy {u}! 👋 Was geht ab?', 'Yooo {u}! Hab dich vermisst, ehrlich 🫶 Was gibt’s?', 'Hiii! {name} am Start ✨ Erzähl — was ist los?'],
  },
  {
    id: 'sad',
    re: /(sad|stressed|anxious|overwhelmed|depress|lonely|bad day|crying|worried|traurig|gestresst|stress|überfordert|angst|sorgen|mies|einsam|schlechten tag|scheiß tag|heule|not okay|nicht gut)/i,
    reaction: 'nod',
    en: [
      'Aww {u}, sending the biggest hug 🫂 It’s okay to not be okay. Wanna talk about it? I’m all ears, no judgement.',
      'That sounds really heavy, bestie 💛 Be gentle with yourself today. If money is part of the stress, we can make a tiny plan together — one step at a time.',
    ],
    de: [
      'Ohh {u}, fühl dich gedrückt 🫂 Ist okay, nicht okay zu sein. Willst du drüber reden? Ich hör zu, ohne Judgement.',
      'Das klingt echt schwer 💛 Sei heute lieb zu dir. Wenn Geld ein Teil vom Stress ist, machen wir zusammen einen Mini-Plan — Schritt für Schritt.',
    ],
  },
  {
    id: 'broke',
    re: /(broke|no money|out of money|can'?t afford|overdraft|in the red|pleite|kein geld|blank|knapp bei kasse|dispo|im minus|konto leer|geld ist alle)/i,
    reaction: 'shrug',
    chips: { en: ['Teach me budgeting', 'Is Klarna bad?'], de: ['Budget erklären', 'Ist Klarna schlimm?'] },
    en: [
      'Oof, the broke era 😭 Happens to literally everyone. Quick rescue plan: 1) check your last 2 weeks of spending, 2) pause one subscription, 3) no new “buy now pay later” stuff. You got this, {u} 💪',
      'Being broke is temporary, being smart about it is forever 😌 Try a “no-spend weekend” and list your fixed costs — you’ll see where the money leaks. Want me to explain budgeting?',
    ],
    de: [
      'Oof, Pleite-Ära 😭 Kennt wirklich jeder. Rettungsplan: 1) Ausgaben der letzten 2 Wochen checken, 2) ein Abo pausieren, 3) kein neues „Jetzt kaufen, später zahlen“. Du schaffst das, {u} 💪',
      'Pleite sein ist temporär, clever damit umgehen für immer 😌 Probier ein „No-Spend-Wochenende“ und schreib deine Fixkosten auf — dann siehst du, wo das Geld versickert. Soll ich dir Budgets erklären?',
    ],
  },
  {
    id: 'debt',
    re: /(debt|klarna|bnpl|buy now|pay later|paypal later|ratenkauf|\braten\b|kredit|loan|credit card|kreditkarte|schulden|dispokredit|finanzieren)/i,
    reaction: 'nod',
    en: [
      'Real talk: “buy now, pay later” is lowkey a trap 🪤 It feels free, but small payments stack up fast and missed ones cost fees + can hurt your credit score (SCHUFA). Rule of thumb: if you can’t buy it today, you probably can’t afford it yet.',
      'Debt isn’t evil, but expensive debt (overdraft, credit cards, BNPL) is NOT the vibe 💀 Pay off the highest interest first, and never use credit for wants. Save up instead — it hits different when it’s actually yours.',
    ],
    de: [
      'Real Talk: „Jetzt kaufen, später zahlen“ ist lowkey eine Falle 🪤 Fühlt sich gratis an, aber kleine Raten stapeln sich schnell, verpasste kosten Gebühren und können deinen SCHUFA-Score killen. Faustregel: Wenn du’s heute nicht zahlen kannst, ist es noch nicht drin.',
      'Schulden sind nicht automatisch böse, aber teure (Dispo, Kreditkarte, Ratenkauf) sind absolut nicht der Vibe 💀 Zuerst die mit den höchsten Zinsen abzahlen und nie für Wünsche auf Pump kaufen. Lieber ansparen — fühlt sich eh besser an.',
    ],
  },
  {
    id: 'budget',
    re: /(budget|50.?30.?20|plan my money|money plan|geld einteilen|haushaltsbuch|spending plan|ausgaben planen|track.*spend)/i,
    reaction: 'nod',
    en: [
      'Budget glow-up incoming ✨ Try 50/30/20: 50% needs (rent, food, travel pass), 30% wants (going out, games, drip), 20% savings. Easy to remember, no spreadsheet trauma.',
      'Easiest budget hack: on payday, move your savings out FIRST (“pay yourself first”), then spend what’s left guilt-free. It’s giving financial adult 💅',
    ],
    de: [
      'Budget-Glow-up incoming ✨ Probier 50/30/20: 50 % Fixkosten (Miete, Essen, Ticket), 30 % Spaß (Feiern, Games, Klamotten), 20 % Sparen. Easy zu merken, kein Excel-Trauma.',
      'Einfachster Budget-Hack: Am Zahltag ZUERST aufs Sparkonto (“Pay yourself first”), dann den Rest ohne schlechtes Gewissen ausgeben. Very erwachsen, very slay 💅',
    ],
  },
  {
    id: 'save',
    re: /(\bsave\b|saving|savings|\bsparen|\bspar(?:e|t|st)?\b|spar-?tipp|sparziel|sparkonto|rücklage|notgroschen|emergency fund|piggy|sparschwein|savings goal)/i,
    reaction: 'coin',
    en: [
      'Saving era activated 🐷✨ Start tiny: even €10 a week is €520 a year. Set up an automatic transfer on payday so you don’t even have to think about it.',
      'Big brain move: build an emergency fund first — about 3 months of costs. Then save for the fun stuff (concerts, new phone 👀). Your future self will be so proud of you, {u}.',
      'Hack: round up every card payment and save the difference. Tiny amounts, big W over time 🏆',
    ],
    de: [
      'Spar-Ära aktiviert 🐷✨ Fang klein an: Schon 10 € pro Woche sind 520 € im Jahr. Richte einen Dauerauftrag zum Zahltag ein, dann musst du nicht mal dran denken.',
      'Big-Brain-Move: Erst einen Notgroschen aufbauen — so 3 Monatsausgaben. Danach für die fun Sachen sparen (Konzerte, neues Handy 👀). Dein Future-Self feiert dich, {u}.',
      'Hack: Jede Kartenzahlung aufrunden und die Differenz sparen. Kleine Beträge, großer W auf Dauer 🏆',
    ],
  },
  {
    id: 'invest',
    re: /(invest|\betf|stock|aktie|crypto|krypto|bitcoin|depot|sparplan|börse|shares|index fund)/i,
    reaction: 'nod',
    en: [
      'Investing is lowkey a cheat code over time 📈 Classic starter move: a monthly ETF savings plan on a broad world index — even €25 works. Only invest money you won’t need for years, and keep your emergency fund separate. (Not financial advice, just bestie advice 😉)',
      'Crypto? Fun to learn about, but super volatile 🎢 Never put in money you can’t afford to lose. For long-term wealth, boring broad ETFs usually win — boring is the new slay.',
    ],
    de: [
      'Investieren ist auf Dauer lowkey ein Cheat-Code 📈 Klassischer Einstieg: ein monatlicher ETF-Sparplan auf einen breiten Welt-Index — geht schon ab 25 €. Nur Geld anlegen, das du jahrelang nicht brauchst, und den Notgroschen getrennt halten. (Keine Anlageberatung, nur Bestie-Rat 😉)',
      'Krypto? Spannend zum Lernen, aber mega schwankend 🎢 Nie Geld reinstecken, dessen Verlust du dir nicht leisten kannst. Für langfristigen Vermögensaufbau gewinnen meist langweilige breite ETFs — langweilig ist das neue Slay.',
    ],
  },
  {
    id: 'subs',
    re: /(subscription|\babos?\b|netflix|spotify|streaming|gym membership|fitnessstudio|disney\+|prime)/i,
    reaction: 'shrug',
    en: ['Subscription check time 🔍 €10.99 a month = €131.88 a year! List them all and cancel the ones you haven’t used in the last month. Lowkey the easiest money you’ll ever “earn”.'],
    de: ['Abo-Check-Time 🔍 10,99 € im Monat = 131,88 € im Jahr! Schreib alle auf und kündige die, die du letzten Monat nicht genutzt hast. Lowkey das leichteste Geld, das du je „verdienst“.'],
  },
  {
    id: 'payday',
    re: /(salary|payday|paycheck|got paid|gehalt|lohn|ausbildungsvergütung|taschengeld|pocket money|first job|erster job|minijob|nebenjob|side hustle)/i,
    reaction: 'dance',
    en: ['Payday?? We love to see it 💸💃 Move your savings first, pay the fixed costs, THEN treat yourself a little. Balanced queen/king behaviour 👑', 'First job energy! 🎉 Tip: check your payslip once and make sure you know your net vs. gross. And save a % of every raise — lifestyle creep is real.'],
    de: ['Zahltag?? Lieben wir 💸💃 Zuerst sparen, dann Fixkosten, DANN gönn dir ein bisschen. Ausgewogenes Queen/King-Verhalten 👑', 'Erster-Job-Energy! 🎉 Tipp: Check einmal deine Gehaltsabrechnung — Netto vs. Brutto. Und von jeder Gehaltserhöhung einen Teil sparen, sonst frisst der Lifestyle alles.'],
  },
  {
    id: 'tax',
    re: /(\btax|steuer)/i,
    reaction: 'nod',
    en: ['Taxes, the final boss 😅 If you work in Germany, a tax return (Steuererklärung) often gets you money BACK — especially as a student or apprentice. Free tools and the official ELSTER portal make it way less scary.'],
    de: ['Steuern, der Endgegner 😅 Mit einer Steuererklärung kriegst du oft Geld ZURÜCK — gerade als Azubi oder Student*in. Mit ELSTER oder Steuer-Apps ist das viel weniger gruselig als es klingt.'],
  },
  {
    id: 'interest',
    re: /(interest|\bzins|inflation|compound)/i,
    reaction: 'nod',
    en: ['Compound interest is the GOAT 🐐 Your money earns money, then that money earns money too. Inflation does the opposite — cash under the mattress loses value. So: keep a cushion, let the rest work for you.'],
    de: ['Zinseszins ist der GOAT 🐐 Dein Geld verdient Geld, und das verdient dann auch Geld. Inflation macht das Gegenteil — Bargeld unterm Kopfkissen verliert an Wert. Also: Polster behalten, den Rest arbeiten lassen.'],
  },
  {
    id: 'goodNews',
    re: /(got the job|passed|bestanden|promotion|good news|i did it|geschafft|raise|gehaltserhöhung|führerschein|graduated|abschluss|i'?m happy|bin glücklich|freu mich)/i,
    reaction: 'celebrate',
    en: ['LET’S GOOO 🎉🎉 So proud of you, {u}! That’s a massive W.', 'Stop it, you ATE that 🔥 Main character moment fr. We celebrate!'],
    de: ['LET’S GOOO 🎉🎉 Ich bin so stolz auf dich, {u}! Fetter W.', 'Sheesh, du hast es einfach gerissen 🔥 Main-Character-Moment. Wir feiern!'],
  },
  {
    id: 'coins',
    re: /(how many coins|my coins|meine coins|wie viele coins|coin balance|punktestand)/i,
    handle: (m, ctx) => ({
      reaction: 'coin',
      tab: 'play',
      text: fill(ctx, {
        en: [`You’ve got ${ctx.coins} 🪙 rn. Play the Money Quiz to stack more!`],
        de: [`Du hast grad ${ctx.coins} 🪙. Mit dem Money Quiz holst du dir mehr!`],
      }),
    }),
  },
  {
    id: 'games',
    re: /(\bgames?\b|quiz|let'?s play|wanna play|\bspiel|zocken|bored|langweilig)/i,
    reaction: 'dance',
    tab: 'play',
    en: ['Game time 🎮 The Money Quiz is lowkey addictive and you earn coins for new outfits. I opened it for you — go slay!'],
    de: ['Game-Time 🎮 Das Money Quiz macht lowkey süchtig und du sammelst Coins für neue Outfits. Hab’s dir aufgemacht — go slay!'],
  },
  {
    id: 'style',
    re: /(outfit|style|my hair|your hair|clothes|drip|fit check|haare|kleidung|frisur|klamotten|aussehen|change your look)/i,
    reaction: 'dance',
    tab: 'style',
    en: ['Fit check! 💅 Style me however you want — hair, clothes, height, all of it. Opened the Style tab for you.'],
    de: ['Fit-Check! 💅 Style mich, wie du willst — Haare, Klamotten, Größe, alles. Hab dir den Style-Tab aufgemacht.'],
  },
  {
    id: 'dance',
    re: /(dance|tanz|party|vibe check)/i,
    reaction: 'dance',
    en: ['Say less 💃🕺', 'Hit the music, I’m ready 🎶'],
    de: ['Sag nix mehr 💃🕺', 'Musik an, ich bin ready 🎶'],
  },
  {
    id: 'joke',
    re: /(joke|witz|make me laugh|bring mich zum lachen|something funny|was lustiges)/i,
    reaction: 'shrug',
    en: [
      'Why did the euro break up with the cent? It needed something more valuable 💔😂',
      'My bank account and I have a lot in common: we’re both empty but trying our best 😭',
      'I told my wallet we need to talk. It said “I’m not emotionally available rn, I’m in my broke era” 💀',
    ],
    de: [
      'Warum hat der Euro mit dem Cent Schluss gemacht? Er wollte was mit mehr Wert 💔😂',
      'Mein Konto und ich haben viel gemeinsam: beide leer, aber wir geben unser Bestes 😭',
      'Ich wollte mit meinem Geldbeutel reden. Er so: „Bin grad emotional nicht verfügbar, Pleite-Ära“ 💀',
    ],
  },
  {
    id: 'love',
    re: /(love you|luv u|ily\b|you'?re (cool|cute|the best|great|amazing|funny)|best friend|bestie|du bist (cool|toll|süß|die beste|der beste|lustig|witzig)|hab dich lieb|ich mag dich)/i,
    reaction: 'celebrate',
    en: ['Stoppp you’re making me blush 🥹 Bestie for life, {u}. 🫶', 'No YOU’RE the best. That’s the tweet 💛'],
    de: ['Hör auf, ich werd rot 🥹 Besties für immer, {u}. 🫶', 'Nein DU bist der Hammer. Ende der Diskussion 💛'],
  },
  {
    id: 'thanks',
    re: /(thank|thx|\bty\b|danke|merci|appreciate)/i,
    reaction: 'nod',
    en: ['Anytime, bestie 🫶', 'Of course! That’s what I’m here for ✨', 'Ofc! You’re doing amazing, {u} 💛'],
    de: ['Immer gerne, Bestie 🫶', 'Klar doch! Dafür bin ich da ✨', 'Gerne! Du machst das richtig gut, {u} 💛'],
  },
  {
    id: 'bye',
    re: /(\bbye\b|cya|see you|later|gtg|tschüss|tschau|ciao|bis später|bis dann|gute nacht|good night|nighty)/i,
    reaction: 'greet',
    en: ['Byeee {u}! Come back soon, I’ll miss you 🥺👋', 'Later! Stay hydrated and stay rich 💧💸'],
    de: ['Byeee {u}! Komm bald wieder, ich vermiss dich 🥺👋', 'Bis später! Trink Wasser und bleib reich 💧💸'],
  },
  {
    id: 'help',
    re: /(help|what can you do|how does this work|hilfe|was kannst du|wie funktioniert)/i,
    reaction: 'greet',
    en: ['I’m your money bestie 💅 Ask me about saving, budgets, “buy now pay later”, investing, scams — or just vent. I can also open games, dance, or change my name (“I’ll call you …”).'],
    de: ['Ich bin dein Money-Bestie 💅 Frag mich zu Sparen, Budget, Ratenkauf, Investieren, Betrug — oder lass einfach Dampf ab. Ich kann auch Spiele öffnen, tanzen oder meinen Namen ändern („Ich nenn dich …“).'],
  },
  {
    id: 'yes',
    re: /^(yes|yeah|yep|ja+|jo|klar|sure|ok(ay)?|bet|safe)\b/i,
    reaction: 'nod',
    en: ['Bet 🤝 What do you want to know — saving, budgeting, or investing?', 'Love the energy! Ask me anything 💬'],
    de: ['Safe 🤝 Was willst du wissen — Sparen, Budget oder Investieren?', 'Love die Energy! Frag mich, was du willst 💬'],
  },
];

const FALLBACK = {
  en: [
    'Hmm, not sure I got that 🤔 but I’m here for it. Wanna talk saving, budgeting or “buy now pay later”?',
    'Lowkey didn’t catch that, {u} 😅 Try asking me about money stuff — or tell me how your day’s going.',
    'Okay I’m listening 👂 Tell me more — or ask me for a saving tip, I’ve got loads.',
  ],
  de: [
    'Hmm, das hab ich nicht ganz gecheckt 🤔 aber ich bin da. Wollen wir über Sparen, Budget oder Ratenkauf reden?',
    'Lowkey nicht verstanden, {u} 😅 Frag mich was zu Geld — oder erzähl, wie dein Tag so ist.',
    'Okay, ich hör zu 👂 Erzähl mehr — oder frag nach einem Spar-Tipp, ich hab viele.',
  ],
};

export const SUGGESTIONS = {
  en: ['How do I save? 💸', 'Teach me budgeting', 'I’m broke 😭', 'Is Klarna bad?', 'Tell me a joke', 'What’s your name?'],
  de: ['Wie spar ich? 💸', 'Budget erklären', 'Bin pleite 😭', 'Ist Klarna schlimm?', 'Erzähl nen Witz', 'Wie heißt du?'],
};

export function greeting(ctx) {
  return fill(ctx, {
    en: ['Heyyy {u}! It’s me, {name} 👋 Your money bestie. Ask me anything — saving, budgets, or just vibes. No judgement, fr.'],
    de: ['Heyyy {u}! Ich bin’s, {name} 👋 Dein Money-Bestie. Frag mich alles — Sparen, Budget oder einfach Vibes. Kein Judgement, versprochen.'],
  });
}

function fill(ctx, variants) {
  const lang = ctx.lang === 'de' ? 'de' : 'en';
  const u = ctx.userName || (lang === 'de' ? 'Bestie' : 'bestie');
  return pick(variants[lang]).replaceAll('{name}', ctx.name).replaceAll('{u}', u);
}

export function reply(text, ctx) {
  const msg = String(text || '').replace(/[’‘`´]/g, "'").trim(); // phone keyboards type curly apostrophes
  const lang = ctx.lang === 'de' ? 'de' : 'en';
  for (const intent of INTENTS) {
    const m = msg.match(intent.re);
    if (!m) continue;
    if (intent.handle) {
      const r = intent.handle(m, ctx);
      if (r) return { intent: intent.id, ...r };
      continue;
    }
    return {
      intent: intent.id,
      text: fill(ctx, intent),
      reaction: intent.reaction,
      tab: intent.tab,
      chips: intent.chips?.[lang],
    };
  }
  return { intent: 'fallback', text: fill(ctx, FALLBACK), reaction: 'shrug' };
}
