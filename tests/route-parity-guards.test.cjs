// Produktionsbefund (Review PR #12, P2-5 und P3):
//
// 1) Quellrouten waren nicht kanonisch: "#/reading" statt "#/readinghub/<id>",
//    "#/ideas" ohne Id statt "#/ideas/<id>", "#/bm" statt dem tatsaechlichen
//    Satellitenpfad "/bm.html". Der Desktop-Router (ai-sync public/index.html)
//    kennt nur die kanonischen Formen — der Quellsprung lief sonst ins Leere.
// 2) Sticky/Workspace "In Noteflow speichern" hatte keinen Doppeltipp-Schutz:
//    zwei schnelle Taps vor dem await erzeugten zwei Notizen.
// 3) mergePayloads (Backup-Import) hat _deleteLog buckets-weise mit max-
//    Zeitstempel zusammengefuehrt statt sie shallow zu ueberschreiben.
//
// Dieser Test verankert die Quelltext-Fixes direkt, weil (1) und (2) reine
// String-/Ablauf-Aenderungen ohne exportierte Funktion sind.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Sync = require("../public/sync-core.js");

let checks = 0;
const ok = (value, message) => { checks++; assert.ok(value, message); };

const read = (name) => fs.readFileSync(path.join(__dirname, "..", "public", name), "utf8");
const app = read("app.js");
const bmApp = read("bm-app.js");
const sticky = read("sticky-app.js");
const workspace = read("tablet-workspace.js");

// ── Kanonische Quellrouten ──
ok(!/route:\s*"#\/reading"/.test(app), "keine Quelle zeigt mehr auf die nicht existente Route #/reading");
ok(!/route:\s*"#\/bm"/.test(bmApp), "BM-Quelle zeigt nicht mehr auf die nicht existente Hash-Route #/bm");
ok(/route:\s*"#\/readinghub\/"\s*\+\s*book\.id/.test(app), "Buch-Lesenotiz nutzt die kanonische Desktop-Route #/readinghub/<id>");
ok(/route:\s*"#\/ideas\/"\s*\+\s*id/.test(app), "neue Ideen erhalten die kanonische Route #/ideas/<id> statt der id-losen Form");
ok(/route:\s*"\/bm\.html"/.test(bmApp), "BM-Quelle zeigt auf den tatsaechlichen Satellitenpfad /bm.html");

// ── Doppeltipp-Schutz ──
ok(/skSpeichernd\[sticky\.id\]/.test(sticky), "sticky-app.js schuetzt sk-note-noteflow gegen Doppeltipp");
ok(/twSavingSticky\.(has|add)\(sticky\.id\)/.test(workspace), "tablet-workspace.js schuetzt save-sticky-note gegen Doppeltipp");

// ── mergePayloads: _deleteLog bucketweise mit max-Zeitstempel ──
{
  const a = { entities: {}, meta: { updatedAt: "2026-08-30T09:00:00Z" }, _deleteLog: { note: { n1: 1000, n2: 5000 } } };
  const b = { entities: {}, meta: { updatedAt: "2026-08-30T08:00:00Z" }, _deleteLog: { note: { n1: 3000 }, idea: { i1: 2000 } } };
  const merged = Sync.mergePayloads(a, b);
  ok(merged._deleteLog.note.n1 === 3000, "der spaetere Zeitstempel pro id gewinnt (n1: max(1000,3000))");
  ok(merged._deleteLog.note.n2 === 5000, "ein nur in a vorhandener Eintrag bleibt erhalten (n2)");
  ok(merged._deleteLog.idea.i1 === 2000, "ein nur in b vorhandener Bucket bleibt erhalten (idea)");
}

console.log(`Routen-Paritaet & Schutzmechanismen: ok (${checks} Pruefungen)`);
