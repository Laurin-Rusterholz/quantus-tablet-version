const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..", "public");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("index.html");
const expansion = read("quantus-tablet-expansion.js");
const sw = read("sw.js");
for (const asset of ["quantus-tablet-expansion.css", "quantus-tablet-expansion.js"]) {
  assert.match(html, new RegExp(asset.replace(/[.]/g, "\\.")), `index.html must load ${asset}`);
  assert.match(sw, new RegExp(asset.replace(/[.]/g, "\\.")), `service worker must cache ${asset}`);
}
for (const remote of ["quantus-universal.css", "quantus-device-sync.js", "quantus-universal-ui.js"]) {
  assert.match(html, new RegExp(remote.replace(/[.]/g, "\\.")), `index.html must load shared ${remote}`);
}
for (const label of ["BM Vorbereitung", "Smarter", "Leseplan", "Career Model", "Pinnboards"]) assert.match(expansion, new RegExp(label));
assert.match(expansion, /careerModel\/users\//);
assert.match(expansion, /bmpruefung/);
assert.match(expansion, /smarter\/documents/);
assert.match(expansion, /leseplan\/docs/);
assert.match(expansion, /QuantusDeviceSync/);
console.log("tablet live learning and device expansion: ok");
