/*
 * CHATGPT-MODUL AUF DEM TABLET — lesen, nicht bearbeiten; Aufgaben nur mit Anker.
 *
 * Der Auftrag (Portierung aus ai-sync) verlangt fuer das Tablet genau drei
 * Dinge und nicht mehr:
 *   · Notes als Leseansicht mit dem Filter "seit letzter Sitzung" — kein
 *     Erfassen, kein Abloesen.
 *   · Leads als Leseansicht: Eingang, Detail mit den Schritten in fester
 *     Reihenfolge, Bewertungsraster, Zuweisung und erteilte Berechtigungen
 *     ohne Klick sichtbar. Kein Bearbeiten, kein Abschliessen.
 *   · ChatGPT-Aufgaben: Marker am Element und Anlegen mit Anker — keine
 *     Sammelansicht.
 *
 * Was hier schiefgehen kann: eine Ansicht, die still den ALTEN Stand zeigt
 * (Filter kaputt), ein Bearbeitungsknopf, der auf dem Tablet nicht sein darf,
 * eine Aufgabe ohne Anker (fuer den Rechner unbrauchbar), und Verdrahtung,
 * die fehlt (Skript nicht geladen, Route nicht nativ, Marker nicht am
 * Formular). Der Test fuehrt die ECHTE Datei gegen dieselbe Bruecke aus, die
 * app.js den Modulen reicht. Kein Browser, kein Netz.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const Core = require(path.join(root, "public", "sync-core.js"));
const source = fs.readFileSync(path.join(root, "public", "chatgpt-app.js"), "utf8");
const appJs = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "public", "sw.js"), "utf8");

let checks = 0;
const luecken = [];
const ok = (bedingung, text) => { checks += 1; if (!bedingung) luecken.push(text); };

const JETZT = new Date().toISOString();
const GELESEN = "2026-08-28T18:00:00.000Z";
function datenstand() {
  return Core.normalisePayload({
    entities: {
      organizations: { o1: { id: "o1", name: "Firma X AG", updatedAt: JETZT } },
      chatgptNotes: {
        alt: { id: "alt", createdAt: "2026-08-20T10:00:00.000Z", updatedAt: "2026-08-20T10:00:00.000Z", instructionDate: "2026-08-20",
               category: "auftrag", instruction: "Alte Anweisung", derived: "Alt abgeleitet", state: "ueberholt", supersededBy: "neu" },
        neu: { id: "neu", createdAt: "2026-09-01T09:00:00.000Z", updatedAt: "2026-09-01T09:00:00.000Z", instructionDate: "2026-09-01",
               category: "feedback", instruction: "Neue Anweisung seit der Sitzung", derived: "Neu abgeleitet", state: "aktiv", supersedes: "alt", tags: ["mail"] }
      },
      chatgptLeads: {
        l1: { id: "l1", createdAt: "2026-09-01T08:00:00.000Z", updatedAt: JETZT, title: "Firma X als Kunde erfassen", rawInput: "Bitte Firma X anlegen.",
              status: "in_arbeit", readAt: null, interpretation: "Neue Organisation", research: "Nicht vorhanden", plan: "Anlegen", execution: "", result: "",
              assessment: { menge: "cowork", werkzeug: "cowork", kontext: "chatgpt", quantusNaehe: "chatgpt", recherche: "cowork", zuschnitt: "cowork" },
              assignee: "cowork", assignmentReason: "Viel Text, klar abgegrenzt.", handoverPacket: "Paket: Firma X anlegen.",
              grantedPermissions: { websuche: true, dateienErstellen: { erlaubt: true, formate: ["pdf"] }, externeTools: [], verboten: ["Mails senden"] },
              handoverAt: JETZT, linkedOrganizations: ["o1"] }
      },
      chatgptTasks: {
        t1: { id: "t1", createdAt: JETZT, updatedAt: JETZT, text: "Adresse nachtragen", state: "offen", anchorKind: "organization", anchorId: "o1", anchorLabel: "Firma X AG", createdBy: "laurin" }
      }
    },
    chatgptNotesMeta: { lastSessionReadAt: GELESEN }
  });
}

function esc(value) {
  return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
const geschrieben = [];
let payload = datenstand();
let renders = 0;
const bridge = {
  state: { payload },
  Core, esc, attr: esc,
  collection(name) {
    const map = (payload.entities && payload.entities[name]) || {};
    return Object.values(map).filter((item) => item && item.status !== "deleted" && !item.deletedAt);
  },
  itemTitle: (item, fallback) => (item && (item.title || item.name || item.subject)) || fallback || "Ohne Titel",
  formatDate: (value) => (value ? String(value).slice(0, 10) : ""),
  formatTime: (value) => (value ? String(value).slice(11, 16) : ""),
  viewHeader: (title, subtitle, actions) => `<div class="view-head"><h1>${esc(title)}</h1><p>${esc(subtitle)}</p>${actions || ""}</div>`,
  emptyState: (icon, title, hint) => `<div class="empty-state">${esc(title)} ${esc(hint)}</div>`,
  toast: () => {},
  render: () => { renders += 1; },
  makeOperation: (kind, action, collectionName, id, patch) => ({
    operationId: Core.makeId("op"), kind, action: action || "update", collection: collectionName || undefined,
    id: id || Core.makeId(kind), patch: patch || {}, updatedAt: new Date().toISOString()
  }),
  executeOperation(operation) {
    geschrieben.push(operation);
    const result = Core.applyOperation(payload, operation);
    if (result.applied) { payload = result.payload; bridge.state.payload = payload; }
    return Promise.resolve(true);
  }
};
const fensterlos = { __quantusTablet: bridge, __quantusTabletModules: [] };
const dokument = { addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ set innerHTML(v) {}, firstElementChild: null }) };
new Function("window", "document", source)(fensterlos, dokument);

const modul = fensterlos.__quantusTabletModules.find((entry) => entry.key === "chatgpt");
ok(Boolean(modul), "chatgpt-app.js hat sich nicht als Tablet-Modul angemeldet");
ok(modul && modul.routes.includes("chatgptnotes"), "die Route chatgptnotes ist nicht angemeldet");
const CG = fensterlos.QuantusChatgpt;
ok(CG && typeof CG.taskSection === "function" && typeof CG.marker === "function", "window.QuantusChatgpt fehlt oder ist unvollstaendig");

// ═══ 1. NOTES: SEIT LETZTER SITZUNG, LESEN OHNE BEARBEITEN ════════════════
{
  const html1 = modul.render("chatgptnotes");
  ok(/Neue Anweisung seit der Sitzung/.test(html1), "der neue Eintrag (nach lastSessionReadAt) fehlt in der Standardansicht");
  ok(!/Alte Anweisung/.test(html1), "der alte Eintrag (vor lastSessionReadAt) wird trotz Filter gezeigt");
  ok(/Seit letzter Sitzung 1/.test(html1) && /Alle 2/.test(html1), "die Zaehler der beiden Modi stimmen nicht");
  ok(!/data-action="cgn-|Neuer Eintrag|Ablösen|Korrigieren|<textarea/.test(html1), "die Tablet-Notes bieten Erfassen oder Abloesen an — das gehoert an den Rechner");
  modul.onAction("cg-notes-mode", { dataset: { mode: "all" } });
  const html2 = modul.render("chatgptnotes");
  ok(/Alte Anweisung/.test(html2) && /Neue Anweisung/.test(html2), "im Modus Alle fehlen Eintraege");
  ok(/cg-superseded/.test(html2) && /überholt/.test(html2), "der ueberholte Eintrag ist nicht als solcher abgeschwaecht");
  ok(renders >= 1, "der Moduswechsel loest kein Neuzeichnen aus");
  ok(CG.newNotesCount() === 1 && CG.badge() === 1, "der Zaehler neuer Notes stimmt nicht");
}

// ═══ 2. LEADS: EINGANG UND DETAIL, ALLES SICHTBAR, NICHTS BEARBEITBAR ═════
{
  modul.onAction("cg-tab", { dataset: { tab: "leads" } });
  const inbox = modul.render("chatgptnotes");
  ok(/Ungelesen \(1\)/.test(inbox), "der ungelesene Lead steht nicht in der Gruppe Ungelesen");
  ok(/Firma X als Kunde erfassen/.test(inbox), "der Lead-Titel fehlt");
  ok(/Menge: <strong>Cowork<\/strong>/.test(inbox) && /Kontext: <strong>ChatGPT<\/strong>/.test(inbox), "das Bewertungsraster fehlt auf der Karte");
  ok(/2 : 4 → <strong>Claude Cowork<\/strong>/.test(inbox), "Ergebnis und Zuweisung stehen nicht auf der Karte");
  ok(/Viel Text, klar abgegrenzt\./.test(inbox), "die Begruendung der Zuweisung fehlt auf der Karte");
  ok(/Websuche ✓ · Dateien ✓ \(pdf\) · Tools: keine · Verboten: Mails senden/.test(inbox), "die erteilten Berechtigungen stehen nicht ohne Klick auf der Karte");
  ok(/<details class="cg-packet">[\s\S]*Paket: Firma X anlegen\./.test(inbox), "das Uebergabepaket ist nicht (eingeklappt) lesbar");
  ok(!/<textarea|data-action="cgl-close"|abschliessen|<select/i.test(inbox), "der Tablet-Eingang bietet Bearbeiten oder Abschliessen an");
  ok(CG.unreadLeadsCount() === 1, "der Zaehler ungelesener Leads stimmt nicht");

  modul.onAction("cg-lead-open", { dataset: { id: "l1" } });
  const detail = modul.render("chatgptnotes");
  ok(/Bitte Firma X anlegen\./.test(detail), "der Wortlaut fehlt im Detail");
  const reihenfolge = ["Interpretation", "Offene Fragen", "Recherche", "Plan", "Bewertung &amp; Zuweisung", "Ausführung", "Ergebnis", "Workflow-Notiz", "Verknüpfungen"]
    .map((label) => detail.indexOf("<strong>" + label + "</strong>"));
  ok(reihenfolge.every((pos) => pos >= 0), `nicht jeder Schritt steht im Detail: ${reihenfolge.join(",")}`);
  ok(reihenfolge.every((pos, i) => i === 0 || pos > reihenfolge[i - 1]), "die Schritte stehen nicht in der festen Reihenfolge untereinander");
  ok(/organizations: Firma X AG/.test(detail), "die Verknuepfung zur Organisation wird nicht aufgeloest");
  ok(/data-action="cg-lead-back"/.test(detail), "es gibt keinen Weg zurueck in den Eingang");
  ok(!/<textarea|<input|data-form=/.test(detail), "das Lead-Detail auf dem Tablet enthaelt Eingabefelder");
}

// ═══ 3. CHATGPT-AUFGABEN: MARKER AM ELEMENT, ANLEGEN NUR MIT ANKER ════════
{
  const marker = CG.marker("organizations", "o1");
  ok(/🪶 1/.test(marker) && /sand/.test(marker), "der Marker am Element fehlt oder zaehlt falsch");
  ok(CG.marker("organizations", "gibt-es-nicht") === "", "ein Element ohne Aufgaben bekommt einen Marker");
  const section = CG.taskSection("organizations", payload.entities.organizations.o1);
  ok(/Adresse nachtragen/.test(section), "die bestehende Aufgabe fehlt im Abschnitt am Element");
  ok(/data-action="cg-task-input"[^>]*data-collection="organizations"[^>]*data-id="o1"/.test(section), "das einzeilige Feld am Element fehlt");
  ok(/cg-notice/.test(section), "bei offener Aufgabe fehlt der deutliche Hinweis fuer den Assistenten");
  ok(!/data-action="cg-task-done"|Sammelansicht/.test(section), "das Tablet bietet Erledigen oder eine Sammelansicht an — nicht vorgesehen");

  return (async () => {
    const vorher = geschrieben.length;
    await CG.createTask("organizations", "gibt-es-nicht", "Kunden erfassen");
    ok(geschrieben.length === vorher, "eine Aufgabe ohne aufloesbaren Anker wurde geschrieben");
    await CG.createTask(null, null, "Kunden erfassen");
    ok(geschrieben.length === vorher, "eine Aufgabe ohne Anker wurde geschrieben");
    await CG.createTask("organizations", "o1", "   ");
    ok(geschrieben.length === vorher, "eine leere Aufgabe wurde geschrieben");
    await CG.createTask("organizations", "o1", "Kunden erfassen");
    ok(geschrieben.length === vorher + 1, "eine gueltige Aufgabe wurde nicht geschrieben");
    const op = geschrieben[geschrieben.length - 1];
    ok(op && op.kind === "entity" && op.action === "create" && op.collection === "chatgptTasks", `die Aufgabe geht nicht als Entity-Operation nach chatgptTasks: ${JSON.stringify(op && { kind: op.kind, action: op.action, collection: op.collection })}`);
    ok(op && op.patch.anchorKind === "organization" && op.patch.anchorId === "o1" && op.patch.anchorLabel === "Firma X AG" && op.patch.state === "offen",
      `die Aufgabe traegt Anker oder Status nicht korrekt: ${JSON.stringify(op && op.patch)}`);
    ok(Object.values(payload.entities.chatgptTasks).length === 2, "die Aufgabe ist nach der Transaktion nicht im Datenstand");
    ok(CG.openTasksCount() === 2, "der Zaehler offener Aufgaben stimmt nicht");
    ok(/🪶 2/.test(CG.marker("organizations", "o1")), "der Marker zaehlt die neue Aufgabe nicht mit");

    // ═══ 4. VERDRAHTUNG ════════════════════════════════════════════════════
    ok(html.indexOf('<script src="chatgpt-app.js">') > 0 && html.indexOf('<script src="chatgpt-app.js">') < html.indexOf('<script src="app.js">'),
      "index.html laedt chatgpt-app.js nicht vor app.js");
    ok(/"\/chatgpt-app\.js"/.test(sw), "der Service Worker cached chatgpt-app.js nicht");
    ok(/"chatgptnotes",\s*\n\s*\.\.\.Object\.keys\(COLLECTION_CONFIG\)/.test(appJs) || /"chatgptnotes"/.test(appJs.slice(appJs.indexOf("const NATIVE_ROUTES"), appJs.indexOf("const state = {"))),
      "app.js fuehrt chatgptnotes nicht als native Route");
    ok(/key: "chatgptnotes", label: "ChatGPT"/.test(appJs), "der App-Katalog kennt das ChatGPT-Modul nicht");
    ok(/window\.QuantusChatgpt\.marker\(name, item\.id\)/.test(appJs), "die Sammlungskarten zeigen den Marker nicht");
    ok(/window\.QuantusChatgpt\.taskSection\(name, existing\)/.test(appJs), "das Formular einer Sammlung enthaelt das Feld fuer ChatGPT-Aufgaben nicht");
    ok(/key === "chatgptnotes"\) return window\.QuantusChatgpt/.test(appJs), "die Kachel hat keinen Zaehler");
    ok(!/ß/.test(source), "chatgpt-app.js enthaelt ein ß (Schweizer Schreibweise)");

    if (luecken.length) {
      console.error(`CHATGPT-MODUL (Tablet) — ${luecken.length} von ${checks} Pruefungen:\n   - ${luecken.join("\n   - ")}`);
      process.exit(1);
    }
    console.log(`chatgpt modul (Tablet): ok (${checks} Pruefungen)`);
  })();
}
