/*
 * JEDE APP IST AUF DEM TABLET BEDIENBAR.
 *
 * BEFUND (Nutzer: "alle apps mit allen funktionen oeffenbar direkt in der
 * tablet version"): Werkzeuge ohne eigene Tablet-Ansicht landeten in
 * renderModule() — einer Kachel mit drei Kennzahlen und dem Knopf „Separat
 * oeffnen". Das betraf Zeiterfassung, Auslastung, Wochenplanung, Google
 * Kalender, Wissensbasis, Thesis, Journal, Reflecta, Nachrichten, Updates,
 * Massnahmen, Drive, PDF, DocStudio, Browser, Briefings, Quantus Projekt und
 * Smarter. Auf dem Tablet hiess das: diese App laesst sich hier gar nicht
 * benutzen.
 *
 * ZWEITER BEFUND: die Route "messages" gehoerte der Mail-App. „Nachrichten"
 * oeffnete also den Gmail-Posteingang, und entities.scheduledMessages — die
 * Nachrichten, die man sich selbst auf einen Zeitpunkt legt — war vom Tablet
 * aus ueberhaupt nicht erreichbar.
 *
 * DRITTER BEFUND: fuer journal.documents, journal.selfLetters,
 * journal.topics, reflections und readingList gab es keine Operationsart.
 * Ein Formular in diesen Bereichen haette stumm gar nichts getan.
 *
 * Dieser Test fuehrt die ECHTEN Ansichten aus native-modules.js gegen einen
 * Stub aus und prueft, dass sie die Daten zeigen und dass jede Eingabe als
 * gueltige Operation im Datenstand landet. Kein Browser, kein Netz.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const Core = require(path.join(root, "public", "sync-core.js"));
const source = fs.readFileSync(path.join(root, "public", "native-modules.js"), "utf8");

let checks = 0;
const luecken = [];
const ok = (bedingung, text) => { checks += 1; if (!bedingung) luecken.push(text); };

// ── Ein Datenstand, in dem jeder Bereich etwas enthaelt ────────────────────
const HEUTE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());
const JETZT = new Date().toISOString();

function datenstand() {
  return Core.normalisePayload({
    entities: {
      tasks: {
        t1: { id: "t1", title: "Sitzungsunterlagen lesen", status: "open", dueDate: HEUTE, projectId: "p1", updatedAt: JETZT },
        t2: { id: "t2", title: "Massnahme aus dem Entscheid", status: "open", decisionId: "d1", kind: "measure", updatedAt: JETZT },
        t3: { id: "t3", title: "Ohne Termin", status: "open", updatedAt: JETZT }
      },
      projects: { p1: { id: "p1", title: "Quantus Tablet", status: "in_progress", updatedAt: JETZT } },
      notes: { n1: { id: "n1", title: "Notiz ueber Wissen", description: "Inhalt der Notiz", updatedAt: JETZT } },
      articles: { a1: { id: "a1", title: "Artikel aus dem Netz", updatedAt: JETZT } },
      concepts: { c1: { id: "c1", title: "Konzeptkarte", updatedAt: JETZT } },
      decisions: { d1: { id: "d1", title: "Wir bauen nativ", description: "Begruendung", updatedAt: JETZT } },
      theses: { th1: { id: "th1", title: "Meine These", question: "Kernfrage", description: "Text", updatedAt: JETZT } },
      updates: { u1: { id: "u1", text: "Tablet ist nativ", category: "Bau", checked: false, createdAt: JETZT, updatedAt: JETZT } },
      scheduledMessages: {
        m1: { id: "m1", title: "Nachricht an mich", content: "Denk daran", deliverAt: "2020-01-01T08:00:00.000Z", isRead: false, updatedAt: JETZT }
      },
      timeEntries: {
        te1: { id: "te1", taskId: "t1", startTs: HEUTE + "T09:00:00.000Z", endTs: HEUTE + "T10:00:00.000Z", durationSec: 3600, updatedAt: JETZT }
      },
      calendarEvents: { e1: { id: "e1", title: "Google-Termin", date: HEUTE, start: HEUTE + "T14:00:00.000Z", updatedAt: JETZT } },
      meetings: { mt1: { id: "mt1", title: "Sitzung", date: HEUTE, updatedAt: JETZT } },
      ideas: { i1: { id: "i1", title: "Idee fuer Quantus", updatedAt: JETZT } },
      programs: { pr1: { id: "pr1", title: "Programm", updatedAt: JETZT } }
    },
    timers: { t1: { taskId: "t1", startTs: new Date(Date.now() - 65000).toISOString(), note: "laeuft" } },
    journal: {
      documents: [{ id: "jd1", title: "Journaleintrag", content: "Text im Journal", updatedAt: JETZT }],
      selfLetters: [{ id: "jl1", title: "Brief an mich", content: "Lieber Laurin", deliveryDate: "2030-01-01", updatedAt: JETZT }],
      topics: [{ id: "jt1", text: "Ein Gedanke", createdAt: JETZT }]
    },
    reflections: [{ id: "rf1", date: HEUTE, openQuestions: { a: "Gelungen ist der Tablet-Umbau" }, ratings: { f: 4 }, learnings: ["Nativ ist besser"], updatedAt: JETZT }],
    readingList: [{ id: "rl1", type: "link", url: "https://example.ch/artikel", title: "Gemerkter Link", updatedAt: JETZT }],
    dailyBriefing: { routines: [], beliefs: [], dailyLog: { [HEUTE]: { notes: "Notiz des Tages" } } },
    dailyGoals: { [HEUTE]: [{ id: "g1", title: "Tagesziel", completed: false }] },
    mobilePushes: [{ title: "Vom Handy", text: "Push-Inhalt" }]
  });
}

// ── Der Stub: dieselbe Bruecke, die app.js den Modulen reicht ─────────────
const geschrieben = [];
let payload = datenstand();

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

const bridge = {
  state: {
    payload,
    user: { email: "test@example.ch" },
    driveDocs: {
      d1: { id: "d1", titel_final: "Bericht.pdf", mimeType: "application/pdf", bereich: "Arbeit", downloadUrl: "https://example.ch/b.pdf" },
      d2: { id: "d2", titel_final: "Notiz.txt", mimeType: "text/plain", bereich: "Privat", textauszug: "Auszug" }
    },
    smarterDocs: { [HEUTE]: { title: "Tageslektion", questions: [{ question: "Frage?", answer: "Antwort." }] } },
    dbTag: null
  },
  Core,
  esc,
  attr: esc,
  collection(name) {
    const map = (payload.entities && payload.entities[name]) || {};
    return Object.values(map).filter((item) => item && item.status !== "deleted" && !item.deletedAt);
  },
  isDone: (item) => Boolean(item) && ["done", "completed", "erledigt", "closed"].includes(item.status),
  itemTitle: (item, fallback) => (item && (item.title || item.name || item.subject)) || fallback || "Ohne Titel",
  itemText: (item) => (item && (item.description || item.content || item.text || item.notes)) || "",
  localDateKey: (date) => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date || new Date()),
  formatDate: (value) => (value ? String(value).slice(0, 10) : ""),
  formatTime: (value) => (value ? String(value).slice(11, 16) : ""),
  viewHeader: (title, subtitle, actions) => `<div class="view-head"><h1>${esc(title)}</h1><p>${esc(subtitle)}</p>${actions || ""}</div>`,
  emptyState: (icon, title, hint) => `<div class="empty-state">${esc(title)} ${esc(hint)}</div>`,
  emptyMini: (title) => `<div class="empty-mini">${esc(title)}</div>`,
  loginBanner: () => "",
  toast: () => {},
  render: () => {},
  go: () => {},
  openExternalUrl: (url) => { geschrieben.push({ kind: "open", url }); },
  makeOperation: (kind, action, collectionName, id, patch) => ({
    operationId: Core.makeId("op"),
    kind,
    action: action || "update",
    collection: collectionName || undefined,
    id: id || Core.makeId(kind),
    patch: patch || {},
    updatedAt: new Date().toISOString()
  }),
  executeOperation(operation) {
    geschrieben.push(operation);
    const result = Core.applyOperation(payload, operation);
    if (result.applied) { payload = result.payload; bridge.state.payload = payload; }
    geschrieben[geschrieben.length - 1].__ergebnis = result;
    return Promise.resolve(true);
  }
};

// ── Ein Fenster, das gerade genug kann ────────────────────────────────────
const module_ = {};
const fensterlos = {
  __quantusTablet: bridge,
  __quantusTabletModules: []
};
const dokument = {
  addEventListener: () => {},
  querySelectorAll: () => [],
  querySelector: () => null,
  body: { contains: () => false }
};
new Function("window", "document", "setInterval", "clearInterval", "requestAnimationFrame", "setTimeout", "clearTimeout", source)(
  fensterlos, dokument, () => 0, () => {}, () => {}, () => 0, () => {}
);

const modul = fensterlos.__quantusTabletModules.find((entry) => entry.key === "native-modules");
ok(Boolean(modul), "native-modules.js hat sich nicht als Tablet-Modul angemeldet");

// ═══ 1. JEDE ROUTE RENDERT EINE ECHTE ANSICHT ═════════════════════════════
// Die Liste steht bewusst hier und wird nicht aus dem Code abgeleitet — sonst
// wuerde der Test jede Streichung stillschweigend mitmachen.
const ROUTEN = [
  "time", "workload", "weekplanning", "nobraine", "googlecalendar", "knowledge",
  "thesis", "journal", "reflecta", "messages", "updates", "measures", "drive",
  "pdfeditor", "docstudio", "browser", "briefings", "quantusproject", "smarter"
];

ROUTEN.forEach((route) => {
  ok(modul.routes.includes(route), `die Route ${route} ist nicht angemeldet`);
  let html = "";
  try { html = modul.render(route); }
  catch (error) { luecken.push(`${route} wirft beim Rendern: ${error.message}`); checks += 1; return; }
  ok(typeof html === "string" && html.length > 400, `${route} rendert keine echte Ansicht (${html.length} Zeichen)`);
  ok(!/Separat öffnen|In separatem Fenster öffnen/.test(html),
    `${route} schickt den Nutzer immer noch in ein anderes Fenster`);
  ok(/data-form=|data-action=/.test(html), `${route} hat keine einzige Bedienung`);
});

// ═══ 2. DIE ANSICHTEN ZEIGEN DIE ECHTEN DATEN ═════════════════════════════
const inhalte = {
  time: ["Sitzungsunterlagen lesen"],
  workload: ["Quantus Tablet"],
  weekplanning: ["Sitzungsunterlagen lesen", "Ohne Termin"],
  googlecalendar: ["Google-Termin"],
  knowledge: ["Notiz ueber Wissen", "Artikel aus dem Netz", "Konzeptkarte"],
  thesis: ["Meine These", "Kernfrage"],
  journal: ["Journaleintrag"],
  reflecta: ["Gelungen ist der Tablet-Umbau"],
  messages: ["Nachricht an mich"],
  updates: ["Tablet ist nativ"],
  measures: ["Wir bauen nativ", "Massnahme aus dem Entscheid"],
  drive: ["Bericht.pdf", "Notiz.txt"],
  pdfeditor: ["Bericht.pdf"],
  docstudio: [],
  browser: ["Gemerkter Link"],
  briefings: ["Tagesziel"],
  quantusproject: ["Idee fuer Quantus"],
  smarter: ["Tageslektion", "Frage?"]
};
Object.keys(inhalte).forEach((route) => {
  const html = modul.render(route);
  inhalte[route].forEach((text) => {
    ok(html.includes(esc(text)), `${route} zeigt "${text}" nicht — die Ansicht liest den Datenstand nicht`);
  });
});

/*
 * Das PDF wird wirklich angezeigt, nicht nur verlinkt.
 *
 * Hier stand die Pruefung auf ein <iframe> mit der Adresse. Genau das war
 * aber der Befund des Nutzers ("pdf reader noch sehr eingeschraenkt"): auf
 * iPadOS zeigt Safari ein PDF im iframe nur als Vorschau — erste Seite, kein
 * Blaettern — und #view wird ignoriert. Gerendert wird jetzt mit einem
 * eigenen Betrachter (pdf-viewer.js), der nach dem Zeichnen in den
 * Behaelter eingehaengt wird. Geprueft wird deshalb der Behaelter samt
 * Adresse, nicht mehr das iframe.
 */
{
  const pdfAnsicht = modul.render("pdfeditor");
  ok(/data-nm-pdf="[^"]*example\.ch\/b\.pdf"/.test(pdfAnsicht),
    "der PDF-Behaelter traegt die Adresse des Dokuments nicht");
  ok(!/<iframe/.test(pdfAnsicht),
    "das PDF steckt wieder in einem iframe — auf iPadOS waere nur die erste Seite sichtbar");
}
// Ein verschlossener Brief gibt seinen Text nicht preis.
ok(!modul.render("journal").includes("Lieber Laurin"),
  "ein Brief mit kuenftigem Zustelldatum zeigt seinen Inhalt trotzdem");

// ═══ 3. JEDE EINGABE LANDET ALS GUELTIGE OPERATION ════════════════════════
function knopf(dataset, treffer) {
  return {
    dataset,
    closest: (selektor) => (treffer && treffer[selektor]) || null
  };
}
function formular(dataset, felder) {
  const daten = new Map(Object.entries(felder));
  return [
    { dataset, reset: () => {}, querySelector: () => null },
    { get: (name) => (daten.has(name) ? daten.get(name) : null) }
  ];
}
function letzteOperation() { return geschrieben[geschrieben.length - 1]; }

const EINGABEN = [
  ["nm-journal-topic", {}, { text: "Neuer Gedanke" }, { kind: "list", collection: "journal.topics" }],
  ["nm-journal-letter", {}, { title: "Brief", content: "Inhalt", deliveryDate: "2030-05-05" },
    { kind: "list", collection: "journal.selfLetters" }],
  ["nm-journal-doc", { id: "jd1" }, { title: "Geaendert", content: "Neuer Text" },
    { kind: "list", collection: "journal.documents" }],
  ["nm-doc", { id: "jd1" }, { title: "Dokument", content: "Text", type: "brief" },
    { kind: "list", collection: "journal.documents" }],
  ["nm-reflect", { id: "" }, { q_a: "Antwort", r_f: "5", learnings: "Punkt eins\nPunkt zwei" },
    { kind: "list", collection: "reflections" }],
  ["nm-browser-save", {}, { url: "beispiel.ch" }, { kind: "list", collection: "readingList" }],
  ["nm-message", {}, { title: "Betreff", content: "Text", deliverAt: "2030-01-01T09:00", priority: "1" },
    { kind: "entity", collection: "scheduledMessages" }],
  ["nm-update", {}, { text: "Neues Update", category: "Bau", priority: "normal" },
    { kind: "entity", collection: "updates" }],
  ["nm-measure", { decision: "d1" }, { title: "Neue Massnahme", dueDate: HEUTE },
    { kind: "entity", collection: "tasks" }],
  ["nm-plan-add", { date: HEUTE }, { title: "Geplante Aufgabe" }, { kind: "entity", collection: "tasks" }],
  ["nm-thesis", { id: "th1" }, { title: "These neu", question: "Frage", status: "In Arbeit", description: "Text" },
    { kind: "entity", collection: "theses" }],
  ["nm-time-manual", {}, { taskId: "t1", date: HEUTE, minutes: "45", note: "Handbuchung" },
    { kind: "entity", collection: "timeEntries" }],
  ["nm-timer-start", {}, { taskId: "t3", note: "los" }, { kind: "timer" }]
];

EINGABEN.forEach(([typ, dataset, felder, erwartet]) => {
  const vorher = geschrieben.length;
  const [form, daten] = formular(dataset, felder);
  const behandelt = modul.onSubmit(typ, form, daten);
  ok(behandelt === true, `das Formular ${typ} wird von niemandem behandelt`);
  ok(geschrieben.length > vorher, `das Formular ${typ} schreibt nichts — die Eingabe ist verloren`);
  const operation = letzteOperation();
  ok(operation.kind === erwartet.kind, `${typ} schreibt als ${operation.kind} statt ${erwartet.kind}`);
  if (erwartet.collection) {
    ok(operation.collection === erwartet.collection,
      `${typ} schreibt nach ${operation.collection} statt ${erwartet.collection}`);
  }
  // Der entscheidende Punkt: die Operation muss die Warteschlange ueberleben
  // (isValidOperation filtert sie sonst offline raus) UND wirken.
  ok(Core.isValidOperation(operation) === true,
    `${typ} erzeugt eine Operation, die offline aus der Warteschlange fliegt`);
  ok(operation.__ergebnis && operation.__ergebnis.applied === true,
    `${typ} wirkt nicht auf den Datenstand: ${operation.__ergebnis && operation.__ergebnis.reason}`);
});

// Die Eingaben stehen danach wirklich im Datenstand.
ok(payload.journal.topics.some((entry) => entry.text === "Neuer Gedanke"), "der Gedanke steht nicht im Journal");
ok(payload.reflections.some((entry) => entry.learnings && entry.learnings.length === 2),
  "die Reflexion hat ihre zwei Zeilen Gelerntes nicht behalten");
ok(payload.readingList.some((entry) => entry.url === "https://beispiel.ch"),
  "eine Adresse ohne Schema wurde nicht ergaenzt — der Link waere stumm verworfen worden");
ok(Object.values(payload.entities.tasks).some((task) => task.decisionId === "d1" && task.title === "Neue Massnahme"),
  "die Massnahme haengt nicht am Entscheid");
ok(Boolean(payload.timers.t3), "die Zeitmessung wurde nicht gestartet");

// ═══ 4. AKTIONEN ══════════════════════════════════════════════════════════
// Eine laufende Messung stoppen legt eine echte Zeitbuchung an.
const vorherBuchungen = Object.keys(payload.entities.timeEntries).length;
modul.onAction("nm-timer-stop", knopf({ id: "t1" }));
ok(Object.keys(payload.entities.timeEntries).length === vorherBuchungen + 1,
  "das Stoppen der Messung legt keine Zeitbuchung an");

// Eine Aufgabe auf einen anderen Tag schieben.
const morgen = new Date(Date.parse(HEUTE + "T12:00:00") + 86400000).toISOString().slice(0, 10);
modul.onAction("nm-plan-move", knopf({ id: "t1", date: morgen }));
ok(payload.entities.tasks.t1.dueDate === morgen, "die Aufgabe liegt nicht auf dem neuen Tag");

// Ein Update abhaken.
modul.onAction("nm-update-toggle", knopf({ id: "u1" }));
ok(payload.entities.updates.u1.checked === true, "das Update laesst sich nicht abhaken");

// Eine Nachricht als gelesen markieren.
modul.onAction("nm-message-read", knopf({ id: "m1" }));
ok(payload.entities.scheduledMessages.m1.isRead === true, "die Nachricht laesst sich nicht als gelesen markieren");

// Aus einem Text eine Karteikarte machen.
const vorherKarten = payload.recallLabData.cards.length;
modul.onAction("nm-to-card", knopf({ front: "Vorderseite", back: "Rueckseite" }));
ok(payload.recallLabData.cards.length === vorherKarten + 1, "aus dem Text entsteht keine Karteikarte");

// Einen Listeneintrag loeschen.
modul.onAction("nm-list-delete", knopf({ area: "journal.topics", id: "jt1" }));
ok(!payload.journal.topics.some((entry) => entry.id === "jt1"), "der Gedanke laesst sich nicht loeschen");

// Und: keine Aktion darf am Datenstand vorbei schreiben.
geschrieben.filter((entry) => entry.kind).forEach((operation) => {
  ok(Core.isValidOperation(operation), `eine Operation (${operation.kind}/${operation.collection}) ist ungueltig`);
});

// ═══ 5. DER ZUSTAND WIRKT NICHT IN EINER ANDEREN ANSICHT WEITER ═══════════
// BEFUND-KLASSE (siehe CLAUDE.md, Fallstrick 4): modul-lokale Variablen wie
// currentRLRoute wurden beim Betreten gesetzt und beim Verlassen nie
// zurueckgesetzt — und wirkten dann in ganz anderen Ansichten weiter.
modul.onAction("nm-open", knopf({ route: "thesis", id: "th1" }));
modul.render("thesis");
modul.render("drive");
const nachWechsel = modul.render("drive");
ok(!nachWechsel.includes("Meine These"), "die geoeffnete These wirkt in der Drive-Ansicht weiter");

if (luecken.length) {
  luecken.forEach((text) => console.error("  ✗ " + text));
  assert.fail(`${luecken.length} von ${checks} Pruefungen fehlgeschlagen`);
}
console.log(`native apps: ok (${checks} Pruefungen)`);
