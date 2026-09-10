// Produktionsbefund (Review PR #12, P1-3 und P2-7):
//
// Das Tablet kannte payload._deleteLog nicht — das Format, ueber das der
// Desktop seine HARTEN Loeschungen schuetzt (ai-sync: logDeletion/
// flattenDeleteLog, delete map[id]). Folge 1: ein Offline-Replay legte eine
// desktop-geloeschte Notiz aus einer aelteren Update-Op einfach neu an
// (Wiederauferstehung). Folge 2: Tablet-Loeschungen hinterliessen nur
// Soft-Flags, die _deleteLog-basierte Desktop-Pfade (z. B. der
// ReadingHub-Buecherfilter) nicht sehen. Dazu Review P3/D2: ein Update, das
// NEUER als ein Soft-Delete war, liess die deleted-Flags der Basis stehen.
//
// Dieser Test faehrt alle Richtungen gegen das echte sync-core-Modul.
const assert = require("node:assert/strict");
const Sync = require("../public/sync-core.js");

let checks = 0;
const ok = (value, message) => { checks++; assert.ok(value, message); };
const eq = (actual, expected, message) => { checks++; assert.deepEqual(actual, expected, message); };

const t = (iso) => Date.parse(iso);
const op = (action, id, patch, updatedAt, extra = {}) => ({
  kind: "entity", action, collection: "notes", id,
  patch, updatedAt, operationId: "op-" + id + "-" + updatedAt, ...extra,
});

// ── 1) Wiederauferstehung: Grabstein ist juenger als die Offline-Op ──
{
  const payload = { entities: { notes: {} }, _deleteLog: { note: { n1: t("2026-08-30T10:00:00Z") } }, meta: {} };
  const r = Sync.applyOperation(payload, op("update", "n1", { content: "offline edit" }, "2026-08-30T09:30:00Z"));
  eq(r.applied, false, "aeltere Op gegen juengeren Grabstein muss abgewiesen werden");
  eq(r.reason, "tombstoned");
  ok(!r.payload.entities.notes.n1, "die geloeschte Notiz darf nicht neu entstehen");
}

// ── 2) Loeschen schreibt Grabstein UND Soft-Flags ──
{
  const payload = { entities: { notes: { n2: { id: "n2", content: "x", updatedAt: "2026-08-30T09:00:00Z" } } }, meta: {} };
  const r = Sync.applyOperation(payload, op("delete", "n2", {}, "2026-08-30T10:00:00Z"));
  eq(r.applied, true);
  const note = r.payload.entities.notes.n2;
  ok(note.deleted === true && note.status === "deleted" && note.deletedAt === "2026-08-30T10:00:00Z", "Soft-Flags fuer alte Clients bleiben");
  eq(r.payload._deleteLog.note.n2, t("2026-08-30T10:00:00Z"), "der Grabstein liegt im Desktop-Format (Bucket 'note', ms)");
}

// ── 3) Neuere Wiederherstellung (Undo) reaktiviert und raeumt den Grabstein ──
{
  let payload = { entities: { notes: { n3: { id: "n3", content: "x", updatedAt: "2026-08-30T09:00:00Z" } } }, meta: {} };
  payload = Sync.applyOperation(payload, op("delete", "n3", {}, "2026-08-30T10:00:00Z")).payload;
  const r = Sync.applyOperation(payload, op("update", "n3", { content: "restored" }, "2026-08-30T11:00:00Z"));
  eq(r.applied, true, "die neuere Wiederherstellung gewinnt gegen den Grabstein");
  const note = r.payload.entities.notes.n3;
  ok(!note.deleted && note.status !== "deleted" && !note.deletedAt, "die Soft-Flags sind geraeumt (Delete-vs-Update ueber Zeitstempel)");
  ok(!r.payload._deleteLog || !r.payload._deleteLog.note || r.payload._deleteLog.note.n3 == null, "der Grabstein ist geraeumt");
}

// ── 4) Update NEUER als Soft-Delete reaktiviert auch ohne Grabstein (D2) ──
{
  const payload = { entities: { notes: { n4: { id: "n4", content: "x", deleted: true, status: "deleted", deletedAt: "2026-08-30T09:00:00Z", updatedAt: "2026-08-30T09:00:00Z" } } }, meta: {} };
  const r = Sync.applyOperation(payload, op("update", "n4", { content: "wieder da" }, "2026-08-30T10:00:00Z"));
  eq(r.applied, true);
  const note = r.payload.entities.notes.n4;
  ok(!note.deleted && note.status !== "deleted" && !note.deletedAt, "das neuere Update reaktiviert die soft-geloeschte Notiz");
  eq(note.content, "wieder da");
}

// ── 5) Aeltere Op gegen Soft-Delete bleibt abgewiesen ──
{
  const payload = { entities: { notes: { n5: { id: "n5", content: "x", deleted: true, status: "deleted", deletedAt: "2026-08-30T10:00:00Z", updatedAt: "2026-08-30T10:00:00Z" } } }, meta: {} };
  const r = Sync.applyOperation(payload, op("update", "n5", { content: "zu spaet" }, "2026-08-30T09:30:00Z"));
  eq(r.applied, false, "die aeltere Op darf die juengere Loeschung nicht aufheben");
  ok(r.payload.entities.notes.n5.deleted === true, "die Notiz bleibt geloescht");
}

// ── 6) Batch-Delete (Idea-Aggregat) traegt die Grabsteine in den Payload ──
{
  const payload = { entities: { notes: { a: { id: "a", updatedAt: "2026-08-30T09:00:00Z" } }, ideas: { i: { id: "i", updatedAt: "2026-08-30T09:00:00Z" } } }, meta: {} };
  const batch = {
    kind: "entity-batch", action: "batch", operationId: "batch-1", id: "batch-1",
    updatedAt: "2026-08-30T10:00:00Z",
    patch: { operations: [
      { collection: "notes", id: "a", action: "delete", patch: {} },
      { collection: "ideas", id: "i", action: "delete", patch: {} },
    ] },
  };
  const r = Sync.applyOperation(payload, batch);
  eq(r.applied, true);
  eq(r.payload._deleteLog.note.a, t("2026-08-30T10:00:00Z"), "Note-Grabstein aus dem Batch");
  eq(r.payload._deleteLog.idea.i, t("2026-08-30T10:00:00Z"), "Idea-Grabstein aus dem Batch");
}

// ── 8) Habits: dieselbe Regel wie fuer Entitaeten ───────────────────────
//
// Befund (10.09.2026): Habits liegen nicht in `entities`, sondern in
// dailyBriefing.routines. applyHabitOperation kannte die Grabsteine nicht —
// ein Abhaken auf dem Tablet legte einen auf dem Desktop geloeschten Habit in
// der Server-Transaktion WIEDER AN, und ein Loeschen hier hinterliess keinen
// Grabstein. Es werden dabei keine Habit-Inhalte erzeugt oder veraendert;
// geprueft wird nur, welche Operation gilt.
const habitOp = (action, id, patch, updatedAt) => ({
  kind: "habit", action, id, patch, updatedAt, operationId: "hop-" + id + "-" + updatedAt,
});
const habitStand = (routines, log) => ({
  entities: {}, dailyBriefing: { routines }, meta: {},
  ...(log ? { _deleteLog: log } : {}),
});

// 8a) Abhaken nach der Loeschung legt den Habit nicht neu an
{
  const payload = habitStand([], { routine: { rt_1: t("2026-09-10T10:00:00Z") } });
  const r = Sync.applyOperation(payload, habitOp("update", "rt_1", { completions: [{ date: "2026-09-10", value: 1 }] }, "2026-09-10T09:30:00Z"));
  eq(r.applied, false, "das Abhaken einer geloeschten Routine muss abgewiesen werden");
  eq(r.reason, "tombstoned");
  eq(r.payload.dailyBriefing.routines.length, 0, "die geloeschte Routine darf nicht neu entstehen");
}

// 8b) Loeschen auf dem Tablet hinterlaesst einen Grabstein im gemeinsamen Format
{
  const payload = habitStand([{ id: "rt_2", text: "Routine", createdAt: "2026-01-05T08:00:00Z" }]);
  const r = Sync.applyOperation(payload, habitOp("delete", "rt_2", {}, "2026-09-10T10:00:00Z"));
  eq(r.applied, true, "das Loeschen einer Routine wird abgewiesen");
  eq(r.payload.dailyBriefing.routines.length, 0, "die Routine steht weiterhin in der Liste");
  eq(r.payload._deleteLog.routine.rt_2, t("2026-09-10T10:00:00Z"),
    "ohne Grabstein bleibt die Loeschung auf diesem Geraet — der Desktop holt sie zurueck");
}

// 8c) Eine NACH der Loeschung bewusst bearbeitete Routine gewinnt
{
  const payload = habitStand([], { routine: { rt_3: t("2026-09-10T10:00:00Z") } });
  const r = Sync.applyOperation(payload, habitOp("update", "rt_3", { text: "Wieder aufgenommen" }, "2026-09-10T11:00:00Z"));
  eq(r.applied, true, "eine spaetere bewusste Aenderung muss gelten");
  eq(r.payload.dailyBriefing.routines.length, 1, "die wieder aufgenommene Routine fehlt");
  ok(!r.payload._deleteLog || !r.payload._deleteLog.routine || !r.payload._deleteLog.routine.rt_3,
    "der ueberholte Grabstein bleibt liegen");
}

// ── 9) Backup einspielen holt nichts Geloeschtes zurueck ────────────────
{
  const lokal = habitStand([{ id: "rt_bleibt", text: "Bleibt", createdAt: "2026-01-05T08:00:00Z" }],
    { routine: { rt_weg: t("2026-09-10T10:00:00Z") } });
  const backup = habitStand([
    { id: "rt_weg", text: "Vor der Loeschung gesichert", createdAt: "2026-01-05T08:00:00Z" },
    { id: "rt_bleibt", text: "Bleibt", createdAt: "2026-01-05T08:00:00Z" },
  ]);
  const m = Sync.mergePayloads(lokal, backup);
  eq(m.dailyBriefing.routines.map((r) => r.id).sort().join(","), "rt_bleibt",
    "das Einspielen eines Backups holt die geloeschte Routine zurueck");
}

// ── 10) Aus blossem Fehlen wird KEINE Loeschabsicht ─────────────────────
//
// Der wichtigste Schutz in die andere Richtung: Ein Habit, den nur eine Seite
// kennt, ist nicht geloescht — er ist nur dort noch nicht angekommen. Ohne
// Grabstein bleibt er, in beide Richtungen. Das gilt auch fuer alles, was VOR
// der Grabstein-Einfuehrung geloescht wurde: Diese Loeschungen sind nirgends
// vermerkt, also bleibt der Habit stehen, bis ihn jemand bewusst erneut
// loescht. Nichts verschwindet auf Verdacht.
{
  const nurLokal = habitStand([{ id: "rt_a", text: "Nur hier", createdAt: "2026-01-05T08:00:00Z" }]);
  const nurBackup = habitStand([{ id: "rt_b", text: "Nur dort", createdAt: "2026-01-05T08:00:00Z" }]);
  const m1 = Sync.mergePayloads(nurLokal, nurBackup);
  eq(m1.dailyBriefing.routines.map((r) => r.id).sort().join(","), "rt_a,rt_b",
    "ein nur einseitig bekannter Habit wird als geloescht behandelt");
  const m2 = Sync.mergePayloads(nurBackup, nurLokal);
  eq(m2.dailyBriefing.routines.map((r) => r.id).sort().join(","), "rt_a,rt_b",
    "die Richtung des Zusammenfuehrens veraendert das Ergebnis");

  // Und ein Eintrag OHNE Zeitstempel bleibt ebenfalls stehen: ohne
  // Vergleichsmass wird nicht geloescht.
  const ohneZeit = habitStand([{ id: "rt_c", text: "Ohne Zeitstempel" }],
    { routine: { rt_c: t("2026-09-10T10:00:00Z") } });
  const m3 = Sync.mergePayloads(ohneZeit, habitStand([{ id: "rt_c", text: "Ohne Zeitstempel" }]));
  eq(m3.dailyBriefing.routines.length, 1,
    "ein Eintrag ohne Zeitstempel wird auf Verdacht entfernt");
}

console.log(`tombstones: ok (${checks} Pruefungen)`);
