/*
 * LERNEN UND BOARDS — was der Nutzer am Tablet nicht benutzen konnte.
 *
 * Fuenf Befunde aus der Bedienung, alle derselben Art: die Ansicht ZEIGTE
 * etwas, aber man kam nicht daran.
 *
 * 1. "in smarter kann ich nichts lesen nur fragen" — renderSmarter las
 *    doc.summary und doc.text. BEIDE FELDER GIBT ES NICHT. Der Lernstoff
 *    steht in doc.documentHtml bzw. doc.theoryHtml. Dazu heissen die
 *    Fragefelder in den Dokumenten q und a; gelesen wurden nur die langen
 *    Namen, also stand als Frage das Wort "Frage" und als Antwort nichts.
 *
 * 2. "im leseplan sehe ich zwar den inhalt aber kann ihn nicht oeffnen" —
 *    renderLeseplan zeigte Titel, Fortschritt und Zieldatum. Der Text liegt
 *    in docs[id].sektionen[sId].html und wurde nie gerendert.
 *
 * 3. "im journal wird nichts richtig angezeigt, absaetze werden nicht als
 *    absaetze sondern <div> angezeigt" — der Inhalt ist HTML aus dem
 *    contenteditable des Journal Booklet und wurde mit esc() in ein
 *    textarea gelegt: sichtbar wurde die Auszeichnung statt des Textes.
 *
 * 4. "warum wird mir in der BM Vorbereitung nicht alles angezeigt wie in
 *    Quantus selber" — bm.html hat zehn Bereiche, das Tablet hatte drei
 *    Lesekacheln.
 *
 * 5. "tablet canvas auch richtig dummes konzept, ich moechte im vollbild ein
 *    sticky board oeffnen ... dort sehe ich alle boards und kann sie
 *    oeffnen" — Boards waren ein Reiter im Canvas; es gab keine Uebersicht.
 *
 * Geprueft wird gegen die echten Dateien: die Module werden ausgefuehrt und
 * mit den Datenformen gefuettert, die AI Sync wirklich fuehrt.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const Core = require(path.join(root, "public", "sync-core.js"));
const lies = (datei) => fs.readFileSync(path.join(root, "public", datei), "utf8");

let checks = 0;
const luecken = [];
const ok = (bedingung, text) => { checks += 1; if (!bedingung) luecken.push(text); };

const HEUTE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ── Die Bruecke, die app.js den Modulen reicht ────────────────────────────
function baueBridge(payload) {
  const geschrieben = [];
  const bridge = {
    state: {
      payload,
      user: { email: "test@example.ch" },
      driveDocs: {},
      smarterDocs: {
        [HEUTE]: {
          theoryHtml: "<h2>Kapitalfluss</h2><p>Der zu lernende Text.</p>",
          questions: [{ id: "q1", q: "Was ist ein Inventar?", a: "Eine Aufstellung." }],
          answers: { q1: { text: "Schon beantwortet" } }
        },
        "2026-01-02": {
          documentHtml: "<html><body><h1>Fertiges Dokument</h1></body></html>",
          questions: []
        }
      }
    },
    Core,
    esc,
    attr: esc,
    collection: (name) => Object.values((payload.entities && payload.entities[name]) || {})
      .filter((item) => item && item.status !== "deleted"),
    isDone: () => false,
    itemTitle: (item, fallback) => (item && (item.title || item.name)) || fallback || "Ohne Titel",
    itemText: (item) => (item && (item.description || item.content)) || "",
    localDateKey: (date) => new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(date || new Date()),
    formatDate: (value) => String(value || "").slice(0, 10),
    formatTime: (value) => String(value || "").slice(11, 16),
    viewHeader: (t, s, a) => `<div class="view-head"><h1>${esc(t)}</h1><p>${esc(s)}</p>${a || ""}</div>`,
    emptyState: (i, t, h) => `<div class="empty-state">${esc(t)} ${esc(h)}</div>`,
    emptyMini: (t) => `<div class="empty-mini">${esc(t)}</div>`,
    loginBanner: () => "",
    toast: () => {},
    render: () => {},
    go: () => {},
    appBaseUrl: () => "https://example.test",
    openExternalUrl: () => {},
    getDatabase: () => null,
    makeOperation: (kind, action, collection, id, patch) => ({
      operationId: Core.makeId("op"), kind, action: action || "update",
      collection: collection || undefined, id: id || Core.makeId(kind),
      patch: patch || {}, updatedAt: new Date().toISOString()
    }),
    executeOperation(operation) {
      geschrieben.push(operation);
      const ergebnis = Core.applyOperation(payload, operation);
      if (ergebnis.applied) { payload = ergebnis.payload; bridge.state.payload = payload; }
      return Promise.resolve(true);
    }
  };
  return { bridge, geschrieben, holePayload: () => payload };
}

function baueFenster(bridge) {
  const fenster = { __quantusTablet: bridge, __quantusTabletModules: [], addEventListener() {}, removeEventListener() {} };
  const dokument = {
    addEventListener() {}, removeEventListener() {},
    querySelectorAll: () => [], querySelector: () => null,
    getElementById: () => null,
    body: { contains: () => false, appendChild() {} }
  };
  return { fenster, dokument };
}

function lade(datei, fenster, dokument, extra) {
  const namen = ["window", "document", "setInterval", "clearInterval", "setTimeout", "clearTimeout", "requestAnimationFrame", "fetch"];
  const werte = [fenster, dokument, () => 0, () => {}, () => 0, () => {}, () => {}, () => Promise.reject(new Error("kein Netz"))];
  Object.keys(extra || {}).forEach((key) => { namen.push(key); werte.push(extra[key]); });
  namen.push(lies(datei));
  // eslint-disable-next-line no-new-func
  new Function(...namen)(...werte);
}

// ══════════════════════════════════════════════════════════════════════════
//  1 + 3. SMARTER UND JOURNAL — native-modules.js
// ══════════════════════════════════════════════════════════════════════════
{
  const payload = Core.normalisePayload({
    journal: {
      documents: [{
        id: "jd1", title: "Ein Tag im August",
        // Genau die Form, die das Journal Booklet schreibt: HTML aus einem
        // contenteditable, jede Zeile ein <div>.
        content: "<div>Erster Absatz.</div><div>Zweiter Absatz.</div>",
        updatedAt: new Date().toISOString()
      }],
      selfLetters: [], topics: []
    }
  });
  const { bridge, geschrieben, holePayload } = baueBridge(payload);
  const { fenster, dokument } = baueFenster(bridge);
  lade("native-modules.js", fenster, dokument);
  const modul = fenster.__quantusTabletModules.find((m) => m.key === "native-modules");
  ok(Boolean(modul), "native-modules.js hat sich nicht angemeldet");

  // ── Smarter ─────────────────────────────────────────────────────────────
  const smarter = modul.render("smarter");
  ok(smarter.includes("Der zu lernende Text."),
    "DER BEFUND: Smarter zeigt den Lernstoff nicht — theoryHtml wird nicht gerendert");
  ok(smarter.includes("Kapitalfluss"), "die Ueberschrift des Lernstoffs fehlt");
  ok(smarter.includes("Was ist ein Inventar?"),
    "DER BEFUND: das Fragefeld q wird nicht gelesen — es stuende nur das Wort \"Frage\"");
  ok(smarter.includes("Eine Aufstellung."), "die Musterantwort aus dem Feld a fehlt");
  ok(/<textarea[^>]*class="nm-antwort"/.test(smarter) || /class="nm-antwort"/.test(smarter),
    "es gibt kein Feld fuer die eigene Antwort");
  ok(smarter.includes("Schon beantwortet"), "eine bereits gespeicherte Antwort wird nicht wieder angezeigt");
  // Ohne Kommentare pruefen — der Befund selbst steht dort beschrieben.
  const ohneKommentare = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(!/open\.summary|open\.text\b/.test(ohneKommentare(lies("native-modules.js"))),
    "renderSmarter liest wieder die Felder summary/text, die es gar nicht gibt");
  // Das fertige Dokument gehoert in einen abgeschotteten Rahmen — sonst
  // schlagen seine Stile auf die ganze App durch.
  const smarterQuelle = lies("native-modules.js");
  ok(/srcdoc=/.test(smarterQuelle) && /sandbox="allow-same-origin"/.test(smarterQuelle),
    "das fertige Lerndokument wird nicht abgeschottet eingebettet");

  // ── Journal ─────────────────────────────────────────────────────────────
  // Der Editor erscheint erst mit einem geoeffneten Eintrag — die Liste
  // allein sagt nichts ueber die Darstellung des Inhalts.
  modul.onAction("nm-open", { dataset: { route: "journal", id: "jd1" }, closest: () => null });
  const journal = modul.render("journal");
  ok(journal.includes("Erster Absatz."), "der Journal-Text erscheint gar nicht");
  ok(!journal.includes("&lt;div&gt;"),
    "DER BEFUND: die Auszeichnung wird als Text gezeigt — <div> statt Absatz");
  ok(/contenteditable="true"[^>]*data-nm-richtext="content"/.test(journal) ||
     /data-nm-richtext="content"[^>]*contenteditable="true"/.test(journal),
    "der Journal-Editor ist kein contenteditable — HTML liesse sich so nicht erhalten");
  ok(!/<textarea name="content"/.test(journal), "der Inhalt steckt wieder in einem textarea");

  // Beim Sichern wird das HTML aus der Flaeche gelesen, nicht aus FormData —
  // ein contenteditable steht dort gar nicht drin.
  const flaeche = { innerHTML: "<div>Neu geschrieben.</div>" };
  const form = { dataset: { id: "jd1" }, querySelector: (sel) => (sel.includes("nm-richtext") ? flaeche : null), reset() {} };
  const daten = new Map([["title", "Ein Tag im August"]]);
  modul.onSubmit("nm-journal-doc", form, { get: (k) => (daten.has(k) ? daten.get(k) : null) });
  const gesichert = holePayload().journal.documents.find((d) => d.id === "jd1");
  ok(gesichert && gesichert.content === "<div>Neu geschrieben.</div>",
    "der Journal-Inhalt wird beim Sichern nicht aus der Schreibflaeche gelesen — der Eintrag waere leer");
  ok(geschrieben.some((o) => o.kind === "list" && o.collection === "journal.documents"),
    "das Sichern laeuft nicht ueber die Listen-Operation");
}

// ══════════════════════════════════════════════════════════════════════════
//  5. STICKY BOARDS — sticky-app.js
// ══════════════════════════════════════════════════════════════════════════
{
  const payload = Core.normalisePayload({
    entities: {
      tasks: {
        t1: {
          id: "t1", title: "Kampagne planen", status: "open", updatedAt: new Date().toISOString(),
          stickyBoard: {
            notes: [
              { id: "n1", x: 60, y: 60, w: 180, h: 180, text: "Zielgruppe", color: "yellow", z: 1 },
              { id: "n2", x: 300, y: 60, w: 180, h: 180, text: "Budget", color: "blue", z: 2 }
            ],
            connections: [{ from: "n1", to: "n2" }],
            drawings: [{ id: "d1", pfad: "M0 0" }],
            view: { x: 0, y: 0, zoom: 1 }
          }
        }
      },
      projects: { p1: { id: "p1", title: "Ohne Board", status: "open", updatedAt: new Date().toISOString() } }
    }
  });
  const { bridge, geschrieben, holePayload } = baueBridge(payload);
  const { fenster, dokument } = baueFenster(bridge);
  lade("sticky-app.js", fenster, dokument);
  const modul = fenster.__quantusTabletModules.find((m) => m.key === "sticky");
  ok(Boolean(modul), "sticky-app.js hat sich nicht angemeldet");

  const uebersicht = modul.render("sticky");
  ok(uebersicht.includes("Kampagne planen"),
    "DER BEFUND: die Uebersicht zeigt das Board nicht — man kaeme nur ueber die Aufgabe daran");
  ok(/<svg class="sk-vorschau"/.test(uebersicht), "es fehlt die Vorschau aus den echten Notiz-Positionen");
  ok(uebersicht.includes("2 Notizen"), "die Anzahl der Notizen fehlt");
  ok(/data-form="sk-neu"/.test(uebersicht), "ein neues Board laesst sich nicht anlegen");
  ok(uebersicht.includes("Ohne Board"), "Elemente ohne Board werden nicht zur Auswahl gestellt");

  const knopf = (dataset) => ({ dataset, closest: () => null });
  modul.onAction("sk-open", knopf({ collection: "tasks", id: "t1" }));
  const board = modul.render("sticky");
  ok(board.includes("Zielgruppe") && board.includes("Budget"), "im Board fehlen die Notizen");
  ok(/data-sk-griff=/.test(board),
    "DER BEFUND: es fehlt der Griff — das Textfeld bedeckt die Notiz, ein Zug markiert nur Text");
  ok(/<line /.test(board), "die Verbindungen werden nicht gezeichnet");
  ok(/class="sk-farbe/.test(board), "es fehlt die Farbpalette");
  ok(/data-action="sk-add"/.test(board), "es laesst sich keine Notiz anlegen");

  // Eine Notiz anlegen — und dabei duerfen Verbindungen und Zeichnungen NICHT
  // verloren gehen. Die Entitaets-Operation ersetzt das Feld; ein Teilstueck
  // haette genau das geloescht, was auf dem Tablet gar nicht bearbeitet wird.
  modul.onAction("sk-add", knopf({}));
  const nachher = holePayload().entities.tasks.t1.stickyBoard;
  ok(nachher.notes.length === 3, "die neue Notiz wurde nicht gespeichert");
  ok(nachher.connections.length === 1, "beim Speichern gingen die Verbindungen verloren");
  ok(nachher.drawings.length === 1, "beim Speichern gingen die Zeichnungen verloren");
  const letzte = geschrieben[geschrieben.length - 1];
  ok(letzte.kind === "entity" && letzte.collection === "tasks",
    "das Board wird nicht ueber die gewoehnliche Entitaets-Operation gesichert");
  ok(Core.isValidOperation(letzte), "die Board-Operation ueberlebt die Offline-Warteschlange nicht");

  // Eine Notiz loeschen raeumt ihre Verbindungen mit weg — sonst zeigt eine
  // Linie ins Nichts.
  modul.onAction("sk-note-weg", knopf({ id: "n2" }));
  const danach = holePayload().entities.tasks.t1.stickyBoard;
  ok(!danach.notes.some((n) => n.id === "n2"), "die Notiz wurde nicht geloescht");
  ok(danach.connections.length === 0, "die Verbindung zur geloeschten Notiz blieb stehen");
}

// ══════════════════════════════════════════════════════════════════════════
//  2. LESEPLAN — quantus-tablet-expansion.js
// ══════════════════════════════════════════════════════════════════════════
{
  const quelle = lies("quantus-tablet-expansion.js");
  ok(/function leseplanEinheitHtml/.test(quelle),
    "DER BEFUND: der Text einer Leseeinheit wird nirgends zusammengesetzt");
  ok(/sektionen\[sid\]|asObject\(doc\.sektionen\)/.test(quelle),
    "der Leseplan liest die Abschnitte nicht aus sektionen");
  ok(/unit\.sektionIds|unit && unit\.sektionIds/.test(quelle),
    "die Abschnitte werden nicht in der Reihenfolge des Plans zusammengesetzt");
  ok(/qt-lp-text/.test(quelle), "es gibt keine Flaeche, in der der Text steht");
  ok(/data-qt-action="lp-done"/.test(quelle), "eine Einheit laesst sich nicht abhaken");
  ok(/einheitenErledigt/.test(quelle), "das Abhaken schreibt nicht dieselben Felder wie die Hauptapp");
  ok(/leseplan\/aufbereitung/.test(quelle), "die KI-Aufbereitung wird nicht gelesen");
  // Der eigene Namensraum: data-qu-action gehoert dem universellen UI-Skript,
  // das hier gar nicht geladen sein muss.
  ok(/data-qt-action/.test(quelle), "die Bedienung haengt an einem fremden Namensraum");
  ok(/addEventListener\("click"/.test(quelle), "der Lern-Hub hat keinen eigenen Klick-Handler");
  // Die hergeleitete Wahl muss zurueckgeschrieben werden, sonst kennt das
  // Abhaken das Dokument nicht, solange man keines angetippt hat.
  ok(/state\.leseplanDoc = docId/.test(quelle),
    "die hergeleitete Dokumentwahl wird nicht zurueckgeschrieben — der erste Haken ginge ins Leere");
}

// ══════════════════════════════════════════════════════════════════════════
//  4. BM VORBEREITUNG — bm-app.js
// ══════════════════════════════════════════════════════════════════════════
{
  const quelle = lies("bm-app.js");
  // Die Bereiche stehen bewusst hier und werden nicht aus dem Code abgeleitet
  // — sonst wuerde der Test jede Streichung stillschweigend mitmachen.
  for (const [fn, was] of [
    ["renderUebersicht", "Übersicht"], ["renderLektion", "Tageslektion"],
    ["renderThemen", "Themen"], ["renderThema", "ein einzelnes Thema"],
    ["renderWiederholen", "Wiederholen"], ["renderQuiz", "das Quiz"],
    ["renderMerksaetze", "Merksätze"], ["renderFortschritt", "Fortschritt"]
  ]) {
    ok(new RegExp(`function ${fn}\\b`).test(quelle), `BM fehlt ${was} (${fn})`);
  }
  // Derselbe Lernstand wie bm.html — sonst rechnen Tablet und Desktop anders.
  ok(/LEITNER = \[1, 2, 4, 7, 14, 30\]/.test(quelle), "das Leitner-Verfahren weicht von bm.html ab");
  ok(/MASTER = 0\.6/.test(quelle), "die Beherrschungs-Schwelle weicht von bm.html ab");
  ok(/replace\(\/\[\.#\$\\\[\\\]\\\/\]\/g, "_"\)/.test(quelle) || /function fbKey/.test(quelle),
    "die Schluessel werden nicht wie in bm.html normiert — geschrieben wuerde an anderer Stelle");
  ok(/bmpruefung\/aufg\//.test(quelle), "der Lernstand wird nicht dorthin geschrieben, wo bm.html ihn liest");
  ok(/theorie\/kompendium\.json/.test(quelle), "das Kompendium wird nicht geladen — es gaebe keine Themen");
  // Erst laden, wenn die App offen ist: 1,8 MB beim Start waeren auf dem
  // Tablet eine spuerbare Bremse.
  ok(/if \(kompendium\.daten \|\| kompendium\.laedt\) return/.test(quelle),
    "das Kompendium wird bei jedem Zeichnen neu geladen");
  ok(/kompendium\.fehler/.test(quelle), "ein fehlgeschlagener Kompendium-Abruf bleibt stumm");
  // Markdown erst escapen, dann Muster ersetzen.
  const mdBlock = quelle.slice(quelle.indexOf("function md(text)"), quelle.indexOf("function md(text)") + 400);
  ok(mdBlock.indexOf("esc(text") < mdBlock.indexOf("replace(/\\*\\*"),
    "das Markdown ersetzt Muster VOR dem Escapen — das waere ein Einfallstor");

  // Die Route gehoert der App, nicht mehr dem Lern-Hub.
  const app = lies("app.js");
  ok(app.indexOf("const mod = moduleFor(route)") < app.indexOf("QuantusTabletLearningHub?.renderRoute"),
    "der Lern-Hub faengt die Route ab, bevor die BM-App gefragt wird");
}

// ══════════════════════════════════════════════════════════════════════════
//  QUERSCHNITT: globale Tasten und Schreibflaechen
// ══════════════════════════════════════════════════════════════════════════
/*
 * BEFUND-KLASSE (CLAUDE.md, Fallstrick 3): ein globaler Tastatur-Handler, der
 * nur INPUT/TEXTAREA/SELECT kennt, uebersieht contenteditable — das ist ein
 * DIV. Mit dem Journal-Editor und den Notizen auf dem Board gibt es jetzt
 * zwei solche Flaechen; ohne die Pruefung wechselte Alt+N mitten im
 * Schreiben die Ansicht.
 */
{
  const app = lies("app.js");
  const stelle = app.indexOf("const typing =");
  ok(stelle > 0, "die Tipp-Erkennung wurde nicht gefunden");
  const block = app.slice(stelle, stelle + 400);
  ok(/isContentEditable/.test(block),
    "DER BEFUND: die globalen Kuerzel greifen wieder in Schreibflaechen mit contenteditable");
}

if (luecken.length) {
  luecken.forEach((text) => console.error("  ✗ " + text));
  assert.fail(`${luecken.length} von ${checks} Pruefungen fehlgeschlagen`);
}
console.log(`lernen und boards: ok (${checks} Pruefungen)`);
