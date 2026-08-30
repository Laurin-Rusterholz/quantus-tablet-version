// Produktionsbefund (Nutzer): "unter dem app pinnboards sollen von anfang an
// alle pinnboard angezeigt werden ... nicht dass ich auswaehlen kann, wenn
// ich eines geoeffnet habe, welches ich ueberhaupt oeffnen moechte".
//
// Sticky Boards oeffnete beim Betreten immer noch das zuletzt angesehene
// Board statt der Uebersicht. Ursache: render() in app.js ruft mount(route)
// NUR fuer das Modul auf, dessen Route gerade aktiv ist — route ist im
// jeweiligen mount() also IMMER die eigene Route, nie etwas anderes. Die
// Abfrage "route !== 'sticky'" (bzw. "route !== 'dailybriefing'" im
// Morgenbriefing) konnte deshalb nie zutreffen: modul-lokaler Zustand
// (ui.offen, state.dbTag) ueberlebte jeden Wechsel zu einer anderen App
// (CLAUDE.md-Fallstrick 4: "Zustandsreste ueberleben den Ansichtswechsel").
//
// Der Fix ersetzt die tote mount()-Abfrage durch einen hashchange-Listener:
// der feuert genau bei echter Navigation, unabhaengig davon, wie oft
// render()/mount() sonst neu laufen (Sync, eigene Aktionen im offenen Board).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

let checks = 0;
const ok = (value, message) => { checks++; assert.ok(value, message); };

const read = (name) => fs.readFileSync(path.join(__dirname, "..", "public", name), "utf8");
const sticky = read("sticky-app.js");
const briefing = read("briefing-app.js");

// ── Die tote if-Abfrage in mount() ist weg, die Modul-Registrierung
//    referenziert kein verschwundenes mount() mehr (das war beim Erstellen
//    des Fixes selbst ein ReferenceError, der das ganze Skript und damit die
//    App-Registrierung zum Absturz gebracht haette) ──
for (const [quelle, name] of [[sticky, "sticky-app.js"], [briefing, "briefing-app.js"]]) {
  ok(!/mount:\s*mount/.test(quelle), `${name}: die Modul-Registrierung verweist noch auf ein mount(), das es nicht mehr gibt`);
  ok(!/if\s*\(\s*route\s*!==\s*"(sticky|dailybriefing)"\s*\)/.test(quelle),
    `${name}: die alte, nie zutreffende mount()-Bedingung steht noch da`);
  ok(/addEventListener\("hashchange"/.test(quelle), `${name}: kein hashchange-Listener registriert`);
}

// ── Echt: der hashchange-Handler aus sticky-app.js gegen eine Attrappe ────
{
  const a = sticky.indexOf('window.addEventListener("hashchange"');
  const start = sticky.indexOf("{", sticky.indexOf("function ()", a)) ;
  const ende = sticky.indexOf("});", a);
  ok(a > 0 && start > a && ende > start, "hashchange-Handler in sticky-app.js nicht auffindbar");
  if (a > 0 && start > a && ende > start) {
    const rumpf = sticky.slice(start, ende + 1);
    const ui = { offen: { collection: "concepts", id: "c1" }, gewaehlt: "note1" };
    const laufen = new Function("location", "ui", rumpf);

    // a) Navigation weg von "sticky": das offene Board faellt weg.
    laufen({ hash: "#/home" }, ui);
    ok(ui.offen === null, "Navigation zu #/home raeumt ui.offen nicht auf — das alte Board bliebe offen");
    ok(ui.gewaehlt === null, "Navigation zu #/home raeumt ui.gewaehlt nicht auf");

    // b) Bleibt man auf "sticky" (z. B. eigener render()-Aufruf nach sk-open),
    //    darf ein gerade geoeffnetes Board nicht verschwinden.
    const ui2 = { offen: { collection: "tasks", id: "t1" }, gewaehlt: null };
    laufen({ hash: "#/sticky" }, ui2);
    ok(ui2.offen !== null, "DER BEFUND waere sonst nur verschoben: ein Wechsel INNERHALB von sticky raeumt das Board faelschlich weg");
  }
}

// ── Echt: derselbe Handler aus briefing-app.js, hier gegen state.dbTag ────
{
  const a = briefing.indexOf('window.addEventListener("hashchange"');
  const start = briefing.indexOf("{", briefing.indexOf("function ()", a));
  const ende = briefing.indexOf("});", a);
  ok(a > 0 && start > a && ende > start, "hashchange-Handler in briefing-app.js nicht auffindbar");
  if (a > 0 && start > a && ende > start) {
    const rumpf = briefing.slice(start, ende + 1);
    const bauen = (tag) => {
      const zustand = { state: { dbTag: tag } };
      return { zustand, api: () => zustand, laufen: new Function("location", "api", rumpf) };
    };

    // a) Navigation weg von "dailybriefing": der gewaehlte Tag faellt weg.
    let u = bauen("2026-08-20");
    u.laufen({ hash: "#/home" }, u.api);
    ok(u.zustand.state.dbTag === null, "Navigation zu #/home raeumt den gewaehlten Vortag nicht auf");

    // b) Bleibt man auf "dailybriefing", darf der gewaehlte Tag nicht verschwinden.
    u = bauen("2026-08-20");
    u.laufen({ hash: "#/dailybriefing" }, u.api);
    ok(u.zustand.state.dbTag === "2026-08-20", "ein Wechsel INNERHALB von dailybriefing raeumt den gewaehlten Tag faelschlich weg");
  }
}

console.log(`Zustand nach Navigation (Sticky Boards, Morgenbriefing): ok (${checks} Pruefungen)`);
