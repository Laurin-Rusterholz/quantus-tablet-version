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

console.log("sync-core: 8 tests passed");
