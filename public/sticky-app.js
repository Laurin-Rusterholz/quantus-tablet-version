/*
 * STICKY BOARDS — eine eigene App.
 *
 * BEFUND (Nutzer: "tablet canvas auch richtig dummes konzept. ich moechte im
 * vollbild ein sticky board oeffnen, mach einfach wie in quantus eine app
 * dort sehe ich alle boards und kann sie oeffnen"): Sticky Boards waren auf
 * dem Tablet nur ein Reiter im Canvas-Werkzeug — man kam an ein Board nur
 * ueber das Element, an dem es haengt. Wer wissen wollte, WELCHE Boards es
 * gibt, musste jede Aufgabe und jedes Projekt einzeln aufmachen.
 *
 * Diese App dreht das um: erst alle Boards, dann eines im Vollbild.
 *
 * Ein Board liegt in AI Sync am Element selbst — entity.stickyBoard mit
 * notes, connections, drawings und view (public/index.html, getBoard()).
 * Boards gibt es an Aufgaben, Projekten, Strategien und Konzepten. Gelesen
 * und geschrieben wird deshalb ueber die gewoehnliche Entitaets-Operation:
 * derselbe Weg, dieselbe Transaktion, derselbe Datenstand wie ueberall sonst.
 */
(function () {
  "use strict";

  // Dieselbe Palette wie in AI Sync. Weicht sie ab, sieht dasselbe Board auf
  // Tablet und Desktop verschieden aus.
  var FARBEN = [
    { key: "yellow", label: "Gelb", bg: "#ffe066", text: "#3a2f00" },
    { key: "green", label: "Grün", bg: "#b2f2bb", text: "#0b3d1a" },
    { key: "blue", label: "Blau", bg: "#a5d8ff", text: "#0a2e4d" },
    { key: "pink", label: "Pink", bg: "#fcc2d7", text: "#4d0a29" },
    { key: "orange", label: "Orange", bg: "#ffd8a8", text: "#4d2600" },
    { key: "purple", label: "Lila", bg: "#d0bfff", text: "#2a0a4d" },
    { key: "teal", label: "Petrol", bg: "#96f2d7", text: "#083d33" },
    { key: "red", label: "Rot", bg: "#ffc9c9", text: "#4d0a0a" },
    { key: "gray", label: "Grau", bg: "#dee2e6", text: "#212529" }
  ];
  // Boards haengen an diesen vier Sammlungen — genau wie KIND_MAP in AI Sync.
  var TRAEGER = [
    { collection: "tasks", label: "Aufgabe", plural: "Aufgaben", icon: "✓" },
    { collection: "projects", label: "Projekt", plural: "Projekte", icon: "▧" },
    { collection: "strategies", label: "Strategie", plural: "Strategien", icon: "◇" },
    { collection: "concepts", label: "Konzept", plural: "Konzepte", icon: "◆" }
  ];
  var NOTE_W = 180, NOTE_H = 180, GRID = 10;

  function api() { return window.__quantusTablet || null; }
  function esc(value) {
    var a = api();
    if (a) return a.esc(value);
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function attr(value) { return esc(value); }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function farbe(key) {
    return FARBEN.find(function (f) { return f.key === key; }) || FARBEN[0];
  }

  var skSpeichernd = {};
  var ui = {
    offen: null,      // { collection, id }
    suche: "",
    farbe: "yellow",
    gewaehlt: null,   // Id der angetippten Notiz
    ansicht: { x: 0, y: 0, zoom: 1 }
  };

  // ── Daten ─────────────────────────────────────────────────────────────────
  function alleBoards() {
    var a = api();
    if (!a) return [];
    var liste = [];
    TRAEGER.forEach(function (traeger) {
      a.collection(traeger.collection).forEach(function (item) {
        var board = obj(item.stickyBoard);
        var notizen = arr(board.notes);
        if (!notizen.length) return;
        liste.push({ traeger: traeger, item: item, board: board, notizen: notizen });
      });
    });
    return liste.sort(function (x, y) {
      return Date.parse(y.item.updatedAt || y.item.createdAt || 0) - Date.parse(x.item.updatedAt || x.item.createdAt || 0);
    });
  }

  function boardVon(collection, id) {
    var a = api();
    if (!a) return null;
    var item = a.collection(collection).find(function (entry) { return entry.id === id; });
    if (!item) return null;
    var board = obj(item.stickyBoard);
    return {
      item: item,
      traeger: TRAEGER.find(function (t) { return t.collection === collection; }) || TRAEGER[0],
      board: {
        notes: arr(board.notes),
        connections: arr(board.connections),
        drawings: arr(board.drawings),
        view: obj(board.view),
        bulkMode: Boolean(board.bulkMode)
      }
    };
  }

  /*
   * Ein Board sichern. Der Patch traegt IMMER das ganze Board — die
   * Entitaets-Operation ersetzt das Feld, ein Teilstueck wuerde also
   * connections und drawings still loeschen. Genau die Zeichnungen, die auf
   * dem Tablet gar nicht bearbeitet werden, waeren als Erstes weg.
   */
  var sicherTimer = null;
  function sichern(collection, id, board, sofort) {
    var a = api();
    if (!a) return;
    var patch = {
      stickyBoard: {
        notes: board.notes,
        connections: board.connections,
        drawings: board.drawings,
        view: board.view,
        bulkMode: board.bulkMode
      }
    };
    clearTimeout(sicherTimer);
    var schreiben = function () {
      a.executeOperation(a.makeOperation("entity", "update", collection, id, patch), { silent: true });
    };
    if (sofort) schreiben(); else sicherTimer = setTimeout(schreiben, 500);
  }

  function neueNotiz(board, x, y) {
    var hoechstesZ = board.notes.reduce(function (m, n) { return Math.max(m, Number(n.z) || 0); }, 0);
    var a = api();
    return {
      id: (a ? a.Core.makeId("note") : "note_" + Math.random().toString(36).slice(2)),
      x: Math.round(x / GRID) * GRID,
      y: Math.round(y / GRID) * GRID,
      w: NOTE_W, h: NOTE_H,
      text: "", color: ui.farbe, textColor: "",
      shape: "square", fontSize: "auto", align: "center", valign: "middle",
      bold: false, italic: false, underline: false, strike: false,
      z: hoechstesZ + 1, tags: [], votes: 0, locked: false,
      groupId: null, author: "tablet", noteId: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
  }

  // ── Übersicht ─────────────────────────────────────────────────────────────
  // Eine kleine Vorschau aus den echten Notiz-Positionen. Sie zeigt auf einen
  // Blick, ob ein Board voll oder fast leer ist — ein blosser Zaehler nicht.
  function vorschau(notizen) {
    if (!notizen.length) return "";
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    notizen.forEach(function (n) {
      minX = Math.min(minX, Number(n.x) || 0);
      minY = Math.min(minY, Number(n.y) || 0);
      maxX = Math.max(maxX, (Number(n.x) || 0) + (Number(n.w) || NOTE_W));
      maxY = Math.max(maxY, (Number(n.y) || 0) + (Number(n.h) || NOTE_H));
    });
    var breite = Math.max(1, maxX - minX);
    var hoehe = Math.max(1, maxY - minY);
    return '<svg class="sk-vorschau" viewBox="' + minX + " " + minY + " " + breite + " " + hoehe +
      '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      notizen.slice(0, 60).map(function (n) {
        var f = farbe(n.color);
        return '<rect x="' + (Number(n.x) || 0) + '" y="' + (Number(n.y) || 0) +
          '" width="' + (Number(n.w) || NOTE_W) + '" height="' + (Number(n.h) || NOTE_H) +
          '" rx="8" fill="' + f.bg + '"/>';
      }).join("") + "</svg>";
  }

  function renderUebersicht() {
    var a = api();
    var boards = alleBoards();
    var suche = ui.suche.trim().toLowerCase();
    var gefiltert = suche
      ? boards.filter(function (eintrag) {
          return (a.itemTitle(eintrag.item, "") + " " + eintrag.traeger.label).toLowerCase().indexOf(suche) >= 0 ||
            eintrag.notizen.some(function (n) { return String(n.text || "").toLowerCase().indexOf(suche) >= 0; });
        })
      : boards;

    // Elemente ohne Board — damit man hier eines anlegen kann, statt dafuer
    // erst die Aufgabe suchen zu muessen.
    var ohneBoard = [];
    TRAEGER.forEach(function (traeger) {
      a.collection(traeger.collection).forEach(function (item) {
        if (arr(obj(item.stickyBoard).notes).length) return;
        ohneBoard.push({ traeger: traeger, item: item });
      });
    });

    return '<div class="view">' +
      a.viewHeader("Sticky Boards",
        boards.length + " Board" + (boards.length === 1 ? "" : "s") +
        " an Aufgaben, Projekten, Strategien und Konzepten — im Vollbild bearbeitbar.",
        '<button class="btn" data-action="workspace">✎ Canvas</button>') +
      a.loginBanner() +
      '<div class="filterbar">' +
        '<div class="search-field"><span>⌕</span><input data-action="sk-suche" placeholder="Boards und Notizen durchsuchen" value="' +
          attr(ui.suche) + '" autocomplete="off"></div>' +
      "</div>" +
      (gefiltert.length
        ? '<div class="sk-grid">' + gefiltert.map(function (eintrag) {
            return '<button class="sk-karte" data-action="sk-open" data-collection="' + attr(eintrag.traeger.collection) +
              '" data-id="' + attr(eintrag.item.id) + '">' +
              '<span class="sk-karte-vorschau">' + vorschau(eintrag.notizen) + "</span>" +
              '<span class="sk-karte-fuss">' +
                '<span class="badge accent">' + esc(eintrag.traeger.icon) + " " + esc(eintrag.traeger.label) + "</span>" +
                "<strong>" + esc(a.itemTitle(eintrag.item, "Ohne Titel")) + "</strong>" +
                "<small>" + eintrag.notizen.length + " Notizen" +
                (arr(eintrag.board.connections).length ? " · " + arr(eintrag.board.connections).length + " Verbindungen" : "") +
                "</small>" +
              "</span></button>";
          }).join("") + "</div>"
        : a.emptyState("▦", suche ? "Kein Board gefunden" : "Noch keine Boards",
            suche ? "Andere Suche versuchen." : "Lege unten an einem Element ein Board an.")) +
      (ohneBoard.length
        ? '<section class="widget span-12" style="margin-top:22px"><div class="widget-head">' +
          '<span class="widget-icon">＋</span><h2>Neues Board anlegen</h2></div>' +
          '<p class="muted small">Ein Board gehört immer zu einem Element — so findest du es später dort wieder.</p>' +
          '<form class="sk-neu" data-form="sk-neu"><select name="ziel" required>' +
          TRAEGER.map(function (traeger) {
            var eigene = ohneBoard.filter(function (e) { return e.traeger.collection === traeger.collection; });
            if (!eigene.length) return "";
            return '<optgroup label="' + attr(traeger.plural) + '">' + eigene.slice(0, 60).map(function (e) {
              return '<option value="' + attr(traeger.collection + ":" + e.item.id) + '">' +
                esc(a.itemTitle(e.item, traeger.label)) + "</option>";
            }).join("") + "</optgroup>";
          }).join("") + "</select>" +
          '<button class="btn primary" type="submit">Board anlegen und öffnen</button></form></section>'
        : "") +
      "</div>";
  }

  // ── Board im Vollbild ─────────────────────────────────────────────────────
  function renderBoard() {
    var a = api();
    var daten = boardVon(ui.offen.collection, ui.offen.id);
    if (!daten) {
      ui.offen = null;
      return renderUebersicht();
    }
    var notizen = daten.board.notes.slice().sort(function (x, y) { return (Number(x.z) || 0) - (Number(y.z) || 0); });
    var verbindungen = daten.board.connections;
    var v = ui.ansicht;

    // Verbindungen werden gezeichnet, aber auf dem Tablet nicht bearbeitet.
    // Sie gehen beim Sichern trotzdem nicht verloren — das Board wird immer
    // vollstaendig geschrieben.
    var linien = verbindungen.map(function (verbindung) {
      var von = notizen.find(function (n) { return n.id === verbindung.from || n.id === verbindung.a; });
      var bis = notizen.find(function (n) { return n.id === verbindung.to || n.id === verbindung.b; });
      if (!von || !bis) return "";
      return '<line x1="' + ((Number(von.x) || 0) + (Number(von.w) || NOTE_W) / 2) +
        '" y1="' + ((Number(von.y) || 0) + (Number(von.h) || NOTE_H) / 2) +
        '" x2="' + ((Number(bis.x) || 0) + (Number(bis.w) || NOTE_W) / 2) +
        '" y2="' + ((Number(bis.y) || 0) + (Number(bis.h) || NOTE_H) / 2) + '"/>';
    }).join("");

    return '<div class="sk-board" id="skBoard">' +
      '<div class="sk-leiste">' +
        '<button class="btn" data-action="sk-close">‹ Alle Boards</button>' +
        '<div class="sk-leiste-titel"><strong>' + esc(a.itemTitle(daten.item, "Board")) + "</strong>" +
        "<small>" + esc(daten.traeger.label) + " · " + notizen.length + " Notizen</small></div>" +
        '<div class="sk-palette">' + FARBEN.map(function (f) {
          return '<button class="sk-farbe' + (ui.farbe === f.key ? " on" : "") + '" data-action="sk-farbe" data-key="' +
            attr(f.key) + '" style="background:' + f.bg + '" title="' + attr(f.label) + '" aria-label="' + attr(f.label) + '"></button>';
        }).join("") + "</div>" +
        '<div class="sk-leiste-rechts">' +
          '<button class="icon-action" data-action="sk-zoom" data-d="-1" aria-label="Kleiner">−</button>' +
          '<span class="sk-zoomwert">' + Math.round(v.zoom * 100) + "%</span>" +
          '<button class="icon-action" data-action="sk-zoom" data-d="1" aria-label="Grösser">＋</button>' +
          '<button class="icon-action" data-action="sk-fit" aria-label="Alles zeigen">⛶</button>' +
          '<button class="btn primary" data-action="sk-add">＋ Notiz</button>' +
        "</div>" +
      "</div>" +
      '<div class="sk-flaeche" id="skFlaeche">' +
        '<div class="sk-welt" id="skWelt" style="transform:translate(' + v.x + "px," + v.y + "px) scale(" + v.zoom + ')">' +
          (linien ? '<svg class="sk-linien">' + linien + "</svg>" : "") +
          notizen.map(function (n) {
            var f = farbe(n.color);
            return '<div class="sk-note' + (ui.gewaehlt === n.id ? " on" : "") + '" data-sk-note="' + attr(n.id) + '" ' +
              'style="left:' + (Number(n.x) || 0) + "px;top:" + (Number(n.y) || 0) + "px;width:" + (Number(n.w) || NOTE_W) +
              "px;height:" + (Number(n.h) || NOTE_H) + "px;background:" + f.bg + ";color:" + (n.textColor || f.text) +
              ";z-index:" + (Number(n.z) || 0) + '">' +
              /*
                 BEFUND (gemessen, Chromium): ein Zug an der Notiz bewegte sie
                 nicht. Die Schreibflaeche bedeckte die ganze Notiz, also
                 landete jeder Zeigerdruck im contenteditable — und dort wird
                 Text markiert, nicht geschoben. Es gab schlicht keine Stelle
                 zum Anfassen.
                 Jede Notiz hat deshalb eine Griffleiste. Ein Tipp in die
                 Flaeche schreibt, ein Zug am Griff verschiebt — beides mit
                 einem einzigen Tipp und ohne versteckte Geste. */
              '<div class="sk-note-griff" data-sk-griff="' + attr(n.id) + '" title="Zum Verschieben ziehen">' +
                '<span class="sk-note-punkte" aria-hidden="true">⠿</span>' +
                '<span class="sk-note-werkzeuge">' +
                  '<button class="sk-note-knopf" data-action="sk-note-noteflow" data-id="' + attr(n.id) + '" aria-label="In Noteflow speichern">' + (n.noteId ? "↗" : "＋✎") + "</button>" +
                  '<button class="sk-note-knopf" data-action="sk-note-farbe" data-id="' + attr(n.id) + '" aria-label="Farbe wechseln">◐</button>' +
                  '<button class="sk-note-knopf" data-action="sk-note-weg" data-id="' + attr(n.id) + '" aria-label="Notiz löschen">⌫</button>' +
                "</span></div>" +
              '<div class="sk-note-text" contenteditable="true" data-sk-text="' + attr(n.id) +
                '" spellcheck="true">' + esc(n.text || "") + "</div></div>";
          }).join("") +
        "</div>" +
        (notizen.length ? "" : '<div class="sk-leerflaeche">Dieses Board ist leer. Tippe auf „＋ Notiz".</div>') +
      "</div></div>";
  }

  function render() {
    return ui.offen ? renderBoard() : renderUebersicht();
  }

  // ── Bedienung ─────────────────────────────────────────────────────────────
  function schreibeNotiz(id, patch) {
    var daten = boardVon(ui.offen.collection, ui.offen.id);
    if (!daten) return null;
    var notizen = daten.board.notes.map(function (n) {
      if (n.id !== id) return n;
      return Object.assign({}, n, patch, { updatedAt: new Date().toISOString() });
    });
    daten.board.notes = notizen;
    return daten;
  }

  function onAction(action, button) {
    var a = api();
    if (!a) return false;

    if (action === "sk-open") {
      ui.offen = { collection: button.dataset.collection, id: button.dataset.id };
      ui.gewaehlt = null;
      var daten = boardVon(ui.offen.collection, ui.offen.id);
      var gemerkt = daten ? obj(daten.board.view) : {};
      ui.ansicht = {
        x: Number(gemerkt.x) || 0,
        y: Number(gemerkt.y) || 0,
        zoom: Number(gemerkt.zoom) > 0 ? Number(gemerkt.zoom) : 1
      };
      a.render();
      return true;
    }
    if (action === "sk-close") { ui.offen = null; ui.gewaehlt = null; a.render(); return true; }
    if (action === "sk-farbe") { ui.farbe = button.dataset.key; a.render(); return true; }

    if (action === "sk-add") {
      var stand = boardVon(ui.offen.collection, ui.offen.id);
      if (!stand) return true;
      // Die neue Notiz landet in der Mitte des SICHTBAREN Ausschnitts — nicht
      // im Nullpunkt, den man nach dem Verschieben gar nicht mehr sieht.
      var flaeche = document.getElementById("skFlaeche");
      var breite = flaeche ? flaeche.clientWidth : 900;
      var hoehe = flaeche ? flaeche.clientHeight : 600;
      var mitteX = (breite / 2 - ui.ansicht.x) / ui.ansicht.zoom - NOTE_W / 2;
      var mitteY = (hoehe / 2 - ui.ansicht.y) / ui.ansicht.zoom - NOTE_H / 2;
      var notiz = neueNotiz(stand.board, mitteX, mitteY);
      stand.board.notes = stand.board.notes.concat([notiz]);
      sichern(ui.offen.collection, ui.offen.id, stand.board, true);
      ui.gewaehlt = notiz.id;
      a.render();
      requestAnimationFrame(function () {
        var feld = document.querySelector('[data-sk-text="' + notiz.id + '"]');
        if (feld) feld.focus();
      });
      return true;
    }
    if (action === "sk-note-weg") {
      var weg = boardVon(ui.offen.collection, ui.offen.id);
      if (!weg) return true;
      weg.board.notes = weg.board.notes.filter(function (n) { return n.id !== button.dataset.id; });
      weg.board.connections = weg.board.connections.filter(function (c) {
        return c.from !== button.dataset.id && c.to !== button.dataset.id &&
          c.a !== button.dataset.id && c.b !== button.dataset.id;
      });
      sichern(ui.offen.collection, ui.offen.id, weg.board, true);
      a.render();
      return true;
    }
    if (action === "sk-note-farbe") {
      var jetzt = boardVon(ui.offen.collection, ui.offen.id);
      if (!jetzt) return true;
      var notiz2 = jetzt.board.notes.find(function (n) { return n.id === button.dataset.id; });
      if (!notiz2) return true;
      var pos = FARBEN.findIndex(function (f) { return f.key === notiz2.color; });
      var neu = FARBEN[(pos + 1) % FARBEN.length].key;
      var stand2 = schreibeNotiz(button.dataset.id, { color: neu });
      if (stand2) { sichern(ui.offen.collection, ui.offen.id, stand2.board, true); a.render(); }
      return true;
    }
    if (action === "sk-note-noteflow") {
      var data = boardVon(ui.offen.collection, ui.offen.id);
      if (!data) return true;
      var sticky = data.board.notes.find(function (note) { return note.id === button.dataset.id; });
      if (!sticky) return true;
      // Zwei schnelle Tipps vor dem then() erzeugten zwei Notizen (Review P3).
      if (skSpeichernd[sticky.id]) return true;
      skSpeichernd[sticky.id] = true;
      if (sticky.noteId && obj(obj(a.state.payload).entities).notes && obj(obj(a.state.payload).entities).notes[sticky.noteId]) {
        a.go("notes"); return true;
      }
      var noteId = a.Core.makeId("note");
      a.saveCanonicalNote({ id:noteId, noteClass:"research", title:"Post-it · " + a.itemTitle(data.item,"Board"),
        content:String(sticky.text || ""), tags:[a.itemTitle(data.item,"Board")].concat(arr(sticky.tags)), notebookId:null,
        source:{ app:"sticky", entityType:"postit", entityId:sticky.id, label:a.itemTitle(data.item,"Board"), route:"#/sticky" },
        dedupeKey:"sticky:" + ui.offen.collection + ":" + ui.offen.id + ":" + sticky.id
      }).then(function () {
        delete skSpeichernd[sticky.id];
        sticky.noteId = noteId; sticky.updatedAt = new Date().toISOString();
        sichern(ui.offen.collection, ui.offen.id, data.board, true);
        a.toast("In Noteflow gespeichert", a.itemTitle(data.item,"Board"), "ok"); a.render();
      }).catch(function (error) { a.toast("Nicht gespeichert", error.message, "error"); });
      return true;
    }
    if (action === "sk-zoom") {
      var richtung = Number(button.dataset.d) || 0;
      ui.ansicht.zoom = Math.max(0.3, Math.min(2.5, ui.ansicht.zoom + richtung * 0.15));
      ansichtAnwenden();
      return true;
    }
    if (action === "sk-fit") {
      passeEin();
      return true;
    }
    return false;
  }

  // Zoom und Verschieben aendern nur die Darstellung. Ein vollstaendiges
  // Neuzeichnen wuerde dabei jede offene Schreibflaeche zerstoeren — deshalb
  // wird nur die Transformation gesetzt.
  function ansichtAnwenden() {
    var welt = document.getElementById("skWelt");
    if (welt) {
      welt.style.transform = "translate(" + ui.ansicht.x + "px," + ui.ansicht.y + "px) scale(" + ui.ansicht.zoom + ")";
    }
    var wert = document.querySelector(".sk-zoomwert");
    if (wert) wert.textContent = Math.round(ui.ansicht.zoom * 100) + "%";
    if (ui.offen) {
      var stand = boardVon(ui.offen.collection, ui.offen.id);
      if (stand) {
        stand.board.view = { x: ui.ansicht.x, y: ui.ansicht.y, zoom: ui.ansicht.zoom };
        sichern(ui.offen.collection, ui.offen.id, stand.board);
      }
    }
  }

  function passeEin() {
    if (!ui.offen) return;
    var stand = boardVon(ui.offen.collection, ui.offen.id);
    var flaeche = document.getElementById("skFlaeche");
    if (!stand || !flaeche || !stand.board.notes.length) return;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    stand.board.notes.forEach(function (n) {
      minX = Math.min(minX, Number(n.x) || 0);
      minY = Math.min(minY, Number(n.y) || 0);
      maxX = Math.max(maxX, (Number(n.x) || 0) + (Number(n.w) || NOTE_W));
      maxY = Math.max(maxY, (Number(n.y) || 0) + (Number(n.h) || NOTE_H));
    });
    var breite = Math.max(1, maxX - minX) + 80;
    var hoehe = Math.max(1, maxY - minY) + 80;
    var zoom = Math.max(0.3, Math.min(1.6, Math.min(flaeche.clientWidth / breite, flaeche.clientHeight / hoehe)));
    ui.ansicht.zoom = zoom;
    ui.ansicht.x = flaeche.clientWidth / 2 - ((minX + maxX) / 2) * zoom;
    ui.ansicht.y = flaeche.clientHeight / 2 - ((minY + maxY) / 2) * zoom;
    ansichtAnwenden();
  }

  function onSubmit(type, form, data) {
    var a = api();
    if (!a) return false;
    if (type === "sk-neu") {
      var ziel = String(data.get("ziel") || "");
      var teile = ziel.split(":");
      if (teile.length !== 2) return true;
      var board = { notes: [], connections: [], drawings: [], view: { x: 0, y: 0, zoom: 1 }, bulkMode: false };
      board.notes = [neueNotiz(board, 40, 40)];
      a.executeOperation(a.makeOperation("entity", "update", teile[0], teile[1], { stickyBoard: board }), { silent: true });
      ui.offen = { collection: teile[0], id: teile[1] };
      ui.ansicht = { x: 0, y: 0, zoom: 1 };
      a.toast("Board angelegt", "", "ok");
      return true;
    }
    return false;
  }

  // ── Ziehen und Schieben ───────────────────────────────────────────────────
  // Die Zeiger-Handler haengen fest am Dokument, greifen aber ausschliesslich
  // innerhalb eines geoeffneten Boards — sonst faengt hier nichts an.
  var zug = null;

  function weltPunkt(event) {
    return { x: event.clientX, y: event.clientY };
  }

  document.addEventListener("pointerdown", function (event) {
    if (!ui.offen) return;
    var flaeche = event.target.closest ? event.target.closest("#skFlaeche") : null;
    if (!flaeche) return;
    if (event.target.closest("button")) return;
    var griff = event.target.closest("[data-sk-griff]");
    var notiz = griff ? griff.closest(".sk-note") : null;
    // Ohne Griff wird nicht die Notiz gezogen: ein Tipp in die Flaeche
    // gehoert dem Text. Auf leerem Grund wird die Ansicht verschoben.
    if (!griff && event.target.closest(".sk-note")) return;
    var start = weltPunkt(event);
    if (notiz) {
      var id = notiz.dataset.skNote;
      var stand = boardVon(ui.offen.collection, ui.offen.id);
      var eintrag = stand && stand.board.notes.find(function (n) { return n.id === id; });
      if (!eintrag || eintrag.locked) return;
      zug = { art: "note", id: id, startX: start.x, startY: start.y,
              ausgangX: Number(eintrag.x) || 0, ausgangY: Number(eintrag.y) || 0, knoten: notiz, bewegt: false };
    } else {
      zug = { art: "flaeche", startX: start.x, startY: start.y,
              ausgangX: ui.ansicht.x, ausgangY: ui.ansicht.y, bewegt: false };
    }
  }, true);

  document.addEventListener("pointermove", function (event) {
    if (!zug) return;
    var dx = event.clientX - zug.startX;
    var dy = event.clientY - zug.startY;
    if (!zug.bewegt && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    zug.bewegt = true;
    event.preventDefault();
    if (zug.art === "flaeche") {
      ui.ansicht.x = zug.ausgangX + dx;
      ui.ansicht.y = zug.ausgangY + dy;
      var welt = document.getElementById("skWelt");
      if (welt) welt.style.transform = "translate(" + ui.ansicht.x + "px," + ui.ansicht.y + "px) scale(" + ui.ansicht.zoom + ")";
      return;
    }
    // Notiz: waehrend des Ziehens nur den Knoten bewegen. Erst beim Loslassen
    // wird geschrieben — sonst laeuft bei jedem Pixel eine Transaktion.
    var neuX = zug.ausgangX + dx / ui.ansicht.zoom;
    var neuY = zug.ausgangY + dy / ui.ansicht.zoom;
    zug.letzteX = Math.round(neuX / GRID) * GRID;
    zug.letzteY = Math.round(neuY / GRID) * GRID;
    if (zug.knoten) {
      zug.knoten.style.left = zug.letzteX + "px";
      zug.knoten.style.top = zug.letzteY + "px";
    }
  }, { passive: false });

  document.addEventListener("pointerup", function () {
    if (!zug) return;
    var aktuell = zug;
    zug = null;
    if (!aktuell.bewegt) return;
    if (aktuell.art === "flaeche") { ansichtAnwenden(); return; }
    var stand = schreibeNotiz(aktuell.id, { x: aktuell.letzteX, y: aktuell.letzteY });
    if (stand) sichern(ui.offen.collection, ui.offen.id, stand.board, true);
  }, true);

  // ── Text und Suche ────────────────────────────────────────────────────────
  var textTimer = {};
  document.addEventListener("input", function (event) {
    var feld = event.target.closest ? event.target.closest("[data-sk-text]") : null;
    if (feld && ui.offen) {
      var id = feld.dataset.skText;
      clearTimeout(textTimer[id]);
      textTimer[id] = setTimeout(function () {
        var stand = schreibeNotiz(id, { text: feld.textContent });
        if (stand) sichern(ui.offen.collection, ui.offen.id, stand.board, true);
      }, 600);
      return;
    }
    var suchfeld = event.target.closest ? event.target.closest('[data-action="sk-suche"]') : null;
    if (!suchfeld) return;
    ui.suche = suchfeld.value;
    clearTimeout(textTimer.__suche);
    textTimer.__suche = setTimeout(function () {
      var a = api();
      if (!a) return;
      a.render();
      requestAnimationFrame(function () {
        var next = document.querySelector('[data-action="sk-suche"]');
        if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
      });
    }, 160);
  });

  function mount(route) {
    // Beim Verlassen faellt das geoeffnete Board weg — sonst steht es beim
    // naechsten Betreten der App noch offen, obwohl man die Uebersicht wollte.
    if (route !== "sticky") { ui.offen = null; ui.gewaehlt = null; }
  }

  (window.__quantusTabletModules = window.__quantusTabletModules || []).push({
    key: "sticky",
    routes: ["sticky"],
    render: render,
    mount: mount,
    onAction: onAction,
    onSubmit: onSubmit
  });
})();
