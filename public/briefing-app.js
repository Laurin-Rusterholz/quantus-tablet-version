/*
 * MORGENBRIEFING — eine eigene App.
 *
 * BEFUND (Nutzer: "das morning briefing wird nicht am anfang angezeigt, das
 * soll auf dem tablet eine eigene app sein"). Zwei Ursachen:
 *
 * 1. Es hatte KEIN SYMBOL auf dem Homebildschirm. Die Route "dailybriefing"
 *    steht zwar im App-Katalog, aber nicht in den Seiten des Springboards —
 *    und normaliseLayout haengt unbekannte Apps hinten an die LETZTE Seite.
 *    Das Briefing lag also auf Seite vier, hinter allem anderen. Auf dem
 *    Homebildschirm gab es nur einen kleinen Vorschaukasten, und der zeigte
 *    auf "Heute", nicht auf das Briefing.
 * 2. Die Route war nur ein Alias: "dailybriefing" rief dieselbe Funktion wie
 *    "daily". Eine eigene App war es damit nie — bloss ein zweiter Name.
 *
 * Diese App ist der Start in den Tag: kurz, in der Reihenfolge, in der man
 * morgens hinsieht, und mit allem Schreibbaren gleich zur Hand. Die
 * vollstaendige Fassung mit allen siebzehn Abschnitten bleibt unveraendert
 * unter "Heute" und ist von hier einen Tipp entfernt.
 *
 * Gerechnet wird mit briefingModell() — DEMSELBEN Modell wie „Heute" und wie
 * der Kasten auf dem Homebildschirm. Zwei Rechnungen fuer denselben Tag
 * waeren zwei Wahrheiten.
 */
(function () {
  "use strict";

  function api() { return window.__quantusTablet || null; }
  function esc(value) {
    var a = api();
    if (a) return a.esc(value);
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function attr(value) { return esc(value); }
  function arr(value) { return Array.isArray(value) ? value : []; }

  function tagText(tag) {
    try {
      return new Date(tag + "T12:00:00").toLocaleDateString("de-CH", {
        weekday: "long", day: "numeric", month: "long"
      });
    } catch (_) { return tag; }
  }

  function gruss(tag, heute) {
    if (tag !== heute) return "Der " + tagText(tag);
    var stunde = new Date().getHours();
    return (stunde < 11 ? "Guten Morgen" : stunde < 18 ? "Guten Tag" : "Guten Abend") + ", Laurin.";
  }

  function kachel(spanne, symbol, titel, zusatz, inhalt, fuss) {
    return '<section class="widget span-' + spanne + ' mb-kachel">' +
      '<div class="widget-head"><span class="widget-icon">' + esc(symbol) + "</span><h2>" + esc(titel) + "</h2>" +
      (zusatz ? '<span class="badge">' + esc(zusatz) + "</span>" : "") + "</div>" +
      inhalt + (fuss || "") + "</section>";
  }

  function render() {
    var a = api();
    if (!a || typeof a.briefingModell !== "function") return "";
    var heute = a.localDateKey();
    var tag = a.state.dbTag || heute;
    var b;
    try { b = a.briefingModell(tag); } catch (fehler) { b = null; }
    if (!b) return '<div class="view">' + a.viewHeader("Morgenbriefing", "Der Tag liess sich nicht berechnen.", "") + "</div>";

    var routinen = arr(b.routinen);
    var routinenFertig = routinen.filter(function (h) { return a.isHabitDoneOn(h, tag); }).length;
    var ziele = arr(b.tagesziele);
    var zieleFertig = ziele.filter(function (g) { return g && g.completed; }).length;
    var faellig = arr(b.faellig);
    var ueberfaellig = arr(b.ueberfaellig);
    var termine = arr(b.meetings).slice().sort(function (x, y) {
      return String(x.start || x.startAt || x.time || "").localeCompare(String(y.start || y.startAt || y.time || ""));
    });
    var naechster = termine[0];
    var bloecke = arr(b.zeitbloecke);
    // Ein Leitgedanke, nicht alle: morgens liest man einen. Welcher, haengt
    // am Tag — so steht nicht jeden Morgen derselbe da.
    var beliefs = arr(b.beliefs);
    var leitgedanke = beliefs.length
      ? beliefs[Math.abs(Number(String(tag).replace(/-/g, ""))) % beliefs.length]
      : null;

    var aufgabenZeile = function (t) {
      var faelligAm = String(t.dueDate || "").slice(0, 10);
      return '<div class="list-item" data-action="toggle-task" data-id="' + attr(t.id) + '">' +
        '<span class="check"></span><div class="item-main"><div class="item-title">' +
        esc(a.itemTitle(t, "Aufgabe")) + "</div>" +
        (faelligAm && faelligAm < tag ? '<div class="item-meta">seit ' + esc(a.formatDate(faelligAm)) + "</div>" : "") +
        "</div></div>";
    };

    var routineZeile = function (h) {
      var fertig = a.isHabitDoneOn(h, tag);
      var teile = typeof a.habitSubUnits === "function" ? a.habitSubUnits(h) : [];
      var teileFertig = teile.filter(function (u) { return a.habitSubDone(h, u.name, tag); }).length;
      return '<div class="list-item ' + (fertig ? "done" : "") + '" data-action="toggle-habit" data-id="' + attr(h.id) + '">' +
        '<span class="check">' + (fertig ? "✓" : "") + "</span>" +
        '<div class="item-main"><div class="item-title">' + esc(h.text || a.itemTitle(h, "Routine")) + "</div>" +
        (teile.length ? '<div class="item-meta">' + teileFertig + "/" + teile.length + " Schritte</div>" : "") +
        "</div></div>";
    };

    return '<div class="view mb-view">' +
      a.viewHeader("Morgenbriefing", gruss(tag, heute) + (tag === heute ? " " + tagText(tag) : ""),
        '<button class="btn" data-action="db-day" data-tage="-1">‹ Vortag</button>' +
        (tag === heute ? "" : '<button class="btn" data-action="db-day" data-tag="heute">Heute</button>') +
        '<button class="btn" data-action="db-day" data-tage="1">Folgetag ›</button>' +
        '<button class="btn" data-action="go" data-route="daily">Alle Abschnitte ›</button>') +
      a.loginBanner() +

      // ── Der Tag in einer Zeile ──────────────────────────────────────────
      '<div class="mb-zahlen">' +
        '<button class="mb-zahl" data-action="go" data-route="calendar"><strong>' + termine.length +
          "</strong><small>Termine</small></button>" +
        '<button class="mb-zahl" data-action="go" data-route="tasks"><strong>' + faellig.length +
          "</strong><small>fällig</small></button>" +
        '<button class="mb-zahl' + (ueberfaellig.length ? " warn" : "") + '" data-action="go" data-route="tasks"><strong>' +
          ueberfaellig.length + "</strong><small>überfällig</small></button>" +
        '<button class="mb-zahl" data-action="go" data-route="habits"><strong>' + routinenFertig + "/" + routinen.length +
          "</strong><small>Routinen</small></button>" +
        '<span class="mb-zahl"><strong>' + zieleFertig + "/" + ziele.length + "</strong><small>Tagesziele</small></span>" +
      "</div>" +

      '<div class="dashboard-grid">' +

        // ── Als Nächstes ──────────────────────────────────────────────────
        kachel(6, "◉", "Als Nächstes", termine.length ? String(termine.length) : "",
          (naechster
            ? '<div class="mb-naechst"><span class="mb-zeit">' +
              esc(a.formatTime(naechster.start || naechster.startAt || naechster.time) || "Ganztags") + "</span>" +
              '<div><strong>' + esc(a.itemTitle(naechster, "Termin")) + "</strong>" +
              (naechster.location || naechster.place
                ? "<small>" + esc(naechster.location || naechster.place) + "</small>" : "") + "</div></div>" +
              (termine.length > 1
                ? '<div class="item-list">' + termine.slice(1, 5).map(function (m) {
                    return '<div class="list-item"><span class="badge accent">' +
                      esc(a.formatTime(m.start || m.startAt || m.time) || "—") + "</span>" +
                      '<div class="item-main"><div class="item-title">' + esc(a.itemTitle(m, "Termin")) + "</div></div></div>";
                  }).join("") + "</div>"
                : "")
            : a.emptyMini("Keine Termine — der Tag gehört dir.")) +
          (bloecke.length
            ? '<div class="mb-bloecke">' + bloecke.map(function (tb) {
                return "<span>" + esc(String(tb.startTime || "").slice(0, 5)) + " " +
                  esc(tb.title || tb.text || "Block") + "</span>";
              }).join("") + "</div>"
            : "")) +

        // ── Tagesziele: das Einzige, was man morgens wirklich schreibt ─────
        kachel(6, "◎", "Was heute zählt", zieleFertig + "/" + ziele.length,
          '<div class="item-list">' + (ziele.length
            ? ziele.map(function (g) {
                return '<div class="list-item ' + (g.completed ? "done" : "") +
                  '" data-action="db-toggle-goal" data-id="' + attr(g.id) + '">' +
                  '<span class="check">' + (g.completed ? "✓" : "") + "</span>" +
                  '<div class="item-main"><div class="item-title">' + esc(g.title || "") + "</div></div></div>";
              }).join("")
            : a.emptyMini("Noch kein Tagesziel — schreib das Wichtigste auf.")) + "</div>" +
          '<form class="quick-add" data-form="db-goal"><span>＋</span>' +
          '<input name="title" placeholder="Ziel für diesen Tag" autocomplete="off">' +
          '<button class="btn primary small-btn" type="submit">Hinzufügen</button></form>') +

        // ── Überfällig steht VOR fällig: es ist das, was drückt ────────────
        (ueberfaellig.length
          ? kachel(6, "!", "Überfällig", String(ueberfaellig.length),
              '<div class="item-list">' + ueberfaellig.slice(0, 8).map(aufgabenZeile).join("") + "</div>",
              ueberfaellig.length > 8
                ? '<button class="btn small-btn" data-action="go" data-route="tasks">Alle ' + ueberfaellig.length + " zeigen</button>"
                : "")
          : "") +

        kachel(ueberfaellig.length ? 6 : 12, "✓", "Fällig heute", String(faellig.length),
          '<div class="item-list">' + (faellig.length
            ? faellig.slice(0, 10).map(aufgabenZeile).join("")
            : a.emptyMini("Nichts fällig.")) + "</div>") +

        // ── Routinen ──────────────────────────────────────────────────────
        kachel(6, "◌", "Routinen", routinenFertig + "/" + routinen.length,
          '<div class="item-list">' + (routinen.length
            ? routinen.map(routineZeile).join("")
            : a.emptyMini("Noch keine Routinen.")) + "</div>") +

        // ── Gedanke und Tagesnotiz ────────────────────────────────────────
        kachel(6, "✦", "Gedanken", "",
          (leitgedanke
            ? '<div class="mb-leitgedanke">' + esc(leitgedanke.text || String(leitgedanke)) + "</div>"
            : "") +
          '<form class="quick-add" data-form="db-thought"><span>＋</span>' +
          '<input name="text" placeholder="Gedanke, Frage, Beobachtung" autocomplete="off">' +
          '<button class="btn primary small-btn" type="submit">Notieren</button></form>' +
          '<div class="item-list">' + arr(b.gedanken).slice(0, 4).map(function (g) {
            return '<div class="list-item"><span>✦</span><div class="item-main"><div class="item-title">' +
              esc(g.text || "") + "</div></div></div>";
          }).join("") + "</div>") +

        kachel(6, "✎", "Notiz zum Tag", "",
          '<form data-form="db-note"><textarea name="notes" rows="6" class="mb-notiz" ' +
          'placeholder="Was beschäftigt dich heute?">' + esc(b.notizen || "") + "</textarea>" +
          '<button class="btn primary small-btn" type="submit" style="margin-top:8px">Notiz sichern</button></form>') +

      "</div>" +

      // Der ausfuehrliche Blick bleibt einen Tipp entfernt — er ist nicht
      // verschwunden, er steht nur nicht am Morgen im Weg.
      '<div class="mb-mehr"><button class="btn" data-action="go" data-route="daily">' +
        "Alle siebzehn Abschnitte des Tages ansehen ›</button></div>" +
      "</div>";
  }

  function mount(route) {
    // Beim Verlassen den gewaehlten Tag fallen lassen: sonst steht beim
    // naechsten Oeffnen noch der Vortag da, den man sich einmal angesehen hat.
    var a = api();
    if (route !== "dailybriefing" && a && a.state.dbTag) a.state.dbTag = null;
  }

  (window.__quantusTabletModules = window.__quantusTabletModules || []).push({
    key: "briefing",
    routes: ["dailybriefing"],
    render: render,
    mount: mount
  });
})();
