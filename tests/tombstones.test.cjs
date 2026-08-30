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

console.log(`tombstones: ok (${checks} Pruefungen)`);
