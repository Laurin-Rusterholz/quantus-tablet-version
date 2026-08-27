/*
 * Das Daily Briefing ist auf dem Tablet vollstaendig.
 *
 * BEFUND (Nutzer: "tablet und mobile: das daily briefing soll vollumfaenglich
 * darin enthalten sein"): renderDaily() zeigte vier Kacheln — Prioritaeten,
 * Agenda, Routinen, Leitgedanken. Die Hauptapp zeigt SIEBZEHN Abschnitte, und
 * alle liegen im selben Datensatz. Sie wurden nur nie gelesen.
 *
 * ZWEITER BEFUND, an derselben Ansicht: isHabitDoneToday() rechnete mit
 * new Date().toISOString().slice(0,10) — dem Tag in UTC. Ab 22 Uhr Zuercher
 * Sommerzeit ist das der Folgetag: eine abends abgehakte Routine galt als
 * offen. localDateKey() gibt es in derselben Datei laengst.
 *
 * DRITTER BEFUND: der Haken schrieb completedDates/lastCompleted — Felder,
 * die die Hauptapp gar nicht liest. Sie fuehrt completions[{date,value}].
 * Ein Haken auf dem Tablet kam auf Desktop und Handy nie an.
 *
 * Geprueft wird gegen die ausgelieferte Datei und, wo moeglich, gegen den
 * Quelltext der Hauptapp. Kein Browser, kein Netz.
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
const APP_AKTIV = ohneKommentare(APP);
const SYNC = ohneKommentare(lies("public/sync-core.js"));
ok(APP.length > 0, "public/app.js wurde nicht gefunden");

// ═══ 1. ALLE SIEBZEHN ABSCHNITTE ═══════════════════════════════════════
// Die Liste ist bewusst hier verankert und nicht aus dem Code abgeleitet —
// sonst wuerde der Test jede Streichung stillschweigend mitmachen.
const ABSCHNITTE = [
  "Tagesziele", "Wochenziele", "Tagesplanung", "Agenda", "Fällig heute",
  "Pendente Aufgaben", "Routinen", "Aktive Massnahmen", "Nachrichten",
  "Leitgedanken", "Gedanken & Fragen", "Leseliste", "Generelle Ziele",
  "Projekte im Briefing", "Programme im Briefing", "Reflexionsfragen",
  "Tägliche Notizen", "Vergangene Tage",
];
const daily = (() => {
  const a = APP.indexOf("function renderDaily()");
  if (a < 0) return "";
  const e = APP.indexOf("\n  function ", a + 10);
  return APP.slice(a, e > a ? e : undefined);
})();
ok(daily.length > 0, "renderDaily() wurde nicht gefunden");
ABSCHNITTE.forEach((titel) => {
  ok(daily.includes(titel), `DER BEFUND: der Abschnitt "${titel}" fehlt im Daily Briefing`);
});
ok(/Überfällig/.test(daily), "der Abschnitt Überfällig fehlt");

// ═══ 2. DIE QUELLEN — dieselben Felder wie die Hauptapp ════════════════
const modell = (() => {
  const a = APP.indexOf("function briefingModell(");
  if (a < 0) return "";
  const e = APP.indexOf("\n  function ", a + 10);
  return APP.slice(a, e > a ? e : undefined);
})();
ok(modell.length > 0, "briefingModell() wurde nicht gefunden — die Abschnitte haetten keine gemeinsame Quelle");
const FELDER = [
  "dailyGoals", "weeklyGoals", "dailyBriefing", "beliefs", "measures",
  "scheduledMessages", "journal", "readingList", "timeBlocks", "dailyLog",
  "hiddenGoals", "selectedProjects", "selectedPrograms", "reflectionQuestions",
];
FELDER.forEach((f) => ok(modell.includes(f), `das Modell liest ${f} nicht — der zugehoerige Abschnitt bliebe leer`));

// Und die Felder gibt es in der Hauptapp wirklich so. Verschiebt sich dort
// etwas, faellt das hier auf, statt still eine leere Kachel zu erzeugen.
{
  const haupt = (() => { try {
    return fs.readFileSync(path.join(path.dirname(root), "ai-sync/public/index.html"), "utf8");
  } catch (e) { return ""; } })();
  if (haupt) {
    FELDER.forEach((f) => ok(haupt.includes(f), `die Hauptapp kennt ${f} nicht mehr — das Modell zeigt ins Leere`));
  } else {
    ok(true, "(ai-sync nicht danebenliegend — Feldabgleich uebersprungen)");
  }
}

// ═══ 3. DER UTC-BEFUND ═════════════════════════════════════════════════
ok(!/new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/.test(APP_AKTIV),
  "DER BEFUND: irgendwo wird der heutige Tag wieder aus toISOString() gebildet — das ist UTC, " +
  "und ab 22 Uhr Zuercher Zeit der falsche Tag");
ok(/function isHabitDoneToday\(habit\) \{ return isHabitDoneOn\(habit, localDateKey\(\)\); \}/.test(APP_AKTIV),
  "isHabitDoneToday rechnet nicht mehr ueber localDateKey");
ok(/function localDateKey/.test(APP_AKTIV) && /Europe\/Zurich/.test(APP_AKTIV),
  "localDateKey rechnet nicht mehr in Europe/Zurich");

// ═══ 4. SUB-EINHEITEN UND DAS SCHREIBFORMAT ════════════════════════════
ok(/function habitSubUnits/.test(APP_AKTIV), "das Tablet kennt keine Sub-Einheiten");
ok(/subs\.every\(/.test(APP_AKTIV),
  "eine Routine mit Schritten gilt nicht erst als erledigt, wenn ALLE stehen — " +
  "Tablet, Handy und Hauptapp zaehlen dann verschieden");
const toggle = (() => {
  const a = APP.indexOf('if (action === "toggle-habit")');
  return a < 0 ? "" : APP.slice(a, APP.indexOf('if (action === "db-day")', a));
})();
ok(toggle.length > 0, "die Aktion toggle-habit wurde nicht gefunden");
ok(/patch\.completions/.test(toggle),
  "DER BEFUND: der Haken schreibt kein completions[] — die Hauptapp liest completedDates gar nicht, " +
  "ein Haken auf dem Tablet kaeme auf Desktop und Handy nie an");
ok(/subCompletions/.test(toggle), "Schritte werden beim Abhaken nicht mitgeschrieben");
ok(/autoFromSubUnits/.test(toggle), "der Automatik-Eintrag der Hauptapp fehlt");
ok(/completedDates/.test(toggle),
  "completedDates wird gar nicht mehr geschrieben — bestehende Tabletdaten wuerden abreissen");

// ═══ 5. DIE SCHREIBENDEN TEILE HABEN EINEN WEG ═════════════════════════
// Ein Formular ohne Operationsart taete stumm nichts. Das ist schlimmer als
// gar kein Formular.
ok(/operation\.kind === "briefing"/.test(SYNC), "sync-core kennt die Operationsart briefing nicht");
ok(/function applyBriefingOperation/.test(SYNC), "applyBriefingOperation fehlt");
for (const was of ["note", "goal-add", "goal-toggle", "goal-delete", "thought-add", "thought-delete"]) {
  ok(SYNC.includes(`"${was}"`), `die Briefing-Operation ${was} fehlt`);
}
for (const form of ["db-goal", "db-thought", "db-note"]) {
  ok(daily.includes(`data-form="${form}"`), `das Formular ${form} steht nicht im Briefing`);
  ok(APP_AKTIV.includes(`type === "${form}"`), `das Formular ${form} wird nicht abgearbeitet — es taete stumm nichts`);
}
ok(/data-action="db-day"/.test(daily), "es gibt keine Tagesnavigation");
ok(/action === "db-day"/.test(APP_AKTIV), "die Tagesnavigation wird nicht abgearbeitet");
ok(/dbTag/.test(APP_AKTIV), "der gewaehlte Tag wird nirgends gehalten");

// ═══ 6. DIE OPERATION SCHREIBT WIRKLICH ════════════════════════════════
const Core = require(path.join(root, "public/sync-core.js"));
{
  // Alle Zugriffe defensiv: auf einem Stand OHNE die Briefing-Operationen
  // bleibt payload.dailyBriefing.dailyLog undefiniert, und ein direkter
  // Zugriff wuerde den Lauf beenden statt den Befund zu zeigen.
  const w = (o, ...pfad) => pfad.reduce((x, k) => (x == null ? undefined : x[k]), o);
  const op = (action, id, patch) => ({ operationId: "o", kind: "briefing", action, id, patch, updatedAt: "2026-08-27T10:00:00.000Z" });
  let r = Core.applyOperation({}, op("note", "n1", { date: "2026-08-27", notes: "Guter Tag" }));
  ok(r.applied === true, `Notiz nicht angewendet: ${r.reason}`);
  ok(w(r.payload, "dailyBriefing", "dailyLog", "2026-08-27", "notes") === "Guter Tag",
    "die Notiz landet nicht in dailyBriefing.dailyLog — dort liest die Hauptapp");

  r = Core.applyOperation(r.payload, op("goal-add", "g1", { date: "2026-08-27", title: "Lernen" }));
  ok(r.applied === true, `Tagesziel nicht angewendet: ${r.reason}`);
  ok(w(r.payload, "dailyGoals", "2026-08-27", 0, "title") === "Lernen", "das Tagesziel landet nicht in dailyGoals[<tag>]");
  ok(w(r.payload, "dailyGoals", "2026-08-27", 0, "completed") === false, "ein neues Tagesziel ist bereits erledigt");

  r = Core.applyOperation(r.payload, op("goal-toggle", "g1", { date: "2026-08-27" }));
  ok(w(r.payload, "dailyGoals", "2026-08-27", 0, "completed") === true, "das Tagesziel laesst sich nicht abhaken");
  r = Core.applyOperation(r.payload, op("goal-toggle", "g1", { date: "2026-08-27" }));
  ok(w(r.payload, "dailyGoals", "2026-08-27", 0, "completed") === false, "das Tagesziel laesst sich nicht zuruecknehmen");

  r = Core.applyOperation(r.payload, op("thought-add", "t1", { text: "Warum?" }));
  ok(w(r.payload, "journal", "topics", 0, "text") === "Warum?", "der Gedanke landet nicht in journal.topics");
  r = Core.applyOperation(r.payload, op("thought-delete", "t1", {}));
  ok((w(r.payload, "journal", "topics") || []).length === 0, "der Gedanke laesst sich nicht loeschen");

  // Ohne Datum wird NICHT geraten — sonst landet die Notiz am falschen Tag.
  const ohne = Core.applyOperation({}, op("note", "n2", { notes: "x" }));
  ok(ohne.applied === false, "eine Notiz ohne Datum wird trotzdem geschrieben — an welchem Tag?");
  const unbekannt = Core.applyOperation({}, op("gibtsnicht", "x", {}));
  ok(unbekannt.applied === false, "eine unbekannte Briefing-Aktion wird stillschweigend angewendet");
}

if (luecken.length) {
  console.error(`BRIEFING VOLLSTAENDIG — ${luecken.length} von ${checks} Pruefungen:`);
  luecken.forEach((l) => console.error("   - " + l));
  process.exit(1);
}
console.log(`briefing vollstaendig (Tablet): ok (${checks} Pruefungen)`);
