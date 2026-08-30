(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.QuantusNotesCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const NOTE_CLASSES = Object.freeze(["reading", "learning", "idea", "general", "short", "research"]);
  const NOTE_CLASS_LABELS = Object.freeze({
    reading: "Lesenotiz",
    learning: "Lernnotiz",
    idea: "Idee",
    general: "Generelle Notiz",
    short: "Kurze Notiz",
    research: "Recherchenotiz"
  });
  const READING_KINDS = Object.freeze(["note", "quote", "summary", "insight"]);
  const LEARNING_KINDS = Object.freeze(["merksatz", "erklaerung", "fehler", "frage", "zusammenfassung"]);
  const BOOK_STATUSES = Object.freeze(["registered", "reading", "paused", "completed", "abandoned"]);
  const EPOCH = "1970-01-01T00:00:00.000Z";

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function cleanText(value) { return String(value == null ? "" : value).trim(); }
  function tagKey(value) { return cleanText(value).toLocaleLowerCase("de-CH"); }

  function tagValues(input) {
    if (Array.isArray(input)) return input;
    if (typeof input === "string") return input.split(/[,;\n]/);
    return [];
  }

  /*
   * Schlagwoerter sind im ganzen Datenstand case-insensitiv eindeutig. Die
   * zuerst vorhandene Schreibweise bleibt erhalten ("EU Schweiz" wird also
   * nicht ploetzlich zu "eu schweiz"), neue leere/gleiche Werte fallen weg.
   */
  function normalizeTags(input, knownTags) {
    const canonical = new Map();
    tagValues(knownTags).forEach(function (tag) {
      const value = cleanText(tag), key = tagKey(value);
      if (key && !canonical.has(key)) canonical.set(key, value);
    });
    const output = [];
    const seen = new Set();
    tagValues(input).forEach(function (tag) {
      const raw = cleanText(tag), key = tagKey(raw);
      if (!key || seen.has(key)) return;
      seen.add(key);
      output.push(canonical.get(key) || raw);
      if (!canonical.has(key)) canonical.set(key, raw);
    });
    return output;
  }

  function collectTags(notes) {
    const output = [];
    const seen = new Set();
    const list = Array.isArray(notes) ? notes : Object.values(isObject(notes) ? notes : {});
    list.forEach(function (note) {
      tagValues(note && note.tags).forEach(function (tag) {
        const value = cleanText(tag), key = tagKey(value);
        if (!key || seen.has(key)) return;
        seen.add(key); output.push(value);
      });
    });
    return output.sort(function (a, b) { return a.localeCompare(b, "de", { sensitivity: "base" }); });
  }

  function filterTagSuggestions(notes, query, selected, limit) {
    const q = tagKey(query);
    const chosen = new Set(tagValues(selected).map(tagKey));
    // Ein bereits berechneter Tag-Index darf direkt uebergeben werden. Damit
    // muessen grosse Notizbestaende nicht bei jedem Tastendruck neu indiziert
    // werden; die Factory bleibt trotzdem unabhaengig von der Oberflaeche.
    const available = Array.isArray(notes) && notes.every(function (entry) { return typeof entry === "string"; })
      ? normalizeTags(notes).sort(function (a, b) { return a.localeCompare(b, "de", { sensitivity:"base" }); })
      : collectTags(notes);
    return available.filter(function (tag) {
      return !chosen.has(tagKey(tag)) && (!q || tagKey(tag).includes(q));
    }).slice(0, Number(limit) > 0 ? Number(limit) : 8);
  }

  function sourceAppFromLegacy(value) {
    const text = cleanText(value).toLowerCase();
    if (/reading|book|buch|lesen/.test(text)) return "readinghub";
    if (/news|article|artikel|research|recherche/.test(text)) return "articles";
    if (/idea|idee/.test(text)) return "ideas";
    if (/smarter/.test(text)) return "smarter";
    if (/bm|pruefung|prüfung/.test(text)) return "bmpruefung";
    if (/recall|learn|lern/.test(text)) return "recalllab";
    if (/short|quick|schnell/.test(text)) return "shortnote";
    if (/tablet/.test(text)) return "noteflow";
    return text.replace(/[^a-z0-9_-]+/g, "-") || "noteflow";
  }

  function canonicalSourceApp(value) {
    const raw = cleanText(value);
    const key = raw.toLowerCase().replace(/[\s_-]+/g, "");
    // Desktop-Bestaende verwendeten zeitweise `newsroom`, waehrend Mobile
    // und das zentrale Notizmodell `articles` nutzen. Im Lesepfad gilt nur
    // noch die kanonische App-ID; Route und Legacy-Wert bleiben erhalten.
    if (["newsroom", "newsroomhub", "article", "articles"].includes(key)) return "articles";
    return raw;
  }

  function normalizeSource(source, fallback) {
    const defaults = isObject(fallback) ? fallback : {};
    if (isObject(source)) {
      const rawApp = cleanText(source.app || defaults.app) || "noteflow";
      const app = canonicalSourceApp(rawApp) || "noteflow";
      return {
        ...clone(source),
        app,
        entityType: cleanText(source.entityType || defaults.entityType) || "note",
        entityId: source.entityId == null || source.entityId === "" ? (defaults.entityId || null) : String(source.entityId),
        label: cleanText(source.label || defaults.label) || "Noteflow",
        route: cleanText(source.route || defaults.route) || null,
        ...(app !== rawApp ? { legacyApp: cleanText(source.legacyApp) || rawApp } : {})
      };
    }
    const legacy = cleanText(source);
    return {
      app: canonicalSourceApp(cleanText(defaults.app) || sourceAppFromLegacy(legacy)),
      entityType: cleanText(defaults.entityType) || "note",
      entityId: defaults.entityId == null || defaults.entityId === "" ? null : String(defaults.entityId),
      label: cleanText(defaults.label) || legacy || "Noteflow",
      route: cleanText(defaults.route) || null,
      ...(legacy ? { legacy } : {})
    };
  }

  function inferNoteClass(note) {
    if (NOTE_CLASSES.includes(note && note.noteClass)) return note.noteClass;
    const source = isObject(note && note.source)
      ? [note.source.app, note.source.entityType, note.source.label].join(" ")
      : String(note && note.source || "");
    // Paritaet mit dem Desktop-Core (Review P2-8): auch tags, readingKind/
    // learningKind/researchKind und readingHubBookId zaehlen als Evidenz, und
    // die Reihenfolge entspricht inferLegacyClass (reading → idea → learning
    // → research → short). Sonst stempelte das zuerst migrierende Geraet
    // dieselbe Altnotiz anders (Tag "Lesenotiz": Tablet general, Desktop
    // reading) — dauerhaft, weil beide die gesetzte Klasse danach respektieren.
    const evidence = [source, note && note.type, note && note.kind,
      note && note.readingKind, note && note.learningKind, note && note.researchKind,
      ...(Array.isArray(note && note.tags) ? note.tags : []),
      note && (note.bookId || note.readingHubBookId) ? "book" : "", note && note.ideaId ? "idea" : ""].join(" ").toLowerCase();
    if (/reading|book|buch|lesenotiz|lesen /.test(evidence + " ")) return "reading";
    if (/(^|[\s:_-])(idea|idee)([\s:_-]|$)/.test(evidence)) return "idea";
    if (/smarter|bm|recall|learn|lern|lektion|leseplan/.test(evidence)) return "learning";
    if (/news|article|artikel|research|recherche|browser|pdf|thesis/.test(evidence)) return "research";
    if (/short|quick|schnell/.test(evidence)) return "short";
    return "general";
  }

  function titleFromContent(content, fallback) {
    const line = cleanText(String(content || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
    if (line) return line.length > 72 ? line.slice(0, 69) + "…" : line;
    return fallback || "Neue Notiz";
  }

  function dedupeKeyFor(noteClass, source, explicit) {
    if (cleanText(explicit)) return cleanText(explicit);
    /* Mehrere Lesenotizen zum selben Buch (oder Lernnotizen zur selben
       Lektion) sind legitim. Einen Dedupe-Schluessel erhalten deshalb nur
       echte Spiegel-Singletons wie Ideas/Artikel, und die geben ihn explizit
       mit. Offline-Wiederholungen werden ueber stabile Note-/Operation-Ids
       abgefangen. */
    return null;
  }

  function validateNoteInput(input, options) {
    const value = isObject(input) ? input : {};
    const noteClass = NOTE_CLASSES.includes(value.noteClass) ? value.noteClass : "general";
    const content = cleanText(value.content == null ? value.description : value.content);
    const tags = normalizeTags(value.tags, options && options.knownTags);
    const source = normalizeSource(value.source, options && options.source);
    const errors = [];
    if (!content) errors.push("Inhalt fehlt");
    if (noteClass === "general" && source.app !== "noteflow") errors.push("Generelle Notizen können nur in Noteflow erstellt werden");
    if (["idea", "short"].includes(noteClass) && !tags.length) errors.push("Mindestens ein Schlagwort ist erforderlich");
    if (["reading", "learning", "research"].includes(noteClass) && source.app !== "noteflow" && !tags.length) errors.push("Ein Kontext-Schlagwort ist erforderlich");
    if (noteClass === "idea" && source.app !== "ideas" && source.app !== "noteflow") errors.push("Ideen werden in Ideas oder Noteflow erstellt");
    return { valid: errors.length === 0, errors, noteClass, content, tags, source };
  }

  function createNote(input, options) {
    const value = isObject(input) ? clone(input) : {};
    const checked = validateNoteInput(value, options);
    if (!checked.valid) {
      const error = new Error(checked.errors.join(". "));
      error.code = "INVALID_QUANTUS_NOTE";
      error.errors = checked.errors;
      throw error;
    }
    const now = cleanText(value.updatedAt || options && options.now) || new Date().toISOString();
    const createdAt = cleanText(value.createdAt) || now;
    const source = checked.source;
    return {
      ...value,
      id: cleanText(value.id),
      noteClass: checked.noteClass,
      title: cleanText(value.title) || titleFromContent(checked.content, NOTE_CLASS_LABELS[checked.noteClass]),
      content: checked.content,
      description: value.description == null ? checked.content : String(value.description),
      tags: checked.tags,
      notebookId: cleanText(value.notebookId) || null,
      source,
      dedupeKey: dedupeKeyFor(checked.noteClass, source, value.dedupeKey),
      createdAt,
      updatedAt: now
    };
  }

  function normalizeBookStatus(status) {
    const value = cleanText(status).toLowerCase();
    if (["reading", "lese ich", "am lesen", "in_progress"].includes(value)) return "reading";
    if (["paused", "pausiert", "pause"].includes(value)) return "paused";
    if (["read", "gelesen", "done", "completed", "finished"].includes(value)) return "completed";
    if (["abandoned", "abgebrochen", "dropped"].includes(value)) return "abandoned";
    return "registered";
  }

  function normalizeBook(book, id) {
    const value = isObject(book) ? clone(book) : {};
    const title = cleanText(value.title || value.titel || value.name || value.fileName || value.dateiname);
    const createdAt = cleanText(value.createdAt || value.erstellt || value.updatedAt || value.aktualisiert) || EPOCH;
    return {
      ...value,
      id: cleanText(value.id || id),
      title,
      author: cleanText(value.author || value.autor),
      status: normalizeBookStatus(value.status),
      createdAt,
      updatedAt: cleanText(value.updatedAt || value.aktualisiert) || createdAt
    };
  }

  function legacyNoteEvidence(value) {
    return [value.type, value.kind, value.sourceType, value.origin, value.originApp, value.app]
      .map(cleanText).join(" ").toLowerCase();
  }

  function legacySourceFallback(value, noteClass) {
    const evidence = legacyNoteEvidence(value);
    let app = "noteflow", entityType = null, entityId = null, route = "#/notes";
    if (noteClass === "reading") {
      app = "readinghub"; entityType = value.bookId ? "book" : "document";
      entityId = value.bookId || value.documentId || value.docId || value.sourceId || value.entityId || null; route = "#/reading";
    } else if (noteClass === "idea") {
      app = "ideas"; entityType = "idea"; entityId = value.ideaId || value.sourceId || value.entityId || null; route = "#/ideas";
    } else if (noteClass === "learning") {
      if (/smarter/.test(evidence)) { app = "smarter"; route = "#/smarter"; }
      else if (/bm|pruefung|prüfung/.test(evidence)) { app = "bmpruefung"; route = "#/bm"; }
      else if (/leseplan/.test(evidence)) { app = "leseplan"; route = "#/leseplan"; }
      else { app = "recalllab"; route = "#/learning"; }
      entityType = value.cardId ? "card" : value.lessonId ? "lesson" : value.topicId ? "topic" : "learning";
      entityId = value.cardId || value.lessonId || value.topicId || value.questionId || value.sourceId || value.entityId || null;
    } else if (noteClass === "research") {
      app = "articles"; route = "#/knowledge";
      entityType = value.publicationId ? "publication" : value.articleId ? "article" : value.documentId || value.docId ? "document" : "article";
      entityId = value.publicationId || value.articleId || value.documentId || value.docId || value.sourceId || value.entityId || null;
    } else if (noteClass === "short") {
      app = "shortnote"; entityType = "capture"; entityId = value.originId || value.sourceId || value.entityId || null; route = "#/notes";
    }
    return {
      app,
      entityType,
      entityId,
      label: cleanText(value.sourceLabel || value.bookTitle || value.category || value.topicLabel || value.topic || value.theme || value.lessonTitle || value.title) || NOTE_CLASS_LABELS[noteClass],
      route
    };
  }

  function normalizeExistingNote(note, id, knownTags) {
    const value = isObject(note) ? clone(note) : {};
    const noteClass = inferNoteClass(value);
    const content = String(value.content == null ? (value.description == null ? value.text || "" : value.description) : value.content);
    const fallback = legacySourceFallback(value, noteClass);
    // Ein vorhandener Legacy-String bleibt massgeblich (z.B. "Projects").
    // Nur eine wirklich fehlende Quelle wird aus Klasse und alten ID-Feldern
    // rekonstruiert, damit Book-/Idea-/Learning-Links nicht zu Noteflow zeigen.
    const sourceDefaults = isObject(value.source) ? fallback : cleanText(value.source) ? {
      entityType:fallback.entityType, entityId:fallback.entityId, label:fallback.label, route:fallback.route
    } : fallback;
    const source = normalizeSource(value.source, sourceDefaults);
    const createdAt = cleanText(value.createdAt || value.updatedAt) || EPOCH;
    return {
      ...value,
      id: cleanText(value.id || id),
      noteClass,
      title: cleanText(value.title || value.name) || titleFromContent(content, NOTE_CLASS_LABELS[noteClass]),
      content,
      tags: normalizeTags(value.tags, knownTags),
      notebookId: cleanText(value.notebookId) || null,
      source,
      dedupeKey: dedupeKeyFor(noteClass, source, value.dedupeKey || (noteClass === "idea" && source.entityId ? "ideas:" + source.entityId : null)),
      createdAt,
      updatedAt: cleanText(value.updatedAt) || createdAt
    };
  }

  function entityMap(value, prefix) {
    if (isObject(value)) return value;
    if (!Array.isArray(value)) return {};
    const output = {};
    Object.keys(value).forEach(function (key) {
      const entry = value[key];
      const item = isObject(entry) ? clone(entry) : { legacyValue: clone(entry) };
      const rawKey = String(key);
      const keyPart = /^(0|[1-9]\d*)$/.test(rawKey)
        ? rawKey
        : (rawKey.replace(/[^A-Za-z0-9_-]+/g,"_").replace(/^_+|_+$/g,"") || "key");
      const base = cleanText(item.id) || "legacy_" + prefix + "_" + keyPart;
      let id = base, suffix = 2;
      while (Object.prototype.hasOwnProperty.call(output, id)) id = base + "_" + suffix++;
      Object.defineProperty(output, id, { value:{ ...item, id }, enumerable:true, writable:true, configurable:true });
    });
    return output;
  }

  function findIdeaNote(notes, idea, ideaId) {
    // Ausdrueckliche Referenzen sind autoritativ. Namenskonventionen dagegen
    // duerfen keine zufaellig gleich benannte fremde Notiz uebernehmen.
    const directIds = [idea.centralNoteId, idea.noteId].map(cleanText).filter(Boolean);
    for (const noteId of directIds) {
      if (Object.prototype.hasOwnProperty.call(notes, noteId) && isObject(notes[noteId])) return { id:noteId, note:notes[noteId] };
    }
    const conventionalIds = ["idea-note-" + ideaId, "note_idea_" + ideaId];
    for (const noteId of conventionalIds) {
      if (!Object.prototype.hasOwnProperty.call(notes, noteId)) continue;
      const note = notes[noteId];
      if (!isObject(note)) continue;
      const source = normalizeSource(note.source);
      const dedupe = cleanText(note.dedupeKey);
      const dedupeIdentifiesIdea = /^ideas?:/.test(dedupe);
      const dedupeMatches = dedupe === "ideas:" + ideaId || dedupe === "idea:" + ideaId;
      const sourceIdentifiesIdea = source.app === "ideas" && Boolean(source.entityId);
      const sourceMatches = sourceIdentifiesIdea && String(source.entityId) === String(ideaId);
      const conflictingIdentity = (dedupeIdentifiesIdea && !dedupeMatches) || (sourceIdentifiesIdea && !sourceMatches);
      if (!conflictingIdentity && (dedupeMatches || sourceMatches
        || (note.noteClass === "idea" && !dedupeIdentifiesIdea && !sourceIdentifiesIdea))) return { id:noteId, note };
    }
    for (const noteId of Object.keys(notes).sort()) {
      const note = notes[noteId];
      if (!isObject(note)) continue;
      const source = normalizeSource(note.source);
      if (cleanText(note.dedupeKey) === "ideas:" + ideaId
        || cleanText(note.dedupeKey) === "idea:" + ideaId
        || (source.app === "ideas" && String(source.entityId || "") === String(ideaId))) {
        return { id:noteId, note };
      }
    }
    return null;
  }

  function freeEntityId(map, preferred) {
    let id = preferred, suffix = 2;
    while (Object.prototype.hasOwnProperty.call(map, id)) id = preferred + "_" + suffix++;
    return id;
  }

  function migratePayload(input) {
    const payload = isObject(input) ? input : {};
    if (!isObject(payload.entities)) payload.entities = {};
    // Manche alte Mobile-/Tablet-Staende serialisierten diese Sammlungen als
    // Arrays. Vor jeder Normalisierung werden sie verlustfrei in Maps
    // ueberfuehrt; doppelte/fehlende IDs erhalten deterministische Suffixe.
    payload.entities.notes = entityMap(payload.entities.notes, "note");
    payload.entities.notebooks = entityMap(payload.entities.notebooks, "notebook");
    payload.entities.books = entityMap(payload.entities.books, "book");
    payload.entities.ideas = entityMap(payload.entities.ideas, "idea");

    /* Alte Reading-Hub-Schatten werden einmalig in die gemeinsame Entity-Map
       uebernommen. Die Schatten bleiben fuer alte Desktop-Clients erhalten. */
    const legacyBooks = payload._readingHubBooks && Array.isArray(payload._readingHubBooks.books)
      ? payload._readingHubBooks.books : [];
    legacyBooks.forEach(function (book) {
      const normalized = normalizeBook(book, book && book.id);
      if (!normalized.id || !normalized.title || payload.entities.books[normalized.id]) return;
      payload.entities.books[normalized.id] = normalized;
    });
    Object.keys(payload.entities.books).forEach(function (id) {
      payload.entities.books[id] = normalizeBook(payload.entities.books[id], id);
    });

    let knownTags = collectTags(payload.entities.notes);
    Object.keys(payload.entities.notes).sort().forEach(function (id) {
      const normalized = normalizeExistingNote(payload.entities.notes[id], id, knownTags);
      payload.entities.notes[id] = normalized;
      knownTags = normalizeTags(knownTags.concat(normalized.tags));
    });

    /* Bestehende Ideen verlieren weder Bewertung noch Konvertierungsfelder.
       Ihre zentrale Notiz erhaelt eine deterministische Id; die Idee behaelt
       nur die stabile Rueckreferenz. Neue Clients lesen Text/Kategorie aus der
       Notiz, wodurch keine zweite bearbeitbare Kopie entsteht. */
    Object.keys(payload.entities.ideas).sort().forEach(function (id) {
      const idea = payload.entities.ideas[id];
      if (!isObject(idea) || idea.deleted || idea.archived || idea.status === "deleted" || idea.deletedAt) return;
      const linked = findIdeaNote(payload.entities.notes, idea, id);
      const content = cleanText(idea.idea || idea.content || idea.description || idea.text || idea.title);
      if (!linked && !content) return;
      const noteId = linked ? linked.id : freeEntityId(payload.entities.notes, "idea-note-" + id);
      if (!linked) {
        const category = cleanText(idea.category || tagValues(idea.tags)[0] || "Idee");
        payload.entities.notes[noteId] = normalizeExistingNote({
          id: noteId,
          noteClass: "idea",
          title: cleanText(idea.title) || titleFromContent(content, "Idee"),
          content,
          tags: [category].concat(tagValues(idea.tags)),
          notebookId: null,
          source: { app: "ideas", entityType: "idea", entityId: id, label: category, route: "#/ideas" },
          dedupeKey: "ideas:" + id,
          createdAt: idea.createdAt,
          updatedAt: idea.updatedAt
        }, noteId, knownTags);
        knownTags = normalizeTags(knownTags.concat(payload.entities.notes[noteId].tags));
      } else {
        // Die gefundene Desktop-/Mobile-Notiz bleibt die einzige Wahrheit.
        // Nur Brueckenfelder werden vereinheitlicht; Inhalt, Titel, Timestamps
        // und unbekannte Erweiterungen bleiben unangetastet.
        const note = linked.note;
        const source = normalizeSource(note.source, {
          app:"ideas", entityType:"idea", entityId:id,
          label:cleanText(idea.category || idea.title) || "Idee", route:"#/ideas"
        });
        note.noteClass = "idea";
        note.dedupeKey = "ideas:" + id;
        note.source = {
          ...source,
          app:"ideas",
          entityType:source.entityType || "idea",
          entityId:String(id),
          label:source.label || cleanText(idea.category || idea.title) || "Idee",
          route:source.route || "#/ideas"
        };
      }
      idea.noteId = noteId;
      idea.centralNoteId = noteId;
    });

    if (!isObject(payload.meta)) payload.meta = {};
    payload.meta.noteSchemaVersion = 2;
    return payload;
  }

  function notesForSource(notes, app, entityId) {
    const list = Array.isArray(notes) ? notes : Object.values(isObject(notes) ? notes : {});
    return list.filter(function (note) {
      const source = normalizeSource(note && note.source);
      return (!app || source.app === app) && (!entityId || String(source.entityId || "") === String(entityId));
    });
  }

  function sourceEntityCollections(source) {
    const normalized = normalizeSource(source);
    if (normalized.app === "articles") {
      return normalized.entityType === "publication" ? ["nhOut", "articles"] : ["articles", "nhOut"];
    }
    return [normalized.app];
  }

  return {
    NOTE_CLASSES,
    NOTE_CLASS_LABELS,
    READING_KINDS,
    LEARNING_KINDS,
    BOOK_STATUSES,
    normalizeTags,
    collectTags,
    filterTagSuggestions,
    normalizeSource,
    inferNoteClass,
    validateNoteInput,
    createNote,
    normalizeBookStatus,
    normalizeBook,
    migratePayload,
    notesForSource,
    sourceEntityCollections,
    titleFromContent
  };
});
