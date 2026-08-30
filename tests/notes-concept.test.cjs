const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Notes = require("../public/notes-core.js");
const Sync = require("../public/sync-core.js");
const publicRoot = path.join(__dirname, "..", "public");
const read = (name) => fs.readFileSync(path.join(publicRoot, name), "utf8");
const app = read("app.js");
const html = read("index.html");
const styles = read("styles.css");
const bm = read("bm-app.js");
const nativeModules = read("native-modules.js");
const workspace = read("tablet-workspace.js");
const sticky = read("sticky-app.js");
const mail = read("mail-app.js");

// Das Klassenset und seine Bezeichnungen sind geraeteuebergreifend stabil.
assert.deepEqual(Notes.NOTE_CLASSES, ["reading", "learning", "idea", "general", "short", "research"]);
assert.deepEqual(Object.values(Notes.NOTE_CLASS_LABELS), [
  "Lesenotiz", "Lernnotiz", "Idee", "Generelle Notiz", "Kurze Notiz", "Recherchenotiz"
]);

// Schlagwoerter sind case-insensitiv eindeutig; bestehende Schreibweisen
// gewinnen und werden bereits nach eingegebenen Buchstaben vorgeschlagen.
assert.deepEqual(Notes.normalizeTags(["  Schule ", "schule", "BM", ""], ["Schule"]), ["Schule", "BM"]);
assert.deepEqual(
  Notes.filterTagSuggestions({ a:{ tags:["Buecher", "BM"] }, b:{ tags:["Recherche"] } }, "b", ["BM"]),
  ["Buecher"]
);

const reading = Notes.createNote({
  id: "reading-1", noteClass: "reading", content: "Eine zentrale Erkenntnis", tags: ["Der Prozess"],
  source: { app:"readinghub", entityType:"book", entityId:"book-1", label:"Der Prozess", route:"#/reading" }
}, { now:"2026-08-29T08:00:00.000Z" });
assert.equal(reading.notebookId, null, "ohne Auswahl muss die Notiz in der Inbox bleiben");
assert.equal(reading.dedupeKey, null, "mehrere Lesenotizen pro Buch duerfen nicht kollidieren");
assert.equal(reading.source.entityId, "book-1");
const unsafe = Notes.createNote({
  id:"unsafe", noteClass:"short", content:'<img src=x onerror="alert(1)">', tags:['<script>alert(1)</script>'],
  source:{ app:"shortnote", label:"Shortnote" }
});
assert.match(unsafe.content, /onerror/); // Die Factory veraendert Nutztext nicht; die View muss escapen.
assert.match(app, /esc\(noteContent\(note\)/);
assert.match(app, /#\$\{esc\(tag\)\}/);

const general = Notes.createNote({
  id:"general-1", noteClass:"general", content:"Direkt in Noteflow",
  source:{ app:"noteflow", label:"Noteflow" }
});
assert.equal(general.noteClass, "general");
assert.throws(() => Notes.createNote({
  id:"bad-general", noteClass:"general", content:"Nicht erlaubt",
  source:{ app:"projects", entityType:"project", entityId:"p1", label:"Projekt" }
}), /nur in Noteflow/);
assert.throws(() => Notes.createNote({
  id:"bad-short", noteClass:"short", content:"Ohne Kategorie",
  source:{ app:"shortnote", label:"Shortnote" }
}), /Schlagwort/);
const idea = Notes.createNote({
  id:"idea-1", noteClass:"idea", content:"Neue Idee", tags:["Produkt"], notebookId:null,
  source:{ app:"ideas", entityType:"idea", entityId:"idea-1", label:"Produkt", route:"#/ideas" },
  dedupeKey:"ideas:idea-1"
});
assert.equal(idea.tags[0], "Produkt");
assert.equal(idea.dedupeKey, "ideas:idea-1");

// Bestehende Daten werden verlustfrei und wiederholbar in die kanonischen
// Maps ueberfuehrt. Notizbuecher bleiben optional und Legacy-Buecher lesbar.
const legacy = {
  entities: {
    notes: {
      old:{ id:"old", description:"Zitat", source:"Reading Hub", bookId:"book-old", bookTitle:"Altbuch", tags:"Altbuch" },
      projectOld:{ id:"projectOld", description:"Historische Projektnotiz", source:"Projects" }
    },
    notebooks:{ nb1:{ id:"nb1", title:"Archiv" } },
    ideas:{ i1:{ id:"i1", title:"Tablet besser", category:"Produkt", score:7, createdAt:"2026-01-02T00:00:00.000Z" } }
  },
  _readingHubBooks:{ books:[{ id:"book-old", titel:"Altbuch", autor:"A. Autor", status:"done", annotations:[{ id:"a1" }] }] },
  meta:{ keep:"yes" }
};
const migrated = Notes.migratePayload(JSON.parse(JSON.stringify(legacy)));
assert.equal(migrated.entities.notes.old.noteClass, "reading");
assert.equal(migrated.entities.notes.old.source.app, "readinghub");
assert.equal(migrated.entities.notes.old.notebookId, null);
assert.equal(migrated.entities.notes.projectOld.source.app, "projects", "Legacy-Quellen duerfen nicht zu Noteflow umgeschrieben werden");
assert.equal(migrated.entities.books["book-old"].status, "completed");
assert.equal(migrated.entities.books["book-old"].annotations[0].id, "a1");
assert.equal(migrated.entities.notebooks.nb1.title, "Archiv");
assert.equal(migrated.entities.ideas.i1.score, 7);
assert.equal(migrated.entities.ideas.i1.noteId, "idea-note-i1");
assert.equal(migrated.entities.ideas.i1.centralNoteId, "idea-note-i1");
assert.equal(migrated.entities.notes["idea-note-i1"].dedupeKey, "ideas:i1");
assert.equal(migrated.meta.keep, "yes");
assert.equal(migrated.meta.noteSchemaVersion, 2);
const once = JSON.stringify(migrated);
assert.equal(JSON.stringify(Notes.migratePayload(migrated)), once, "Migration muss idempotent sein");

// Cross-Repo-Fixture: Die Desktop-ID und centralNoteId werden wiederverwendet,
// statt daneben eine zweite Tablet-/Mobile-Ideennotiz anzulegen.
const desktopIdea = Notes.migratePayload({ entities:{
  notes:{ "idea-note-i1":{
    id:"idea-note-i1", noteClass:"idea", title:"Titel", content:"KEEP", tags:["Kategorie"], notebookId:null,
    dedupeKey:"ideas:i1", source:{ app:"ideas", entityType:"idea", entityId:"i1", label:"Titel", route:"#/ideas/i1" },
    createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z"
  } },
  ideas:{ i1:{ id:"i1", centralNoteId:"idea-note-i1", title:"Titel", text:"KEEP", content:"KEEP",
    category:"Kategorie", tags:["Kategorie"], status:"open", createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z" } },
  books:{}, notebooks:{}
} });
assert.deepEqual(Object.keys(desktopIdea.entities.notes), ["idea-note-i1"]);
assert.equal(desktopIdea.entities.ideas.i1.noteId, "idea-note-i1");
assert.equal(desktopIdea.entities.ideas.i1.centralNoteId, "idea-note-i1");
assert.equal(desktopIdea.entities.notes["idea-note-i1"].content, "KEEP");
const desktopIdeaOnce = JSON.stringify(desktopIdea);
assert.equal(JSON.stringify(Notes.migratePayload(desktopIdea)), desktopIdeaOnce);

const discoveredIdeas = Notes.migratePayload({ entities:{
  notes:{
    mobile:{ id:"mobile", noteClass:"idea", content:"Dedupe", dedupeKey:"ideas:i2", source:{ app:"noteflow" } },
    sourced:{ id:"sourced", noteClass:"idea", content:"Source", source:{ app:"ideas", entityType:"idea", entityId:"i3" } },
    explicit:{ id:"explicit", noteClass:"idea", content:"Ref", source:{ app:"noteflow" } }
  },
  ideas:{ i2:{ id:"i2", text:"Dedupe" }, i3:{ id:"i3", text:"Source" }, i4:{ id:"i4", text:"Ref", noteId:"explicit" } }
} });
assert.equal(discoveredIdeas.entities.ideas.i2.centralNoteId, "mobile");
assert.equal(discoveredIdeas.entities.ideas.i3.centralNoteId, "sourced");
assert.equal(discoveredIdeas.entities.ideas.i4.centralNoteId, "explicit");
assert.equal(Object.keys(discoveredIdeas.entities.notes).length, 3);

// Eine fremde Notiz darf nicht allein wegen einer passenden Namenskonvention
// als Idea-Singleton gekapert werden; der neue Link erhaelt eine freie ID.
const occupiedIdeaId = Notes.migratePayload({ entities:{
  notes:{ "idea-note-i1":{ id:"idea-note-i1", noteClass:"general", content:"FREMD", source:{ app:"noteflow", label:"Noteflow" } } },
  ideas:{ i1:{ id:"i1", text:"Echte Idee", category:"Kategorie" } }
} });
assert.equal(occupiedIdeaId.entities.notes["idea-note-i1"].content, "FREMD");
assert.equal(occupiedIdeaId.entities.ideas.i1.noteId, "idea-note-i1_2");
assert.equal(occupiedIdeaId.entities.notes["idea-note-i1_2"].content, "Echte Idee");
const occupiedByOtherIdea = Notes.migratePayload({ entities:{
  notes:{ "idea-note-i1":{ id:"idea-note-i1", noteClass:"idea", content:"ANDERE IDEE", dedupeKey:"ideas:i2",
    source:{ app:"ideas", entityType:"idea", entityId:"i2", label:"Andere" } } },
  ideas:{ i1:{ id:"i1", text:"Echte Idee", category:"Kategorie" } }
} });
assert.equal(occupiedByOtherIdea.entities.notes["idea-note-i1"].content, "ANDERE IDEE");
assert.equal(occupiedByOtherIdea.entities.notes["idea-note-i1"].source.entityId, "i2");
assert.equal(occupiedByOtherIdea.entities.ideas.i1.noteId, "idea-note-i1_2");

// Array-Altbestaende erreichen die Migration auch durch sync-core und werden
// inklusive doppelter/fehlender IDs in collision-safe Maps ueberfuehrt.
const arrayLegacy = Sync.parseWrapper({ data:JSON.stringify({ entities:{
  notes:[
    { id:"same", description:"Erste" },
    { id:"same", description:"Zweite", extra:{ keep:true } },
    { description:"Ohne ID" }
  ],
  notebooks:[{ id:"nb", title:"Eins" }, { id:"nb", title:"Zwei" }],
  books:[{ titel:"Nur Titel", status:"new", annotations:[{ id:"a1" }] }],
  ideas:[{ id:"array-idea", text:"Array-Idee", category:"Array" }]
} }) }).payload;
assert.equal(arrayLegacy.entities.notes.same.content, "Erste");
assert.equal(arrayLegacy.entities.notes.same_2.content, "Zweite");
assert.equal(arrayLegacy.entities.notes.same_2.extra.keep, true);
assert.equal(arrayLegacy.entities.notes.legacy_note_2.content, "Ohne ID");
assert.equal(arrayLegacy.entities.notebooks.nb.title, "Eins");
assert.equal(arrayLegacy.entities.notebooks.nb_2.title, "Zwei");
assert.equal(arrayLegacy.entities.books.legacy_book_0.title, "Nur Titel");
assert.equal(arrayLegacy.entities.books.legacy_book_0.annotations[0].id, "a1");
assert.equal(arrayLegacy.entities.ideas["array-idea"].centralNoteId, "idea-note-array-idea");

// Exakt dieselbe lossless Array-Konvention wie Mobile/Desktop: sparse und
// string-keyed Einträge bleiben erhalten, reservierte IDs polluieren nichts.
const richArrayNotes = [];
richArrayNotes[4] = { description:"Sparse" };
richArrayNotes["custom tag"] = { description:"String key" };
richArrayNotes.push({ id:"__proto__", description:"Reserved" });
const richArrays = { entities:{
  notes:richArrayNotes,
  notebooks:[{ id:"__proto__", title:"Reserved notebook" }],
  books:[{ id:"__proto__", title:"Reserved book" }],
  ideas:[{ id:"__proto__", text:"Reserved idea", category:"System" }]
} };
Notes.migratePayload(richArrays);
assert.equal(richArrays.entities.notes.legacy_note_4.content, "Sparse");
assert.equal(richArrays.entities.notes.legacy_note_custom_tag.content, "String key");
for (const name of ["notes","notebooks","books","ideas"]) {
  assert.equal(Object.prototype.hasOwnProperty.call(richArrays.entities[name], "__proto__"), true, `${name}: reserved id`);
}
assert.equal(Object.getPrototypeOf(richArrays.entities.notes), Object.prototype);
const richOnce = JSON.stringify(richArrays);
assert.equal(JSON.stringify(Notes.migratePayload(richArrays)), richOnce);

const deletedIdeas = Notes.migratePayload({ entities:{ notes:{}, notebooks:{}, books:{}, ideas:{
  mobile:{ id:"mobile", text:"weg", deleted:true },
  archived:{ id:"archived", text:"weg", archived:true },
  tablet:{ id:"tablet", text:"weg", status:"deleted", deletedAt:"2026-08-29T10:00:00.000Z" }
} } });
assert.deepEqual(Object.keys(deletedIdeas.entities.notes), [], "Tombstone-Ideas dürfen nicht wiederbelebt werden");

// Quellenlose Legacy-Notizen rekonstruieren ihre fachliche App und IDs aus
// den alten Feldern; sie duerfen nicht pauschal als Noteflow-Quelle enden.
const legacySources = Notes.migratePayload({ entities:{ notes:{
  r:{ id:"r", description:"Lesen", bookId:"b1", bookTitle:"Buch" },
  ro:{ id:"ro", description:"Lesen", bookId:"b2", source:{} },
  i:{ id:"i", description:"Idee", ideaId:"i1", category:"Produkt" },
  s:{ id:"s", description:"Lernen", type:"smarter", lessonId:"l1" },
  bm:{ id:"bm", description:"Lernen", type:"bm-pruefung", topicId:"t1" },
  rl:{ id:"rl", description:"Lernen", type:"recall", cardId:"c1" },
  a:{ id:"a", description:"Artikel", type:"newsroom", publicationId:"pub1" },
  q:{ id:"q", description:"Kurz", type:"short", originId:"capture1" }
} } });
assert.deepEqual([legacySources.entities.notes.r.source.app, legacySources.entities.notes.r.source.entityId], ["readinghub", "b1"]);
assert.deepEqual([legacySources.entities.notes.ro.source.app, legacySources.entities.notes.ro.source.entityId], ["readinghub", "b2"]);
assert.deepEqual([legacySources.entities.notes.i.source.app, legacySources.entities.notes.i.source.entityId], ["ideas", "i1"]);
assert.deepEqual([legacySources.entities.notes.s.source.app, legacySources.entities.notes.s.source.entityId], ["smarter", "l1"]);
assert.deepEqual([legacySources.entities.notes.bm.source.app, legacySources.entities.notes.bm.source.entityId], ["bmpruefung", "t1"]);
assert.deepEqual([legacySources.entities.notes.rl.source.app, legacySources.entities.notes.rl.source.entityId], ["recalllab", "c1"]);
assert.deepEqual([legacySources.entities.notes.a.source.app, legacySources.entities.notes.a.source.entityId], ["articles", "pub1"]);
assert.deepEqual([legacySources.entities.notes.q.source.app, legacySources.entities.notes.q.source.entityId], ["shortnote", "capture1"]);

// Newsroom-Publications verwenden kanonisch app=articles, lesen aber alte
// Desktop-Objektquellen und loesen publication-IDs gegen entities.nhOut auf.
const newsroomFixture = Sync.parseWrapper({ data:JSON.stringify({ entities:{
  nhOut:{ pub1:{ id:"pub1", title:"Artikel", format:"article", content:"Text", topicLabel:"Politik", created:"2026-01-01T00:00:00.000Z" } },
  notes:{ n1:{ id:"n1", noteClass:"research", content:"Text", tags:["Politik"], source:{ app:"newsroom", entityType:"publication", entityId:"pub1", label:"Artikel", route:"#/articles/outputs" } } }
} }) }).payload;
assert.equal(newsroomFixture.entities.notes.n1.source.app, "articles");
assert.equal(newsroomFixture.entities.notes.n1.source.legacyApp, "newsroom");
assert.equal(newsroomFixture.entities.notes.n1.source.route, "#/articles/outputs");
assert.equal(newsroomFixture.entities.nhOut.pub1.topicLabel, "Politik");
assert.deepEqual(Notes.sourceEntityCollections(newsroomFixture.entities.notes.n1.source), ["nhOut", "articles"]);
assert.match(app, /sourceEntityCollections\(source\)/);
assert.match(app, /item\.deleted \|\| item\.archived \|\| item\.status === "deleted" \|\| item\.deletedAt/);
assert.match(app, /function ideaAggregate\(/);
assert.match(app, /makeEntityBatch\(operations\)/);
assert.match(nativeModules, /col\("nhOut"\)/);

for (const [legacyStatus, canonical] of Object.entries({
  new:"registered", read:"completed", done:"completed", reading:"reading", paused:"paused", abandoned:"abandoned"
})) assert.equal(Notes.normalizeBookStatus(legacyStatus), canonical);

// Auch eine freie Notizoperation eines alten/offline Clients wird unmittelbar
// normalisiert; die zusaetzlichen kanonischen Sammlungen sind immer vorhanden.
const empty = Sync.makeEmptyPayload();
assert.deepEqual(empty.entities.notebooks, {});
assert.deepEqual(empty.entities.books, {});
const applied = Sync.applyOperation(empty, {
  operationId:"legacy-note-op", kind:"entity", action:"create", collection:"notes", id:"legacy-note",
  updatedAt:"2026-08-29T09:00:00.000Z", patch:{ description:"Alte Notiz", source:"Tablet" }
});
assert.equal(applied.payload.entities.notes["legacy-note"].noteClass, "general");
assert.equal(applied.payload.entities.notes["legacy-note"].content, "Alte Notiz");
assert.equal(applied.payload.entities.notes["legacy-note"].source.app, "noteflow");
const withOrigin = Sync.makeEmptyPayload();
withOrigin.entities.projects.p1 = { id:"p1", title:"Quelle", updatedAt:"2026-08-29T08:00:00.000Z" };
withOrigin.entities.notes.n1 = Notes.createNote({ id:"n1", noteClass:"research", content:"Bleibt", tags:["Quelle"], futureField:{ keep:true },
  source:{ app:"projects", entityType:"project", entityId:"p1", label:"Quelle" } }, { now:"2026-08-29T08:00:00.000Z" });
const deletedOrigin = Sync.applyOperation(withOrigin, {
  operationId:"delete-project", kind:"entity", action:"delete", collection:"projects", id:"p1",
  updatedAt:"2026-08-29T10:00:00.000Z", patch:{}
}).payload;
assert.equal(deletedOrigin.entities.notes.n1.content, "Bleibt");
assert.equal(deletedOrigin.entities.notes.n1.futureField.keep, true);

// Verdrahtung der tablet-nativen Oberflaeche: kein automatisch erzeugtes
// Notizbuch, alle Filter, Titel-only-Buecher und Shortnote-Zeitvalidierung.
assert.match(html, /notes-core\.js/);
assert.ok(html.indexOf("notes-core.js") < html.indexOf("sync-core.js"));
for (const hook of ["openNoteForm", "openShortnote", "openBookForm", "note-filter", "tag-autocomplete",
  "reading-note", "open-book", "scheduledMessages", "Zustellzeitpunkt", "Inbox"])
  assert.match(app, new RegExp(hook), `app.js fehlt ${hook}`);
assert.match(app, /Nur der Titel ist notwendig/);
assert.match(app, /Es wird kein neues Notizbuch automatisch erstellt/);
assert.match(app, /data\.get\("deliverAt"\)[\s\S]{0,180}date\.getTime\(\) <= Date\.now\(\)/);
assert.match(app, /dataset\.submitting/, "Doppeltipps muessen gegen doppelte Notizen geschuetzt sein");
assert.match(app, /entity-linked-notes/, "Entitaetsdetails brauchen ihre verknuepfte Notizliste");
assert.match(styles, /\.tag-suggestions/);
assert.match(styles, /\.shortnote-type/);

// Notizen entstehen in den fachlichen Apps an ihrem Kontext, bleiben aber
// zentral in Noteflow. Mail-Inhalte werden nur nach expliziter Vorschau kopiert.
assert.match(bm, /bm-learning-note/);
assert.match(nativeModules, /noteClass:"learning", app:"smarter"/);
for (const feature of ["nm-context-note", "openContextualNote", "renderKnowledge", "renderThesis",
  "renderJournal", "renderReflecta", "renderMessages", "renderDrive", "renderPdf", "renderBrowser"])
  assert.match(nativeModules, new RegExp(feature));
assert.match(workspace, /saveCanonicalNote/);
assert.match(sticky, /dedupeKey/);
assert.match(mail, /mail-note/);
assert.doesNotMatch(mail, /saveCanonicalNote\(/, "E-Mails duerfen nicht ohne Formularvorschau direkt gespeichert werden");

console.log("notes-concept: ok");
