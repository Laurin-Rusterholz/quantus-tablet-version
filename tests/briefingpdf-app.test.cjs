// Produktionsbefund (Nutzer): "ich kann auf dem tablet das morning briefing
// nicht oeffnen. das ist ein pdf welches ich jeden tag bekomme, was mir
// aber nicht angezeigt wird. es soll auf dem tablet eine spezielle app mit
// einem shortcut bekommen, sonst wird es in quantus unter nachrichten
// angezeigt."
//
// Das taeglich zugestellte PDF landet in AI Syncs Firebase-Storage-Mailbox
// (netlify/functions/briefing-put | -list | -get | -deliver) — auf dem
// Tablet gab es dafuer ueberhaupt keine Ansicht.
//
// ZWEITER BEFUND, per Playwright beim Testen DIESES Fixes entdeckt: die
// naheliegende Route "briefings" ist bereits vergeben. native-modules.js
// (Route "briefings") zeigt seit laengerem das Archiv vergangener Tage —
// Tagesziele, Notiz, Reflexion je Tag, reiner Text aus dem Datenstand,
// KEIN PDF. Waere dieses Modul ebenfalls auf "briefings" registriert
// worden, haette je nach Skriptreihenfolge in index.html eines der beiden
// Module das andere stumm verdraengt (moduleFor() nimmt das erste
// Array-Element mit passender Route — genau die Verwechslungsgefahr, vor
// der CLAUDE.md-Fallstrick 1 warnt, nur zwischen zwei Modulen statt
// zwischen Aufrufer und window-Funktion). Diese App bekommt deshalb die
// eigene Route "briefingpdf" — dieser Test verankert, dass beide Routen
// getrennt bleiben.
//
// Geprueft wird gegen die ausgelieferten Dateien: Modul-Registrierung,
// dass "briefings" (das Archiv) unberuehrt bleibt, Routen-Erkennung
// (ROUTE_TITLES/NATIVE_ROUTES leiten sich aus demselben FULL_APP_DEFS-
// Eintrag ab), Einbindung in Shell/Service-Worker, und dass mount() nicht
// denselben tot-if-Fehler traegt, der Sticky Boards und das Morgenbriefing
// schon einmal kaputt gemacht hat (siehe zustand-nach-navigation.test.cjs).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

let checks = 0;
const ok = (value, message) => { checks++; assert.ok(value, message); };

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const briefingpdf = read("public/briefingpdf-app.js");
const app = read("public/app.js");
const nativeModules = read("public/native-modules.js");
const springboard = read("public/springboard.js");
const expansion = read("public/quantus-tablet-expansion.js");
const html = read("public/index.html");
const sw = read("public/sw.js");
const pkg = read("package.json");

// ── Die neue Route bleibt getrennt von der bestehenden "briefings" ───────
ok(/routes:\s*Object\.keys\(VIEWS\)/.test(nativeModules) && /briefings:\s*renderBriefings/.test(nativeModules),
  "DER ZWEITE BEFUND: native-modules.js hat das Archiv vergangener Tage (Route \"briefings\") nicht mehr — das waere ein bestehendes Feature kaputt gemacht statt nur eine fehlende App ergaenzt");

// ── Die Datei ist gueltig und meldet sich als Modul fuer die eigene Route an ─
ok(!/route\s*!==\s*"briefingpdf"/.test(briefingpdf.replace(/window\.addEventListener\("hashchange"[\s\S]*?\}\);/, "")),
  "mount() darf nicht denselben tot-if-Fehler tragen wie Sticky Boards/Morgenbriefing (route ist beim Aufruf von mount() immer die eigene Route)");
ok(/addEventListener\("hashchange"/.test(briefingpdf), "kein hashchange-Listener — die Blob-URL des offenen PDFs wird nie freigegeben");
ok(/key:\s*"briefingpdf"/.test(briefingpdf) && /routes:\s*\["briefingpdf"\]/.test(briefingpdf),
  "das Modul meldet sich nicht fuer die eigene Route \"briefingpdf\" an");
ok(/data-nm-pdf=/.test(briefingpdf), "das PDF wird nicht ueber den vorhandenen QuantusPdfViewer angezeigt ([data-nm-pdf])");
ok(/briefing-list/.test(briefingpdf) && /briefing-get/.test(briefingpdf), "spricht nicht dieselben Endpunkte wie die Desktop-Mailbox an");
ok(!/Authorization/.test(briefingpdf), "sendet einen Auth-Header, den die Tablet-App gar nicht besitzt — googlecalendar-app.js verlangt keinen");

// ── Der App-Katalog bekommt einen eigenen Eintrag, nicht den bestehenden ──
ok(/key:\s*"briefings",\s*label:\s*"Briefings"/.test(app), "DER ZWEITE BEFUND: der bestehende Katalogeintrag fuer das Archiv (\"briefings\") wurde entfernt statt belassen");
ok(/key:\s*"briefingpdf",\s*label:\s*"Briefing-PDF"/.test(app), "kein eigener Katalogeintrag fuer die PDF-App in FULL_APP_DEFS");
ok(/"statistics",\s*"reports",\s*"sticky",\s*"briefingpdf"/.test(app),
  "briefingpdf fehlt in NATIVE_ROUTES — der App-Bildschirm meldet faelschlich \"keine eigene Tablet-Ansicht\"");
ok(!/"statistics",\s*"reports",\s*"sticky",\s*"briefings",/.test(app),
  "NATIVE_ROUTES enthaelt faelschlich \"briefings\" (das Archiv war nie dort — native-modules.js-Routen sind bewusst nicht einzeln gelistet)");
ok(/data-route="briefingpdf"/.test(app), "kein Shortcut zur Briefing-PDF-App auf dem Dashboard");

// ── Der eigentliche Homebildschirm (Springboard, eigenes Modul mit
//    routes:["home"] — renderHome() in app.js ist fuer "home" TOTER Code,
//    moduleFor() findet springboard.js zuerst) zeigt das Lerncockpit ganz
//    oben (quantus-tablet-expansion.js, injiziert vor den App-Seiten) —
//    auf Nutzerwunsch sitzt der Shortcut DORT, direkt neben BM Vorbereitung,
//    nicht (mehr) als Symbol auf der Werkzeuge-Seite ─────────────────────
ok(/key:\s*"springboard"[\s\S]{0,20}routes:\s*\["home"\]/.test(springboard),
  "Testannahme veraltet: springboard.js beansprucht \"home\" nicht mehr wie erwartet — renderHome() waere dann kein toter Code mehr und der Shortcut muesste anders platziert sein");
ok(/key:\s*"briefings",\s*label:\s*"Briefings"/.test(springboard),
  "das bestehende Symbol fuer das Archiv wurde versehentlich entfernt");
ok(/function briefingPdfCard\(\)/.test(expansion) && /"briefingpdf"/.test(expansion),
  "DER BEFUND: \"oben ins Lerncockpit\" — es gibt keine Briefing-PDF-Karte im Lerncockpit (quantus-tablet-expansion.js)");
ok(/bmCard\(\)\s*\+\s*briefingPdfCard\(\)/.test(expansion),
  "die Briefing-PDF-Karte steht nicht direkt neben BM Vorbereitung im Lerncockpit");

// ── Einbindung in Shell und Service Worker ────────────────────────────────
ok(/<script src="briefingpdf-app\.js">/.test(html), "briefingpdf-app.js ist nicht in index.html eingebunden");
ok(html.indexOf('<script src="briefingpdf-app.js">') < html.indexOf('<script src="app.js">'),
  "briefingpdf-app.js muss VOR app.js geladen werden, damit sich das Modul rechtzeitig anmeldet");
ok(/["']\/briefingpdf-app\.js["']/.test(sw), "briefingpdf-app.js fehlt im Service-Worker-Precache — Offline-Start liefert eine alte Version ohne die App");
ok(/node --check public\/briefingpdf-app\.js/.test(pkg), "briefingpdf-app.js wird nicht syntaktisch geprueft (npm run check)");

console.log(`briefing-pdf app (Morgen-PDF als eigene App, eigene Route): ok (${checks} Pruefungen)`);
