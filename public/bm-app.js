/*
 * BM VORBEREITUNG — die vollstaendige Pruefungsvorbereitung auf dem Tablet.
 *
 * BEFUND (Nutzer: "warum wird mir z. B. in der BM Vorbereitung nicht alles
 * angezeigt wie in Quantus selber"): bm.html hat ZEHN Bereiche — Uebersicht,
 * Lernplan, Tageslektion, Themen, Wiederholen, Wochentest, Karteikarten,
 * Merksaetze, Fortschritt, KI-Chat. Das Tablet zeigte DREI Lesekacheln:
 * heutige Lektion, Anzahl faelliger Wiederholungen, Liste der letzten Tage.
 * Lernen liess sich damit nicht — nur nachsehen, dass es etwas zu lernen gibt.
 *
 * Diese App baut die Vorbereitung nativ nach. Sie liest denselben Bestand:
 *
 *   RTDB bmpruefung/        aufg (Lernstand je Aufgabe), lessons/<tag>,
 *                           notes, config, activity
 *   theorie/kompendium.json 6 Faecher, 158 Themen, 1046 Aufgaben
 *
 * und schreibt an genau dieselbe Stelle wie bm.html: bmpruefung/aufg/<key>
 * mit demselben Leitner-Verfahren. Ein eigener Lernstand waere ein zweiter,
 * den niemand mehr zusammenfuehrt — auf dem Desktop stuende dann etwas
 * anderes als auf dem Tablet.
 */
(function () {
  "use strict";

  // Dieselben Werte wie in bm.html — sie bestimmen, wann eine Aufgabe wieder
  // faellig wird und ab wann ein Thema als beherrscht gilt. Weichen sie ab,
  // rechnen Tablet und Desktop verschieden.
  var LEITNER = [1, 2, 4, 7, 14, 30];
  var MASTER = 0.6;
  var KOMPENDIUM_PFAD = "theorie/kompendium.json";

  function api() { return window.__quantusTablet || null; }
  function hub() { return window.QuantusTabletLearningHub || null; }

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

  function heute() {
    var a = api();
    return a ? a.localDateKey() : new Date().toISOString().slice(0, 10);
  }
  function tagPlus(iso, n) {
    var d = new Date((iso || heute()) + "T12:00:00");
    d.setDate(d.getDate() + n);
    var a = api();
    return a ? a.localDateKey(d) : d.toISOString().slice(0, 10);
  }
  function tageBis(iso) {
    if (!iso) return null;
    return Math.round((Date.parse(iso + "T00:00:00") - Date.parse(heute() + "T00:00:00")) / 86400000);
  }

  // ── Zustand ───────────────────────────────────────────────────────────────
  var ui = {
    bereich: "uebersicht",   // uebersicht | lektion | themen | wiederholen | fortschritt | merksaetze
    fach: null,
    thema: null,
    suche: "",
    quiz: null               // { items, idx, aufgedeckt, gewaehlt, richtig, falsch, titel }
  };

  // Das Kompendium ist gross (rund 1,8 MB). Es wird deshalb erst geladen, wenn
  // man es wirklich braucht, und danach fuer die Sitzung behalten.
  var kompendium = { daten: null, laedt: false, fehler: null, index: null };

  function bmDaten() {
    var h = hub();
    return h && h.state ? obj(h.state.bm) : {};
  }
  function aufgStand() { return obj(bmDaten().aufg); }
  function konfig() { return obj(bmDaten().config); }
  function notizen() { return obj(bmDaten().notes); }
  function aktivitaet() { return obj(bmDaten().activity); }

  // Firebase erlaubt in Schluesseln kein . # $ [ ] / — bm.html ersetzt sie
  // durch _. Wer hier anders normiert, schreibt an einer anderen Stelle als
  // der Desktop und sieht dessen Lernstand nie.
  function fbKey(key) { return String(key).replace(/[.#$\[\]\/]/g, "_"); }
  function aufgKey(fach, thema, aufgabe) { return fach + "/" + thema + "/" + aufgabe; }
  function standVon(key) { return obj(aufgStand()[fbKey(key)]); }

  function ladeKompendium() {
    if (kompendium.daten || kompendium.laedt) return;
    var a = api();
    if (!a) return;
    kompendium.laedt = true;
    kompendium.fehler = null;
    var basis = a.appBaseUrl ? a.appBaseUrl() : "";
    fetch(basis + "/" + KOMPENDIUM_PFAD, { cache: "force-cache" })
      .then(function (antwort) {
        if (!antwort.ok) throw new Error("Kompendium " + antwort.status);
        return antwort.json();
      })
      .then(function (daten) {
        kompendium.daten = daten;
        kompendium.index = baueIndex(daten);
        kompendium.laedt = false;
        a.render();
      })
      .catch(function (fehler) {
        kompendium.laedt = false;
        kompendium.fehler = fehler.message;
        a.render();
      });
  }

  function baueIndex(daten) {
    var index = { themen: [], byKey: {}, faecher: [] };
    arr(obj(daten).faecher).forEach(function (fach) {
      index.faecher.push(fach);
      arr(fach.themen).forEach(function (thema) {
        var eintrag = { key: fach.key + "/" + thema.id, fachKey: fach.key, fach: fach.fach, thema: thema };
        index.themen.push(eintrag);
        index.byKey[eintrag.key] = eintrag;
      });
    });
    return index;
  }

  // ── Lernstand ─────────────────────────────────────────────────────────────
  function themaMastery(eintrag) {
    var aufgaben = arr(eintrag.thema.aufgaben);
    if (!aufgaben.length) return 0;
    var summe = 0;
    aufgaben.forEach(function (aufgabe) {
      var stand = standVon(aufgKey(eintrag.fachKey, eintrag.thema.id, aufgabe.id));
      summe += stand.box != null ? Math.min(Number(stand.box) || 0, 5) / 5 : 0;
    });
    return summe / aufgaben.length;
  }

  function faelligeAufgaben() {
    var tag = heute();
    var stand = aufgStand();
    var index = kompendium.index;
    var liste = [];
    Object.keys(stand).forEach(function (key) {
      var eintrag = obj(stand[key]);
      if (!eintrag.due || String(eintrag.due).slice(0, 10) > tag) return;
      liste.push({ key: key, stand: eintrag });
    });
    if (!index) return liste;
    // Zur Aufgabe die Frage aus dem Kompendium dazuholen. Ohne sie liesse sich
    // die Wiederholung nicht stellen — nur zaehlen.
    return liste.map(function (posten) {
      var treffer = null;
      index.themen.some(function (eintrag) {
        return arr(eintrag.thema.aufgaben).some(function (aufgabe) {
          if (fbKey(aufgKey(eintrag.fachKey, eintrag.thema.id, aufgabe.id)) !== posten.key) return false;
          treffer = { eintrag: eintrag, aufgabe: aufgabe };
          return true;
        });
      });
      return Object.assign({}, posten, treffer || {});
    });
  }

  function faelligZahl() {
    var tag = heute();
    var stand = aufgStand();
    return Object.keys(stand).filter(function (key) {
      var eintrag = obj(stand[key]);
      return eintrag.due && String(eintrag.due).slice(0, 10) <= tag;
    }).length;
  }

  function beherrschteThemen() {
    if (!kompendium.index) return 0;
    return kompendium.index.themen.filter(function (eintrag) { return themaMastery(eintrag) >= MASTER; }).length;
  }

  // Die Themen fuer heute: die am wenigsten beherrschten zuerst. Dieselbe
  // Regel wie in bm.html — wer schon sitzt, kommt nicht nochmals dran.
  function heutigeThemen() {
    if (!kompendium.index) return [];
    var proTag = Number(konfig().topicsPerDay) === 1 ? 1 : 2;
    return kompendium.index.themen
      .filter(function (eintrag) { return themaMastery(eintrag) < MASTER; })
      .slice(0, proTag);
  }

  // ── Schreiben ─────────────────────────────────────────────────────────────
  function datenbank() {
    var sync = window.QuantusDeviceSync;
    if (sync && sync.state && sync.state.db) return sync.state.db;
    var a = api();
    return a && typeof a.getDatabase === "function" ? a.getDatabase() : null;
  }

  /*
   * Eine Antwort bewerten — exakt das Leitner-Verfahren aus bm.html:
   * richtig hebt die Box um eins und verschiebt die Faelligkeit um
   * LEITNER[box] Tage, falsch setzt auf Box 0 und stellt die Aufgabe morgen
   * erneut. Wer hier anders rechnet, baut einen zweiten Lernstand.
   */
  function bewerten(key, richtig, ergaenzung) {
    var db = datenbank();
    var a = api();
    var alt = standVon(key);
    var stand = {
      box: Number(alt.box) || 0,
      due: alt.due || heute(),
      c: Number(alt.c) || 0,
      w: Number(alt.w) || 0
    };
    if (richtig) {
      stand.c += 1;
      stand.box = Math.min(stand.box + 1, 5);
      stand.due = tagPlus(heute(), LEITNER[stand.box]);
    } else {
      stand.w += 1;
      stand.box = 0;
      stand.due = tagPlus(heute(), 1);
    }
    stand.last = heute();
    if (ergaenzung) {
      if (ergaenzung.fach) stand.fach = ergaenzung.fach;
      if (ergaenzung.thema) stand.thema = ergaenzung.thema;
    }
    if (!db) {
      if (a) a.toast("Nicht gespeichert", "Keine Verbindung zur Datenbank.", "error");
      return;
    }
    db.ref("bmpruefung/aufg/" + fbKey(key)).set(stand).catch(function (fehler) {
      if (a) a.toast("Nicht gespeichert", fehler.message, "error");
    });
    // Aktivitaet mitschreiben — davon lebt die Serie im Fortschritt.
    var tag = heute();
    var heutige = obj(aktivitaet()[tag]);
    db.ref("bmpruefung/activity/" + tag).set({
      a: (Number(heutige.a) || 0) + 1,
      c: (Number(heutige.c) || 0) + (richtig ? 1 : 0)
    }).catch(function () {});
  }

  function notizSchreiben(key, text) {
    var db = datenbank();
    var a = api();
    if (!db) { if (a) a.toast("Nicht gespeichert", "Keine Verbindung zur Datenbank.", "error"); return; }
    var ziel = db.ref("bmpruefung/notes/" + fbKey(key));
    var aktion = String(text || "").trim() ? ziel.set(String(text)) : ziel.remove();
    aktion.then(function () { if (a) a.toast("Gespeichert", "", "ok"); })
      .catch(function (fehler) { if (a) a.toast("Nicht gespeichert", fehler.message, "error"); });
  }

  function konfigSchreiben(patch) {
    var db = datenbank();
    var a = api();
    if (!db) { if (a) a.toast("Nicht gespeichert", "Keine Verbindung zur Datenbank.", "error"); return; }
    db.ref("bmpruefung/config").update(patch)
      .then(function () { if (a) { a.toast("Gespeichert", "", "ok"); a.render(); } })
      .catch(function (fehler) { if (a) a.toast("Nicht gespeichert", fehler.message, "error"); });
  }

  // ── Kleines Markdown ──────────────────────────────────────────────────────
  // Die Theorie im Kompendium ist Markdown. ERST escapen, dann Muster
  // ersetzen — andersherum waere jeder Text aus dem Kompendium ein Einfallstor.
  function md(text) {
    var t = esc(text || "");
    t = t.replace(/^#{4,}\s*/gm, "").replace(/^###\s*(.+)$/gm, "<h4>$1</h4>")
         .replace(/^##\s*(.+)$/gm, "<h3>$1</h3>").replace(/^#\s*(.+)$/gm, "<h2>$1</h2>");
    t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
    var zeilen = t.split(/\n/);
    var raus = [];
    var inListe = false;
    function listeZu() { if (inListe) { raus.push("</ul>"); inListe = false; } }
    zeilen.forEach(function (zeile) {
      if (/^\s*[-•*]\s+/.test(zeile)) {
        if (!inListe) { raus.push("<ul>"); inListe = true; }
        raus.push("<li>" + zeile.replace(/^\s*[-•*]\s+/, "") + "</li>");
      } else if (/^\s*\d+\.\s+/.test(zeile)) {
        if (!inListe) { raus.push("<ul>"); inListe = true; }
        raus.push("<li>" + zeile.replace(/^\s*\d+\.\s+/, "") + "</li>");
      } else {
        listeZu();
        if (/^<h[234]>/.test(zeile)) raus.push(zeile);
        else if (zeile.trim()) raus.push("<p>" + zeile + "</p>");
      }
    });
    listeZu();
    return raus.join("");
  }

  // ── Bausteine ─────────────────────────────────────────────────────────────
  function kopf(titel, unter, aktionen) {
    var a = api();
    return a ? a.viewHeader(titel, unter, aktionen || "") : "";
  }
  function leer(text) { return '<div class="bm-leer">' + esc(text) + "</div>"; }
  function balken(anteil, ton) {
    var p = Math.max(0, Math.min(100, Math.round((Number(anteil) || 0) * 100)));
    return '<div class="bm-bar"><i class="' + (ton || "") + '" style="width:' + p + '%"></i></div>';
  }
  function kachel(spanne, symbol, titel, inhalt, aktionen) {
    return '<section class="widget span-' + spanne + '"><div class="widget-head"><span class="widget-icon">' +
      esc(symbol) + "</span><h2>" + esc(titel) + "</h2>" + (aktionen || "") + "</div>" + inhalt + "</section>";
  }

  function lernnotizOeffnen(kind, key) {
    var a = api(); if (!a || typeof a.openNoteForm !== "function") return;
    var label = "BM Vorbereitung", tags = ["BM Vorbereitung"], content = "", entityId = key || heute(), subtype = "merksatz";
    if (kind === "lesson") {
      var lesson = obj(obj(bmDaten().lessons)[key || heute()]);
      label = lesson.titel || lesson.thema || "Tageslektion " + (key || heute());
      tags.push(lesson.thema || label); content = lesson.zusammenfassung || ""; subtype = "zusammenfassung";
    } else if (kind === "topic") {
      var entry = kompendium.index && kompendium.index.byKey[key];
      if (entry) { label = entry.thema.titel; tags.push(entry.fach, label); content = notizen()[fbKey(key)] || ""; }
    } else if (kind === "question") {
      var current = ui.quiz && ui.quiz.items[ui.quiz.idx];
      if (current) {
        label = current.eintrag ? current.eintrag.thema.titel : ui.quiz.titel;
        tags.push(current.eintrag && current.eintrag.fach || "BM", label);
        content = frageText(current.aufgabe) + "\n\n" + antwortText(current.aufgabe);
        entityId = current.key || entityId; subtype = "fehler";
      }
    } else if (kind === "memorandum") {
      var match = kompendium.index && kompendium.index.themen.find(function (entry) { return fbKey(entry.key) === key; });
      label = match ? match.thema.titel : key.replace(/_/g, " / ");
      if (match) tags.push(match.fach, label);
      content = String(notizen()[key] || ""); entityId = key;
    }
    a.openNoteForm({ noteClass:"learning", lockClass:true, learningKind:subtype, title:"Lernnotiz · " + label, content:content,
      tags:tags, source:{ app:"bmpruefung", entityType:kind || "preparation", entityId:entityId, label:label, route:"/bm.html" } });
  }

  var BEREICHE = [
    { key: "uebersicht", label: "Übersicht", icon: "◆" },
    { key: "lektion", label: "Tageslektion", icon: "☀" },
    { key: "themen", label: "Themen", icon: "❏" },
    { key: "wiederholen", label: "Wiederholen", icon: "↻" },
    { key: "merksaetze", label: "Merksätze", icon: "✦" },
    { key: "fortschritt", label: "Fortschritt", icon: "▰" }
  ];

  function reiter() {
    return '<div class="bm-tabs">' + BEREICHE.map(function (bereich) {
      var zahl = bereich.key === "wiederholen" ? faelligZahl() : 0;
      return '<button class="bm-tab' + (ui.bereich === bereich.key ? " on" : "") +
        '" data-action="bm-tab" data-tab="' + attr(bereich.key) + '"><span>' + esc(bereich.icon) + "</span>" +
        esc(bereich.label) + (zahl ? ' <b class="bm-tab-zahl">' + zahl + "</b>" : "") + "</button>";
    }).join("") + "</div>";
  }

  // Hinweis auf den Ladezustand des Kompendiums. Ohne ihn wirkt eine noch
  // ladende Ansicht wie eine kaputte.
  function kompendiumHinweis() {
    if (kompendium.daten) return "";
    if (kompendium.laedt) return leer("Kompendium wird geladen — 158 Themen, das dauert einen Moment.");
    if (kompendium.fehler) {
      return '<div class="bm-leer">Das Kompendium liess sich nicht laden (' + esc(kompendium.fehler) +
        '). <button class="btn small-btn" data-action="bm-reload">Nochmals versuchen</button></div>';
    }
    return leer("Kompendium noch nicht geladen.");
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  ÜBERSICHT
  // ══════════════════════════════════════════════════════════════════════════
  function renderUebersicht() {
    var cfg = konfig();
    var tage = tageBis(cfg.examDate);
    var gesamt = kompendium.index ? kompendium.index.themen.length : 0;
    var fertig = beherrschteThemen();
    var faellig = faelligZahl();
    var serie = Number(cfg.streak) || 0;
    var themen = heutigeThemen();
    var heutigeAkt = obj(aktivitaet()[heute()]);

    return '<div class="dashboard-grid">' +
      kachel(4, "◷", "Prüfung",
        cfg.examDate
          ? '<div class="bm-zahl">' + (tage != null ? tage : "—") + "</div>" +
            '<small class="muted">Tage bis ' + esc(String(cfg.examDate)) + "</small>"
          : '<form class="bm-form" data-form="bm-exam"><label>Prüfungsdatum</label>' +
            '<input name="examDate" type="date" required>' +
            '<button class="btn primary" type="submit">Lernplan starten</button></form>') +
      kachel(4, "▰", "Themen beherrscht",
        '<div class="bm-zahl">' + fertig + "<small>/" + gesamt + "</small></div>" +
        balken(gesamt ? fertig / gesamt : 0, "accent")) +
      kachel(4, "↻", "Fällig heute",
        '<div class="bm-zahl">' + faellig + "</div>" +
        (faellig
          ? '<button class="btn primary" data-action="bm-quiz-due">Wiederholen starten</button>'
          : '<small class="muted">Nichts fällig — sauber.</small>')) +
      kachel(6, "☀", "Deine Themen für heute",
        themen.length
          ? '<div class="item-list">' + themen.map(function (eintrag) {
              return '<div class="list-item" data-action="bm-thema" data-key="' + attr(eintrag.key) + '">' +
                '<span class="badge accent">' + esc(eintrag.fach.split(" ")[0]) + "</span>" +
                '<div class="item-main"><div class="item-title">' + esc(eintrag.thema.titel) + "</div>" +
                '<div class="item-meta">' + esc(eintrag.thema.kapitel || "") + " · " +
                Math.round(themaMastery(eintrag) * 100) + " %</div>" +
                balken(themaMastery(eintrag), "blue") + "</div></div>";
            }).join("") + "</div>"
          : kompendiumHinweis(),
        '<button class="btn small-btn" data-action="bm-tab" data-tab="themen">Alle Themen</button>') +
      kachel(6, "✎", "Heute geübt",
        '<div class="bm-zahl">' + (Number(heutigeAkt.a) || 0) + "</div>" +
        '<small class="muted">Aufgaben · davon ' + (Number(heutigeAkt.c) || 0) + " richtig" +
        (serie ? " · Serie " + serie + " Tage" : "") + "</small>" +
        (cfg.examDate
          ? '<form class="bm-form bm-form-inline" data-form="bm-perday"><label>Themen pro Tag</label>' +
            '<select name="topicsPerDay">' +
            [1, 2].map(function (n) {
              return '<option value="' + n + '"' + ((Number(cfg.topicsPerDay) || 2) === n ? " selected" : "") + ">" + n + "</option>";
            }).join("") + "</select>" +
            '<button class="btn small-btn" type="submit">Ändern</button></form>'
          : "")) +
      "</div>";
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  TAGESLEKTION
  // ══════════════════════════════════════════════════════════════════════════
  function renderLektion() {
    var lektionen = obj(bmDaten().lessons);
    var tag = heute();
    var lektion = obj(lektionen[tag]);
    var tage = Object.keys(lektionen).sort().reverse();

    if (!Object.keys(lektion).length) {
      return '<div class="dashboard-grid">' +
        kachel(12, "☀", "Heute",
          leer("Für " + tag + " liegt noch keine Tageslektion vor. Sie wird morgens vom Workflow erzeugt.")) +
        renderLektionArchiv(lektionen, tage) + "</div>";
    }

    var uebung = arr(lektion.uebungsfragen || lektion.fragen);
    var repetition = arr(lektion.repetitionsfragen);

    return '<div class="dashboard-grid">' +
      kachel(12, "☀", lektion.titel || lektion.thema || "Tageslektion vom " + tag,
        (lektion.thema && lektion.titel ? '<p class="muted">' + esc(lektion.thema) + "</p>" : "") +
        (lektion.theorie || lektion.inhalt || lektion.text
          ? '<div class="bm-theorie">' + md(lektion.theorie || lektion.inhalt || lektion.text) + "</div>"
          : leer("Diese Lektion enthält keinen Theorieteil.")) +
        (lektion.zusammenfassung ? '<div class="bm-merk">' + md(lektion.zusammenfassung) + "</div>" : ""),
        '<button class="btn small-btn" data-action="bm-learning-note" data-kind="lesson" data-key="' + attr(tag) + '">＋ Lernnotiz</button>') +
      (uebung.length
        ? kachel(6, "✎", "Übungsfragen (" + uebung.length + ")",
            '<button class="btn primary" data-action="bm-quiz-lektion" data-art="uebung">Übungsfragen starten</button>' +
            '<div class="item-list" style="margin-top:12px">' + uebung.slice(0, 6).map(function (frage, i) {
              return '<div class="list-item"><span class="badge">' + (i + 1) + "</span>" +
                '<div class="item-main"><div class="item-title">' + esc(frageText(frage)) + "</div></div></div>";
            }).join("") + "</div>")
        : "") +
      (repetition.length
        ? kachel(6, "↻", "Repetitionsfragen (" + repetition.length + ")",
            '<button class="btn" data-action="bm-quiz-lektion" data-art="repetition">Repetition starten</button>')
        : "") +
      renderLektionArchiv(lektionen, tage) +
      "</div>";
  }

  function renderLektionArchiv(lektionen, tage) {
    return kachel(12, "▤", "Frühere Lektionen",
      tage.length
        ? '<div class="item-list">' + tage.slice(0, 20).map(function (t) {
            var l = obj(lektionen[t]);
            return '<div class="list-item"><span class="badge accent">' + esc(t) + "</span>" +
              '<div class="item-main"><div class="item-title">' + esc(l.titel || l.thema || "Lektion") + "</div>" +
              '<div class="item-meta">' + esc(String(l.thema || l.beschreibung || "").slice(0, 90)) + "</div></div></div>";
          }).join("") + "</div>"
        : leer("Noch keine Lektionen geladen."));
  }

  function frageText(frage) {
    if (typeof frage === "string") return frage;
    var f = obj(frage);
    return f.frage || f.q || f.question || f.text || "Frage";
  }
  function antwortText(frage) {
    if (typeof frage === "string") return "";
    var f = obj(frage);
    return f.loesung || f.antwort || f.a || f.answer || f.erklaerung || "";
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  THEMEN
  // ══════════════════════════════════════════════════════════════════════════
  function renderThemen() {
    if (!kompendium.index) return '<div class="dashboard-grid">' + kachel(12, "❏", "Themen", kompendiumHinweis()) + "</div>";

    if (ui.thema) return renderThema(ui.thema);

    var suche = ui.suche.trim().toLowerCase();
    var faecher = kompendium.index.faecher;
    var gewaehlt = ui.fach || (faecher[0] && faecher[0].key);

    var themen = kompendium.index.themen.filter(function (eintrag) {
      if (suche) return (eintrag.thema.titel + " " + (eintrag.thema.kapitel || "") + " " + eintrag.fach).toLowerCase().indexOf(suche) >= 0;
      return eintrag.fachKey === gewaehlt;
    });

    // Nach Kapitel gruppieren — 75 Themen in einem Fach sind sonst eine Wand.
    var kapitel = {};
    themen.forEach(function (eintrag) {
      var k = eintrag.thema.kapitel || "Ohne Kapitel";
      (kapitel[k] = kapitel[k] || []).push(eintrag);
    });

    return '<div class="bm-themen">' +
      '<div class="filterbar">' +
        '<div class="search-field"><span>⌕</span><input data-action="bm-suche" placeholder="Themen durchsuchen" value="' +
          attr(ui.suche) + '" autocomplete="off"></div>' +
      "</div>" +
      (suche ? "" : '<div class="bm-faecher">' + faecher.map(function (fach) {
        var eigene = kompendium.index.themen.filter(function (e) { return e.fachKey === fach.key; });
        var fertig = eigene.filter(function (e) { return themaMastery(e) >= MASTER; }).length;
        return '<button class="bm-fach' + (fach.key === gewaehlt ? " on" : "") +
          '" data-action="bm-fach" data-key="' + attr(fach.key) + '">' +
          "<strong>" + esc(fach.fach) + "</strong>" +
          "<small>" + fertig + " von " + eigene.length + " Themen</small>" +
          balken(eigene.length ? fertig / eigene.length : 0, "accent") + "</button>";
      }).join("") + "</div>") +
      Object.keys(kapitel).map(function (k) {
        return '<section class="bm-kapitel"><h3>' + esc(k) + "</h3>" +
          '<div class="content-grid">' + kapitel[k].map(function (eintrag) {
            var m = themaMastery(eintrag);
            var aufgaben = arr(eintrag.thema.aufgaben).length;
            return '<article class="entity-card bm-thema-karte" data-action="bm-thema" data-key="' + attr(eintrag.key) + '">' +
              '<div class="row-actions"><span class="badge ' + (m >= MASTER ? "accent" : "") + '">' +
              Math.round(m * 100) + " %</span>" +
              (suche ? '<span class="badge">' + esc(eintrag.fach.split(" ")[0]) + "</span>" : "") + "</div>" +
              "<h3>" + esc(eintrag.thema.titel) + "</h3>" +
              '<p>' + esc(arr(eintrag.thema.lernziele).slice(0, 2).join(" · ") || "Theorie und Aufgaben") + "</p>" +
              balken(m, m >= MASTER ? "accent" : "blue") +
              '<div class="card-foot"><span class="muted small">' + aufgaben + " Aufgaben</span></div></article>";
          }).join("") + "</div></section>";
      }).join("") ||
      leer(suche ? "Kein Thema gefunden." : "Dieses Fach hat keine Themen.") +
      "</div>";
  }

  function renderThema(key) {
    var eintrag = kompendium.index.byKey[key];
    if (!eintrag) return leer("Thema nicht gefunden.");
    var thema = eintrag.thema;
    var aufgaben = arr(thema.aufgaben);
    var notiz = notizen()[fbKey(key)] || "";
    var m = themaMastery(eintrag);

    return '<div class="bm-thema-detail">' +
      '<div class="bm-thema-kopf">' +
        '<button class="btn" data-action="bm-zurueck">‹ Themen</button>' +
        "<div><strong>" + esc(thema.titel) + "</strong><small>" + esc(eintrag.fach) +
        (thema.kapitel ? " · " + esc(thema.kapitel) : "") + "</small></div>" +
        '<div class="bm-thema-aktionen">' +
          '<span class="badge ' + (m >= MASTER ? "accent" : "") + '">' + Math.round(m * 100) + " %</span>" +
          '<button class="btn" data-action="bm-learning-note" data-kind="topic" data-key="' + attr(key) + '">＋ Lernnotiz</button>' +
          (aufgaben.length
            ? '<button class="btn primary" data-action="bm-quiz-thema" data-key="' + attr(key) + '">' +
              aufgaben.length + " Aufgaben üben</button>"
            : "") +
        "</div>" +
      "</div>" +
      '<div class="dashboard-grid">' +
        (arr(thema.lernziele).length
          ? kachel(4, "◎", "Lernziele",
              "<ul class=\"bm-ziele\">" + arr(thema.lernziele).map(function (ziel) {
                return "<li>" + esc(String(ziel)) + "</li>";
              }).join("") + "</ul>")
          : "") +
        kachel(arr(thema.lernziele).length ? 8 : 12, "▤", "Theorie",
          thema.theorie ? '<div class="bm-theorie">' + md(thema.theorie) + "</div>" : leer("Keine Theorie hinterlegt.")) +
        (arr(thema.beispiele).length
          ? kachel(12, "✎", "Beispiele",
              arr(thema.beispiele).map(function (beispiel) {
                return '<div class="bm-beispiel">' + md(String(beispiel)) + "</div>";
              }).join(""))
          : "") +
        kachel(12, "✦", "Deine Merksätze",
          '<form class="bm-form" data-form="bm-notiz" data-key="' + attr(key) + '">' +
          '<textarea name="text" rows="4" placeholder="Was willst du dir zu diesem Thema merken?">' + esc(notiz) + "</textarea>" +
          '<button class="btn primary" type="submit">Speichern</button></form>') +
        (aufgaben.length
          ? kachel(12, "❑", "Aufgaben (" + aufgaben.length + ")",
              '<div class="item-list">' + aufgaben.map(function (aufgabe, i) {
                var stand = standVon(aufgKey(eintrag.fachKey, thema.id, aufgabe.id));
                return '<div class="list-item"><span class="badge' + (stand.box >= 3 ? " accent" : "") + '">' +
                  (stand.box != null && stand.last ? "Box " + (Number(stand.box) || 0) : "neu") + "</span>" +
                  '<div class="item-main"><div class="item-title">' + (i + 1) + ". " + esc(aufgabe.frage) + "</div>" +
                  '<div class="item-meta">' + esc(aufgabe.typ || "Aufgabe") +
                  (aufgabe.schwierigkeit ? " · " + esc(String(aufgabe.schwierigkeit)) : "") +
                  (stand.due ? " · fällig " + esc(String(stand.due)) : "") + "</div></div></div>";
              }).join("") + "</div>")
          : "") +
      "</div></div>";
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  WIEDERHOLEN — das Quiz
  // ══════════════════════════════════════════════════════════════════════════
  function quizBauen(items, titel) {
    return { items: items, idx: 0, aufgedeckt: false, gewaehlt: null, richtig: 0, falsch: 0, titel: titel };
  }

  function quizAusThema(key) {
    var eintrag = kompendium.index && kompendium.index.byKey[key];
    if (!eintrag) return null;
    return quizBauen(arr(eintrag.thema.aufgaben).map(function (aufgabe) {
      return { aufgabe: aufgabe, eintrag: eintrag, key: aufgKey(eintrag.fachKey, eintrag.thema.id, aufgabe.id) };
    }), eintrag.thema.titel);
  }

  function quizAusFaelligen() {
    return quizBauen(faelligeAufgaben().filter(function (posten) { return posten.aufgabe; }).map(function (posten) {
      return { aufgabe: posten.aufgabe, eintrag: posten.eintrag, key: aufgKey(posten.eintrag.fachKey, posten.eintrag.thema.id, posten.aufgabe.id) };
    }), "Fällige Wiederholungen");
  }

  function quizAusLektion(art) {
    var lektion = obj(obj(bmDaten().lessons)[heute()]);
    var fragen = art === "repetition" ? arr(lektion.repetitionsfragen) : arr(lektion.uebungsfragen || lektion.fragen);
    return quizBauen(fragen.map(function (frage, i) {
      return {
        aufgabe: { id: "lektion-" + i, frage: frageText(frage), optionen: arr(obj(frage).optionen), loesung: antwortText(frage), erklaerung: obj(frage).erklaerung || "" },
        eintrag: null,
        // Fragen der Tageslektion stehen nicht im Kompendium; sie bekommen
        // trotzdem einen stabilen Schluessel, damit ihr Lernstand zaehlt.
        key: "lektion/" + heute() + "/" + i
      };
    }), art === "repetition" ? "Repetitionsfragen" : "Übungsfragen");
  }

  // Welche Option richtig ist. Die Loesung steht mal als Buchstabe ("B"), mal
  // als ausgeschriebener Text — beides muss treffen, sonst wird eine richtige
  // Antwort als falsch gewertet.
  function richtigerIndex(aufgabe) {
    var optionen = arr(aufgabe.optionen);
    if (!optionen.length) return -1;
    var loesung = String(aufgabe.loesung == null ? "" : aufgabe.loesung).trim();
    function norm(s) {
      return String(s == null ? "" : s).toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/^\s*([a-h])[).]\s*/i, "")
        .replace(/[^a-z0-9]+/g, " ").trim();
    }
    var buchstabe = loesung.match(/^([A-Ha-h])[).:\s]*$/);
    if (buchstabe) {
      var pos = buchstabe[1].toUpperCase().charCodeAt(0) - 65;
      if (pos >= 0 && pos < optionen.length) return pos;
    }
    var ziel = norm(loesung);
    for (var i = 0; i < optionen.length; i += 1) {
      if (norm(optionen[i]) === ziel) return i;
    }
    return -1;
  }

  function renderQuiz() {
    var quiz = ui.quiz;
    var posten = quiz.items[quiz.idx];

    if (!posten) {
      var gesamt = quiz.richtig + quiz.falsch;
      return '<div class="dashboard-grid">' + kachel(12, "✓", "Fertig — " + quiz.titel,
        '<div class="bm-zahl">' + quiz.richtig + "<small>/" + gesamt + "</small></div>" +
        '<small class="muted">richtig beantwortet</small>' +
        balken(gesamt ? quiz.richtig / gesamt : 0, "accent") +
        '<div class="row-actions" style="margin-top:16px">' +
        '<button class="btn primary" data-action="bm-quiz-ende">Zurück</button>' +
        (faelligZahl() ? '<button class="btn" data-action="bm-quiz-due">Weiter wiederholen</button>' : "") +
        "</div>") + "</div>";
    }

    var aufgabe = posten.aufgabe;
    var optionen = arr(aufgabe.optionen);
    var richtig = richtigerIndex(aufgabe);

    return '<div class="bm-quiz">' +
      '<div class="bm-quiz-kopf">' +
        '<button class="btn" data-action="bm-quiz-ende">✕ Beenden</button>' +
        "<div><strong>" + esc(quiz.titel) + "</strong><small>Frage " + (quiz.idx + 1) + " von " + quiz.items.length +
        " · " + quiz.richtig + " richtig, " + quiz.falsch + " falsch</small></div>" +
        balken(quiz.items.length ? quiz.idx / quiz.items.length : 0, "accent") +
      "</div>" +
      '<div class="bm-quiz-karte">' +
        (posten.eintrag ? '<span class="badge">' + esc(posten.eintrag.thema.titel) + "</span>" : "") +
        '<div class="bm-quiz-frage">' + esc(aufgabe.frage) + "</div>" +
        (optionen.length
          ? '<div class="bm-optionen">' + optionen.map(function (option, i) {
              var klasse = "";
              if (quiz.aufgedeckt) {
                if (i === richtig) klasse = " richtig";
                else if (i === quiz.gewaehlt) klasse = " falsch";
              }
              return '<button class="bm-option' + klasse + '" data-action="bm-quiz-wahl" data-i="' + i + '"' +
                (quiz.aufgedeckt ? " disabled" : "") + ">" + esc(String(option)) + "</button>";
            }).join("") + "</div>"
          : (quiz.aufgedeckt
              ? '<div class="bm-loesung"><strong>Lösung</strong>' + md(String(aufgabe.loesung || "—")) + "</div>"
              : '<button class="btn primary" data-action="bm-quiz-aufdecken">Lösung zeigen</button>')) +
        (quiz.aufgedeckt && aufgabe.erklaerung
          ? '<div class="bm-erklaerung"><strong>Erklärung</strong>' + md(String(aufgabe.erklaerung)) + "</div>"
          : "") +
        (quiz.aufgedeckt && !optionen.length
          ? '<div class="row-actions bm-selbst"><span class="muted">Hattest du es gewusst?</span>' +
            '<button class="btn" data-action="bm-quiz-note" data-ok="0">Nein</button>' +
            '<button class="btn primary" data-action="bm-quiz-note" data-ok="1">Ja</button></div>'
          : "") +
        (quiz.aufgedeckt && optionen.length
          ? '<div class="row-actions"><button class="btn" data-action="bm-learning-note" data-kind="question">Als Lernnotiz</button><button class="btn primary" data-action="bm-quiz-weiter">Weiter ›</button></div>'
          : "") +
      "</div></div>";
  }

  function renderWiederholen() {
    if (ui.quiz) return renderQuiz();
    var faellig = faelligeAufgaben();
    var mitFrage = faellig.filter(function (posten) { return posten.aufgabe; });
    var schwach = kompendium.index
      ? kompendium.index.themen.filter(function (e) { return themaMastery(e) > 0 && themaMastery(e) < MASTER; })
          .sort(function (x, y) { return themaMastery(x) - themaMastery(y); }).slice(0, 8)
      : [];

    return '<div class="dashboard-grid">' +
      kachel(6, "↻", "Fällig",
        '<div class="bm-zahl">' + faellig.length + "</div>" +
        '<small class="muted">' + (mitFrage.length < faellig.length && kompendium.index
          ? (faellig.length - mitFrage.length) + " davon ohne Frage im Kompendium"
          : "Aufgaben warten auf die Wiederholung") + "</small>" +
        (mitFrage.length
          ? '<button class="btn primary" data-action="bm-quiz-due" style="margin-top:12px">Jetzt wiederholen</button>'
          : (kompendium.index ? "" : kompendiumHinweis()))) +
      kachel(6, "◑", "Schwache Themen",
        schwach.length
          ? '<div class="item-list">' + schwach.map(function (eintrag) {
              return '<div class="list-item" data-action="bm-quiz-thema" data-key="' + attr(eintrag.key) + '">' +
                '<span class="badge coral">' + Math.round(themaMastery(eintrag) * 100) + " %</span>" +
                '<div class="item-main"><div class="item-title">' + esc(eintrag.thema.titel) + "</div>" +
                '<div class="item-meta">' + esc(eintrag.fach) + "</div></div></div>";
            }).join("") + "</div>"
          : leer(kompendium.index ? "Noch keine angefangenen Themen." : "Kompendium wird geladen.")) +
      "</div>";
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  MERKSÄTZE UND FORTSCHRITT
  // ══════════════════════════════════════════════════════════════════════════
  function renderMerksaetze() {
    var alle = notizen();
    var keys = Object.keys(alle).filter(function (key) { return String(alle[key] || "").trim(); });
    return '<div class="dashboard-grid">' +
      kachel(12, "✦", "Deine Merksätze (" + keys.length + ")",
        keys.length
          ? '<div class="item-list">' + keys.map(function (key) {
              var eintrag = kompendium.index
                ? kompendium.index.themen.find(function (e) { return fbKey(e.key) === key; })
                : null;
              return '<div class="list-item">' +
                '<span class="badge accent">✦</span><div class="item-main">' +
                '<div class="item-title">' + esc(eintrag ? eintrag.thema.titel : key.replace(/_/g, " / ")) + "</div>" +
                '<div class="item-meta">' + esc(String(alle[key]).slice(0, 200)) + '</div></div><button class="btn small-btn" data-action="bm-learning-note" data-kind="memorandum" data-key="' + attr(key) + '">In Noteflow</button></div>';
            }).join("") + "</div>"
          : leer("Noch keine Merksätze — schreib sie beim Lernen direkt beim Thema auf.")) +
      "</div>";
  }

  function renderFortschritt() {
    var akt = aktivitaet();
    var tage = Object.keys(akt).sort().reverse().slice(0, 14);
    var maxA = Math.max(1, ...tage.map(function (t) { return Number(obj(akt[t]).a) || 0; }));
    var faecher = kompendium.index ? kompendium.index.faecher : [];

    return '<div class="dashboard-grid">' +
      kachel(12, "▰", "Beherrschung je Fach",
        faecher.length
          ? faecher.map(function (fach) {
              var eigene = kompendium.index.themen.filter(function (e) { return e.fachKey === fach.key; });
              var fertig = eigene.filter(function (e) { return themaMastery(e) >= MASTER; }).length;
              return '<div class="stat-bar-row"><span class="stat-bar-label">' + esc(fach.fach) + "</span>" +
                '<div class="stat-bar"><i class="accent" style="width:' +
                Math.max(2, Math.round((eigene.length ? fertig / eigene.length : 0) * 100)) + '%"></i></div>' +
                "<strong>" + fertig + "/" + eigene.length + "</strong></div>";
            }).join("")
          : kompendiumHinweis()) +
      kachel(12, "✎", "Geübt in den letzten Tagen",
        tage.length
          ? '<div class="bm-aktivitaet">' + tage.slice().reverse().map(function (t) {
              var a = obj(akt[t]);
              var anzahl = Number(a.a) || 0;
              return '<div class="bm-akt-tag"><div class="bm-akt-bar"><i style="height:' +
                Math.max(4, Math.round((anzahl / maxA) * 100)) + '%"></i></div>' +
                "<strong>" + anzahl + "</strong><small>" + esc(t.slice(5)) + "</small></div>";
            }).join("") + "</div>"
          : leer("Noch keine Übungen erfasst.")) +
      "</div>";
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  REGISTRIERUNG
  // ══════════════════════════════════════════════════════════════════════════
  function render() {
    // Das Kompendium wird gebraucht, sobald diese App offen ist — es traegt
    // Themen, Aufgaben und den ganzen Fortschritt.
    ladeKompendium();
    var inhalt = ui.bereich === "lektion" ? renderLektion()
      : ui.bereich === "themen" ? renderThemen()
      : ui.bereich === "wiederholen" ? renderWiederholen()
      : ui.bereich === "merksaetze" ? renderMerksaetze()
      : ui.bereich === "fortschritt" ? renderFortschritt()
      : renderUebersicht();

    var a = api();
    return '<div class="view bm-view">' +
      kopf("BM Vorbereitung", "Lernplan, Tageslektion, Kompendium und Wiederholungen — derselbe Lernstand wie in Quantus.",
        '<button class="btn" data-action="bm-learning-note" data-kind="preparation">＋ Lernnotiz</button><button class="btn" data-action="external" data-path="bm.html">↗ Vollversion</button>') +
      (a && !a.state.user ? a.loginBanner() : "") +
      reiter() + inhalt + "</div>";
  }

  function onAction(action, button) {
    var a = api();
    if (!a) return false;

    if (action === "bm-tab") { ui.bereich = button.dataset.tab; ui.thema = null; ui.quiz = null; a.render(); return true; }
    if (action === "bm-fach") { ui.fach = button.dataset.key; a.render(); return true; }
    if (action === "bm-thema") { ui.bereich = "themen"; ui.thema = button.dataset.key; a.render(); return true; }
    if (action === "bm-zurueck") { ui.thema = null; a.render(); return true; }
    if (action === "bm-reload") { kompendium.fehler = null; kompendium.daten = null; ladeKompendium(); a.render(); return true; }
    if (action === "bm-learning-note") { lernnotizOeffnen(button.dataset.kind, button.dataset.key); return true; }

    if (action === "bm-quiz-due") {
      var quiz = quizAusFaelligen();
      if (!quiz.items.length) { a.toast("Nichts fällig", "Alle Wiederholungen sind erledigt.", "ok"); return true; }
      ui.quiz = quiz; ui.bereich = "wiederholen"; ui.thema = null; a.render();
      return true;
    }
    if (action === "bm-quiz-thema") {
      var themaQuiz = quizAusThema(button.dataset.key);
      if (!themaQuiz || !themaQuiz.items.length) { a.toast("Keine Aufgaben", "Zu diesem Thema gibt es keine.", "error"); return true; }
      ui.quiz = themaQuiz; ui.bereich = "wiederholen"; ui.thema = null; a.render();
      return true;
    }
    if (action === "bm-quiz-lektion") {
      var lektionQuiz = quizAusLektion(button.dataset.art);
      if (!lektionQuiz.items.length) { a.toast("Keine Fragen", "Die Lektion enthält keine.", "error"); return true; }
      ui.quiz = lektionQuiz; ui.bereich = "wiederholen"; a.render();
      return true;
    }
    if (action === "bm-quiz-ende") { ui.quiz = null; a.render(); return true; }
    if (action === "bm-quiz-aufdecken") { ui.quiz.aufgedeckt = true; a.render(); return true; }

    if (action === "bm-quiz-wahl") {
      var q = ui.quiz;
      var posten = q.items[q.idx];
      q.gewaehlt = Number(button.dataset.i);
      q.aufgedeckt = true;
      var korrekt = q.gewaehlt === richtigerIndex(posten.aufgabe);
      if (korrekt) q.richtig += 1; else q.falsch += 1;
      bewerten(posten.key, korrekt, posten.eintrag
        ? { fach: posten.eintrag.fach, thema: posten.eintrag.thema.titel }
        : null);
      a.render();
      return true;
    }
    if (action === "bm-quiz-note") {
      var quiz2 = ui.quiz;
      var posten2 = quiz2.items[quiz2.idx];
      var gewusst = button.dataset.ok === "1";
      if (gewusst) quiz2.richtig += 1; else quiz2.falsch += 1;
      bewerten(posten2.key, gewusst, posten2.eintrag
        ? { fach: posten2.eintrag.fach, thema: posten2.eintrag.thema.titel }
        : null);
      quiz2.idx += 1; quiz2.aufgedeckt = false; quiz2.gewaehlt = null;
      a.render();
      return true;
    }
    if (action === "bm-quiz-weiter") {
      ui.quiz.idx += 1; ui.quiz.aufgedeckt = false; ui.quiz.gewaehlt = null;
      a.render();
      return true;
    }
    return false;
  }

  function onSubmit(type, form, data) {
    var a = api();
    if (!a) return false;
    if (type === "bm-exam") {
      var datum = String(data.get("examDate") || "");
      if (datum) konfigSchreiben({ examDate: datum, planStart: heute() });
      return true;
    }
    if (type === "bm-perday") {
      konfigSchreiben({ topicsPerDay: Number(data.get("topicsPerDay")) || 2 });
      return true;
    }
    if (type === "bm-notiz") {
      notizSchreiben(form.dataset.key, String(data.get("text") || ""));
      return true;
    }
    return false;
  }

  // Beim Verlassen der App faellt der Ansichtszustand weg — sonst steht beim
  // naechsten Oeffnen noch ein halb beantwortetes Quiz da.
  function mount(route) {
    if (route !== "bm") { ui.quiz = null; ui.thema = null; }
  }

  var sucheTimer = null;
  document.addEventListener("input", function (event) {
    var feld = event.target.closest('[data-action="bm-suche"]');
    if (!feld) return;
    ui.suche = feld.value;
    clearTimeout(sucheTimer);
    sucheTimer = setTimeout(function () {
      var a = api();
      if (!a) return;
      a.render();
      requestAnimationFrame(function () {
        var next = document.querySelector('[data-action="bm-suche"]');
        if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
      });
    }, 160);
  });

  (window.__quantusTabletModules = window.__quantusTabletModules || []).push({
    key: "bm",
    routes: ["bm"],
    render: render,
    mount: mount,
    onAction: onAction,
    onSubmit: onSubmit
  });
})();
