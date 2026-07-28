const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "public");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
const serviceWorker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const workspace = fs.readFileSync(path.join(root, "tablet-workspace.js"), "utf8");

for (const id of ["app", "main", "overlayRoot", "syncDot", "accountButton"]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
}
for (const file of ["styles.css", "tablet-workspace.css", "sync-core.js", "tablet-workspace.js", "app.js", "icon.svg", "manifest.webmanifest"]) {
  assert.equal(fs.existsSync(path.join(root, file)), true, `missing ${file}`);
  assert.match(serviceWorker + html, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${file} is not referenced`);
}
assert.equal(manifest.name, "Quantus Tablet");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, "/");
assert.doesNotMatch(html + app, /ß/);
for (const route of ["tasks", "projects", "notes", "meetings", "concepts", "goals", "strategies", "programs", "organizations", "statistics", "reports", "decisions", "polaris"]) {
  assert.match(app, new RegExp(`fullRoute: ["']${route}["']`), `missing full AI Sync route ${route}`);
}
for (const page of ["drive.html", "docstudio.html", "nobraine.html", "bm.html"]) {
  assert.match(app, new RegExp(`fullPath: ["']${page.replace(".", "\\.")}["']`), `missing full AI Sync page ${page}`);
}

// The tablet no longer embeds the AI Sync app in an iframe. Every route renders a
// native tablet view; full desktop modules only open in a separate window.
assert.doesNotMatch(app, /full-app-frame|fullAppFrame|renderFullApp/, "AI Sync must not be embedded in an iframe anymore");
assert.doesNotMatch(html, /<iframe[^>]*full-app/, "index.html must not embed a full app iframe");
for (const fn of ["renderRoute", "renderModule", "renderCalendar", "renderCollectionView", "renderStatistics", "renderReports", "moduleList"]) {
  assert.match(app, new RegExp(`function ${fn}\\b`), `missing native renderer ${fn}`);
}
// Module pages must surface real data, not just an "open externally" placeholder.
assert.match(app, /MODULE_COLLECTIONS/, "modules should map to real collections");
assert.match(app, /recentActivity/, "modules should show recent activity from the payload");
// Enhanced handwriting: marker/highlighter mode and colour presets.
assert.match(workspace, /highlighter/, "missing highlighter/marker handwriting mode");
assert.match(workspace, /INK_COLORS/, "missing handwriting colour presets");
// Native collection routes must be reachable through the router, not an iframe.
for (const route of ["tasks", "projects", "notes", "meetings", "goals", "strategies", "organizations", "decisions"]) {
  assert.match(app, new RegExp(`${route}: \\{ label:`), `missing native collection config for ${route}`);
}
for (const feature of ["handwriting", "stickyBoard", "externalLinks", "linkedProjects", "uploadFiles", "attachDrive"]) {
  assert.match(workspace, new RegExp(feature), `missing tablet workspace feature ${feature}`);
}
assert.match(html, /firebase-storage-compat\.js/, "missing Firebase Storage SDK");
assert.match(html, /data-action="workspace"/, "missing global workspace launcher");

// Speicher- und Produktivitaets-Verbesserungen muessen verdrahtet bleiben.
const syncCore = fs.readFileSync(path.join(root, "sync-core.js"), "utf8");
for (const fn of ["compactQueue", "mergePayloads", "isValidOperation", "payloadStats", "estimateSize"]) {
  assert.match(syncCore, new RegExp(`function ${fn}\\b`), `sync-core is missing ${fn}`);
}
for (const feature of ["hydrateFromSnapshot", "saveSnapshot", "exportBackup", "importBackupFile", "undoToast", "quick-add", "status-filter", "sort-collection", "pin-entity", "duplicate-entity", "PENDING_MAX_OPS"]) {
  assert.match(app, new RegExp(feature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `app.js is missing storage/productivity feature ${feature}`);
}
assert.match(app, /Core\.compactQueue/, "pending queue must be compacted through sync-core");
assert.match(serviceWorker, /staleWhileRevalidate|stale-while-revalidate/i, "service worker should serve static assets cache-first with background refresh");
assert.match(serviceWorker, /networkFirst/, "service worker should keep navigations network-first with cache fallback");
assert.ok(manifest.shortcuts.length >= 5, "manifest should expose launcher shortcuts");

console.log("structure: shell, full AI Sync app catalog, manifest and local assets passed");
