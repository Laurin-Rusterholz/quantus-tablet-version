/*
 * DAS LERNCOCKPIT FLIMMERTE UND VERSCHLUCKTE JEDEN TIPP.
 *
 * BEFUND (Tablet, Bildschirmfoto): die fuenf Karten des Lerncockpits — BM
 * Vorbereitung, Smarter, Leseplan, Career Model, Pinnboards — liessen sich
 * nicht oeffnen, "es flimmert einfach nur".
 *
 * GEMESSEN (Chromium, echte index.html, Home-Route, 2000 ms):
 *     vorher:  40 vollstaendige Ersetzungen des Cockpits — alle ~50 ms
 *     nachher:  0
 * Und ein Fingertipp:
 *     vorher:  120 / 300 / 600 / 900 ms → kein einziges click-Ereignis,
 *              die Route blieb auf #/home stehen
 *     nachher: alle fuenf Karten oeffnen (#/bm, #/smarter, #/leseplan,
 *              #/career, #/workspace)
 * Der Grund fuer das Verschlucken: ein Tipp dauert 100–300 ms. Die Karte
 * wurde zwischen Beruehrung und Loslassen aus dem Dokument entfernt, also
 * sendete der Browser gar kein click mehr — die Klick-Delegation in app.js
 * bekam nie etwas zu sehen.
 *
 * URSACHE: renderHomeExpansion verglich das selbst erzeugte Markup mit
 * existing.outerHTML — also mit der SERIALISIERUNG des DOM. Die ist nie
 * zeichengleich: der Browser gibt "LESEN &amp; WEITERBILDEN" zurueck, wo die
 * Zeichenkette "LESEN & WEITERBILDEN" sagt, und macht aus esc()s &#039;
 * wieder ein blosses '. Der Vergleich war damit IMMER ungleich → ersetzen →
 * die MutationObserver auf #main sah die Aenderung → scheduleRender (50 ms)
 * → ersetzen → Endlosschleife.
 *
 * Dieser Test haelt die Invariante fest: unveraenderte Daten duerfen das
 * Cockpit NICHT neu schreiben, geaenderte Daten muessen es.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const quelle = fs.readFileSync(path.join(__dirname, "..", "public", "quantus-tablet-expansion.js"), "utf8");

// Der Browser gibt Markup nicht zeichengleich zurueck. Genau diese beiden
// Umformungen liessen den alten Vergleich immer scheitern.
function wieDerBrowser(markup) {
  return String(markup)
    .replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, "&amp;")
    .replace(/&#039;/g, "'");
}

function stubDom() {
  let schreibvorgaenge = 0;
  let hub = null;

  const neuerHub = (markup) => ({
    id: "quantusLearningHub",
    roh: markup,
    get outerHTML() { return wieDerBrowser(this.roh); },
    set outerHTML(wert) { schreibvorgaenge += 1; this.roh = wert; }
  });

  const springboard = {
    className: "springboard",
    querySelector(sel) {
      if (sel === "#quantusLearningHub") return hub;
      if (sel === ".sb-top") return { insertAdjacentHTML(pos, html) { hub = neuerHub(html); } };
      return null;
    },
    querySelectorAll() { return []; },
    insertAdjacentHTML(pos, html) { hub = neuerHub(html); }
  };

  const document = {
    readyState: "complete",
    body: { },
    addEventListener() {},
    getElementById() { return null; },
    createElement() { return { setAttribute() {}, innerHTML: "" }; },
    querySelector(sel) { return sel === ".springboard" ? springboard : null; }
  };

  const window = { document: document, __quantusTablet: { state: { payload: { entities: {} } } } };
  const modul = new Function("window", "setTimeout", "clearTimeout", "MutationObserver", quelle);
  // Zeitgeber stillgelegt: der Test ruft render() ausdruecklich auf, damit
  // jeder Schreibvorgang zaehlbar einer Ursache zugeordnet bleibt.
  modul(window, () => 0, () => {}, function () { return { observe() {}, disconnect() {} }; });

  return {
    hub: window.QuantusTabletLearningHub,
    render: () => window.QuantusTabletLearningHub.render(),
    text: () => (hub ? hub.roh : ""),
    schreibvorgaenge: () => schreibvorgaenge
  };
}

// ── 1. Der erste Aufbau setzt das Cockpit ins Dokument ────────────────────
const dom = stubDom();
dom.render();
assert.match(dom.text(), /id="quantusLearningHub"/, "das Lerncockpit wurde gar nicht eingesetzt");
assert.equal((dom.text().match(/class="qt-learning-card/g) || []).length, 6,
  "es muessen sechs Karten sein: BM, Briefing-PDF, Smarter, Leseplan, Career Model, Pinnboards");

// ── 2. DER BEFUND: gleiche Daten duerfen nichts neu schreiben ─────────────
const vorher = dom.schreibvorgaenge();
for (let i = 0; i < 20; i += 1) dom.render();
assert.equal(dom.schreibvorgaenge(), vorher,
  "DER BEFUND: das Cockpit wird bei unveraenderten Daten neu geschrieben — " +
  "jedes Neuschreiben weckt die MutationObserver auf #main, das ist die " +
  "Endlosschleife, die flimmert und jeden Tipp verschluckt");

// ── 3. Geaenderte Daten muessen aber ankommen ─────────────────────────────
dom.hub.state.smarter = { d1: { title: "Testlektion Alpha", generatedAt: "2026-08-28T06:00:00Z" } };
dom.render();
assert.equal(dom.schreibvorgaenge(), vorher + 1,
  "geaenderte Daten schreiben das Cockpit nicht (oder mehr als einmal) neu");
assert.match(dom.text(), /Testlektion Alpha/, "der neue Smarter-Titel steht nicht auf der Karte");
dom.render();
assert.equal(dom.schreibvorgaenge(), vorher + 1, "nach der Aenderung laeuft es erneut in die Schleife");

// ── 4. Die Karten fuehren in die Tablet-Routen, nicht nach draussen ───────
for (const route of ["bm", "briefingpdf", "smarter", "leseplan", "career", "workspace"]) {
  assert.match(dom.text(), new RegExp(`data-action="go" data-route="${route}"`),
    `die Karte fuer ${route} oeffnet nicht die Tablet-Route`);
}
assert.doesNotMatch(dom.text(), /data-action="external"/,
  "eine Karte springt wieder in die Desktop-App statt in die Tablet-Ansicht");

console.log("lerncockpit: kein flimmern, karten reagieren: ok");
