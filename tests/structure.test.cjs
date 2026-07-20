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
assert.match(app, /class=\"full-app-frame\"/, "missing embedded full app frame");
for (const feature of ["handwriting", "stickyBoard", "externalLinks", "linkedProjects", "uploadFiles", "attachDrive"]) {
  assert.match(workspace, new RegExp(feature), `missing tablet workspace feature ${feature}`);
}
assert.match(html, /firebase-storage-compat\.js/, "missing Firebase Storage SDK");
assert.match(html, /data-action="workspace"/, "missing global workspace launcher");

console.log("structure: shell, full AI Sync app catalog, manifest and local assets passed");
