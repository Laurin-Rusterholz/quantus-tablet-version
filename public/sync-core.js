(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.QuantusSyncCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ENTITY_TYPES = {
    tasks: "task",
    projects: "project",
    notes: "note",
    meetings: "meeting",
    calendarEvents: "event",
    persons: "person",
    concepts: "concept",
    ideas: "idea",
    strategies: "strategy",
    goals: "goal",
    decisions: "decision",
    organizations: "organization",
    programs: "program",
    articles: "article",
    protocols: "protocol",
    workflows: "workflow",
    theses: "thesis"
  };

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function parseTime(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const parsed = Date.parse(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function makeEmptyPayload() {
    return {
      entities: {
        tasks: {},
        projects: {},
        notes: {},
        meetings: {},
        calendarEvents: {},
        concepts: {},
        strategies: {},
        goals: {},
        programs: {},
        organizations: {},
        persons: {},
        ideas: {},
        decisions: {},
        articles: {},
        protocols: {},
        workflows: {},
        theses: {},
        transactions: {},
        accounts: {}
      },
      dailyBriefing: { routines: [], beliefs: [] },
      recallLabData: { decks: [], cards: [], reviewLogs: [] },
      meta: {}
    };
  }

  function normalisePayload(input) {
    const payload = isObject(input) ? clone(input) : makeEmptyPayload();
    if (!isObject(payload.entities)) payload.entities = {};
    ["tasks", "projects", "notes", "meetings", "calendarEvents", "concepts", "strategies", "goals", "programs", "organizations", "persons", "ideas", "decisions", "articles", "protocols", "workflows", "theses", "transactions", "accounts"]
      .forEach((key) => { if (!isObject(payload.entities[key])) payload.entities[key] = {}; });
    if (!isObject(payload.dailyBriefing)) payload.dailyBriefing = {};
    if (!Array.isArray(payload.dailyBriefing.routines)) payload.dailyBriefing.routines = [];
    if (!Array.isArray(payload.dailyBriefing.beliefs)) payload.dailyBriefing.beliefs = [];
    if (!isObject(payload.recallLabData)) payload.recallLabData = {};
    if (!Array.isArray(payload.recallLabData.cards)) payload.recallLabData.cards = [];
    if (!Array.isArray(payload.recallLabData.decks)) payload.recallLabData.decks = [];
    if (!Array.isArray(payload.recallLabData.reviewLogs)) payload.recallLabData.reviewLogs = [];
    if (!isObject(payload.meta)) payload.meta = {};
    return payload;
  }

  function parseWrapper(raw) {
    let wrapper = raw;
    if (typeof wrapper === "string") {
      try { wrapper = JSON.parse(wrapper); } catch (_) { wrapper = {}; }
    }
    if (!isObject(wrapper)) wrapper = {};

    let data = wrapper.data;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (_) { data = {}; }
    }
    if (!isObject(data)) {
      const looksLikePayload = isObject(wrapper.entities) || isObject(wrapper.dailyBriefing);
      data = looksLikePayload ? wrapper : {};
    }

    return { wrapper: clone(wrapper), payload: normalisePayload(data) };
  }

  function operationTime(operation) {
    return parseTime(operation.updatedAt || operation.ts || Date.now());
  }

  function currentTime(item) {
    return parseTime(item && (item.updatedAt || item.modifiedAt || item.createdAt));
  }

  function applyEntityOperation(payload, operation) {
    const collection = operation.collection;
    if (!collection || !operation.id) return { applied: false, reason: "invalid-entity-operation" };
    if (!isObject(payload.entities[collection])) payload.entities[collection] = {};

    const map = payload.entities[collection];
    const existing = isObject(map[operation.id]) ? map[operation.id] : null;
    const opTime = operationTime(operation);
    if (existing && currentTime(existing) > opTime) return { applied: false, reason: "newer-remote-version" };

    const base = existing ? clone(existing) : { id: operation.id, createdAt: operation.updatedAt };
    const patch = isObject(operation.patch) ? clone(operation.patch) : {};
    map[operation.id] = {
      ...base,
      ...patch,
      id: operation.id,
      updatedAt: operation.updatedAt
    };
    if (operation.action === "delete") {
      map[operation.id].status = "deleted";
      map[operation.id].deletedAt = operation.updatedAt;
    }
    return { applied: true, reason: "entity-updated" };
  }

  function applyHabitOperation(payload, operation) {
    if (!operation.id) return { applied: false, reason: "invalid-habit-operation" };
    const list = payload.dailyBriefing.routines;
    const index = list.findIndex((item) => item && item.id === operation.id);
    const existing = index >= 0 ? list[index] : null;
    if (existing && currentTime(existing) > operationTime(operation)) {
      return { applied: false, reason: "newer-remote-version" };
    }
    if (operation.action === "delete") {
      if (index >= 0) list.splice(index, 1);
      return { applied: true, reason: "habit-deleted" };
    }
    const item = {
      ...(existing || { id: operation.id, createdAt: operation.updatedAt }),
      ...(isObject(operation.patch) ? clone(operation.patch) : {}),
      id: operation.id,
      updatedAt: operation.updatedAt
    };
    if (index >= 0) list[index] = item;
    else list.push(item);
    return { applied: true, reason: "habit-updated" };
  }

  function applyFlashcardOperation(payload, operation) {
    if (!operation.id) return { applied: false, reason: "invalid-flashcard-operation" };
    const cards = payload.recallLabData.cards;
    const index = cards.findIndex((item) => item && item.id === operation.id);
    const existing = index >= 0 ? cards[index] : null;
    if (existing && currentTime(existing) > operationTime(operation)) {
      return { applied: false, reason: "newer-remote-version" };
    }
    if (operation.action === "delete") {
      if (index >= 0) cards.splice(index, 1);
      return { applied: true, reason: "flashcard-deleted" };
    }
    const item = {
      ...(existing || { id: operation.id, createdAt: Date.now(), srs: null }),
      ...(isObject(operation.patch) ? clone(operation.patch) : {}),
      id: operation.id,
      updatedAt: operation.updatedAt
    };
    if (index >= 0) cards[index] = item;
    else cards.push(item);
    return { applied: true, reason: "flashcard-updated" };
  }

  function applyOperation(input, operation) {
    const payload = normalisePayload(input);
    let result;
    if (!operation || !operation.kind) result = { applied: false, reason: "invalid-operation" };
    else if (operation.kind === "entity") result = applyEntityOperation(payload, operation);
    else if (operation.kind === "habit") result = applyHabitOperation(payload, operation);
    else if (operation.kind === "flashcard") result = applyFlashcardOperation(payload, operation);
    else result = { applied: false, reason: "unsupported-operation" };

    if (result.applied) {
      payload.meta.updatedAt = operation.updatedAt;
      payload.meta.lastTabletOperationId = operation.operationId || operation.id;
    }
    return { payload, ...result };
  }

  function buildWrapper(payload, deviceId, now) {
    const date = now || new Date().toISOString();
    return {
      data: JSON.stringify(normalisePayload(payload)),
      updatedAt: date,
      savedAt: Date.parse(date) || Date.now(),
      savedBy: deviceId || "quantus-tablet"
    };
  }

  function toInboxRecord(operation) {
    if (!operation) return null;
    const base = {
      ...(isObject(operation.patch) ? clone(operation.patch) : {}),
      id: operation.id,
      ts: operationTime(operation),
      updatedAt: operation.updatedAt,
      op: operation.action === "delete" ? "delete" : (operation.action === "create" ? "create" : "update"),
      source: "quantus-tablet"
    };
    if (operation.kind === "entity") {
      const type = ENTITY_TYPES[operation.collection];
      return type ? { type, record: base } : null;
    }
    if (operation.kind === "habit") return { type: "habit", record: base };
    return null;
  }

  function makeId(prefix) {
    const random = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    return `${prefix || "qt"}_${random}`;
  }

  return {
    ENTITY_TYPES,
    makeEmptyPayload,
    normalisePayload,
    parseWrapper,
    applyOperation,
    buildWrapper,
    toInboxRecord,
    makeId
  };
});
