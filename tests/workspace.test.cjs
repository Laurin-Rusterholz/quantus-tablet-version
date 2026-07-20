const assert = require("node:assert/strict");

global.document = {
  addEventListener() {},
  getElementById() { return null; },
  body: { appendChild() {}, classList: { add() {}, remove() {} } }
};
global.window = {
  __quantusTablet: {
    state: {
      route: "projects",
      payload: {
        entities: {
          projects: { p1: { id: "p1", title: "Projekt", handwriting: { strokes: [] }, stickyBoard: { notes: [] } } },
          tasks: {}, notes: {}, meetings: {}, concepts: {}, strategies: {}, goals: {}, programs: {},
          organizations: {}, persons: {}, ideas: {}, decisions: {}, calendarEvents: {},
          articles: {}, protocols: {}, workflows: {}, theses: {}
        }
      },
      driveDocs: {}
    },
    Core: { makeId: (prefix) => `${prefix}_test` }
  }
};

require("../public/tablet-workspace.js");

assert.equal(typeof window.QuantusTabletWorkspace.open, "function");
assert.equal(typeof window.QuantusTabletWorkspace.renderRoute, "function");
const html = window.QuantusTabletWorkspace.renderRoute();
assert.match(html, /Handschrift überall/);
assert.match(html, /Sticky Boards/);
assert.match(html, /Verknüpfungen/);
assert.match(html, /Dateien/);

console.log("workspace: tablet canvas module passed");
