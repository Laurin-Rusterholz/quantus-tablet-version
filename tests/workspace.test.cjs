const assert = require("node:assert/strict");

global.document = {
  addEventListener() {},
  getElementById() { return null; },
  querySelector() { return null; },
  createElement() { return { classList: { add() {}, remove() {} }, style: {}, isConnected: true }; },
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
          articles: {}, protocols: {}, workflows: {}, theses: {},
          // Kein COLLECTIONS-Eintrag (bewusst) — fuer den Fallback-Test unten:
          // ChatGPT-Leads sind auf dem Tablet keine Canvas-Sammlung, sollen
          // den bestehenden Upload aber trotzdem ueber uploadTo() nutzen
          // koennen (chatgpt-app.js, Dokument-Anhang).
          chatgptLeads: { lead1: { id: "lead1", title: "Lead", files: [] } }
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

// ── uploadTo(): der Dokument-Anhang aus chatgpt-app.js nutzt genau diesen
// bestehenden ~50MB-Upload, unveraendert, nur fuer eine Sammlung ausserhalb
// von COLLECTIONS (chatgptLeads statt projects/tasks/…). Echter Aufruf gegen
// eine gefakte Firebase-Storage-Instanz — keine reine Textpruefung.
(async () => {
  const geschrieben = [];
  window.__quantusTablet.getStorage = () => ({
    ref(path) {
      return {
        put(file) {
          const task = {
            snapshot: { ref: { getDownloadURL: () => Promise.resolve(`https://storage.example/${path}`) } },
            on(event, progress, error, complete) { complete(); }
          };
          return task;
        }
      };
    }
  });
  window.__quantusTablet.toast = () => {};
  window.__quantusTablet.makeOperation = (kind, action, collection, id, patch) => ({ kind, action, collection, id, patch });
  window.__quantusTablet.executeOperation = (operation) => {
    geschrieben.push(operation);
    const map = window.__quantusTablet.state.payload.entities[operation.collection];
    if (map && map[operation.id]) Object.assign(map[operation.id], operation.patch);
    return Promise.resolve(true);
  };

  const datei = { name: "Angebot.pdf", size: 204800, type: "application/pdf" };
  await window.QuantusTabletWorkspace.uploadTo("chatgptLeads", "lead1", [datei]);

  const lead = window.__quantusTablet.state.payload.entities.chatgptLeads.lead1;
  assert.equal(lead.files.length, 1, "uploadTo haengt die Datei nicht am richtigen Lead an");
  assert.equal(lead.files[0].name, "Angebot.pdf", "der Dateiname fehlt im angehaengten Datensatz");
  assert.equal(lead.files[0].size, 204800, "die Dateigroesse fehlt im angehaengten Datensatz");
  assert.match(lead.files[0].storagePath, /^attachments\/chatgptLeads\/lead1\//, "der Storage-Pfad nutzt nicht den Fallback fuer unregistrierte Sammlungen");
  assert.equal(geschrieben.length, 1, "uploadTo schreibt nicht ueber genau eine echte Operation (executeOperation)");
  assert.equal(geschrieben[0].collection, "chatgptLeads", "die Operation zeigt nicht auf chatgptLeads");
  assert.equal(geschrieben[0].id, "lead1", "die Operation zeigt nicht auf den richtigen Lead");

  console.log("workspace: uploadTo() (Dokument-Anhang, bestehender Upload) passed");
})().then(() => {
  console.log("workspace: tablet canvas module passed");
}).catch((error) => {
  console.error("workspace: tablet canvas module failed", error);
  process.exit(1);
});
