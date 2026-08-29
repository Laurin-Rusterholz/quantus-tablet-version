/*
 * DER HOMEBILDSCHIRM LAESST SICH ANORDNEN.
 *
 * BEFUND (Nutzer: "ich kann den homescreen anordnen"): die Seiten des
 * Homebildschirms standen fest in PAGES. Umraeumen liess sich einzig das
 * Dock, und auch das nur durch Antippen — ein Symbol auf eine andere Seite
 * oder an eine andere Stelle zu legen war gar nicht vorgesehen.
 *
 * ZWEITER BEFUND, aus der Vorgeschichte dieser Datei: das Umraeumen lief
 * frueher ueber einen LANGEN DRUCK. Gemessen (Chromium, echte
 * Zeigerereignisse) oeffnete ein Tipp ab 760 ms die App nicht mehr —
 *     80 ms ✓   300 ms ✓   600 ms ✓   760 ms ✗   900 ms ✗   1100 ms ✗
 * — eine versteckte Geste verschluckte also die Hauptfunktion des
 * Bildschirms. Das Anordnen braucht jetzt Zeiger-Ereignisse fuers Ziehen,
 * und genau deshalb prueft dieser Test, dass sie AUSSCHLIESSLICH im
 * sichtbaren Anordnen-Modus am Dokument haengen.
 *
 * Geprueft wird gegen die echte Datei: springboard.js wird ausgefuehrt, und
 * die Anordnung wird wie von Hand umgeraeumt. Kein Browser, kein Netz.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const Core = require(path.join(root, "public", "sync-core.js"));
const source = fs.readFileSync(path.join(root, "public", "springboard.js"), "utf8");

let checks = 0;
const luecken = [];
const ok = (bedingung, text) => { checks += 1; if (!bedingung) luecken.push(text); };

// ── Ein Speicher, ein Dokument, ein Fenster ───────────────────────────────
const speicher = new Map();
const localStorage = {
  getItem: (key) => (speicher.has(key) ? speicher.get(key) : null),
  setItem: (key, value) => speicher.set(key, String(value)),
  removeItem: (key) => speicher.delete(key)
};

// Jeder Zeiger-Handler, den springboard.js am Dokument anmeldet, wird hier
// mitgezaehlt — das ist der Kern der zweiten Pruefung.
const handler = new Map();
const dokument = {
  addEventListener: (typ, fn) => {
    if (!handler.has(typ)) handler.set(typ, new Set());
    handler.get(typ).add(fn);
  },
  removeEventListener: (typ, fn) => {
    if (handler.has(typ)) handler.get(typ).delete(fn);
  },
  querySelectorAll: () => [],
  querySelector: () => null,
  body: { appendChild: () => {}, contains: () => false }
};
function zeigerHandler() {
  return ["pointerdown", "pointermove", "pointerup", "pointercancel"]
    .reduce((summe, typ) => summe + (handler.get(typ) ? handler.get(typ).size : 0), 0);
}

const JETZT = new Date().toISOString();
let payload = Core.normalisePayload({
  entities: { tasks: { t1: { id: "t1", title: "Aufgabe", status: "open", updatedAt: JETZT } } }
});
let neuGezeichnet = 0;
const meldungen = [];

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

const bridge = {
  state: { payload, user: { email: "test@example.ch" } },
  Core,
  esc,
  attr: esc,
  collection: (name) => Object.values((payload.entities && payload.entities[name]) || {}),
  isDone: () => false,
  itemTitle: (item, fallback) => (item && item.title) || fallback || "",
  itemText: () => "",
  localDateKey: () => new Date().toISOString().slice(0, 10),
  formatDate: (value) => String(value || "").slice(0, 10),
  formatTime: (value) => String(value || "").slice(11, 16),
  todayTasks: () => [],
  dueCards: () => [],
  activeHabits: () => [],
  isHabitDoneOn: () => false,
  briefingModell: () => ({ meetings: [], faellig: [], routinen: [], tagesziele: [], ueberfaellig: [], beliefs: [] }),
  render: () => { neuGezeichnet += 1; },
  toast: (titel) => meldungen.push(titel)
};

// Die Adresszeile — der Anordnen-Modus haengt sich selbst daran.
const location = { hash: "#/home" };
const fensterHandler = new Map();
const fenster = {
  __quantusTablet: bridge,
  __quantusTabletModules: [],
  addEventListener: (typ, fn) => {
    if (!fensterHandler.has(typ)) fensterHandler.set(typ, new Set());
    fensterHandler.get(typ).add(fn);
  },
  removeEventListener: (typ, fn) => { if (fensterHandler.has(typ)) fensterHandler.get(typ).delete(fn); }
};
function geheZu(route) {
  location.hash = "#/" + route;
  (fensterHandler.get("hashchange") || new Set()).forEach((fn) => fn());
}
new Function("window", "document", "location", "localStorage", "setTimeout", "clearTimeout", "requestAnimationFrame", source)(
  fenster, dokument, location, localStorage, () => 0, () => {}, () => {}
);

const modul = fenster.__quantusTabletModules.find((entry) => entry.key === "springboard");
ok(Boolean(modul), "springboard.js hat sich nicht als Tablet-Modul angemeldet");
const sb = fenster.QuantusTabletSpringboard;
ok(Boolean(sb), "der Homebildschirm meldet keine Schnittstelle fuers Anordnen an");

// ═══ 1. AUSSERHALB DES MODUS HAENGT KEIN ZEIGER-HANDLER ═══════════════════
ok(zeigerHandler() === 0,
  `beim Laden haengen bereits ${zeigerHandler()} Zeiger-Handler am Dokument — genau das verschluckte einmal den Tipp`);

// Und ein Tipp auf ein Symbol wird ausserhalb des Modus NICHT abgefangen.
// closest() schliesst im echten DOM das Element SELBST ein — ein Stub, der
// immer null liefert, wuerde hier eine gruene Luege erzeugen.
function knopf(dataset, ziel) {
  const node = {
    dataset,
    closest(selektor) {
      if (ziel && Object.prototype.hasOwnProperty.call(ziel, selektor)) return ziel[selektor];
      if (selektor === ".sb-app" || selektor === "[data-sb-zone]") return node;
      return null;
    }
  };
  return node;
}
ok(modul.onAction("go", knopf({ sbKey: "tasks", sbZone: "page", sbPage: "0" })) === false,
  "ausserhalb des Anordnen-Modus faengt onAction den Tipp ab — die App liesse sich nicht mehr oeffnen");

// ═══ 2. IM MODUS HAENGEN SIE, DANACH NICHT MEHR ═══════════════════════════
sb.startArrange();
const imModus = zeigerHandler();
ok(imModus >= 4, `im Anordnen-Modus haengen nur ${imModus} Zeiger-Handler — das Ziehen kann nicht funktionieren`);
sb.stopArrange();
ok(zeigerHandler() === 0,
  `nach dem Anordnen bleiben ${zeigerHandler()} Zeiger-Handler stehen — sie wirken in anderen Ansichten weiter`);

/*
 * Auch das Verlassen des Homebildschirms raeumt auf — und zwar auf dem Weg,
 * den die App WIRKLICH geht.
 *
 * BEFUND (gemessen, Chromium): die Aufraeumung stand nur in mount(). Das
 * sah richtig aus und lief nie: app.js ruft mount() ausschliesslich auf dem
 * Modul, dem die aktuelle Route gehoert. Der Homebildschirm besitzt nur
 * "home" und erfaehrt vom Verlassen gar nichts. Der Modus blieb samt
 * Zeiger-Handlern stehen. Dieser Test ging vorher trotzdem durch, weil er
 * mount() von Hand aufrief — eine gruene Luege.
 *
 * Geprueft wird deshalb der Routenwechsel selbst.
 */
sb.startArrange();
ok(zeigerHandler() > 0, "der Anordnen-Modus haengt keine Zeiger-Handler an");
geheZu("tasks");
ok(zeigerHandler() === 0,
  "ein Routenwechsel beendet den Anordnen-Modus nicht — er wirkt in anderen Ansichten weiter");
ok(modul.onAction("go", knopf({ sbKey: "tasks", sbZone: "page", sbPage: "0" })) === false,
  "nach dem Routenwechsel faengt onAction den Tipp immer noch ab");
geheZu("home");

// Und der direkte Weg ueber mount() raeumt ebenfalls auf.
sb.startArrange();
modul.mount("tasks", null);
ok(zeigerHandler() === 0, "mount() raeumt den Anordnen-Modus nicht auf");

// ═══ 3. DIE VOREINSTELLUNG IST VOLLSTAENDIG ═══════════════════════════════
function alleSymbole(layout) {
  return layout.pages.reduce((liste, page) => liste.concat(page.apps), []).concat(layout.dock);
}
const anfang = sb.layout();
ok(anfang.pages.length >= 4, "der Homebildschirm hat weniger Seiten als vorgesehen");
ok(anfang.dock.length > 0, "das Dock ist leer");
const symbole = alleSymbole(anfang);
ok(new Set(symbole).size === symbole.length, "ein Symbol liegt doppelt auf dem Homebildschirm");
// Jede App aus dem Katalog muss irgendwo liegen — sonst ist sie unsichtbar.
["tasks", "projects", "time", "workload", "journal", "reflecta", "drive", "smarter", "browser"].forEach((key) => {
  ok(symbole.includes(key), `die App ${key} liegt auf keiner Seite und in keinem Dock`);
});

// ═══ 4. VERSCHIEBEN — INNERHALB EINER SEITE, ZWISCHEN SEITEN, INS DOCK ════
function seiteVon(layout, key) {
  for (let i = 0; i < layout.pages.length; i += 1) {
    if (layout.pages[i].apps.includes(key)) return i;
  }
  return layout.dock.includes(key) ? "dock" : null;
}

sb.startArrange();

// a) Aufheben und auf ein Symbol derselben Seite ablegen.
const zuVerschieben = anfang.pages[0].apps[5];
const ziel = anfang.pages[0].apps[1];
modul.onAction("go", knopf({ sbKey: zuVerschieben, sbZone: "page", sbPage: "0" }));
modul.onAction("go", knopf({ sbKey: ziel, sbZone: "page", sbPage: "0" }));
let layout = sb.layout();
ok(layout.pages[0].apps.indexOf(zuVerschieben) === layout.pages[0].apps.indexOf(ziel) - 1,
  "das Symbol wurde nicht vor sein Ziel gelegt");
ok(alleSymbole(layout).filter((key) => key === zuVerschieben).length === 1,
  "das verschobene Symbol liegt jetzt doppelt");

// b) Auf eine ANDERE Seite legen.
const wanderer = sb.layout().pages[0].apps[0];
const zielAufSeite2 = sb.layout().pages[1].apps[0];
modul.onAction("go", knopf({ sbKey: wanderer, sbZone: "page", sbPage: "0" }));
modul.onAction("go", knopf({ sbKey: zielAufSeite2, sbZone: "page", sbPage: "1" }));
layout = sb.layout();
ok(seiteVon(layout, wanderer) === 1, "das Symbol ist nicht auf der zweiten Seite gelandet");
ok(!layout.pages[0].apps.includes(wanderer), "das Symbol liegt auch noch auf der alten Seite");

// c) Ins Dock legen.
const insDock = sb.layout().pages[2].apps[0];
const dockVorher = sb.layout().dock.length;
modul.onAction("go", knopf({ sbKey: insDock, sbZone: "page", sbPage: "2" }));
modul.onAction("go", knopf({ sbKey: sb.layout().dock[0], sbZone: "dock", sbPage: "" }));
layout = sb.layout();
ok(layout.dock.includes(insDock), "das Symbol ist nicht im Dock gelandet");
ok(layout.dock[0] === insDock, "das Symbol liegt nicht an der angetippten Stelle im Dock");
ok(layout.dock.length === dockVorher + 1, "das Dock hat die falsche Groesse");
ok(seiteVon(layout, insDock) === "dock", "das Symbol liegt zusaetzlich noch auf seiner Seite");

// d) Aus dem Dock nehmen — ueber das Minuszeichen auf dem Symbol.
modul.onAction("go",
  knopf({ sbKey: insDock, sbZone: "dock", sbPage: "" }, { "[data-sb-remove]": {} }),
  { target: { closest: (selektor) => (selektor === "[data-sb-remove]" ? {} : null) } });
layout = sb.layout();
ok(!layout.dock.includes(insDock), "das Symbol laesst sich nicht aus dem Dock nehmen");
ok(seiteVon(layout, insDock) !== null, "das aus dem Dock genommene Symbol ist ganz verschwunden");

// e) Dasselbe Symbol zweimal antippen legt es zurueck.
const dieselbe = sb.layout().pages[0].apps[2];
const vorherOrdnung = JSON.stringify(sb.layout());
modul.onAction("go", knopf({ sbKey: dieselbe, sbZone: "page", sbPage: "0" }));
modul.onAction("go", knopf({ sbKey: dieselbe, sbZone: "page", sbPage: "0" }));
ok(JSON.stringify(sb.layout()) === vorherOrdnung, "das Abbrechen hat die Anordnung veraendert");

// ═══ 5. DAS DOCK LAEUFT NICHT UEBER ═══════════════════════════════════════
let schutz = 0;
while (sb.layout().dock.length < 6 && schutz < 20) {
  const kandidat = sb.layout().pages[0].apps.find((key) => !sb.layout().dock.includes(key));
  if (!kandidat) break;
  modul.onAction("go", knopf({ sbKey: kandidat, sbZone: "page", sbPage: "0" }));
  modul.onAction("go", knopf({ sbKey: sb.layout().dock[0], sbZone: "dock", sbPage: "" }));
  schutz += 1;
}
ok(sb.layout().dock.length === 6, `das Dock fasst ${sb.layout().dock.length} statt 6 Symbole`);
const nochEines = sb.layout().pages[0].apps.find((key) => !sb.layout().dock.includes(key));
modul.onAction("go", knopf({ sbKey: nochEines, sbZone: "page", sbPage: "0" }));
modul.onAction("go", knopf({ sbKey: sb.layout().dock[0], sbZone: "dock", sbPage: "" }));
layout = sb.layout();
ok(layout.dock.length === 6, `das volle Dock ist auf ${layout.dock.length} Symbole gewachsen`);
ok(layout.dock.includes(nochEines), "das neue Symbol ist nicht ins volle Dock gerueckt");
// Und das verdraengte Symbol ist nicht verschwunden, sondern auf einer Seite.
const alle = alleSymbole(layout);
ok(new Set(alle).size === alle.length, "beim Verdraengen aus dem Dock entstand ein doppeltes Symbol");

// ═══ 6. DIE ANORDNUNG UEBERLEBT DEN NEUSTART ══════════════════════════════
ok(speicher.has("quantus-tablet-springboard-v2"), "die Anordnung wird nicht gespeichert");
const gespeichert = JSON.stringify(sb.layout());
const wieder = JSON.parse(speicher.get("quantus-tablet-springboard-v2"));
ok(JSON.stringify(sb.layout()) === gespeichert, "die Anordnung ist nicht stabil");
ok(Array.isArray(wieder.pages) && Array.isArray(wieder.dock), "der gespeicherte Stand hat die falsche Form");

// Eine neu dazugekommene App darf nicht unsichtbar bleiben: der gespeicherte
// Stand kennt sie nicht, der Katalog schon.
const ohneEine = JSON.parse(speicher.get("quantus-tablet-springboard-v2"));
ohneEine.pages.forEach((page) => { page.apps = page.apps.filter((key) => key !== "journal"); });
ohneEine.dock = ohneEine.dock.filter((key) => key !== "journal");
speicher.set("quantus-tablet-springboard-v2", JSON.stringify(ohneEine));
ok(alleSymbole(sb.layout()).includes("journal"),
  "eine App, die im gespeicherten Stand fehlt, bleibt auf dem Homebildschirm unsichtbar");

// Und ein kaputter Stand wirft die App nicht um.
speicher.set("quantus-tablet-springboard-v2", "{kaputt");
ok(sb.layout().pages.length >= 4, "ein kaputter gespeicherter Stand loescht den Homebildschirm");
speicher.set("quantus-tablet-springboard-v2", JSON.stringify({ pages: [{ apps: ["gibtsnicht", "tasks", "tasks"] }], dock: ["auchnicht"] }));
const bereinigt = sb.layout();
ok(!alleSymbole(bereinigt).includes("gibtsnicht"), "ein unbekanntes Symbol bleibt in der Anordnung stehen");
ok(alleSymbole(bereinigt).filter((key) => key === "tasks").length === 1, "ein doppelt gespeichertes Symbol bleibt doppelt");

// ═══ 7. ZURUECKSETZEN ═════════════════════════════════════════════════════
sb.reset();
ok(!speicher.has("quantus-tablet-springboard-v2"), "das Zuruecksetzen loescht die Anordnung nicht");
ok(JSON.stringify(sb.layout().pages[0].apps) === JSON.stringify(anfang.pages[0].apps),
  "nach dem Zuruecksetzen steht der Homebildschirm nicht wieder wie am Anfang");

// ═══ 8. EIN ALTES DOCK GEHT NICHT VERLOREN ════════════════════════════════
speicher.clear();
speicher.set("quantus-tablet-springboard-v1", JSON.stringify({ dock: ["notes", "budget"] }));
const uebernommen = sb.layout();
ok(uebernommen.dock[0] === "notes" && uebernommen.dock[1] === "budget",
  "ein bereits eingerichtetes Dock aus der alten Fassung geht beim Umstieg verloren");

// ═══ 9. DIE ANSICHT ZEIGT DEN MODUS AN ════════════════════════════════════
speicher.clear();
sb.stopArrange();
const ruhig = modul.render("home");
ok(!ruhig.includes("sb-drop-end"), "die Ablageflaechen sind auch ausserhalb des Anordnen-Modus da");
ok(ruhig.includes('data-action="sb-arrange"'), "es fehlt der sichtbare Schalter fuers Anordnen");
sb.startArrange();
const angeordnet = modul.render("home");
ok(angeordnet.includes("arranging"), "der Anordnen-Modus ist an der Ansicht nicht zu erkennen");
ok(angeordnet.includes("sb-drop-end"), "es fehlt die Flaeche zum Ablegen am Seitenende");
ok(angeordnet.includes('data-action="sb-reset"'), "es fehlt der Knopf zum Zuruecksetzen");
ok(angeordnet.includes("sb-remove"), "im Dock fehlt das Minuszeichen zum Herausnehmen");
sb.stopArrange();

if (luecken.length) {
  luecken.forEach((text) => console.error("  ✗ " + text));
  assert.fail(`${luecken.length} von ${checks} Pruefungen fehlgeschlagen`);
}
console.log(`homescreen anordnen: ok (${checks} Pruefungen)`);
