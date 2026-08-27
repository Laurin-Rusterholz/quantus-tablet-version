/*
 * Die Lern-Apps oeffnen im Tablet — nicht in der Desktop-App.
 *
 * BEFUND (Tablet): BM Vorbereitung, Smarter, Leseplan, Career Model und
 * Pinnboard liessen sich nicht oeffnen. Drei Ursachen, die zusammenwirkten:
 *
 * 1. Alle Karten des Lerncockpits riefen data-action="external". openExternal
 *    haengte den Pfad an die DESKTOP-Adresse und rief openWindow — auf dem
 *    Tablet ist das Popup meist blockiert, also wurde im SELBEN Fenster
 *    geoeffnet und die Tablet-App war weg.
 *
 * 2. Fuer "#/smarter" und "#/leseplan" entstand dabei sogar eine unsinnige
 *    Adresse: openExternal streift nur fuehrende Schraegstriche ab, ein Hash
 *    blieb stehen und wurde an die Basis gehaengt ("…netlify.app/#/smarter").
 *    Dabei HAT das Tablet fuer smarter eine eigene Ansicht (renderLearning).
 *
 * 3. go(route) faellt bei unbekannter Route still auf "home" zurueck. Eine
 *    Route, die nicht in ROUTE_TITLES steht, landet also wieder auf dem
 *    Dashboard — von aussen sieht das aus wie "laesst sich nicht oeffnen".
 *
 * Die Daten waren die ganze Zeit da: connectData abonniert bmpruefung,
 * smarter/documents, leseplan/docs und careerModel/users/<uid> live.
 * Es fehlten nur Ansichten.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const app = read("app.js");
const expansion = read("quantus-tablet-expansion.js");
const css = read("quantus-tablet-expansion.css");
const sw = read("sw.js");

let checks = 0;
const luecken = [];
const ok = (b, t) => { checks++; if (!b) luecken.push(t); };
const ohneKommentare = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

// ── 1. openExternal behandelt einen Hash als eigene Route ────────────────
{
  const a = app.indexOf("function openExternal(path) {");
  ok(a > 0, "openExternal wurde nicht gefunden");
  const koerper = ohneKommentare(app.slice(a, app.indexOf("\n  }", a)));
  ok(/raw\.charAt\(0\) === "#"/.test(koerper) || /startsWith\("#"\)/.test(koerper),
    "DER BEFUND: openExternal erkennt einen Hash-Pfad nicht — '#/smarter' wird an die Desktop-Adresse gehaengt");
  ok(/go\(/.test(koerper), "der Hash-Pfad fuehrt nicht in die eigene Routenwahl");
  const hashIdx = koerper.indexOf('charAt(0) === "#"');
  const openIdx = koerper.indexOf("openWindow(");
  ok(hashIdx > 0 && openIdx > hashIdx,
    "die Hash-Pruefung steht nicht VOR openWindow — der Sprung nach draussen passiert trotzdem");
}

// ── 2. Die Routen sind bekannt, sonst wirft go() auf home zurueck ────────
for (const route of ["bm", "leseplan", "career"]) {
  ok(new RegExp(`\\b${route}: "`).test(app),
    `die Route ${route} steht nicht in ROUTE_TITLES — go() wirft sie still auf home zurueck`);
  ok(new RegExp(`"${route}"`).test(app.slice(app.indexOf("NATIVE_ROUTES"), app.indexOf("NATIVE_ROUTES") + 400)),
    `die Route ${route} fehlt in NATIVE_ROUTES`);
}
// smarter war schon vorher eine Route — sie darf nicht verloren gehen.
ok(/route === "smarter"/.test(app), "die bestehende smarter-Route wurde entfernt");
ok(/route === "workspace"/.test(app), "die Pinnboard-/Canvas-Route wurde entfernt");

// ── 3. Die Routentabelle delegiert an den Lern-Hub ──────────────────────
{
  const k = ohneKommentare(app);
  ok(/route === "bm" \|\| route === "leseplan" \|\| route === "career"/.test(k),
    "die drei Lern-Routen werden nicht gerendert");
  ok(/QuantusTabletLearningHub\?\.renderRoute\?\.\(route\)/.test(k),
    "die Routen delegieren nicht an den Lern-Hub");
}

// ── 4. Die Karten zeigen nach INNEN ─────────────────────────────────────
{
  const k = ohneKommentare(expansion);
  const karte = (label) => {
    const i = k.indexOf('card("' + label + '"');
    return i < 0 ? "" : k.slice(i, k.indexOf(");", i));
  };
  for (const [label, ziel] of [["BM Vorbereitung", "bm"], ["Smarter", "smarter"],
    ["Leseplan", "leseplan"], ["Career Model", "career"]]) {
    const c = karte(label);
    ok(c.length > 0, `die Karte "${label}" wurde nicht gefunden`);
    ok(/"go"/.test(c), `DER BEFUND: die Karte "${label}" ruft weiterhin "external" — sie verlaesst das Tablet`);
    ok(new RegExp('"' + ziel + '"').test(c), `die Karte "${label}" zielt nicht auf die Route ${ziel}`);
    ok(!/\.html/.test(c), `die Karte "${label}" zeigt auf eine Desktop-Datei`);
    ok(!/#\//.test(c), `die Karte "${label}" traegt einen Hash-Pfad statt einer Route`);
  }
  // Pinnboard war schon vorher eine Route — unveraendert.
  const pinn = karte("Pinnboards");
  ok(/"go"/.test(pinn) && /"workspace"/.test(pinn), "die Pinnboard-Karte wurde veraendert");
  // Auch das nachtraeglich eingehaengte Springboard-Symbol.
  ok(!/data-path", "career-model\.html"/.test(k),
    "das Career-Symbol im Springboard zeigt weiterhin auf die Desktop-Datei");
  ok(/setAttribute\("data-route", "career"\)/.test(k), "das Career-Symbol traegt keine Route");
}

// ── 5. Es GIBT die drei Ansichten, und sie lesen die Live-Daten ─────────
{
  ok(/function renderRoute\(route\)/.test(expansion), "der Lern-Hub hat kein renderRoute");
  ok(/renderRoute: renderRoute/.test(expansion), "renderRoute wird nicht exportiert");
  for (const [fn, quelle] of [["renderBm", "state.bm"], ["renderLeseplan", "state.leseplan"], ["renderCareer", "state.career"]]) {
    const a = expansion.indexOf("function " + fn + "(");
    ok(a > 0, `${fn} fehlt — die Route liefe ins Leere`);
    if (a < 0) continue;
    const koerper = expansion.slice(a, expansion.indexOf("\n  }", a));
    ok(koerper.includes(quelle) || /nextReadingUnit|nextCareerSession|countDue/.test(koerper),
      `${fn} liest nicht aus ${quelle} — die Ansicht waere erfunden`);
    ok(!/fetch\(|XMLHttpRequest/.test(koerper), `${fn} laedt selbst nach, statt die abonnierten Daten zu nehmen`);
  }
  // Die Abos bleiben, wie sie waren.
  for (const knoten of ["bmpruefung", "smarter/documents", "leseplan/docs", "careerModel/users/"]) {
    ok(expansion.includes(knoten), `das Abo auf ${knoten} ging verloren`);
  }
  // Ein optionaler Weg in die Vollversion bleibt — als Zusatz, nicht als
  // einziger Ausgang.
  ok(/function vollversion\(/.test(expansion), "es gibt keinen optionalen Weg in die Vollversion");
  ok(/data-action="external"/.test(expansion), "der optionale Weg in die Vollversion fehlt ganz");
}

// ── 5b. Nichts, wofuer es eine Tablet-Ansicht gibt, fuehrt nach draussen ─
// Die Lerncockpit-Karten waren nicht die einzige Stelle. Auch Smarter in der
// Lernliste, Statistiken, Berichte, Polaris und Lesen schickten in die
// Desktop-App, obwohl das Tablet fuer alle fuenf eine eigene Ansicht hat.
{
  const k = ohneKommentare(app);

  // Der Smarter-Eintrag in der Lernliste zeigt nach innen.
  ok(/data-action="go" data-route="smarter">↗<\/button>/.test(k),
    'der Smarter-Eintrag in der Lernliste springt weiterhin in die Desktop-App');
  ok(!/data-path="index\.html#\/smarter"/.test(k),
    'es gibt weiterhin einen Link auf index.html#/smarter — dafuer hat das Tablet renderLearning');

  // Der Polaris-Schnellknopf oeffnet die Tablet-Ansicht.
  ok(/data-action="go" data-route="polaris"/.test(k), 'der Polaris-Schnellknopf fuehrt nicht in die Tablet-Ansicht');

  // KEIN dominanter Aussenknopf mehr — ausser im generischen Modul-Fallback,
  // wo es gar keine Tablet-Ansicht gibt und "Separat oeffnen" der Hauptweg ist.
  const primaer = k.match(/btn primary" data-action="external"/g) || [];
  ok(primaer.length === 2,
    `${primaer.length} dominante Aussenknoepfe statt 2 — erlaubt sind nur die beiden in renderModule`);
  const modulAnfang = k.indexOf("function renderModule(");
  const modulEnde = k.indexOf("\n  function ", modulAnfang + 10);
  let ausserhalb = 0;
  let i = k.indexOf('btn primary" data-action="external"');
  while (i >= 0) {
    if (i < modulAnfang || i > modulEnde) ausserhalb += 1;
    i = k.indexOf('btn primary" data-action="external"', i + 1);
  }
  ok(ausserhalb === 0,
    `${ausserhalb} dominante Aussenknoepfe stehen ausserhalb von renderModule — dort gibt es eine Tablet-Ansicht`);

  // Die verbliebenen Aussenwege sind als Zusatz gekennzeichnet.
  for (const ziel of ["index.html#/statistics", "index.html#/reports", "index.html#/polaris", "drive.html"]) {
    const j = k.indexOf('data-path="' + ziel + '"');
    ok(j > 0, `der optionale Weg zu ${ziel} ist ganz verschwunden`);
    if (j > 0) {
      const knopf = k.slice(Math.max(0, j - 90), j);
      ok(!/btn primary/.test(knopf), `der Weg zu ${ziel} ist weiterhin der dominante Knopf`);
    }
  }
}

// ── 6. Aussehen und Auslieferung ───────────────────────────────────────
for (const regel of [".qt-route-title", ".qt-route-number", ".qt-route-empty", ".qt-bar"]) {
  ok(css.includes(regel), `die Regel ${regel} fehlt — die Ansicht bliebe unformatiert`);
}
ok(!/!important/.test(css.slice(css.indexOf(".qt-route .qt-route-title"))),
  "die neuen Regeln arbeiten mit !important");
{
  const v = /const CACHE = "([^"]+)"/.exec(sw);
  ok(v && v[1] !== "quantus-tablet-v9-no-mirror",
    `der Cache heisst weiterhin "${v && v[1]}" — die Tablets bekaemen die alte app.js`);
}

if (luecken.length) {
  console.error("TABLET LERNROUTEN — " + luecken.length + " von " + checks + " Pruefungen:");
  luecken.forEach((l) => console.error("   - " + l));
  process.exit(1);
}
console.log(`tablet lernrouten: ok (${checks} Pruefungen)`);
