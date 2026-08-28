/*
 * Budget auf dem Tablet: erfassen statt nur lesen — und der Saldo stimmt.
 *
 * BEFUND 1: die Ansicht trug ausdruecklich das Abzeichen "Nur lesen".
 * Erfasst wurde nur am Desktop oder am Handy — auf dem Geraet, das man beim
 * Einkaufen am ehesten dabei hat, gar nicht.
 *
 * BEFUND 2 (Rechenfehler): budgetData() summierte fuer "expense" die rohen
 * Betraege. Eine Ausgabe traegt aber ein NEGATIVES Vorzeichen, also war
 * expense negativ — und der angezeigte Saldo income - expense ADDIERTE die
 * Ausgaben. Bei 3000 Einnahmen und 92.50 Ausgaben stand dort 3092.50 statt
 * 2907.50.
 *
 * BEFUND 3 (gleiche Stelle): gefiltert wurde nach item.type. Buchungen aus
 * dem CSV-Import und aeltere Bestaende haben kein type-Feld — sie fielen aus
 * beiden Summen heraus. Massgeblich ist das Vorzeichen.
 *
 * FORMAT: der Betrag traegt sein Vorzeichen. Ein positiver Betrag mit
 * type "expense" wuerde auf Desktop und Handy als Einnahme zaehlen.
 */
const fs = require("fs");
const path = require("path");

const root = path.dirname(__dirname);
const lies = (p) => { try { return fs.readFileSync(path.join(root, p), "utf8"); } catch (e) { return ""; } };
let checks = 0;
const luecken = [];
const ok = (b, t) => { checks++; if (!b) luecken.push(t); };
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const APP = lies("public/app.js");
const AKTIV = ohneKommentare(APP);
ok(APP.length > 0, "public/app.js wurde nicht gefunden");

// ═══ 1. DIE RECHNUNG — an der ECHTEN Funktion ══════════════════════════
// Kein Nachbau: budgetData wird aus der ausgelieferten Datei geschnitten und
// gegen Attrappen ausgefuehrt. Ein Quelltextmuster wuerde den Rechenfehler
// nicht zeigen.
const bd = (() => {
  const a = APP.indexOf("  function budgetData(");
  if (a < 0) return "";
  const e = APP.indexOf("\n  }\n", a);
  return e > a ? APP.slice(a, e + 4) : "";
})();
ok(bd.length > 0, "budgetData() wurde nicht gefunden");

if (bd) {
  const KONTEN = [{ id: "a1", title: "Privatkonto", balance: 1200.5, currency: "CHF" }];
  const TX = [
    { id: "t1", amount: -12.5, type: "expense", category: "Essen", date: "2026-08-05" },
    { id: "t2", amount: 3000, type: "income", category: "Lohn", date: "2026-08-01" },
    { id: "t3", amount: -80, type: "expense", category: "Transport", date: "2026-08-09" },
    // Ohne type-Feld — genau der Fall aus dem CSV-Import.
    { id: "t4", amount: -25, category: "Einkauf", date: "2026-08-11" },
    // Ein anderer Monat darf nicht mitzaehlen.
    { id: "t5", amount: -999, type: "expense", category: "Essen", date: "2026-07-30" },
    // Zukuenftige Buchungen bleiben aussen vor.
    { id: "t6", amount: -500, type: "expense", category: "Essen", date: "2026-08-20", isFuture: true },
  ];
  const fn = new Function("collection", "localDateKey", "state", "Number", "Object", "Math", "Date", "String",
    bd + "\nreturn budgetData;")(
    (name) => (name === "accounts" ? KONTEN : name === "transactions" ? TX : []),
    () => "2026-08-12", { budgetMonat: null }, Number, Object, Math, Date, String);

  const d = fn("2026-08");
  ok(d.income === 3000, `Einnahmen ${d.income} statt 3000`);
  ok(d.expense === 117.5,
    `DER RECHENFEHLER: Ausgaben ${d.expense} statt 117.5 — Betraege sind negativ, ` +
    "und eine Buchung ohne type-Feld darf nicht herausfallen");
  ok(d.income - d.expense === 2882.5,
    `DER SALDO: ${d.income - d.expense} statt 2882.5 — die Ausgaben wurden addiert statt abgezogen`);
  ok(d.balance === 1200.5, `Kontostand ${d.balance} statt 1200.5`);
  // Vier: drei Ausgaben und eine Einnahme. Juli (t5) und die zukuenftige
  // Buchung (t6) bleiben aussen vor.
  ok(d.month.length === 4,
    `${d.month.length} Buchungen im Monat statt 4 — ein anderer Monat oder eine zukuenftige Buchung zaehlt mit`);
  ok(Array.isArray(d.kategorien) && d.kategorien.length === 3,
    `die Kategorien werden nicht ausgewertet (${Array.isArray(d.kategorien) ? d.kategorien.length : "gar nicht"})`);
  // Defensiv: auf einem Stand ohne Kategorienauswertung ist d.kategorien
  // undefiniert, und ein direkter Zugriff wuerde den Lauf beenden statt den
  // Befund zu zeigen.
  {
    const groesste = (d.kategorien || [])[0] || [];
    ok(groesste[0] === "Transport" && groesste[1] === 80,
      `die groesste Kategorie ist ${JSON.stringify(groesste)} statt ["Transport", 80]`);
  }

  // Ein anderer Monat liefert einen anderen Stand.
  const juli = fn("2026-07");
  ok(juli.expense === 999, `Juli: Ausgaben ${juli.expense} statt 999 — der Monat wirkt nicht`);
  ok(juli.income === 0, "Juli: es werden Einnahmen aus einem anderen Monat gezaehlt");
}

// ═══ 2. ERFASSEN IST MOEGLICH ══════════════════════════════════════════
const view = (() => {
  const a = APP.indexOf("  function renderBudget() {");
  if (a < 0) return "";
  const e = APP.indexOf("\n  function ", a + 10);
  return APP.slice(a, e > a ? e : undefined);
})();
ok(view.length > 0, "renderBudget() wurde nicht gefunden");
ok(!/Nur lesen/.test(view), "DER BEFUND: das Budget traegt weiterhin das Abzeichen \"Nur lesen\"");
ok(/data-form="budget-tx"/.test(view), "es gibt kein Erfassungsformular");
for (const feld of ["amount", "category", "description", "date", "typ"]) {
  ok(new RegExp('name="' + feld + '"').test(view), `im Formular fehlt das Feld ${feld}`);
}
ok(/data-action="budget-typ"/.test(view), "Ausgabe und Einnahme lassen sich nicht umschalten");
ok(/data-action="budget-monat"/.test(view), "die Uebersicht laesst sich nicht auf einen anderen Monat blaettern");
ok(/data-action="budget-loeschen"/.test(view), "eine Buchung laesst sich nicht loeschen");
ok(/inputmode="decimal"/.test(view), "das Betragsfeld oeffnet keine Zifferntastatur");
ok(/Kategorien/.test(view) && /Konten/.test(view), "Kategorien oder Konten fehlen in der Uebersicht");

// ═══ 3. DAS FORMAT ═════════════════════════════════════════════════════
const submit = (() => {
  const a = AKTIV.indexOf('} else if (type === "budget-tx") {');
  return a < 0 ? "" : AKTIV.slice(a, AKTIV.indexOf('} else if (type === "db-goal")', a));
})();
ok(submit.length > 0, "das Formular budget-tx wird nicht abgearbeitet — es taete stumm nichts");
ok(/typ === "income" \? roh : -roh/.test(submit),
  "DER FORMATFEHLER: der Betrag traegt kein Vorzeichen — Desktop und Handy zaehlten jede Ausgabe als Einnahme");
ok(/Math\.abs\(Number\(data\.get\("amount"\)\)/.test(submit),
  "ein von Hand eingegebenes Minus wuerde das Vorzeichen ein zweites Mal drehen");
ok(/if \(!roh\)/.test(submit), "ohne Betrag wird trotzdem eine Buchung angelegt");
ok(/makeOperation\("entity", "create", "transactions"/.test(submit),
  "die Buchung wird nicht als Entitaets-Operation in transactions geschrieben");
ok(/source: "tablet"/.test(submit), "die Herkunft wird nicht vermerkt");

// Loeschen fragt nach — der Papierkorb liegt einen Daumen neben dem Betrag.
const del = (() => {
  const a = AKTIV.indexOf('if (action === "budget-loeschen")');
  return a < 0 ? "" : AKTIV.slice(a, AKTIV.indexOf("\n    }", a));
})();
ok(/window\.confirm\(/.test(del), "eine Buchung wird ohne Rueckfrage geloescht");
ok(/makeOperation\("entity", "delete", "transactions"/.test(del), "geloescht wird nicht ueber die Entitaets-Operation");

if (luecken.length) {
  console.error(`BUDGET ERFASSUNG (Tablet) — ${luecken.length} von ${checks} Pruefungen:`);
  luecken.forEach((l) => console.error("   - " + l));
  process.exit(1);
}
console.log(`budget erfassung (Tablet): ok (${checks} Pruefungen)`);
