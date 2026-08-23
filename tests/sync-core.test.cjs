const assert = require("node:assert/strict");
const core = require("../public/sync-core.js");

function op(overrides = {}) {
  return {
    operationId: "op-1",
    kind: "entity",
    action: "update",
    collection: "tasks",
    id: "task-1",
    updatedAt: "2026-07-20T10:00:00.000Z",
    patch: { title: "Tablet-Aufgabe", status: "open" },
    ...overrides
  };
}

{
  const parsed = core.parseWrapper({
    data: JSON.stringify({ entities: { tasks: { old: { id: "old", title: "Bleibt" } } } }),
    savedBy: "desktop"
  });
  assert.equal(parsed.payload.entities.tasks.old.title, "Bleibt");
  assert.deepEqual(parsed.payload.dailyBriefing.routines, []);
}

{
  const payload = core.makeEmptyPayload();
  payload.entities.projects.keep = { id: "keep", title: "Unberührt" };
  const result = core.applyOperation(payload, op());
  assert.equal(result.applied, true);
  assert.equal(result.payload.entities.tasks["task-1"].title, "Tablet-Aufgabe");
  assert.equal(result.payload.entities.projects.keep.title, "Unberührt");
}

{
  const payload = core.makeEmptyPayload();
  payload.entities.tasks["task-1"] = {
    id: "task-1",
    title: "Neuere Desktop-Version",
    updatedAt: "2026-07-20T12:00:00.000Z"
  };
  const result = core.applyOperation(payload, op());
  assert.equal(result.applied, false);
  assert.equal(result.payload.entities.tasks["task-1"].title, "Neuere Desktop-Version");
}

// meta.lastSavedBy ist der Fremdgeraete-Marker fuer AI Sync. Fehlt er, haelt
// der Desktop einen Tablet-Schreibvorgang fuer seinen eigenen und ueberschreibt
// ihn beim naechsten Speichern.
{
  const payload = core.makeEmptyPayload();
  payload.meta.lastSavedBy = "dev_abc123_xyz";
  const result = core.applyOperation(payload, op());
  assert.equal(result.applied, true);
  assert.equal(result.payload.meta.lastSavedBy, "tablet-app");
  const abgelehnt = core.applyOperation(result.payload, op({ updatedAt: "2026-07-20T09:00:00.000Z" }));
  assert.equal(abgelehnt.applied, false);
  assert.equal(abgelehnt.payload.meta.lastSavedBy, "tablet-app");
}

{
  const payload = core.makeEmptyPayload();
  payload.entities.notes.n1 = { id: "n1", title: "Notiz", updatedAt: "2026-07-20T08:00:00.000Z" };
  const result = core.applyOperation(payload, op({ collection: "notes", id: "n1", action: "delete" }));
  assert.equal(result.payload.entities.notes.n1.status, "deleted");
  assert.ok(result.payload.entities.notes.n1.deletedAt);
}

{
  const payload = core.makeEmptyPayload();
  const result = core.applyOperation(payload, op({
    kind: "habit",
    collection: undefined,
    id: "habit-1",
    patch: { name: "Lesen", completedDates: ["2026-07-20"] }
  }));
  assert.equal(result.payload.dailyBriefing.routines[0].name, "Lesen");
}

{
  const payload = core.makeEmptyPayload();
  const result = core.applyOperation(payload, op({
    kind: "flashcard",
    collection: undefined,
    id: "card-1",
    patch: { deckId: "deck_general", front: "liberté", back: "Freiheit" }
  }));
  assert.equal(result.payload.recallLabData.cards[0].back, "Freiheit");
}

{
  const inbox = core.toInboxRecord(op({ collection: "meetings", id: "m1" }));
  assert.equal(inbox.type, "meeting");
  assert.equal(inbox.record.source, "quantus-tablet");
}

{
  const wrapper = core.buildWrapper(core.makeEmptyPayload(), "tablet-test", "2026-07-20T10:00:00.000Z");
  assert.equal(wrapper.savedBy, "tablet-test");
  assert.equal(JSON.parse(wrapper.data).entities.tasks.constructor, Object);
}

{
  const payload = core.makeEmptyPayload();
  payload.entities.projects.p1 = { id: "p1", title: "Tablet", updatedAt: "2026-07-20T08:00:00.000Z" };
  const stickyBoard = {
    notes: [{ id: "s1", x: 40, y: 60, w: 220, h: 160, text: "Idee", color: "#ffe082" }],
    connections: [], drawings: [], view: { x: 0, y: 0, zoom: 1 }
  };
  const handwriting = { version: 1, strokes: [{ id: "stroke-1", color: "#243c34", width: 4, points: [{ x: .1, y: .2 }] }] };
  const result = core.applyOperation(payload, op({ collection: "projects", id: "p1", patch: { stickyBoard, handwriting, linkedNotes: ["n1"] } }));
  assert.equal(result.payload.entities.projects.p1.stickyBoard.notes[0].text, "Idee");
  assert.equal(result.payload.entities.projects.p1.handwriting.strokes.length, 1);
  assert.deepEqual(result.payload.entities.projects.p1.linkedNotes, ["n1"]);
}

{
  const payload = core.makeEmptyPayload();
  const result = core.applyOperation(payload, op({ collection: "organizations", id: "o1", patch: { name: "Organisation", files: [{ id: "f1", storagePath: "attachments/organization/o1/test.pdf" }] } }));
  assert.equal(result.payload.entities.organizations.o1.files[0].id, "f1");
  assert.equal(core.toInboxRecord(op({ collection: "organizations", id: "o1" })).type, "organization");
}

// ── Speicher-Verbesserungen: Validierung, Warteschlangen-Verdichtung,
// Backup-Merge und Speicher-Kennzahlen ──

{
  assert.equal(core.isValidOperation(op()), true);
  assert.equal(core.isValidOperation(null), false);
  assert.equal(core.isValidOperation(op({ id: "" })), false);
  assert.equal(core.isValidOperation(op({ kind: "unknown" })), false);
  assert.equal(core.isValidOperation(op({ collection: undefined })), false);
  assert.equal(core.isValidOperation(op({ kind: "habit", collection: undefined })), true);
  assert.equal(core.isValidOperation(op({ patch: "kaputt" })), false);
}

{
  // Drei Updates auf derselben Aufgabe schrumpfen zu einer Operation mit
  // zusammengefuehrtem Patch und dem juengsten Zeitstempel.
  const queue = [
    op({ operationId: "a", updatedAt: "2026-07-20T10:00:00.000Z", patch: { title: "Erster Titel" } }),
    op({ operationId: "b", updatedAt: "2026-07-20T11:00:00.000Z", patch: { status: "in_progress" } }),
    op({ operationId: "c", updatedAt: "2026-07-20T12:00:00.000Z", patch: { title: "Finaler Titel" } }),
    op({ operationId: "d", id: "task-2", updatedAt: "2026-07-20T09:00:00.000Z", patch: { title: "Andere Aufgabe" } }),
    { kaputt: true }
  ];
  const compacted = core.compactQueue(queue);
  assert.equal(compacted.length, 2);
  const merged = compacted.find((item) => item.id === "task-1");
  assert.equal(merged.patch.title, "Finaler Titel");
  assert.equal(merged.patch.status, "in_progress");
  assert.equal(merged.updatedAt, "2026-07-20T12:00:00.000Z");
  assert.equal(compacted[0].id, "task-2");
}

{
  // Create + Updates bleiben ein Create; ein Delete ersetzt alles Vorherige.
  const created = core.compactQueue([
    op({ operationId: "a", action: "create", updatedAt: "2026-07-20T10:00:00.000Z", patch: { title: "Neu" } }),
    op({ operationId: "b", action: "update", updatedAt: "2026-07-20T11:00:00.000Z", patch: { status: "done" } })
  ]);
  assert.equal(created.length, 1);
  assert.equal(created[0].action, "create");
  assert.equal(created[0].patch.status, "done");
  const deleted = core.compactQueue([
    op({ operationId: "a", action: "create", updatedAt: "2026-07-20T10:00:00.000Z" }),
    op({ operationId: "b", action: "delete", updatedAt: "2026-07-20T11:00:00.000Z", patch: {} })
  ]);
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].action, "delete");
}

{
  // Backup-Merge: pro Element gewinnt die neuere Version, nichts geht verloren.
  const local = core.makeEmptyPayload();
  local.entities.tasks.t1 = { id: "t1", title: "Lokal neuer", updatedAt: "2026-07-21T10:00:00.000Z" };
  local.entities.notes.n1 = { id: "n1", title: "Nur lokal", updatedAt: "2026-07-20T10:00:00.000Z" };
  local.dailyBriefing.routines.push({ id: "h1", name: "Lesen", updatedAt: "2026-07-20T10:00:00.000Z" });
  const backup = core.makeEmptyPayload();
  backup.entities.tasks.t1 = { id: "t1", title: "Backup aelter", updatedAt: "2026-07-19T10:00:00.000Z" };
  backup.entities.tasks.t2 = { id: "t2", title: "Nur im Backup", updatedAt: "2026-07-18T10:00:00.000Z" };
  backup.recallLabData.cards.push({ id: "c1", front: "A", back: "B", updatedAt: "2026-07-18T10:00:00.000Z" });
  const merged = core.mergePayloads(local, backup);
  assert.equal(merged.entities.tasks.t1.title, "Lokal neuer");
  assert.equal(merged.entities.tasks.t2.title, "Nur im Backup");
  assert.equal(merged.entities.notes.n1.title, "Nur lokal");
  assert.equal(merged.dailyBriefing.routines.length, 1);
  assert.equal(merged.recallLabData.cards.length, 1);
}

{
  const payload = core.makeEmptyPayload();
  payload.entities.tasks.t1 = { id: "t1", title: "Aktiv" };
  payload.entities.tasks.t2 = { id: "t2", title: "Weg", status: "deleted" };
  payload.recallLabData.cards.push({ id: "c1" });
  const stats = core.payloadStats(payload);
  assert.equal(stats.totalEntities, 1);
  assert.equal(stats.perCollection.tasks, 1);
  assert.equal(stats.cards, 1);
  assert.ok(stats.bytes > 100);
  assert.ok(core.estimateSize("äöü") >= 6);
}

// FlowerTech: Offerten und Rechnungen werden ueber dieselbe Transaktion
// gespeichert wie alle anderen Tablet-Aenderungen.
{
  const payload = core.makeEmptyPayload();
  const doc = {
    id: "off-1", kind: "offer", number: "OF-2026-0001", status: "draft",
    items: [{ id: "p1", description: "Website", qty: 1, unit: "Pauschal", price: 4800 }],
    vatRate: 8.1
  };
  const result = core.applyOperation(payload, op({
    kind: "flowertech", collection: "offers", id: "off-1", action: "create",
    patch: { doc, counterKey: "offer_2026", counterValue: 1 }
  }));
  assert.equal(result.applied, true);
  assert.equal(result.payload.flowertech.offers.length, 1);
  assert.equal(result.payload.flowertech.offers[0].number, "OF-2026-0001");
  assert.equal(result.payload.flowertech.counters.offer_2026, 1);

  const removed = core.applyOperation(result.payload, op({
    kind: "flowertech", collection: "offers", id: "off-1", action: "delete",
    updatedAt: "2026-07-21T10:00:00.000Z", patch: {}
  }));
  assert.equal(removed.applied, true);
  assert.equal(removed.payload.flowertech.offers.length, 0);

  assert.equal(core.isValidOperation(op({ kind: "flowertech", collection: "offers", id: "x" })), true);
  assert.equal(core.isValidOperation(op({ kind: "flowertech", collection: "unknown", id: "x" })), false);
}

// Backups fuehren FlowerTech-Dokumente feldweise zusammen.
{
  const local = core.makeEmptyPayload();
  local.flowertech.invoices.push({ id: "inv-1", number: "RE-2026-0001", updatedAt: "2026-07-20T08:00:00.000Z" });
  local.flowertech.counters.invoice_2026 = 1;
  const backup = core.makeEmptyPayload();
  backup.flowertech.invoices.push({ id: "inv-2", number: "RE-2026-0002", updatedAt: "2026-07-20T09:00:00.000Z" });
  backup.flowertech.counters.invoice_2026 = 2;
  const merged = core.mergePayloads(local, backup);
  assert.equal(merged.flowertech.invoices.length, 2);
  assert.equal(merged.flowertech.counters.invoice_2026, 2);
}

console.log("sync-core: 18 tests passed");
