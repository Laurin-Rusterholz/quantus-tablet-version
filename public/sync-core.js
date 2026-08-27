(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.QuantusSyncCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function clone(value) {
    if (value == null) return value;
    if (typeof structuredClone === "function") {
      try { return structuredClone(value); } catch (_) {}
    }
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
      flowertech: { offers: [], invoices: [], finances: [], notes: [], links: [], counters: {}, company: {} },
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
    // Das Daily Briefing schreibt in drei weitere Aeste: die Tagesnotiz, die
    // Tagesziele und die Gedanken. Sie liegen dort, wo die Hauptapp sie auch
    // sucht — dailyBriefing.dailyLog, dailyGoals und journal.topics.
    if (!isObject(payload.dailyBriefing.dailyLog)) payload.dailyBriefing.dailyLog = {};
    if (!isObject(payload.dailyGoals)) payload.dailyGoals = {};
    if (!isObject(payload.journal)) payload.journal = {};
    if (!Array.isArray(payload.journal.topics)) payload.journal.topics = [];
    if (!isObject(payload.recallLabData)) payload.recallLabData = {};
    if (!Array.isArray(payload.recallLabData.cards)) payload.recallLabData.cards = [];
    if (!Array.isArray(payload.recallLabData.decks)) payload.recallLabData.decks = [];
    if (!Array.isArray(payload.recallLabData.reviewLogs)) payload.recallLabData.reviewLogs = [];
    if (!isObject(payload.meta)) payload.meta = {};
    // FlowerTech liegt ausserhalb von entities (gleiche Struktur wie in AI Sync):
    // Offerten und Rechnungen sind Dokumentlisten mit Positionen.
    if (!isObject(payload.flowertech)) payload.flowertech = {};
    ["offers", "invoices", "finances", "notes", "links"].forEach((key) => {
      if (!Array.isArray(payload.flowertech[key])) payload.flowertech[key] = [];
    });
    if (!isObject(payload.flowertech.counters)) payload.flowertech.counters = {};
    if (!isObject(payload.flowertech.company)) payload.flowertech.company = {};
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

  /*
   * BRIEFING-OPERATIONEN.
   *
   * Das Tablet zeigte das Daily Briefing bisher nur an. Mit der Vollfassung
   * kommen drei schreibende Teile dazu: Tagesziel, Gedanke, Tagesnotiz. Fuer
   * sie gab es keine Operationsart — ein Formular haette stumm nichts getan.
   *
   * Geschrieben wird EXAKT dorthin, wo die Hauptapp liest. Ein eigener
   * Ablageort waere ein zweiter Datenstand, den niemand mehr zusammenfuehrt.
   */
  function applyBriefingOperation(payload, operation) {
    const patch = isObject(operation.patch) ? operation.patch : {};
    const tag = String(patch.date || "").slice(0, 10);
    const was = operation.action;

    if (was === "note") {
      if (!tag) return { applied: false, reason: "briefing-note-without-date" };
      const log = payload.dailyBriefing.dailyLog;
      if (!isObject(log[tag])) log[tag] = { routineChecks: {}, notes: "" };
      log[tag].notes = String(patch.notes || "");
      return { applied: true, reason: "briefing-note-updated" };
    }

    if (was === "goal-add" || was === "goal-toggle" || was === "goal-delete") {
      if (!tag) return { applied: false, reason: "briefing-goal-without-date" };
      if (!Array.isArray(payload.dailyGoals[tag])) payload.dailyGoals[tag] = [];
      const liste = payload.dailyGoals[tag];
      if (was === "goal-add") {
        liste.push({ id: operation.id, title: String(patch.title || ""), completed: false, createdAt: operation.updatedAt });
        return { applied: true, reason: "briefing-goal-added" };
      }
      const i = liste.findIndex((g) => g && g.id === operation.id);
      if (i < 0) return { applied: false, reason: "briefing-goal-missing" };
      if (was === "goal-toggle") { liste[i].completed = !liste[i].completed; return { applied: true, reason: "briefing-goal-toggled" }; }
      liste.splice(i, 1);
      return { applied: true, reason: "briefing-goal-deleted" };
    }

    if (was === "thought-add") {
      payload.journal.topics.push({ id: operation.id, text: String(patch.text || ""), createdAt: operation.updatedAt });
      return { applied: true, reason: "briefing-thought-added" };
    }
    if (was === "thought-delete") {
      const i = payload.journal.topics.findIndex((t) => t && t.id === operation.id);
      if (i < 0) return { applied: false, reason: "briefing-thought-missing" };
      payload.journal.topics.splice(i, 1);
      return { applied: true, reason: "briefing-thought-deleted" };
    }
    return { applied: false, reason: "unsupported-briefing-action" };
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

  // FlowerTech-Dokumente (Offerten/Rechnungen). Die Operation traegt das
  // vollstaendige Dokument in patch.doc; laufende Nummern werden mitgezaehlt.
  function applyFlowerTechOperation(payload, operation) {
    const listName = operation.collection === "invoices" ? "invoices" : "offers";
    const list = payload.flowertech[listName];
    const index = list.findIndex((item) => item && item.id === operation.id);
    const existing = index >= 0 ? list[index] : null;
    if (existing && currentTime(existing) > operationTime(operation)) {
      return { applied: false, reason: "newer-remote-version" };
    }
    if (operation.action === "delete") {
      if (index >= 0) list.splice(index, 1);
      return { applied: true, reason: "flowertech-deleted" };
    }
    const patch = isObject(operation.patch) ? operation.patch : {};
    const doc = isObject(patch.doc) ? clone(patch.doc) : {};
    const merged = { ...(existing || {}), ...doc, id: operation.id, updatedAt: operation.updatedAt };
    if (index >= 0) list[index] = merged;
    else list.unshift(merged);
    if (patch.counterKey) {
      const current = Number(payload.flowertech.counters[patch.counterKey]) || 0;
      payload.flowertech.counters[patch.counterKey] = Math.max(current, Number(patch.counterValue) || 0);
    }
    return { applied: true, reason: "flowertech-updated" };
  }

  function applyOperation(input, operation) {
    const payload = normalisePayload(input);
    let result;
    if (!operation || !operation.kind) result = { applied: false, reason: "invalid-operation" };
    else if (operation.kind === "entity") result = applyEntityOperation(payload, operation);
    else if (operation.kind === "habit") result = applyHabitOperation(payload, operation);
    else if (operation.kind === "briefing") result = applyBriefingOperation(payload, operation);
    else if (operation.kind === "flashcard") result = applyFlashcardOperation(payload, operation);
    else if (operation.kind === "flowertech") result = applyFlowerTechOperation(payload, operation);
    else result = { applied: false, reason: "unsupported-operation" };

    if (result.applied) {
      payload.meta.updatedAt = operation.updatedAt;
      payload.meta.lastTabletOperationId = operation.operationId || operation.id;
      // meta.lastSavedBy ist der einzige Fremdgeraete-Marker, den AI Sync
      // auswertet (ai-sync public/index.html:10744/10751 und 6774-6776).
      // savedBy im Wrapper reicht dafuer nicht: der Desktop liest das Feld
      // aus dem Datenstand, nicht aus der Huelle. Ohne eigenen Wert blieb
      // dort die Geraete-Id des Desktops stehen, er hielt den Stand fuer
      // selbst geschrieben und uebersprang den Schutz-Merge.
      payload.meta.lastSavedBy = "tablet-app";
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

  function makeId(prefix) {
    const random = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    return `${prefix || "qt"}_${random}`;
  }

  function isValidOperation(operation) {
    if (!isObject(operation)) return false;
    if (!operation.id || typeof operation.id !== "string") return false;
    if (!["entity", "habit", "flashcard", "flowertech"].includes(operation.kind)) return false;
    if (operation.kind === "entity" && (!operation.collection || typeof operation.collection !== "string")) return false;
    if (operation.kind === "flowertech" && !["offers", "invoices"].includes(operation.collection)) return false;
    if (operation.action && !["create", "update", "delete"].includes(operation.action)) return false;
    if (operation.patch != null && !isObject(operation.patch)) return false;
    return true;
  }

  // Verdichtet eine Offline-Warteschlange: mehrere Operationen auf demselben
  // Element werden zu einer einzigen zusammengefasst (letzter Stand gewinnt,
  // ein Delete ersetzt alle vorherigen Schritte). Ungueltige Eintraege fliegen
  // raus. Das haelt localStorage klein und macht das Nachsynchronisieren schnell.
  function compactQueue(operations) {
    const list = (Array.isArray(operations) ? operations : []).filter(isValidOperation);
    const groups = new Map();
    list.forEach((operation) => {
      const key = [operation.kind, operation.collection || "", operation.id].join("::");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(operation);
    });
    const compacted = [];
    groups.forEach((ops) => {
      ops.sort((a, b) => operationTime(a) - operationTime(b));
      const last = ops[ops.length - 1];
      if (last.action === "delete") { compacted.push(clone(last)); return; }
      const merged = clone(ops[0]);
      merged.patch = {};
      let hasCreate = false;
      ops.forEach((operation) => {
        if (operation.action === "create") hasCreate = true;
        if (isObject(operation.patch)) Object.assign(merged.patch, clone(operation.patch));
      });
      merged.action = hasCreate ? "create" : "update";
      merged.updatedAt = last.updatedAt;
      if (last.operationId) merged.operationId = last.operationId;
      compacted.push(merged);
    });
    compacted.sort((a, b) => operationTime(a) - operationTime(b));
    return compacted;
  }

  function newerItem(a, b) {
    if (!a) return b;
    if (!b) return a;
    return currentTime(b) >= currentTime(a) ? b : a;
  }

  function mergeById(listA, listB) {
    const map = new Map();
    [...(Array.isArray(listA) ? listA : []), ...(Array.isArray(listB) ? listB : [])].forEach((item) => {
      if (!isObject(item) || item.id == null) return;
      map.set(item.id, newerItem(map.get(item.id), item));
    });
    return Array.from(map.values()).map(clone);
  }

  // Feldweiser Zusammenzug zweier Datenstaende (z. B. lokaler Snapshot und
  // Backup-Datei): pro Element gewinnt die neuere Version, nichts geht verloren.
  function mergePayloads(inputA, inputB) {
    const a = normalisePayload(inputA);
    const b = normalisePayload(inputB);
    const merged = makeEmptyPayload();
    const collections = new Set([...Object.keys(a.entities), ...Object.keys(b.entities)]);
    collections.forEach((name) => {
      const target = {};
      const mapA = isObject(a.entities[name]) ? a.entities[name] : {};
      const mapB = isObject(b.entities[name]) ? b.entities[name] : {};
      new Set([...Object.keys(mapA), ...Object.keys(mapB)]).forEach((id) => {
        target[id] = clone(newerItem(mapA[id], mapB[id]));
      });
      merged.entities[name] = target;
    });
    merged.dailyBriefing = { ...clone(a.dailyBriefing), ...clone(b.dailyBriefing) };
    merged.dailyBriefing.routines = mergeById(a.dailyBriefing.routines, b.dailyBriefing.routines);
    merged.dailyBriefing.beliefs = clone(b.dailyBriefing.beliefs.length ? b.dailyBriefing.beliefs : a.dailyBriefing.beliefs);
    merged.recallLabData = { ...clone(a.recallLabData), ...clone(b.recallLabData) };
    merged.recallLabData.cards = mergeById(a.recallLabData.cards, b.recallLabData.cards);
    merged.recallLabData.decks = mergeById(a.recallLabData.decks, b.recallLabData.decks);
    const logs = new Map();
    [...a.recallLabData.reviewLogs, ...b.recallLabData.reviewLogs].forEach((log) => {
      if (!log) return;
      const key = log.id || `${log.cardId || ""}::${log.ts || log.date || ""}`;
      if (!logs.has(key)) logs.set(key, clone(log));
    });
    merged.recallLabData.reviewLogs = Array.from(logs.values());
    // FlowerTech: Dokumente und Buchungen nach Id zusammenfuehren, laufende
    // Nummern auf den hoeheren Stand heben, damit nichts doppelt vergeben wird.
    merged.flowertech = { ...clone(a.flowertech), ...clone(b.flowertech) };
    ["offers", "invoices", "finances", "notes", "links"].forEach((key) => {
      merged.flowertech[key] = mergeById(a.flowertech[key], b.flowertech[key]);
    });
    merged.flowertech.counters = { ...clone(a.flowertech.counters) };
    Object.keys(b.flowertech.counters || {}).forEach((key) => {
      merged.flowertech.counters[key] = Math.max(
        Number(a.flowertech.counters[key]) || 0,
        Number(b.flowertech.counters[key]) || 0
      );
    });
    merged.meta = parseTime(a.meta.updatedAt) >= parseTime(b.meta.updatedAt) ? clone(a.meta) : clone(b.meta);
    return merged;
  }

  function estimateSize(value) {
    let json = "";
    try { json = typeof value === "string" ? value : (JSON.stringify(value) || ""); } catch (_) { return 0; }
    if (typeof TextEncoder !== "undefined") {
      try { return new TextEncoder().encode(json).length; } catch (_) {}
    }
    return json.length;
  }

  // Kennzahlen fuer die Speicher-Anzeige in den Einstellungen: wie viele aktive
  // Elemente pro Sammlung vorhanden sind und wie gross der Datenstand ist.
  function payloadStats(payload) {
    const normalised = normalisePayload(payload);
    const perCollection = {};
    let totalEntities = 0;
    Object.keys(normalised.entities).forEach((name) => {
      const active = Object.values(normalised.entities[name]).filter((item) =>
        isObject(item) && item.status !== "deleted" && !item.deletedAt).length;
      if (active) perCollection[name] = active;
      totalEntities += active;
    });
    return {
      totalEntities,
      perCollection,
      routines: normalised.dailyBriefing.routines.length,
      cards: normalised.recallLabData.cards.length,
      bytes: estimateSize(normalised)
    };
  }

  return {
    makeEmptyPayload,
    normalisePayload,
    parseWrapper,
    applyOperation,
    buildWrapper,
    makeId,
    isValidOperation,
    compactQueue,
    mergePayloads,
    estimateSize,
    payloadStats
  };
});
