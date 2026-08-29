/*
 * DER PDF-BETRACHTER UND DAS MORGENBRIEFING.
 *
 * Zwei Meldungen aus der Bedienung:
 *
 * 1. "pdf reader noch sehr eingeschraenkt" — der Betrachter war ein blosses
 *    <iframe src="…#view=FitH">. Auf iPadOS zeigt Safari ein PDF im iframe
 *    nur als VORSCHAU: erste Seite, kein Blaettern, #view wird ignoriert.
 *    Dazu gab es keinerlei Bedienung — keine Seitenzahl, kein Zoom, keine
 *    Suche, kein Drehen.
 *
 * 2. "das morning briefing wird nicht am anfang angezeigt, das soll auf dem
 *    tablet eine eigene app sein" — zwei Ursachen: die Route "dailybriefing"
 *    stand in keiner Seite des Springboards (normaliseLayout haengt
 *    unbekannte Apps hinten an die LETZTE Seite, sie lag also auf Seite
 *    vier), und sie war nur ein Alias derselben Funktion wie "daily" — eine
 *    eigene App war sie nie.
 *
 * Geprueft wird gegen die echten Dateien. Das Verhalten im Browser (Seiten
 * zeichnen, blaettern, zoomen, drehen, suchen) laesst sich hier nicht
 * nachstellen — dafuer gibt es die Messung mit Chromium; hier stehen die
 * Zusagen, die im Quelltext nachweisbar sind.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "public");
const lies = (datei) => fs.readFileSync(path.join(root, datei), "utf8");
const ohneKommentare = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let checks = 0;
const luecken = [];
const ok = (bedingung, text) => { checks += 1; if (!bedingung) luecken.push(text); };

// ══════════════════════════════════════════════════════════════════════════
//  1. DER PDF-BETRACHTER
// ══════════════════════════════════════════════════════════════════════════
{
  const viewer = lies("pdf-viewer.js");
  const aktiv = ohneKommentare(viewer);
  const css = lies("pdf-viewer.css");

  // Die Bedienung, die das iframe nie hatte.
  for (const [muster, was] of [
    [/data-pdfv="prev"/, "Blaettern zurueck"],
    [/data-pdfv="next"/, "Blaettern vorwaerts"],
    [/data-pdfv="seitenfeld"/, "Sprung zu einer Seite"],
    [/data-pdfv="zoom-ein"/, "Zoom hinein"],
    [/data-pdfv="zoom-aus"/, "Zoom heraus"],
    [/data-pdfv="fit-breite"/, "Einpassen auf die Breite"],
    [/data-pdfv="fit-seite"/, "ganze Seite"],
    [/data-pdfv="drehen"/, "Drehen"],
    [/data-pdfv="suchfeld"/, "Suche im Dokument"],
    [/data-pdfv="vollbild"/, "Vollbild"]
  ]) {
    ok(muster.test(aktiv), `dem PDF-Betrachter fehlt ${was}`);
  }

  // Gerendert wird selbst, auf Canvas — nicht an den Browser abgegeben.
  ok(/getDocument\(/.test(aktiv) && /\.render\(\{/.test(aktiv),
    "der Betrachter rendert die Seiten nicht selbst");
  ok(/canvasContext/.test(aktiv), "es wird nicht auf Canvas gezeichnet");
  ok(/devicePixelRatio/.test(aktiv),
    "auf einem Tablet mit doppelter Punktdichte waere die Seite sichtbar unscharf");
  ok(/modus: "breite"/.test(aktiv), "das PDF wird nicht auf die Breite eingepasst geoeffnet");

  /*
   * BEFUND (gemessen, Chromium): Blaettern, Zoom, Drehen und Suche taten
   * nichts, obwohl der Klick ankam. Jedes render() ersetzt das Innere von
   * #main; der Betrachter wird dann erneut geoeffnet. Lud der zweite Lauf
   * schneller, setzte danach der erste seinen Zustand als der gueltige — mit
   * Verweisen in einen Baum, den niemand mehr sieht. Sichtbar war Lauf zwei,
   * bedient wurde Lauf eins.
   */
  ok(/laufNummer/.test(aktiv), "es fehlt die Absicherung gegen zwei gleichzeitige Laeufe");
  ok(/isConnected/.test(aktiv),
    "ein Lauf gilt auch dann noch, wenn sein Behaelter gar nicht mehr im Dokument haengt");
  ok(/if \(!nochGueltig\(\)\)/.test(aktiv), "der veraltete Lauf wird nicht abgebrochen");

  /*
   * BEFUND (gemessen): nach einem Sprung landete man eine Seite daneben.
   * offsetTop misst gegen den naechsten POSITIONIERTEN Vorfahren — ohne
   * position:relative am Rollbehaelter verglich die Rechnung zwei
   * verschiedene Nullpunkte.
   */
  ok(/\.pdfv-seiten\s*\{[^}]*position:\s*relative/.test(css),
    "dem Rollbehaelter fehlt position:relative — die Seitenrechnung haette zwei Nullpunkte");
  ok(!/behavior:\s*"smooth"/.test(aktiv),
    "der Sprung auf eine Seite rollt weich — waehrenddessen aendern nachgezeichnete Seiten die Geometrie");

  // Lazy rendern, aber mit richtiger Geometrie.
  ok(/IntersectionObserver/.test(aktiv), "es werden alle Seiten auf einmal gezeichnet");
  ok(/function schaetzeBlattgroesse/.test(aktiv),
    "nach Zoom oder Drehung behalten ungezeichnete Seiten ihre alte Groesse — die Rollhoehe waere eine Mischung");

  // Der Rueckfall. PDF.js holt die Datei per fetch; die Dokumente liegen auf
  // fremder Herkunft (Firebase Storage) und offline fehlt PDF.js ganz.
  ok(/function rueckfall/.test(aktiv), "es fehlt der Rueckfall auf den Betrachter des Browsers");
  ok(/<iframe/.test(aktiv), "der Rueckfall zeigt das Dokument gar nicht");
  ok(/pdfv-hinweis/.test(aktiv), "der Rueckfall sagt nicht, warum er da ist");
  ok(/offline nicht verf/.test(viewer) && /erlaubt den Zugriff/.test(viewer),
    "die beiden Gruende fuer den Rueckfall werden nicht unterschieden");

  // Aufraeumen: ein liegengebliebenes Dokument behaelt seinen Arbeiter.
  ok(/destroy\(\)/.test(aktiv), "das Dokument wird beim Schliessen nicht freigegeben");

  // Die Quelle laesst sich umstellen — fuer Netze, die fremde CDNs blocken.
  ok(/QUANTUS_PDFJS_BASE/.test(aktiv), "die Herkunft von PDF.js laesst sich nicht umstellen");

  // Eingehaengt wird zentral in app.js: mount() eines Moduls laeuft nur fuer
  // dessen eigene Route, und "reading" gehoert keinem Modul.
  const app = ohneKommentare(lies("app.js"));
  ok(/function mountPdfViewer/.test(app), "der Betrachter wird nirgends eingehaengt");
  ok(/mountPdfViewer\(\);/.test(app), "mountPdfViewer wird beim Zeichnen nicht gerufen");
  ok(/host\.querySelector\("\.pdfv"\)/.test(app),
    "es wird auf eine Merkvariable statt auf den tatsaechlichen Inhalt geprueft — nach einem Neuzeichnen bliebe der Kasten leer");
  // Beide Ansichten nutzen denselben Betrachter.
  ok(/data-nm-pdf=/.test(app), "die Lesen-Ansicht nutzt den Betrachter nicht");
  ok(/data-nm-pdf=/.test(lies("native-modules.js")), "die PDF-App nutzt den Betrachter nicht");
  ok(!/#view=FitH/.test(app + lies("native-modules.js")),
    "irgendwo steckt das PDF wieder in einem iframe");
}

// ══════════════════════════════════════════════════════════════════════════
//  2. DAS MORGENBRIEFING
// ══════════════════════════════════════════════════════════════════════════
{
  const briefing = lies("briefing-app.js");
  const aktiv = ohneKommentare(briefing);
  const app = lies("app.js");
  const springboard = lies("springboard.js");

  // Eine eigene App, kein Alias mehr.
  ok(/routes: \["dailybriefing"\]/.test(aktiv), "das Briefing ist kein eigenes Modul");
  ok(/key: "briefing"/.test(aktiv), "das Modul meldet sich nicht an");
  // Dieselbe Rechnung wie „Heute" und wie der Kasten auf dem Homebildschirm.
  ok(/a\.briefingModell\(tag\)/.test(aktiv),
    "das Briefing rechnet den Tag selbst, statt das gemeinsame Modell zu lesen");
  ok(!/collection\("tasks"\)/.test(aktiv),
    "das Briefing greift an briefingModell vorbei auf die Daten zu — zwei Rechnungen fuer denselben Tag");

  // Was morgens dasteht — und was man schreiben kann.
  for (const [muster, was] of [
    [/Als Nächstes/, "der naechste Termin"],
    [/Was heute zählt/, "die Tagesziele"],
    [/Überfällig/, "das Ueberfaellige"],
    [/Fällig heute/, "das heute Faellige"],
    [/Routinen/, "die Routinen"],
    [/Gedanken/, "die Gedanken"],
    [/Notiz zum Tag/, "die Tagesnotiz"]
  ]) {
    ok(muster.test(briefing), `im Morgenbriefing fehlt ${was}`);
  }
  for (const form of ["db-goal", "db-thought", "db-note"]) {
    ok(new RegExp(`data-form="${form}"`).test(aktiv), `es fehlt das Formular ${form}`);
  }
  for (const aktion of ["db-toggle-goal", "toggle-habit", "toggle-task", "db-day"]) {
    ok(new RegExp(`data-action="${aktion}"`).test(aktiv), `es fehlt die Aktion ${aktion}`);
  }
  // Der ausfuehrliche Blick bleibt erreichbar — er ist nicht verschwunden.
  ok(/data-route="daily"/.test(aktiv), "von hier fuehrt kein Weg zu allen Abschnitten");

  /*
   * BEFUND: das Briefing hatte kein Symbol auf dem Homebildschirm. Es stand
   * in keiner Seite von PAGES, und normaliseLayout haengt unbekannte Apps
   * hinten an die LETZTE Seite — es lag also auf Seite vier, hinter allem.
   */
  const seiteEins = springboard.slice(springboard.indexOf('title: "Alltag"'), springboard.indexOf('title: "Wissen'));
  ok(/key: "dailybriefing"/.test(seiteEins), "das Morgenbriefing fehlt auf der ersten Seite des Homebildschirms");
  const stelle = seiteEins.indexOf('key: "dailybriefing"');
  const davor = (seiteEins.slice(0, stelle).match(/key: "/g) || []).length;
  ok(davor === 0, `das Morgenbriefing steht an Stelle ${davor + 1} statt an erster`);
  // Und der Vorschaukasten fuehrt in die App, nicht nach „Heute".
  ok(/class="sb-briefing" data-action="go" data-route="dailybriefing"/.test(springboard),
    "der Kasten auf dem Homebildschirm zeigt nicht auf das Morgenbriefing");

  /*
   * "wird nicht am anfang angezeigt" — die App startete immer auf dem
   * Homebildschirm. Der Startbildschirm ist jetzt waehlbar.
   */
  ok(/name="startRoute"/.test(app), "der Startbildschirm laesst sich nicht waehlen");
  ok(/state\.settings\.startRoute = String\(data\.get\("startRoute"\)/.test(app),
    "die Wahl des Startbildschirms wird nicht gesichert");
  const bootBlock = app.slice(app.indexOf("function boot()"), app.indexOf("window.__quantusTablet = {"));
  ok(/startRoute/.test(bootBlock), "beim Aufstarten wird die Wahl nicht angewandt");
  ok(/!location\.hash/.test(bootBlock),
    "der Startbildschirm ueberschreibt eine mitgegebene Adresse — ein Link auf eine Ansicht ginge verloren");

  // Der Name im Katalog passt zur App.
  ok(/key: "dailybriefing", label: "Morgenbriefing"/.test(app), "im App-Katalog heisst es noch anders");
}

if (luecken.length) {
  luecken.forEach((text) => console.error("  ✗ " + text));
  assert.fail(`${luecken.length} von ${checks} Pruefungen fehlgeschlagen`);
}
console.log(`pdf und briefing: ok (${checks} Pruefungen)`);
