/*
 * Briefing im Hero und angenehmes PDF-Lesen.
 *
 * BEFUND 1 — DER TAG STAND NICHT DA. Der Startbildschirm begruesste, zeigte
 * vier Zahlen und einen Knopf "Daily Briefing oeffnen". Den Tag selbst sah man
 * erst nach einem Klick. Auf einem Tablet, das man morgens aufklappt, ist das
 * die falsche Reihenfolge.
 *
 * BEFUND 2 — PDFs LASEN SICH SCHLECHT. Vier Gruende, alle im Quelltext:
 *   a) Das Dokument steckte in .reader-content — einem Behaelter mit 24 px
 *      oben/unten und bis zu 54 px seitlichem Polster. Das ist Polster fuer
 *      Fliesstext; ein PDF wird davon nur kleiner.
 *   b) "#toolbar=0&navpanes=0" schaltete die Werkzeugleiste des Betrachters AB:
 *      kein Zoom, keine Seitenzahl, keine Suche.
 *   c) Kein Vollbild, und die Bibliotheksspalte frass dauerhaft Breite.
 *   d) In der Media Query stand .reader-content auf height:auto — ein iframe
 *      mit height:100% faellt darin auf nichts zusammen.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const app = read("app.js");
const css = read("styles.css");
const expCss = read("quantus-tablet-expansion.css");
const sw = read("sw.js");

let checks = 0;
const luecken = [];
const ok = (b, t) => { checks++; if (!b) luecken.push(t); };
const ohneKommentare = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
function regel(quelle, selektor) {
  const rein = quelle.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = new RegExp("(?:^|[,}])\\s*" + selektor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}", "m");
  const m = re.exec(rein);
  return m ? m[1] : null;
}

// ═══ 1. DER TAG STEHT IM HERO ══════════════════════════════════════════
{
  const k = ohneKommentare(app);
  ok(/function briefingHero\(\)/.test(k), "DER BEFUND: es gibt keinen Briefing-Block auf dem Startbildschirm");
  ok(/\$\{briefingHero\(\)\}/.test(k), "der Block wird nicht gerendert");

  const home = k.indexOf("function renderHome(");
  const block = k.indexOf("${briefingHero()}", home);
  const metriken = k.indexOf("metric-row", home);
  const knopf = k.indexOf('data-route="daily"', home);
  ok(block > 0 && block < metriken, "der Briefing-Block steht hinter den Zahlen statt davor");
  ok(block < knopf, "der Briefing-Block steht hinter dem Knopf — man sieht den Tag erst nach einem Klick");

  // Er rechnet NICHT eigenstaendig, sondern nimmt dieselben Quellen wie
  // renderDaily — sonst zeigten Hero und Briefing verschiedene Zahlen.
  const a = k.indexOf("function briefingHero()");
  const koerper = k.slice(a, k.indexOf("\n  }", a));
  for (const quelle of ["todayEvents()", "todayMeetings()", "todayTasks()", "activeHabits()", "dailyBriefing"]) {
    ok(koerper.includes(quelle), `briefingHero benutzt ${quelle} nicht — es rechnet eigene Zahlen`);
  }
  ok(!/fetch\(|\.ref\(/.test(koerper), "briefingHero laedt selbst nach, statt den vorhandenen Stand zu nehmen");
  ok(/hero-warn/.test(koerper), "ueberfaellige Aufgaben werden nicht hervorgehoben");
  for (const r of [".hero-briefing", ".hero-briefing-list", ".hero-warn"]) {
    ok(expCss.includes(r), `die Regel ${r} fehlt — der Block bliebe unformatiert`);
  }
}

// ═══ 2. PDF: eigener Behaelter, Werkzeugleiste, Vollbild ═══════════════
{
  const k = ohneKommentare(app);

  /*
   * Hier stand die Pruefung auf das eingebettete iframe: kein #toolbar=0,
   * dafuer #view=FitH und allowfullscreen. Das war die richtige Antwort auf
   * den damaligen Befund — aber der Nutzer meldete danach "pdf reader noch
   * sehr eingeschraenkt", und der Grund liegt tiefer: auf iPadOS zeigt Safari
   * ein PDF im iframe nur als VORSCHAU. Erste Seite, kein Blaettern, und
   * #view wird ignoriert. Ein besser eingestelltes iframe half dort nichts.
   *
   * Gerendert wird jetzt mit einem eigenen Betrachter (pdf-viewer.js), der
   * die Seiten selbst auf Canvas zeichnet. Geprueft wird deshalb, dass das
   * PDF in dessen Behaelter landet — und NICHT mehr in einem iframe.
   */
  ok(!/#toolbar=0/.test(k), "das PDF wird wieder mit abgeschalteter Werkzeugleiste eingebettet");
  ok(!/navpanes=0/.test(k), "die Seitenleiste des Betrachters ist weiterhin abgeschaltet");
  ok(/data-nm-pdf=/.test(k), "das PDF landet nicht im Behaelter des eigenen Betrachters");
  ok(!/<iframe[^>]*\$\{attr\(url\)\}/.test(k) && !/#view=FitH/.test(k),
    "DER BEFUND: das PDF steckt wieder in einem iframe — auf iPadOS bliebe es bei der ersten Seite");
  // Der Betrachter selbst muss die Bedienung mitbringen, die das iframe nie hatte.
  const viewer = ohneKommentare(read("pdf-viewer.js"));
  for (const [muster, was] of [
    [/data-pdfv="prev"/, "Blaettern zurueck"], [/data-pdfv="next"/, "Blaettern vorwaerts"],
    [/data-pdfv="seitenfeld"/, "Sprung zu einer Seite"], [/data-pdfv="zoom-ein"/, "Zoom"],
    [/data-pdfv="fit-breite"/, "Einpassen auf die Breite"], [/data-pdfv="fit-seite"/, "ganze Seite"],
    [/data-pdfv="drehen"/, "Drehen"], [/data-pdfv="suchfeld"/, "Suche im Dokument"],
    [/data-pdfv="vollbild"/, "Vollbild"]
  ]) {
    ok(muster.test(viewer), `dem PDF-Betrachter fehlt ${was}`);
  }
  // Beim Oeffnen wird auf die Breite eingepasst — sonst steht die Seite
  // winzig oder ragt hinaus.
  ok(/modus: "breite"/.test(viewer), "das PDF wird nicht auf die Breite eingepasst geoeffnet");
  // Und der Rueckfall bleibt: ohne Netz oder ohne CORS muss das Dokument
  // trotzdem sichtbar sein, mit einem Wort dazu, warum es hier weniger kann.
  ok(/function rueckfall/.test(viewer) && /<iframe/.test(viewer),
    "es fehlt der Rueckfall auf den Betrachter des Browsers");
  ok(/pdfv-hinweis/.test(viewer), "der Rueckfall sagt nicht, warum er da ist");

  // Der Textzweig bleibt, wie er war — Fliesstext BRAUCHT das Polster.
  ok(/class="reader-content" data-reader="true"><article>/.test(k),
    "der Textzweig verlor seinen Lesebehaelter");

  ok(/data-action="reader-full"/.test(k), "es gibt keinen Vollbildknopf");
  ok(/data-action="reader-wide"/.test(k), "die Bibliothek laesst sich nicht wegklappen");
  ok(/action === "reader-full"/.test(k) && /requestFullscreen/.test(k), "der Vollbildknopf ist nicht verdrahtet");
  ok(/action === "reader-wide"/.test(k) && /library-hidden/.test(k), "der Breit-Knopf ist nicht verdrahtet");
  // Beide sind reine Ansichtsschalter.
  const wide = k.slice(k.indexOf('action === "reader-wide"'), k.indexOf('action === "reader-full"'));
  ok(!/executeOperation|go\(|openExternal/.test(wide), "der Breit-Knopf loest mehr aus als eine Ansichtsaenderung");
}

// ═══ 3. Das CSS gibt dem PDF wirklich Flaeche ══════════════════════════
{
  const pdf = regel(css, ".nm-pdf-host");
  ok(pdf != null, ".nm-pdf-host hat keine Regel");
  if (pdf) {
    ok(/height:\s*calc\(var\(--content-h\)/.test(pdf), ".nm-pdf-host bekommt keine Hoehe aus --content-h");
    ok(!/padding/.test(pdf), ".nm-pdf-host hat ein Polster — genau das verkleinerte das PDF vorher");
    ok(/overflow:\s*hidden/.test(pdf),
      ".nm-pdf-host scrollt selbst — dann scrollen zwei Ebenen gegeneinander, der Betrachter soll es tun");
  }
  // Die alten iframe-Regeln sind entfallen; sie gestalteten etwas, das es
  // nicht mehr gibt. Totes CSS behauptet, es sei noch im Spiel.
  ok(!/\.reader-pdf/.test(css), "es steht noch totes CSS fuer das alte PDF-iframe herum");

  // Der schmale Fall: ohne echte Hoehe faellt der Behaelter zusammen.
  const schmal = css.slice(css.indexOf("@media"), css.length);
  ok(/\.nm-pdf-host\s*\{[^}]*height:\s*75vh/.test(schmal),
    "in der Media Query bekommt .nm-pdf-host keine echte Hoehe — das PDF faellt dort zusammen");

  ok(regel(css, ".reading-layout.library-hidden") != null, "das Wegklappen der Bibliothek ist nicht gestaltet");
  ok(/\.reader-panel:fullscreen/.test(css), "im Vollbild bleibt der Rahmen stehen");
  ok(!/!important/.test(regel(css, ".reader-pdf") || ""), ".reader-pdf arbeitet mit !important");
}

// ═══ 4. Auslieferung ═══════════════════════════════════════════════════
{
  const v = /const CACHE = "([^"]+)"/.exec(sw);
  ok(v && v[1] !== "quantus-tablet-v10-lernrouten",
    `der Cache heisst weiterhin "${v && v[1]}" — die Tablets bekaemen die alte app.js und das alte CSS`);
}

if (luecken.length) {
  console.error("BRIEFING & PDF — " + luecken.length + " von " + checks + " Pruefungen:");
  luecken.forEach((l) => console.error("   - " + l));
  process.exit(1);
}
console.log(`briefing & pdf: ok (${checks} Pruefungen)`);
