/*
 * DIE ANMELDUNG MUSS AUCH IN DER INSTALLIERTEN TABLET-APP DURCHKOMMEN.
 *
 * BEFUND (gemessen, Chromium, echte index.html, Firebase-Oberflaeche
 * nachgebaut): signIn() rief ausschliesslich signInWithPopup. Kam von dort
 * ein Fehler, war Schluss — eine Meldung mit dem rohen Firebase-Text und
 * kein zweiter Weg:
 *
 *   Popup blockiert            → ["signInWithPopup"] → "Anmeldung fehlgeschlagen"
 *   Standalone nicht moeglich  → ["signInWithPopup"] → "Anmeldung fehlgeschlagen"
 *   Popup sofort geschlossen   → ["signInWithPopup"] → "Anmeldung fehlgeschlagen"
 *
 * Und beim Start wurde getRedirectResult NIE aufgerufen (gemessen: nur
 * ["setPersistence"]) — eine Anmeldung ueber Weiterleitung konnte also gar
 * nicht ankommen, selbst wenn sie jemand ausgeloest haette.
 *
 * Das trifft genau das Tablet: die App laeuft als installierte PWA
 * ("display": "standalone" im Manifest). Dort liefert window.open haeufig
 * kein nutzbares Fenster — dasselbe Muster, an dem schon die Lern-Apps
 * scheiterten. drive.html im Hauptprojekt geht deshalb laengst den Weg
 * "Popup versuchen, sonst Weiterleitung"; das Tablet macht es jetzt genauso.
 *
 * NACHHER (gleiche Messung):
 *   Start                      → ["setPersistence","getRedirectResult"]
 *   Popup blockiert            → ["signInWithPopup","signInWithRedirect"]
 *   Standalone nicht moeglich  → ["signInWithPopup","signInWithRedirect"]
 *   Domain nicht autorisiert   → ["signInWithPopup"] + klarer Text mit Code
 *   Popup bewusst geschlossen  → ["signInWithPopup"], keine Meldung
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const app = read("app.js");
const manifest = JSON.parse(read("manifest.webmanifest"));

let pruefungen = 0;
const luecken = [];
const ok = (b, t) => { pruefungen++; if (!b) luecken.push(t); };
const ohneKommentare = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
// Fehlt eine Funktion ganz, ist das selbst ein Befund — der Test soll dann
// alle Luecken aufzaehlen, nicht beim ersten Fund abbrechen.
const koerper = (start, ende) => {
  const a = app.indexOf(start);
  if (a < 0) { pruefungen++; luecken.push(`${start.trim()} gibt es nicht`); return ""; }
  return ohneKommentare(app.slice(a, app.indexOf(ende, a)));
};

// ── 0. Die Voraussetzung, aus der alles folgt ────────────────────────────
ok(manifest.display === "standalone",
  "das Manifest laeuft nicht mehr als installierte App — dann gilt die Begruendung hier nicht mehr");

// ── 1. Popup zuerst, Weiterleitung als Ausweg ────────────────────────────
{
  const k = koerper("  async function signIn() {", "\n  }");
  ok(/signInWithPopup/.test(k), "signIn versucht das Popup nicht mehr");
  ok(/signInWithRedirect/.test(k),
    "DER BEFUND: signIn kennt keine Weiterleitung — in der installierten App " +
    "gibt es damit ueberhaupt keinen Weg zur Anmeldung");
  ok(k.indexOf("signInWithPopup") < k.indexOf("signInWithRedirect"),
    "die Weiterleitung steht vor dem Popup — sie soll der Ausweg sein, nicht der Ersatz");
  for (const code of ["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"]) {
    ok(new RegExp(code.replace(/[/-]/g, "\\$&")).test(app),
      `der Fehlercode ${code} wird nicht behandelt — genau er kommt aus der installierten App`);
  }
  ok(/popup-closed-by-user/.test(k),
    "ein bewusst geschlossenes Popup wird nicht erkannt — eine Absage darf keine Weiterleitung ausloesen");
  ok(/cancelled-popup-request/.test(k),
    "auth/cancelled-popup-request wird nicht erkannt — ein doppelter Tipp loeste sonst eine Weiterleitung aus");
}

// ── 2. Die Rueckkehr aus der Weiterleitung wird abgeholt ─────────────────
{
  const k = koerper("  function initFirebase() {", "\n  }");
  ok(/getRedirectResult/.test(k),
    "DER BEFUND: getRedirectResult fehlt — eine Anmeldung ueber Weiterleitung " +
    "kommt nie an, die App startet einfach wieder abgemeldet");
  ok(k.indexOf("getRedirectResult") < k.indexOf("onAuthStateChanged"),
    "das Redirect-Ergebnis wird erst nach onAuthStateChanged abgeholt");
  ok(/meldeAuthFehler/.test(k),
    "ein Fehler auf dem Rueckweg (meist auth/unauthorized-domain) bleibt unsichtbar");
}

// ── 3. Der Fehlercode bleibt stehen, nicht nur als Einblendung ───────────
{
  ok(/authFehler:/.test(app), "es gibt kein Zustandsfeld fuer den letzten Anmeldefehler");
  const k = koerper("  function meldeAuthFehler(error) {", "\n  }");
  ok(/state\.authFehler = \{/.test(k), "meldeAuthFehler merkt sich den Fehler nicht");
  ok(/popup-closed-by-user/.test(k), "eine bewusste Absage wird als Fehler gemeldet");
  const banner = koerper("  function loginBanner() {", "\n  }");
  ok(/state\.authFehler/.test(banner),
    "das Anmeldebanner zeigt den Fehler nicht — nach einer Weiterleitung ist die " +
    "Einblendung laengst weg und niemand weiss, was schiefging");
  const blatt = koerper("  function openSyncSheet() {", "\n  }");
  ok(/state\.authFehler/.test(blatt), "das Synchronisationsblatt nennt den Anmeldefehler nicht");
  ok(/Konto/.test(blatt), "das Synchronisationsblatt zeigt nicht, mit welchem Konto man verbunden ist");
}

// ── 4. Jeder erklaerte Fehlercode hat einen Klartext ─────────────────────
{
  const k = koerper("  function authFehlerText(error) {", "\n  }");
  for (const code of ["auth/unauthorized-domain", "auth/network-request-failed", "auth/operation-not-allowed"]) {
    ok(k.includes(code), `fuer ${code} gibt es keinen verstaendlichen Text`);
  }
}

// ── 5. Der Schreibweg selbst: eine Transaktion auf den kanonischen Knoten ─
{
  const k = koerper("  function transactionOperation(operation) {", "\n  }");
  ok(/APP_STORE_PATH/.test(k), "die Transaktion laeuft nicht auf den kanonischen Knoten");
  ok(/ref\.transaction\(/.test(k), "es wird nicht transaktional geschrieben — paralleles Aendern ginge verloren");
  ok(!/polaris\/inbox/.test(k), "der Spiegel nach polaris/inbox ist zurueck (F-23)");
  const blatt = koerper("  function openSyncSheet() {", "\n  }");
  ok(!/Polaris-Inbox gespiegelt/.test(blatt),
    "das Synchronisationsblatt verspricht weiterhin den entfernten Polaris-Spiegel — " +
    "eine Erklaerung, die nicht mehr stimmt, laesst an der falschen Stelle suchen");
}

if (luecken.length) {
  console.error("anmeldung: " + luecken.length + " Luecke(n)");
  luecken.forEach((l) => console.error("  - " + l));
  process.exit(1);
}
console.log(`anmeldung & schreibweg: ok (${pruefungen} Pruefungen)`);
