/*
 * Das Tablet schrieb nach jeder kanonischen Transaktion zusaetzlich einen
 * Spiegelsatz nach polaris/inbox/<typ>/<id> (mirrorOperation). Gedacht war das
 * als doppeltes Netz gegen eine aeltere Desktop-Speicherung; die AI-Sync-App
 * behandelt polaris/inbox aber als EIGENSTAENDIGE Quelle (n8n-/Voice-Eingang)
 * und legte aus dem Spiegelsatz eine zweite Notiz an — die doppelte
 * London-Notiz (F-23).
 *
 * Zwei Aufrufstellen waren betroffen: executeOperation (direkter Weg) und
 * flushPending (Warteschlange). Keine der beiden prueft, ob die Transaktion
 * die Operation ueberhaupt ANGEWENDET hat: transactionOperation gibt nur
 * { committed, snapshot } zurueck und wirft das applied-Flag weg. Lehnt der
 * Updater eine veraltete Operation ab, gibt er den unveraenderten Stand
 * zurueck — also einen Wert, kein undefined —, die Transaktion committet, und
 * der Spiegel feuerte trotzdem. Ein bereits verworfener Stand trug so ueber
 * die Inbox doch noch ins Modell.
 *
 * Dieser Test fuehrt die ECHTEN Funktionen aus public/app.js gegen eine
 * Firebase-Attrappe aus, die JEDEN Schreibzugriff mitschreibt.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.dirname(__dirname);
const appSrc = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
const coreSrc = fs.readFileSync(path.join(root, "public/sync-core.js"), "utf8");
const Core = require("../public/sync-core.js");
let checks = 0;
const ok = (bedingung, text) => { assert.ok(bedingung, text); checks++; };

// ── Die vier Funktionen des Schreibwegs aus app.js herausschneiden ────────
function schnipsel(name, kopf) {
  const a = appSrc.indexOf(kopf);
  ok(a > 0, `die Funktion ${name} wurde in public/app.js nicht gefunden`);
  const b = appSrc.indexOf("\n  }\n", a) + 4;
  return appSrc.slice(a, b);
}
// Optional: auf dem Vorgaengerstand existiert mirrorOperation noch. Ohne sie im
// Ausschnitt wuerde executeOperation dort an einem ReferenceError scheitern —
// der Test fiele durch, aber aus dem falschen Grund und ohne den Spiegel zu
// zeigen. Mit ihr laeuft der alte Code echt und schreibt wirklich nach
// polaris/inbox. Im aktuellen Stand liefert das schlicht nichts.
function schnipselOptional(kopf) {
  const a = appSrc.indexOf(kopf);
  if (a < 0) return "";
  return appSrc.slice(a, appSrc.indexOf("\n  }\n", a) + 4);
}
const WEG = [
  schnipselOptional("  async function mirrorOperation(operation) {"),
  schnipsel("queueOperation", "  function queueOperation(operation) {"),
  schnipsel("executeOperation", "  async function executeOperation(operation, options) {"),
  schnipsel("transactionOperation", "  function transactionOperation(operation) {"),
  // Neu seit der Konfliktablage (Review P2-7): executeOperation haelt
  // abgewiesene Fassungen fest, statt sie still zu verwerfen.
  schnipsel("recordConflict", "  function recordConflict(operation, reason) {"),
  schnipsel("flushPending", "  async function flushPending() {"),
].join("\n");

// ── Firebase-Attrappe: schreibt jeden Zugriff mit ─────────────────────────
function firebase({ ablehnen = false, fehlerBis = 0 } = {}) {
  const schreibzugriffe = [];   // { pfad, art }
  let knoten = null;            // der kanonische Wrapper
  let versuche = 0;
  const db = {
    ref(pfad) {
      return {
        // der einzige legitime Weg
        transaction(updater, cb) {
          versuche++;
          schreibzugriffe.push({ pfad, art: "transaction" });
          if (versuche <= fehlerBis) { setTimeout(() => cb(new Error("netzfehler"), false, null), 0); return; }
          const neu = updater(knoten);
          if (neu === undefined) { setTimeout(() => cb(null, false, null), 0); return; }
          knoten = neu;
          setTimeout(() => cb(null, true, { val: () => knoten }), 0);
        },
        // jeder Direktschreibvorgang — hier landete frueher der Spiegel
        set(wert) { schreibzugriffe.push({ pfad, art: "set", wert }); return Promise.resolve(); },
        update(wert) { schreibzugriffe.push({ pfad, art: "update", wert }); return Promise.resolve(); },
      };
    },
  };
  return {
    db, schreibzugriffe,
    get knoten() { return knoten; },
    inboxSchreibzugriffe: () => schreibzugriffe.filter((z) => String(z.pfad).startsWith("polaris/inbox")),
  };
}

function harness(fb, { pending = [], online = true, user = { uid: "u1" } } = {}) {
  const state = {
    payload: Core.makeEmptyPayload(), pending, user, deviceId: "tablet-test",
    syncStatus: "idle", lastSync: null,
  };
  const protokoll = { toasts: [], sync: [], gespeichert: [] };
  const api = new Function(
    "state", "db", "Core", "navigator", "LOCAL_KEYS", "PENDING_MAX_OPS", "APP_STORE_PATH",
    "scheduleRender", "queueSave", "saveJson", "loadJson", "setSync", "toast",
    WEG + "\nreturn { executeOperation, flushPending, queueOperation };")(
    state, fb.db, Core, { onLine: online }, { pending: "qt-pending", conflicts: "qt-conflicts" }, 500, "appStore/app-data_json",
    () => {}, () => {},
    (schluessel, wert) => protokoll.gespeichert.push([schluessel, (wert || []).length]),
    () => [],
    (status, text) => { state.syncStatus = status; protokoll.sync.push(status); },
    (...a) => protokoll.toasts.push(a));
  return { api, state, protokoll };
}

const operation = (ueberschreiben = {}) => ({
  operationId: "op-" + (ueberschreiben.id || "1"),
  kind: "entity", action: "update", collection: "notes", id: "note-1",
  updatedAt: "2026-08-23T20:00:00.000Z", patch: { title: "London" },
  ...ueberschreiben,
});

(async () => {

// ── 1. Direkter Weg: Notiz-Update = genau EIN Schreibzugriff ─────────────
{
  const fb = firebase();
  const h = harness(fb);
  const erfolg = await h.api.executeOperation(operation());

  ok(erfolg === true, "die Operation wurde nicht als erfolgreich gemeldet");
  ok(fb.schreibzugriffe.length === 1,
    `es gab ${fb.schreibzugriffe.length} Schreibzugriffe statt genau einem: ` +
    fb.schreibzugriffe.map((z) => z.art + " " + z.pfad).join(", "));
  ok(fb.schreibzugriffe[0].art === "transaction" && fb.schreibzugriffe[0].pfad === "appStore/app-data_json",
    "der einzige Schreibzugriff ging nicht als Transaktion auf den kanonischen Knoten");
  ok(fb.inboxSchreibzugriffe().length === 0,
    `es entstand ein polaris/inbox-Schreibzugriff: ${JSON.stringify(fb.inboxSchreibzugriffe())}`);
  ok(JSON.parse(fb.knoten.data).entities.notes["note-1"].title === "London",
    "die Aenderung kam im kanonischen Knoten nicht an");
  ok(JSON.parse(fb.knoten.data).meta.lastSavedBy === "tablet-app",
    "der Fremdgeraete-Marker aus F-03 fehlt");
}

// ── 2. create / update / delete: keiner spiegelt ─────────────────────────
for (const aktion of ["create", "update", "delete"]) {
  const fb = firebase();
  const h = harness(fb);
  await h.api.executeOperation(operation({ action: aktion, id: "note-" + aktion }));
  ok(fb.inboxSchreibzugriffe().length === 0, `action "${aktion}" schrieb nach polaris/inbox`);
  ok(fb.schreibzugriffe.every((z) => z.art === "transaction"),
    `action "${aktion}" erzeugte einen Direktschreibvorgang statt nur der Transaktion`);
}

// ── 3. Abgelehnte Operation (veralteter Stand) spiegelt erst recht nicht ──
// Frueher der gefaehrlichste Fall: der Updater gibt den unveraenderten Stand
// zurueck, die Transaktion committet, und der Spiegel trug den bereits
// verworfenen Stand ueber die Inbox doch noch ins Modell.
{
  const fb = firebase();
  const h = harness(fb);
  await h.api.executeOperation(operation({ updatedAt: "2026-08-23T22:00:00.000Z", patch: { title: "Neu" } }));
  const vorher = fb.knoten.data;
  await h.api.executeOperation(operation({
    operationId: "op-alt", updatedAt: "2026-08-23T18:00:00.000Z", patch: { title: "Veraltet" },
  }));
  ok(fb.inboxSchreibzugriffe().length === 0,
    "eine als veraltet abgelehnte Operation schrieb nach polaris/inbox");
  ok(JSON.parse(fb.knoten.data).entities.notes["note-1"].title === "Neu",
    "der veraltete Stand hat den neueren im kanonischen Knoten verdraengt");
  ok(vorher === fb.knoten.data || JSON.parse(fb.knoten.data).entities.notes["note-1"].title === "Neu",
    "der kanonische Knoten wurde durch die abgelehnte Operation veraendert");
}

// ── 4. Warteschlangenweg: offline vormerken, dann flushPending ───────────
{
  const fb = firebase();
  const h = harness(fb, { online: false });
  const erfolg = await h.api.executeOperation(operation({ id: "note-offline" }));
  ok(erfolg === false, "offline wurde die Operation nicht vorgemerkt");
  ok(fb.schreibzugriffe.length === 0, "offline entstand ein Schreibzugriff");
  ok(h.state.pending.length === 1, "die Operation liegt nicht in der Warteschlange");

  const fb2 = firebase();
  const h2 = harness(fb2, { pending: h.state.pending.slice() });
  await h2.api.flushPending();
  ok(fb2.inboxSchreibzugriffe().length === 0,
    `flushPending schrieb nach polaris/inbox: ${JSON.stringify(fb2.inboxSchreibzugriffe())}`);
  ok(fb2.schreibzugriffe.length === 1 && fb2.schreibzugriffe[0].art === "transaction",
    `flushPending erzeugte ${fb2.schreibzugriffe.length} Schreibzugriffe statt genau einer Transaktion`);
  ok(h2.state.pending.length === 0, "die Warteschlange wurde nach dem Abgleich nicht geleert");
}

// ── 5. Wiederholung nach Netzfehler: weiterhin kein Spiegel ──────────────
{
  const fb = firebase({ fehlerBis: 1 });
  const h = harness(fb);
  const erster = await h.api.executeOperation(operation({ id: "note-retry" }));
  ok(erster === false, "ein Netzfehler wurde nicht als Fehlschlag gemeldet");
  ok(h.state.pending.length === 1, "nach dem Netzfehler liegt nichts in der Warteschlange");
  ok(fb.inboxSchreibzugriffe().length === 0, "der Fehlerpfad schrieb nach polaris/inbox");

  await h.api.flushPending();
  ok(h.state.pending.length === 0, "die Wiederholung hat die Warteschlange nicht geleert");
  ok(fb.inboxSchreibzugriffe().length === 0, "die Wiederholung schrieb nach polaris/inbox");
  ok(fb.schreibzugriffe.every((z) => z.art === "transaction"),
    "die Wiederholung erzeugte einen Direktschreibvorgang");
}

// ── 6. Quelltextregeln: der Spiegel ist restlos entfernt ─────────────────
{
  ok(!/mirrorOperation/.test(appSrc.replace(/^\s*\/\/.*$/gm, "")),
    "mirrorOperation kommt in public/app.js noch als Code vor");
  ok(!/db\.ref\(`polaris\/inbox/.test(appSrc) && !/\.ref\(["'`]polaris\/inbox/.test(appSrc),
    "public/app.js schreibt weiterhin nach polaris/inbox");
  ok(!/toInboxRecord/.test(appSrc), "app.js ruft toInboxRecord noch auf");
  ok(!/toInboxRecord/.test(coreSrc), "sync-core.js definiert oder exportiert toInboxRecord noch");
  ok(Core.toInboxRecord === undefined, "Core.toInboxRecord ist weiterhin exportiert");
  ok(Core.ENTITY_TYPES === undefined,
    "ENTITY_TYPES ist weiterhin exportiert, obwohl es nur toInboxRecord diente");
  // die legitimen Wege bleiben
  ok(typeof Core.applyOperation === "function" && typeof Core.buildWrapper === "function",
    "der kanonische Schreibweg wurde beschaedigt");
  ok(/ref\.transaction\(/.test(appSrc), "der Transaktionsweg fehlt in app.js");
}

console.log(`no-inbox-mirror: ok (${checks} Pruefungen)`);
})().catch((e) => { console.error(e); process.exit(1); });
