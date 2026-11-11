/**
 * Game content (en/de). Keep facts general and timeless – no product claims, no
 * figures that change yearly. `c` = index of the correct answer (answers are
 * shuffled at runtime).
 */
const Q = (q, a, c, why, topic) => ({ q, a, c, why, topic });

export const QUIZ = [
  Q({ en: 'You save €100 at 10% interest per year and leave the interest in the account. How much do you have after 2 years?',
      de: 'Du legst 100 € zu 10 % Zinsen pro Jahr an und lässt die Zinsen auf dem Konto. Wie viel hast du nach 2 Jahren?' },
    [{ en: '€120', de: '120 €' }, { en: '€121', de: '121 €' }, { en: '€110', de: '110 €' }, { en: '€200', de: '200 €' }], 1,
    { en: 'Compound interest! Year 1: €110. Year 2: 10% of €110 = €11 → €121. You earn interest on your interest.',
      de: 'Zinseszins! Jahr 1: 110 €. Jahr 2: 10 % von 110 € = 11 € → 121 €. Du bekommst Zinsen auf deine Zinsen.' }, 'saving'),

  Q({ en: 'Your savings earn 1% interest, but prices rise by 3% (inflation). After one year your money buys…',
      de: 'Dein Erspartes bringt 1 % Zinsen, aber die Preise steigen um 3 % (Inflation). Nach einem Jahr kannst du dir davon…' },
    [{ en: 'more than today', de: 'mehr kaufen als heute' }, { en: 'exactly the same', de: 'genauso viel kaufen' }, { en: 'less than today', de: 'weniger kaufen als heute' }], 2,
    { en: 'Prices rose faster than your savings, so your purchasing power shrank by roughly 2%.',
      de: 'Die Preise sind schneller gestiegen als dein Erspartes – deine Kaufkraft ist um etwa 2 % gesunken.' }, 'inflation'),

  Q({ en: 'A text message from “your bank” asks for your PIN or a TAN to “unlock your account”. What do you do?',
      de: 'Eine SMS von „deiner Bank“ will deine PIN oder eine TAN, um „dein Konto zu entsperren“. Was machst du?' },
    [{ en: 'Reply fast so the account isn’t locked', de: 'Schnell antworten, damit das Konto nicht gesperrt wird' },
     { en: 'Send the PIN but not the TAN', de: 'Nur die PIN schicken, nicht die TAN' },
     { en: 'Don’t reply – contact the bank via the official app or number', de: 'Nicht antworten – die Bank über die offizielle App oder Nummer kontaktieren' }], 2,
    { en: 'Banks never ask for your PIN or TAN by text, email or phone. That’s phishing.',
      de: 'Banken fragen nie per SMS, E-Mail oder Telefon nach PIN oder TAN. Das ist Phishing.' }, 'security'),

  Q({ en: 'The 50/30/20 rule splits your net income into…', de: 'Die 50/30/20-Regel teilt dein Nettoeinkommen auf in…' },
    [{ en: '50% needs, 30% wants, 20% saving', de: '50 % Fixkosten, 30 % Wünsche, 20 % Sparen' },
     { en: '50% saving, 30% needs, 20% wants', de: '50 % Sparen, 30 % Fixkosten, 20 % Wünsche' },
     { en: '50% wants, 30% saving, 20% needs', de: '50 % Wünsche, 30 % Sparen, 20 % Fixkosten' }], 0,
    { en: 'A simple starting point for a budget: needs first, some fun, and always something for savings.',
      de: 'Ein einfacher Start fürs Budget: erst das Nötige, etwas Spaß – und immer etwas zum Sparen.' }, 'budget'),

  Q({ en: 'A job offer says €2,500 gross (brutto) per month. What lands in your account?',
      de: 'Ein Jobangebot sagt 2.500 € brutto im Monat. Was landet auf deinem Konto?' },
    [{ en: 'Exactly €2,500', de: 'Genau 2.500 €' }, { en: 'Less than €2,500', de: 'Weniger als 2.500 €' }, { en: 'More, thanks to bonuses', de: 'Mehr, wegen Boni' }], 1,
    { en: 'Net (netto) = gross minus taxes and social security contributions.',
      de: 'Netto = Brutto minus Steuern und Sozialversicherungsbeiträge.' }, 'income'),

  Q({ en: 'Your account has been €300 in the red (overdraft) for months. Why is that a problem?',
      de: 'Dein Konto ist seit Monaten 300 € im Minus (Dispo). Warum ist das ein Problem?' },
    [{ en: 'Overdraft interest is usually very high', de: 'Dispozinsen sind meist sehr hoch' },
     { en: 'It isn’t – an overdraft is free', de: 'Gar nicht – der Dispo ist kostenlos' },
     { en: 'The bank pays you interest for it', de: 'Die Bank zahlt dir dafür Zinsen' }], 0,
    { en: 'An overdraft is handy for short emergencies, but its interest rate is usually much higher than a regular loan’s.',
      de: 'Der Dispo ist praktisch für kurze Notfälle, aber seine Zinsen sind meist viel höher als bei einem normalen Kredit.' }, 'debt'),

  Q({ en: 'How big should an emergency fund ideally be?', de: 'Wie groß sollte ein Notgroschen idealerweise sein?' },
    [{ en: 'One week of spending', de: 'Ausgaben für eine Woche' }, { en: 'About 3–6 months of expenses', de: 'Etwa 3–6 Monatsausgaben' }, { en: 'Exactly €10,000', de: 'Genau 10.000 €' }], 1,
    { en: 'A buffer of a few months’ expenses covers surprises like a broken laptop or a gap between jobs.',
      de: 'Ein Puffer von ein paar Monatsausgaben fängt Überraschungen ab – wie einen kaputten Laptop oder eine Jobpause.' }, 'saving'),

  Q({ en: 'What does “don’t put all your eggs in one basket” mean for investing?',
      de: 'Was bedeutet „Leg nicht alle Eier in einen Korb“ beim Investieren?' },
    [{ en: 'Spread money across many investments', de: 'Geld auf viele Anlagen verteilen' },
     { en: 'Only buy the one share you like most', de: 'Nur die eine Aktie kaufen, die du am liebsten magst' },
     { en: 'Keep everything as cash at home', de: 'Alles als Bargeld zu Hause lassen' }], 0,
    { en: 'Diversification: if one investment drops, the others soften the hit.',
      de: 'Diversifikation: Fällt eine Anlage, federn die anderen den Verlust ab.' }, 'investing'),

  Q({ en: 'What is an ETF?', de: 'Was ist ein ETF?' },
    [{ en: 'A fund that tracks an index – many companies at once', de: 'Ein Fonds, der einen Index abbildet – viele Unternehmen auf einmal' },
     { en: 'A savings account with guaranteed returns', de: 'Ein Sparkonto mit garantierter Rendite' },
     { en: 'A type of cryptocurrency', de: 'Eine Kryptowährung' }], 0,
    { en: 'ETFs are exchange-traded funds. They’re diversified and usually low-cost – but their value can still go down.',
      de: 'ETFs sind börsengehandelte Fonds. Sie sind breit gestreut und meist günstig – ihr Wert kann aber trotzdem fallen.' }, 'investing'),

  Q({ en: 'An app promises 20% return per year with zero risk. That is…', de: 'Eine App verspricht 20 % Rendite pro Jahr ohne Risiko. Das ist…' },
    [{ en: 'A great deal – sign up fast', de: 'Ein super Deal – schnell anmelden' },
     { en: 'A red flag – high returns always come with risk', de: 'Ein Warnsignal – hohe Rendite heißt immer auch Risiko' },
     { en: 'Normal for savings accounts', de: 'Normal für Sparkonten' }], 1,
    { en: 'Higher possible returns always mean higher risk. “Guaranteed high returns” is a classic scam sign.',
      de: 'Höhere mögliche Rendite bedeutet immer höheres Risiko. „Garantiert hohe Rendite“ ist ein klassisches Betrugszeichen.' }, 'investing'),

  Q({ en: 'With “Buy now, pay later”…', de: 'Bei „Jetzt kaufen, später zahlen“…' },
    [{ en: 'the purchase is basically free', de: 'ist der Kauf praktisch kostenlos' },
     { en: 'you take on debt you must repay on time', de: 'machst du Schulden, die du pünktlich zurückzahlen musst' },
     { en: 'you never pay if you forget', de: 'zahlst du nie, wenn du es vergisst' }], 1,
    { en: 'It’s still borrowing. Missed payments can mean fees and reminders and can hurt your credit score.',
      de: 'Es bleibt ein Kredit. Verpasste Zahlungen können Gebühren und Mahnungen bringen und deiner Bonität schaden.' }, 'debt'),

  Q({ en: 'What helps your credit score (e.g. SCHUFA in Germany)?', de: 'Was hilft deiner Bonität (z. B. SCHUFA-Score)?' },
    [{ en: 'Paying bills and instalments on time', de: 'Rechnungen und Raten pünktlich zahlen' },
     { en: 'Opening as many credit cards as possible', de: 'Möglichst viele Kreditkarten eröffnen' },
     { en: 'Ignoring payment reminders', de: 'Mahnungen ignorieren' }], 0,
    { en: 'Reliability counts: paying on time shows lenders you can handle credit.',
      de: 'Zuverlässigkeit zählt: Pünktliches Zahlen zeigt, dass du mit Krediten umgehen kannst.' }, 'debt'),

  Q({ en: 'You have 3 subscriptions at €9.99 each per month. What do they cost per year?',
      de: 'Du hast 3 Abos zu je 9,99 € im Monat. Was kosten sie pro Jahr?' },
    [{ en: 'About €120', de: 'Etwa 120 €' }, { en: 'About €360', de: 'Etwa 360 €' }, { en: 'About €30', de: 'Etwa 30 €' }], 1,
    { en: '3 × €9.99 × 12 ≈ €360. Small monthly amounts add up – check which ones you really use.',
      de: '3 × 9,99 € × 12 ≈ 360 €. Kleine Monatsbeträge läppern sich – check, welche du wirklich nutzt.' }, 'budget'),

  Q({ en: 'Up to what amount are bank deposits in the EU protected by law, per person and bank?',
      de: 'Bis zu welchem Betrag sind Bankeinlagen in der EU gesetzlich geschützt – pro Person und Bank?' },
    [{ en: '€10,000', de: '10.000 €' }, { en: '€100,000', de: '100.000 €' }, { en: 'Unlimited', de: 'Unbegrenzt' }], 1,
    { en: 'The statutory deposit guarantee covers up to €100,000 per customer per bank.',
      de: 'Die gesetzliche Einlagensicherung schützt bis zu 100.000 € pro Kunde und Bank.' }, 'saving'),

  Q({ en: 'To compare loan offers, which number is best?', de: 'Welche Zahl ist am besten, um Kreditangebote zu vergleichen?' },
    [{ en: 'The monthly instalment', de: 'Die Monatsrate' },
     { en: 'The effective annual interest rate (APR)', de: 'Der effektive Jahreszins' },
     { en: 'How nice the app looks', de: 'Wie schön die App aussieht' }], 1,
    { en: 'The effective annual rate includes interest and most fees. A low monthly rate can just mean a longer, pricier loan.',
      de: 'Der effektive Jahreszins enthält Zinsen und die meisten Gebühren. Eine kleine Rate kann einfach einen längeren, teureren Kredit bedeuten.' }, 'debt'),

  Q({ en: 'At 6% return per year, roughly how long until your money doubles?', de: 'Bei 6 % Rendite pro Jahr: Nach etwa wie vielen Jahren hat sich dein Geld verdoppelt?' },
    [{ en: '6 years', de: '6 Jahre' }, { en: '12 years', de: '12 Jahre' }, { en: '72 years', de: '72 Jahre' }], 1,
    { en: 'Rule of 72: 72 ÷ 6 = about 12 years.', de: 'Die 72er-Regel: 72 ÷ 6 = etwa 12 Jahre.' }, 'investing'),

  Q({ en: 'What does “pay yourself first” mean?', de: 'Was bedeutet „Bezahl dich zuerst selbst“?' },
    [{ en: 'Treat yourself to something on payday', de: 'Dir am Zahltag etwas gönnen' },
     { en: 'Move money to savings as soon as your income arrives', de: 'Sparen, sobald dein Geld reinkommt' },
     { en: 'Pay back friends before the bank', de: 'Erst Freunde zurückzahlen, dann die Bank' }], 1,
    { en: 'A standing order on payday makes saving automatic – before you can spend it.',
      de: 'Ein Dauerauftrag am Zahltag macht Sparen automatisch – bevor du das Geld ausgibst.' }, 'saving'),

  Q({ en: 'When you pay with a debit card, the money…', de: 'Wenn du mit einer Debitkarte zahlst, wird das Geld…' },
    [{ en: 'comes straight from your current account', de: 'direkt von deinem Girokonto abgebucht' },
     { en: 'is borrowed and billed next year', de: 'geliehen und nächstes Jahr abgerechnet' },
     { en: 'is paid by the shop', de: 'vom Laden bezahlt' }], 0,
    { en: 'Debit = your own money, taken from your account. A credit card lends you money first.',
      de: 'Debit = dein eigenes Geld vom Konto. Eine Kreditkarte leiht dir das Geld erst einmal.' }, 'banking'),
];

const I = (emoji, en, de, need) => ({ emoji, label: { en, de }, need });

export const NEEDS_WANTS = [
  I('🏠', 'Rent', 'Miete', true),
  I('🛒', 'Groceries', 'Lebensmittel', true),
  I('🚌', 'Monthly ticket for school or work', 'Monatsticket für Schule oder Arbeit', true),
  I('💊', 'Medicine you need', 'Medikamente, die du brauchst', true),
  I('💡', 'Electricity bill', 'Stromrechnung', true),
  I('🩺', 'Health insurance', 'Krankenversicherung', true),
  I('📚', 'Textbooks for your course', 'Fachbücher für deine Ausbildung', true),
  I('🧥', 'A winter jacket when you don’t own one', 'Eine Winterjacke, wenn du keine hast', true),
  I('🎟️', 'Festival ticket', 'Festival-Ticket', false),
  I('👟', 'Limited sneaker drop', 'Limitierte Sneaker', false),
  I('🎮', 'New skin in your favourite game', 'Neuer Skin in deinem Lieblingsgame', false),
  I('🍕', 'Pizza delivery', 'Pizza-Lieferung', false),
  I('📺', 'A third streaming subscription', 'Ein drittes Streaming-Abo', false),
  I('📱', 'New phone while yours still works', 'Neues Handy, obwohl deins noch geht', false),
  I('🧋', 'Bubble tea every day', 'Jeden Tag Bubble Tea', false),
  I('✈️', 'Weekend trip with friends', 'Wochenendtrip mit Freunden', false),
];
