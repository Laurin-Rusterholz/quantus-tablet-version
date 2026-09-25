/*
 * Zwei Tablets delegieren dieselbe Aufgabe unabhaengig an ChatGPT — zwei
 * Leads statt einem, trotz task.delegatedLeadId. Review-Punkt (25.09.2026,
 * zusaetzlich zu ai-sync PR269, spiegelt dort chatgpt-task-delegation-lead-
 * race.test.mjs 1:1):
 * ---------------------------------------------------------------------------
 * delegateTask() legte einen neuen Lead bisher ueber addChatgptLead() OHNE
 * forcedId an — also mit Core.makeId("chatgptLead"), einer Zufalls-ID.
 * Delegieren zwei Tablets (oder ein Tablet und der Rechner) dieselbe, noch
 * nicht delegierte Aufgabe unabhaengig voneinander, bevor eines vom anderen
 * erfahren hat, erzeugt jedes Geraet einen eigenen Lead mit einer ANDEREN
 * Zufalls-ID und schreibt seine eigene auf task.delegatedLeadId. Der Merge
 * (Core.mergePayloads, newerItem je Entitaet) entscheidet nur, welche der
 * beiden delegatedLeadId-Schreibungen auf der Aufgabe gewinnt — der
 * VERLIERENDE Lead existiert als Entity trotzdem weiter: eine Karteileiche,
 * die keine Aufgabe mehr referenziert.
 *
 * Fix: dieselbe deterministische-ID-Formel wie bei ai-sync/mobile:
 * "chatgptLead_from_task_" + taskId statt Core.makeId(). Beide Geraete
 * berechnen unabhaengig dieselbe ID — Core.mergePayloads fuehrt die beiden
 * Fassungen des Leads unter dieser einen ID zu einem Datensatz zusammen
 * (newerItem, neuerer updatedAt gewinnt), statt zwei separate Eintraege zu
 * behalten.
 *
 * Der Test fuehrt die ECHTE chatgpt-app.js zweimal unabhaengig gegen zwei
 * eigene, minimale Bruecken aus (zwei "Geraete"), genau wie
 * chatgpt-modul.test.cjs es fuer ein einzelnes Geraet tut.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const Core = require(path.join(root, "public", "sync-core.js"));
const source = fs.readFileSync(path.join(root, "public", "chatgpt-app.js"), "utf8");

let checks = 0;
const luecken = [];
const ok = (bedingung, text) => { checks += 1; if (!bedingung) luecken.push(text); };

function esc(value) {
  return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Ein unabhaengiges "Geraet": eigener Datenstand, eigene Bruecke, aber die
// ECHTE chatgpt-app.js-Quelle — dasselbe Muster wie chatgpt-modul.test.cjs.
function geraet(taskId, taskTitle, jetzt) {
  let payload = Core.normalisePayload({
    entities: { tasks: { [taskId]: { id: taskId, createdAt: jetzt, updatedAt: jetzt, title: taskTitle, assignee: "user" } } },
  });
  const geschrieben = [];
  const bridge = {
    state: { payload },
    Core, esc, attr: esc,
    collection(name) {
      const map = (payload.entities && payload.entities[name]) || {};
      return Object.values(map).filter((item) => item && item.status !== "deleted" && !item.deletedAt);
    },
    itemTitle: (item, fallback) => (item && (item.title || item.name || item.subject)) || fallback || "Ohne Titel",
    formatDate: (value) => (value ? String(value).slice(0, 10) : ""),
    formatTime: (value) => (value ? String(value).slice(11, 16) : ""),
    viewHeader: () => "", emptyState: () => "", toast: () => {}, render: () => {},
    makeOperation: (kind, action, collectionName, id, patch) => ({
      operationId: Core.makeId("op"), kind, action: action || "update", collection: collectionName || undefined,
      id: id || Core.makeId(kind), patch: patch || {}, updatedAt: jetzt,
    }),
    executeOperation(operation) {
      geschrieben.push(operation);
      const result = Core.applyOperation(payload, operation);
      if (result.applied) { payload = result.payload; bridge.state.payload = payload; }
      return Promise.resolve(Boolean(result.applied));
    },
  };
  const fensterlos = { __quantusTablet: bridge, __quantusTabletModules: [] };
  const dokument = { addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ set innerHTML(v) {}, firstElementChild: null }) };
  new Function("window", "document", source)(fensterlos, dokument);
  return { CG: fensterlos.QuantusChatgpt, payload: () => payload, geschrieben };
}

// ── 1. Zwei unabhaengige Geraete delegieren dieselbe, noch nicht delegierte
//      Aufgabe — beides "unwissend" vom jeweils anderen ─────────────────────
(async () => {
  const taskId = "tk_geteilt_1";
  const titel = "Vertrag mit Firma X pruefen";
  const leadId = "chatgptLead_from_task_" + taskId; // exakt die Formel aus dem Fix

  const geraetA = geraet(taskId, titel, "2026-09-25T10:00:00.000Z");
  const geraetB = geraet(taskId, titel, "2026-09-25T10:00:05.000Z"); // 5s spaeter, genauso unwissend

  const erfolgA = await geraetA.CG.delegateTask(taskId);
  const erfolgB = await geraetB.CG.delegateTask(taskId);
  ok(erfolgA === true && erfolgB === true, "die Delegation auf einem der beiden Geraete schlug fehl");

  const leadIdA = geraetA.payload().entities.tasks[taskId].delegatedLeadId;
  const leadIdB = geraetB.payload().entities.tasks[taskId].delegatedLeadId;
  ok(leadIdA === leadId && leadIdB === leadId,
    `zwei unabhaengige Geraete berechnen fuer dieselbe delegierte Aufgabe verschiedene Lead-IDs — genau die gemeldete Karteileiche: ${JSON.stringify({ leadIdA, leadIdB, erwartet: leadId })}`);

  // ── 2. Der laengst vorhandene, generische Payload-Merge (Core.mergePayloads,
  //      newerItem je Entitaet) fasst beide Fassungen zu EINEM Lead zusammen ─
  const geraetALead = geraetA.payload().entities.chatgptLeads[leadIdA];
  const geraetBLead = geraetB.payload().entities.chatgptLeads[leadIdB];
  ok(Boolean(geraetALead) && Boolean(geraetBLead), "beide Geraete muessten unter der deterministischen ID je einen Lead fuehren");

  const gemergt = Core.mergePayloads(geraetA.payload(), geraetB.payload());
  const leadsNachMerge = Object.keys(gemergt.entities.chatgptLeads || {}).filter((id) => id === leadId);
  ok(leadsNachMerge.length === 1, `nach dem Zusammenfuehren existiert nicht genau EIN Lead fuer diese Aufgabe: ${JSON.stringify(Object.keys(gemergt.entities.chatgptLeads || {}))}`);
  ok(gemergt.entities.tasks[taskId].delegatedLeadId === leadId, "die zusammengefuehrte Aufgabe zeigt nicht auf die deterministische Lead-Id");
})().then(() => {
  // ── 3. Der echte Quelltext: deterministische Formel, kein unbedingtes
  //      Neuanlegen, forcedId wird tatsaechlich durchgereicht ────────────────
  const start = source.indexOf("function delegateTask(taskId) {");
  ok(start > 0, "delegateTask() wurde nicht gefunden");
  const ende = source.indexOf("\n  function attachDocument(", start);
  ok(ende > start, "Ende von delegateTask() nicht bestimmbar (naechste Funktion verschoben)");
  const src = source.slice(start, ende);
  ok(/var leadId = "chatgptLead_from_task_" \+ taskId;/.test(src),
    "delegateTask berechnet die Lead-ID nicht mehr deterministisch aus der taskId");
  ok(/leads\(\)\.filter\(function \(l\) \{ return l\.id === leadId; \}\)\[0\]/.test(src),
    "delegateTask prueft nicht, ob unter der deterministischen ID bereits ein Lead existiert — riskiert das Ueberschreiben echter Bearbeitung");
  ok(/addChatgptLead\([^;]*, leadId\)/.test(src),
    "addChatgptLead wird nicht mit der deterministischen leadId als forcedId aufgerufen — die Zufalls-ID-Luecke besteht fort");

  console.log(`chatgpt-task-delegation-lead-race (Tablet): ok (${checks} Pruefungen)`);
  if (luecken.length) { console.error("FEHLGESCHLAGEN:\n- " + luecken.join("\n- ")); process.exit(1); }
}).catch((err) => { console.error(err); process.exit(1); });
