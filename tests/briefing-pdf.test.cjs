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

  ok(!/#toolbar=0/.test(k),
    "DER BEFUND: das PDF wird weiterhin mit #toolbar=0 eingebettet — kein Zoom, keine Seitenzahl, keine Suche");
  ok(!/navpanes=0/.test(k), "die Seitenleiste des Betrachters ist weiterhin abgeschaltet");
  ok(/#view=FitH/.test(k), "das PDF wird nicht auf die Breite eingepasst geoeffnet");
  ok(/class="reader-pdf"/.test(k),
    "DER BEFUND: das PDF steckt weiterhin in .reader-content — dessen Lesepolster verkleinert es");
  ok(/allowfullscreen/.test(k), "der eingebettete Betrachter darf nicht ins Vollbild");

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
  const pdf = regel(css, ".reader-pdf");
  ok(pdf != null, ".reader-pdf hat keine Regel");
  if (pdf) {
    ok(/height:\s*calc\(var\(--content-h\)/.test(pdf), `.reader-pdf bekommt keine Hoehe aus --content-h`);
    ok(!/padding/.test(pdf), ".reader-pdf hat ein Polster — genau das verkleinerte das PDF vorher");
    ok(/overflow:\s*hidden/.test(pdf),
      ".reader-pdf scrollt selbst — dann scrollen zwei Ebenen gegeneinander, der Betrachter soll es tun");
  }
  const frame = regel(css, ".reader-pdf iframe");
  ok(frame && /height:\s*100%/.test(frame) && /width:\s*100%/.test(frame), "das iframe fuellt den Behaelter nicht");

  // Der schmale Fall: height:auto liesse das iframe zusammenfallen.
  const schmal = css.slice(css.indexOf("@media"), css.length);
  ok(/\.reader-pdf\s*\{[^}]*height:\s*75vh/.test(schmal),
    "in der Media Query bekommt .reader-pdf keine echte Hoehe — das PDF faellt dort zusammen");

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
