const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "public");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
const serviceWorker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const workspace = fs.readFileSync(path.join(root, "tablet-workspace.js"), "utf8");
const springboard = fs.readFileSync(path.join(root, "springboard.js"), "utf8");
const mailApp = fs.readFileSync(path.join(root, "mail-app.js"), "utf8");
const flowertechApp = fs.readFileSync(path.join(root, "flowertech-app.js"), "utf8");
const nativeModules = fs.readFileSync(path.join(root, "native-modules.js"), "utf8");

for (const id of ["app", "main", "overlayRoot", "syncDot", "accountButton"]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
}
for (const file of ["styles.css", "tablet-workspace.css", "apps.css", "native-modules.css", "sync-core.js", "tablet-workspace.js", "springboard.js", "mail-app.js", "flowertech-app.js", "native-modules.js", "bm-app.js", "bm-app.css", "sticky-app.js", "sticky-app.css", "pdf-viewer.js", "pdf-viewer.css", "briefing-app.js", "briefing-app.css", "app.js", "icon.svg", "manifest.webmanifest"]) {
  assert.equal(fs.existsSync(path.join(root, file)), true, `missing ${file}`);
  assert.match(serviceWorker + html, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${file} is not referenced`);
}
assert.equal(manifest.name, "Quantus Tablet");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, "/");
assert.doesNotMatch(html + app, /ß/);
for (const route of ["tasks", "projects", "notes", "meetings", "concepts", "goals", "strategies", "programs", "organizations", "statistics", "reports", "decisions", "polaris"]) {
  assert.match(app, new RegExp(`fullRoute: ["']${route}["']`), `missing full AI Sync route ${route}`);
}
for (const page of ["drive.html", "docstudio.html", "nobraine.html", "bm.html"]) {
  assert.match(app, new RegExp(`fullPath: ["']${page.replace(".", "\\.")}["']`), `missing full AI Sync page ${page}`);
}

// The tablet never embeds the AI Sync app in an iframe. Every route renders a
// native tablet view.
assert.doesNotMatch(app, /full-app-frame|fullAppFrame|renderFullApp/, "AI Sync must not be embedded in an iframe anymore");
assert.doesNotMatch(html, /<iframe[^>]*full-app/, "index.html must not embed a full app iframe");
for (const fn of ["renderRoute", "renderCalendar", "renderCollectionView", "renderStatistics", "renderReports"]) {
  assert.match(app, new RegExp(`function ${fn}\\b`), `missing native renderer ${fn}`);
}

/*
 * JEDE APP HAT EINE EIGENE TABLET-ANSICHT.
 *
 * BEFUND: Module ohne eigene Ansicht landeten in renderModule() — einer
 * Kachel mit ein paar Kennzahlen und dem Knopf „Separat oeffnen". Auf dem
 * Tablet hiess das: diese App laesst sich hier gar nicht bedienen, sie
 * schickt einen in die Desktop-App. Betroffen waren unter anderem
 * Zeiterfassung, Auslastung, Wochenplanung, Wissensbasis, Thesis, Journal,
 * Reflecta, Nachrichten, Updates, Massnahmen, Drive, PDF, DocStudio,
 * Browser, Briefings, Quantus Projekt und Smarter.
 *
 * Diese Pruefung haelt fest, dass KEIN Eintrag des App-Katalogs mehr ohne
 * Ansicht dasteht: entweder rendert app.js die Route selbst, oder ein
 * Tablet-Modul beansprucht sie.
 */
const moduleRoutes = new Set();
for (const source of [nativeModules, springboard, mailApp, flowertechApp, workspace]) {
  const block = source.match(/routes:\s*\[([^\]]*)\]/);
  if (block) block[1].split(",").forEach((entry) => {
    const key = entry.trim().replace(/^["']|["']$/g, "");
    if (key) moduleRoutes.add(key);
  });
}
// native-modules.js meldet seine Routen aus VIEWS an, nicht als Literal.
for (const key of nativeModules.matchAll(/^\s{4}(\w+):\s*render\w+,?$/gm)) moduleRoutes.add(key[1]);
const appKeys = [...app.matchAll(/\{ key: "([\w]+)",/g)].map((match) => match[1]);
const nativeRoutesBlock = app.slice(app.indexOf("const NATIVE_ROUTES"), app.indexOf("const state = {"));
const collectionKeys = [...app.matchAll(/^\s{4}(\w+): \{ label:/gm)].map((match) => match[1]);
const routerKeys = [...app.matchAll(/route === "(\w+)"/g)].map((match) => match[1]);
const missing = appKeys.filter((key) =>
  !moduleRoutes.has(key) &&
  !collectionKeys.includes(key) &&
  !routerKeys.includes(key) &&
  !new RegExp(`"${key}"`).test(nativeRoutesBlock));
assert.deepEqual(missing, [], `diese Apps haben keine eigene Tablet-Ansicht: ${missing.join(", ")}`);

// Und der App-Bildschirm darf keine App mehr als „Separat" auszeichnen.
assert.doesNotMatch(app, /Separat<\/small>|>Separat</, "keine App darf noch als \"Separat\" markiert sein");
assert.match(app, /function isNativeRoute\b/, "app.js muss selbst pruefen, welche Route nativ ist");

// Die nativen Ansichten muessen echte Bereiche des Datenstands lesen.
for (const view of ["renderTime", "renderWorkload", "renderWeekplan", "renderKnowledge", "renderThesis",
  "renderJournal", "renderReflecta", "renderMessages", "renderUpdates", "renderMeasures", "renderDrive",
  "renderPdf", "renderDocStudio", "renderBrowser", "renderBriefings", "renderQuantusProject", "renderSmarter",
  "renderGoogleCalendar"]) {
  assert.match(nativeModules, new RegExp(`function ${view}\\b`), `native-modules.js fehlt ${view}`);
}
/*
 * DER SCHREIBWEG.
 *
 * Hier stand zuerst "native-modules.js darf das Wort db.ref nicht enthalten".
 * Das war zu grob und haette eine richtige Aenderung blockiert: Smarter liegt
 * gar nicht im Quantus-Datenstand, sondern in einem eigenen RTDB-Knoten
 * (smarter/documents), in den AI Sync selbst direkt schreibt. Fuer diesen
 * Bestand IST der direkte Weg der einzige — ihn zu verbieten hiesse, die
 * eigenen Antworten nicht speichern zu koennen.
 *
 * Die Regel, um die es wirklich geht, lautet: der QUANTUS-DATENSTAND wird
 * ausschliesslich ueber die gemeinsame Transaktion veraendert, und
 * polaris/inbox bleibt unberuehrt. Genau das wird jetzt geprueft.
 */
assert.match(nativeModules, /a\.executeOperation\(a\.makeOperation\(/, "native Ansichten muessen ueber executeOperation schreiben");
assert.doesNotMatch(nativeModules, /polaris\/inbox/, "das Tablet schreibt nicht in den n8n-Eingang");
// Kein direkter Griff an den App-Blob — der laeuft nur ueber die Transaktion.
assert.doesNotMatch(nativeModules, /app-data|appStore/, "der Quantus-Datenstand darf nur ueber die Transaktion geschrieben werden");
// Und wo direkt geschrieben wird, dann nur in die dafuer vorgesehenen Knoten.
for (const treffer of nativeModules.matchAll(/\.ref\((["'`])([^"'`]*)\1/g)) {
  assert.ok(/^(smarter\/documents)/.test(treffer[2]),
    `native-modules.js schreibt direkt nach "${treffer[2]}" — erlaubt ist nur der Smarter-Knoten`);
}
// Dasselbe fuer den Lern-Hub: Leseplan und BM haben eigene RTDB-Knoten.
const expansion = fs.readFileSync(path.join(root, "quantus-tablet-expansion.js"), "utf8");
assert.doesNotMatch(expansion, /polaris\/inbox/, "der Lern-Hub schreibt nicht in den n8n-Eingang");
assert.doesNotMatch(expansion, /app-data|appStore/, "der Lern-Hub fasst den Quantus-Datenstand nicht direkt an");

// „Nachrichten" ist scheduledMessages, nicht der Gmail-Posteingang.
assert.doesNotMatch(mailApp, /routes:\s*\[[^\]]*"messages"/, "die Mail-App darf die Route messages nicht mehr belegen");
assert.match(nativeModules, /messages: renderMessages/, "Nachrichten an mich brauchen eine eigene native Ansicht");
// Enhanced handwriting: marker/highlighter mode and colour presets.
assert.match(workspace, /highlighter/, "missing highlighter/marker handwriting mode");
assert.match(workspace, /INK_COLORS/, "missing handwriting colour presets");
// Native collection routes must be reachable through the router, not an iframe.
for (const route of ["tasks", "projects", "notes", "meetings", "goals", "strategies", "organizations", "decisions"]) {
  assert.match(app, new RegExp(`${route}: \\{ label:`), `missing native collection config for ${route}`);
}
for (const feature of ["handwriting", "stickyBoard", "externalLinks", "linkedProjects", "uploadFiles", "attachDrive"]) {
  assert.match(workspace, new RegExp(feature), `missing tablet workspace feature ${feature}`);
}
assert.match(html, /firebase-storage-compat\.js/, "missing Firebase Storage SDK");
assert.match(html, /data-action="workspace"/, "missing global workspace launcher");

// Eigenstaendige Tablet-Programme: Homebildschirm, Mail und FlowerTech.
for (const source of [springboard, mailApp, flowertechApp]) {
  assert.match(source, /__quantusTabletModules/, "tablet modules must register themselves");
}
assert.match(app, /tabletModules\(\)/, "app.js must dispatch to the tablet modules");
assert.match(springboard, /sb-dock/, "springboard needs a dock");
assert.match(springboard, /sb-grid/, "springboard needs an icon grid");
assert.match(mailApp, /gmail-api/, "mail must use the existing Quantus gmail proxy");
for (const feature of ["mail-reply", "mail-forward", "mail-archive", "mail-trash", "mail-compose"]) {
  assert.match(mailApp, new RegExp(feature), `mail is missing ${feature}`);
}

/*
 * ABWESENHEITSANTWORT (VacationSettings).
 *
 * Gmail verwaltet den automatischen Abwesenheits-Responder serverseitig
 * ueber /users/me/settings/vacation (GET zum Laden, PUT zum Speichern). Die
 * Tablet-Mail-App muss dieselbe Route wie AI Sync ansprechen, ein PUT darf
 * ausschliesslich nach einer sichtbaren Bestaetigung erfolgen (kein PUT ohne
 * Nutzerklick), und Deaktivieren muss denselben Weg nutzen wie Aktivieren.
 */
assert.match(mailApp, /"GET", "\/users\/me\/settings\/vacation"/, "mail must load the existing VacationSettings via GET");
assert.match(mailApp, /"PUT", "\/users\/me\/settings\/vacation"/, "mail must save VacationSettings via PUT");
assert.match(mailApp, /data-form="mail-vacation"/, "mail needs a vacation settings form");
assert.match(mailApp, /mail-vacation/, "mail is missing the mail-vacation action");
assert.match(mailApp, /Automatische Abwesenheitsantwort wirklich aktivieren/, "activating must show a visible confirmation");
assert.match(mailApp, /responseBodyPlainText/, "vacation payload must carry a plain-text response body");
assert.match(mailApp, /enableAutoReply: active/, "deactivating must reuse the same save path as activating");
assert.doesNotMatch(mailApp, /rpc\("PUT",\s*"\/users\/me\/settings\/vacation"[\s\S]{0,400}confirm\(/,
  "a PUT must never be issued before the confirm() dialog — confirm has to come first");

assert.match(flowertechApp, /flowertech-doc/, "FlowerTech needs its document form");
assert.match(html, /data-route="mail"/, "mail must be reachable from the dock");

// Speicher- und Produktivitaets-Verbesserungen muessen verdrahtet bleiben.
const syncCore = fs.readFileSync(path.join(root, "sync-core.js"), "utf8");
for (const fn of ["compactQueue", "mergePayloads", "isValidOperation", "payloadStats", "estimateSize"]) {
  assert.match(syncCore, new RegExp(`function ${fn}\\b`), `sync-core is missing ${fn}`);
}
for (const feature of ["hydrateFromSnapshot", "saveSnapshot", "exportBackup", "importBackupFile", "undoToast", "quick-add", "status-filter", "sort-collection", "pin-entity", "duplicate-entity", "PENDING_MAX_OPS"]) {
  assert.match(app, new RegExp(feature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `app.js is missing storage/productivity feature ${feature}`);
}
assert.match(app, /Core\.compactQueue/, "pending queue must be compacted through sync-core");
assert.match(serviceWorker, /staleWhileRevalidate|stale-while-revalidate/i, "service worker should serve static assets cache-first with background refresh");
assert.match(serviceWorker, /networkFirst/, "service worker should keep navigations network-first with cache fallback");
// Programmdateien duerfen nie aus einem alten Zwischenspeicher kommen und nie
// durch die HTML-Startseite ersetzt werden – sonst reagiert auf dem Tablet
// keine Bedienung mehr.
assert.match(serviceWorker, /CODE_ASSET[\s\S]*networkFirst\(request\)/, "scripts and styles must be loaded network-first");
assert.match(serviceWorker, /shellFallback/, "only navigations may fall back to index.html");

// Bedienbarkeit auf dem Tablet: Kopfzeile, Inhalt und Dock teilen sich die
// Hoehe. Nichts liegt fest ueber dem scrollenden Inhalt, sonst lassen sich
// Knoepfe darunter nicht mehr antippen.
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const appsCss = fs.readFileSync(path.join(root, "apps.css"), "utf8");
assert.match(styles, /\.app-shell \{[^}]*display:flex[^}]*flex-direction:column/, "app shell must be a column layout");
assert.match(styles, /\.main \{[^}]*overflow-y:auto/, "the main area must be the scroll container");
assert.doesNotMatch(styles, /\.topbar \{[^}]*position:fixed/, "the topbar must not float above the content");
assert.doesNotMatch(styles, /\.dock \{[^}]*position:fixed/, "the dock must not float above the content");
assert.doesNotMatch(appsCss, /\.sb-dock \{[^}]*position: fixed/, "the springboard dock must not cover the app icons");
assert.doesNotMatch(appsCss, /\.sb-dots \{[^}]*position: fixed/, "the page dots must not cover the app icons");
assert.match(appsCss, /\.sb-footer/, "springboard dots and dock belong in a footer in the flow");
assert.match(springboard, /sb-footer/, "springboard must render its footer");
/*
 * Frueher stand hier eine Schwelle fuer den langen Druck (LONG_PRESS_MS).
 * GEMESSEN (Chromium, echte Zeigerereignisse): ein Tipp ab 760 ms oeffnete die
 * App NICHT mehr — er galt als langer Druck, legte das Symbol ins Dock, loeste
 * ein Neuzeichnen aus und sperrte den folgenden Klick weitere 700 ms.
 *     80 ms ✓   300 ms ✓   600 ms ✓   760 ms ✗   900 ms ✗   1100 ms ✗
 * Ein bewusster Fingertipp auf einem Tablet dauert leicht so lang; eine
 * versteckte Geste verschluckte damit die Hauptfunktion des Bildschirms.
 *
 * Die Schwelle hochzusetzen haette das nur verschoben. Die Regel lautet jetzt:
 * EIN TIPP OEFFNET IMMER. Umgeraeumt wird das Dock in einem sichtbaren Modus.
 */
assert.doesNotMatch(springboard, /LONG_PRESS_MS/,
  "der lange Druck ist zurueck — er verschluckt wieder den normalen Tipp");
assert.doesNotMatch(springboard, /lastLongPress/,
  "onAction sperrt wieder Klicks nach einem langen Druck");
/*
 * DAS ANORDNEN BRAUCHT ZEIGER-EREIGNISSE — ABER NUR IM MODUS.
 *
 * Frueher stand hier "springboard.js darf das Wort pointerdown nicht
 * enthalten". Das war die richtige Antwort auf den damaligen Fehler, aber es
 * ist zu grob: der Homebildschirm laesst sich jetzt anordnen, und Ziehen
 * geht nun einmal nicht ohne Zeiger-Ereignisse.
 *
 * Die Regel dahinter bleibt aber wortgleich bestehen: AUSSERHALB DES
 * ANORDNEN-MODUS DARF KEIN ZEIGER-HANDLER AUF DEN SYMBOLEN LIEGEN. Deshalb
 * wird jetzt geprueft, was wirklich zaehlt —
 *   1. die Handler werden ausschliesslich in startDragging() angemeldet,
 *   2. startDragging() laeuft nur, wenn der Modus eingeschaltet wird,
 *   3. stopDragging() meldet jeden davon wieder ab,
 *   4. und der Modus wird beim Verlassen des Homebildschirms fallengelassen.
 * Faellt eines davon weg, ist der alte Fehler unter neuem Namen zurueck.
 */
assert.match(springboard, /function startDragging\(\) \{[\s\S]*?addEventListener\("pointerdown"/,
  "die Zeiger-Handler haengen nicht mehr an startDragging");
assert.match(springboard, /if \(on\) startDragging\(\); else stopDragging\(\);/,
  "die Zeiger-Handler sind nicht mehr an den Anordnen-Modus gekoppelt");
for (const event of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
  assert.match(springboard, new RegExp(`function stopDragging\\(\\)[\\s\\S]*?removeEventListener\\("${event}"`),
    `stopDragging meldet ${event} nicht wieder ab — der Handler wirkt weiter`);
}
assert.match(springboard, /if \(route !== "home"\) \{[\s\S]*?stopDragging\(\);/,
  "beim Verlassen des Homebildschirms bleibt der Anordnen-Modus stehen");
// Ein einziger Zeiger-Handler ausserhalb von startDragging waere genau der
// alte Fehler. addEventListener fuer Zeiger darf es nur dort geben.
{
  const pointerBindings = [...springboard.matchAll(/addEventListener\("pointer\w+"/g)].length;
  const insideStart = (springboard.match(/function startDragging\(\)[\s\S]*?\n  \}/) || [""])[0];
  assert.equal(pointerBindings, [...insideStart.matchAll(/addEventListener\("pointer\w+"/g)].length,
    "es haengt ein Zeiger-Handler ausserhalb des Anordnen-Modus");
}
assert.match(springboard, /if \(!arrangeMode\) return false;/,
  "ausserhalb des Anordnen-Modus darf onAction gar nichts abfangen");
assert.match(springboard, /data-action="sb-arrange"/,
  "es fehlt der sichtbare Schalter fuer das Anordnen");

/*
 * ANORDNEN: VERSCHIEBEN UND DOCK.
 *
 * Die Anordnung liegt in einem eigenen Speicher (v2) und haelt Seiten UND
 * Dock. Ohne normaliseLayout() waere eine neu dazugekommene App auf dem
 * Homebildschirm unsichtbar — man merkt das erst, wenn man sie sucht.
 */
assert.match(springboard, /LAYOUT_KEY/, "die Anordnung wird nicht gespeichert");
for (const fn of ["defaultLayout", "loadLayout", "normaliseLayout", "saveLayout", "place", "pluck", "resetLayout"]) {
  assert.match(springboard, new RegExp(`function ${fn}\\b`), `springboard.js fehlt ${fn}`);
}
assert.match(springboard, /data-action="sb-reset"/, "es fehlt der Knopf zum Zuruecksetzen");
assert.match(springboard, /sb-drop-end/, "es fehlt die Ablageflaeche am Seitenende und im Dock");
// Aufheben und ablegen muss ohne Ziehen funktionieren — mit Finger, Stift und
// Maus gleichermassen. Sonst braucht das Anordnen eine ruhige Hand.
assert.match(springboard, /aufgehoben = key;/, "ein Tipp hebt kein Symbol auf");
assert.match(springboard, /function swallowNextClick\b/,
  "nach einem Zug folgt ein Klick, der das Symbol sofort wieder aufheben wuerde");
// Der App-Bildschirm startet das Anordnen von aussen.
assert.match(springboard, /QuantusTabletSpringboard/, "der Homebildschirm meldet keine Schnittstelle an");
assert.match(app, /startArrange/, "der App-Bildschirm kann das Anordnen nicht starten");
// Und das Morgenbriefing steht auf dem Homebildschirm. app.js hat dafuer einen
// Hero, aber springboard.js ueberschreibt renderHome() — er lief dort nie.
assert.match(springboard, /function briefingBlock/,
  "auf dem Homebildschirm fehlt das Morgenbriefing");
assert.match(springboard, /briefingModell/,
  "der Homebildschirm rechnet den Tag selbst statt das gemeinsame Modell zu lesen");
assert.match(springboard, /briefingBlock\(\) \+/,
  "der Briefingblock wird nicht gerendert");
assert.match(app, /briefingModell, isHabitDoneOn/,
  "die Bruecke reicht das Briefingmodell nicht an die Module durch");
// Externe Seiten muessen sich auch ohne zweites Fenster oeffnen lassen.
assert.match(app, /function openWindow\b/, "external links need a popup blocker fallback");
assert.match(app, /location\.assign\(url\)/, "blocked popups must open in the same window");
assert.ok(manifest.shortcuts.length >= 5, "manifest should expose launcher shortcuts");

console.log("structure: shell, full AI Sync app catalog, manifest and local assets passed");
