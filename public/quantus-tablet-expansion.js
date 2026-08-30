(function (global) {
  "use strict";

  if (!global || global.QuantusTabletLearningHub) return;

  var state = {
    bm: null,
    smarter: null,
    leseplan: null,
    leseplanAufbereitung: null,
    career: null,
    // Welches Dokument und welche Einheit im Leseplan offen sind.
    leseplanDoc: null,
    leseplanEinheit: null,
    userId: "",
    refs: [],
    mounted: false,
    renderTimer: null,
    lastMarkup: ""
  };

  function api() { return global.__quantusTablet || null; }
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char];
    });
  }
  function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : value && typeof value === "object" ? Object.keys(value).map(function (key) { return value[key]; }) : []; }
  function values(value) { return Object.keys(asObject(value)).map(function (key) { var item = value[key]; if (item && typeof item === "object" && !item.id) item = Object.assign({ id: key }, item); return item; }).filter(Boolean); }
  function dateKey(date) {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(date || new Date()); }
    catch (_) { return new Date().toISOString().slice(0, 10); }
  }
  function parseTime(value) { var time = Date.parse(value || 0); return Number.isFinite(time) ? time : 0; }
  function titleOf(item, fallback) { return item && (item.title || item.titel || item.name || item.subject || item.thema) || fallback || "Bereit"; }

  function countDue(node, today) {
    var count = 0;
    if (!node || typeof node !== "object") return 0;
    if (node.due && String(node.due).slice(0, 10) <= today) return 1;
    Object.keys(node).forEach(function (key) { count += countDue(node[key], today); });
    return count;
  }

  function bmCard() {
    var root = asObject(state.bm);
    var today = dateKey();
    var lesson = asObject(asObject(root.lessons)[today]);
    var due = countDue(root.aufg, today);
    var title = titleOf(lesson, "Tageslektion öffnen");
    var sub = lesson && Object.keys(lesson).length ? (due ? due + " Wiederholungen fällig" : "Heutige Lektion ist bereit") : (due ? due + " Wiederholungen fällig" : "Lernplan und Kompendium öffnen");
    return card("BM Vorbereitung", title, sub, "∑", "sand", "go", "bm");
  }

  function latestSmarter() {
    return values(state.smarter).sort(function (a, b) {
      return parseTime(b.generatedAt || b.createdAt || b.aktualisiert || b.date || b.id) - parseTime(a.generatedAt || a.createdAt || a.aktualisiert || a.date || a.id);
    })[0] || null;
  }

  // BEFUND (Nutzer: "ich kann auf dem tablet das morning briefing nicht
  // oeffnen ... es soll eine spezielle app mit einem shortcut bekommen" —
  // spaeter praezisiert: "oben ins lerncockpit", direkt neben BM
  // Vorbereitung). Anders als die uebrigen Karten hat das Briefing-PDF
  // keinen Platz im synchronisierten state (es liegt in AI Syncs
  // Firebase-Storage-Mailbox, nicht im Quantus-Datenstand) — die Karte
  // zeigt deshalb bewusst keinen Live-Zaehler, sondern fuehrt direkt in
  // die App.
  function briefingPdfCard() {
    return card("Briefing-PDF", "Morgen-PDF öffnen", "Dein tägliches Briefing aus AI Sync", "📬", "blue", "go", "briefingpdf");
  }

  function smarterCard() {
    var doc = latestSmarter();
    return card("Smarter", titleOf(doc, "Tagesstoff öffnen"), doc ? (doc.status === "delivered" ? "Heute bereit" : "Neuester Lernstoff") : "Noch kein Tagesdokument", "Σ", "violet", "go", "smarter");
  }

  function nextReadingUnit() {
    var today = dateKey();
    var candidates = [];
    values(state.leseplan).forEach(function (doc) {
      if (doc.status === "fertig") return;
      asArray(doc.plan).forEach(function (unit, index) {
        if (!unit || unit.done) return;
        candidates.push({ doc: doc, unit: unit, index: index, date: String(unit.datum || "9999-12-31") });
      });
    });
    candidates.sort(function (a, b) { return a.date.localeCompare(b.date) || a.index - b.index; });
    var due = candidates.find(function (item) { return item.date <= today; });
    return due || candidates[0] || null;
  }

  function leseplanCard() {
    var next = nextReadingUnit();
    var title = next ? titleOf(next.doc, "Nächste Leseeinheit") : "Leseplan öffnen";
    var sub = next ? ("Einheit " + (Number(next.unit.index != null ? next.unit.index : next.index) + 1) + " · ca. " + (next.unit.estMinutes || 10) + " Min.") : "Kein offener Abschnitt";
    return card("Leseplan", title, sub, "▤", "blue", "go", "leseplan");
  }

  function nextCareerSession() {
    var root = asObject(state.career);
    var modules = values(root.modules).filter(function (module) { return module.status !== "archived"; });
    modules.sort(function (a, b) { return Number(b.status === "active") - Number(a.status === "active") || parseTime(b.updatedAt) - parseTime(a.updatedAt); });
    for (var i = 0; i < modules.length; i += 1) {
      var module = modules[i];
      var progress = asObject(asObject(root.progress)[module.id]);
      var completed = asObject(progress.completedDays);
      var order = asArray(module.dayOrder);
      var dayId = order.find(function (id) { return !completed[id]; });
      var day = dayId && asObject(module.days)[dayId];
      if (day) return { module: module, day: day, completed: Object.keys(completed).length, total: order.length };
    }
    return null;
  }

  function careerCard() {
    var next = nextCareerSession();
    var reflections = asObject(asObject(state.career).reflections);
    var reflected = Boolean(reflections[dateKey()]);
    var title = next ? (titleOf(next.module, "Career Model") + " · " + titleOf(next.day, "Nächster Tag")) : "Fachmodul importieren";
    var sub = next ? ("Tag " + (next.day.day || next.completed + 1) + " · " + (next.day.estimatedMinutes || 30) + " Min. · Reflecta " + (reflected ? "erledigt" : "offen")) : ("30-Minuten-Weiterbildung · Reflecta " + (reflected ? "erledigt" : "offen"));
    return card("Career Model", title, sub, "C", "green", "go", "career");
  }

  function boardStats() {
    var q = api();
    var entities = asObject(q && q.state && q.state.payload && q.state.payload.entities);
    var boards = 0, notes = 0;
    Object.keys(entities).forEach(function (collection) {
      values(entities[collection]).forEach(function (entity) {
        var sticky = asObject(entity.stickyBoard);
        var count = asArray(sticky.notes).length;
        if (count) { boards += 1; notes += count; }
      });
    });
    return { boards: boards, notes: notes };
  }

  function canvasCard() {
    var stats = boardStats();
    return card("Pinnboards", stats.boards ? stats.boards + " aktive Boards" : "Pinnboard öffnen", stats.notes ? stats.notes + " Post-its synchronisiert" : "Post-its, Handschrift und Verknüpfungen", "▦", "coral", "go", "workspace");
  }

  function deviceSummary() {
    var devices = global.QuantusDeviceSync ? global.QuantusDeviceSync.listDevices() : [];
    return devices.length ? devices.length + " weiteres Gerät live" : "Kein weiteres Gerät live";
  }

  function card(label, title, sub, icon, tone, action, target) {
    var attrs = action === "go" ? 'data-action="go" data-route="' + esc(target) + '"' : 'data-action="external" data-path="' + esc(target) + '"';
    return '<button class="qt-learning-card tone-' + esc(tone) + '" ' + attrs + '><span class="qt-learning-icon">' + esc(icon) + '</span><span class="qt-learning-copy"><small>' + esc(label) + '</small><strong>' + esc(title) + '</strong><span>' + esc(sub) + '</span></span><i>›</i></button>';
  }

  function hubHtml() {
    return '<section id="quantusLearningHub" class="qt-learning-hub"><div class="qt-learning-head"><div><span>LESEN &amp; WEITERBILDEN</span><h2>Dein Lerncockpit</h2><p>BM, Smarter, Leseplan, Career Model und Pinnboards werden live aktualisiert; dein Briefing-PDF ist einen Tipp entfernt.</p></div><button type="button" data-qu-action="toggle" class="qt-device-summary">⇄ ' + esc(deviceSummary()) + '</button></div><div class="qt-learning-grid">' + bmCard() + briefingPdfCard() + smarterCard() + leseplanCard() + careerCard() + canvasCard() + '</div></section>';
  }

  function injectCareerIcon(springboard) {
    if (!springboard || springboard.querySelector("#qtCareerApp")) return;
    var pages = springboard.querySelectorAll(".sb-page");
    var target = null;
    Array.prototype.forEach.call(pages, function (page) {
      var title = page.querySelector(".sb-page-title");
      if (title && /Werkzeuge/i.test(title.textContent || "")) target = page.querySelector(".sb-grid");
    });
    if (!target) return;
    var button = global.document.createElement("button");
    button.id = "qtCareerApp";
    button.className = "sb-app";
    button.setAttribute("data-action", "go");
    button.setAttribute("data-route", "career");
    button.title = "Career Model";
    button.innerHTML = '<span class="sb-icon tone-green"><span class="sb-glyph">C</span></span><span class="sb-label">Career Model</span>';
    target.appendChild(button);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  BEFUND (gemessen, Chromium): das Lerncockpit wurde 37-mal in 2000 ms
  //  komplett ersetzt — alle ~54 ms. Das war das Flimmern, und es verschluckte
  //  jeden Tipp: ein Fingertipp dauert 100–300 ms, die Karte verschwand also
  //  zwischen Beruehrung und Loslassen und der Browser sendete gar kein
  //  click-Ereignis mehr. Gemessen mit einem Tipp von 120 ms: null Klicks.
  //
  //  URSACHE: der Vergleich "existing.outerHTML !== markup" verglich unser
  //  erzeugtes Markup mit der SERIALISIERUNG des DOM — und die ist nie
  //  zeichengleich. Der Browser schreibt "LESEN &amp; WEITERBILDEN" zurueck,
  //  wo unsere Zeichenkette "LESEN & WEITERBILDEN" sagt; ebenso wird aus
  //  esc()s &#039; wieder ein blosses '. Der Vergleich war damit IMMER
  //  ungleich → Ersetzen → die MutationObserver auf #main sah die Aenderung
  //  → scheduleRender (50 ms) → Ersetzen → … eine Endlosschleife.
  //
  //  Deshalb wird jetzt gegen das zuletzt SELBST erzeugte Markup verglichen.
  //  Das ist der einzige Vergleich, der ueberhaupt aussagekraeftig ist: er
  //  beantwortet die Frage "haben sich meine Daten geaendert?" statt der
  //  Frage "serialisiert der Browser so wie ich?".
  // ══════════════════════════════════════════════════════════════════════
  function renderHomeExpansion() {
    var springboard = global.document.querySelector(".springboard");
    if (!springboard) return;
    var markup = hubHtml();
    var existing = springboard.querySelector("#quantusLearningHub");
    if (existing) {
      if (state.lastMarkup !== markup) {
        existing.outerHTML = markup;
        state.lastMarkup = markup;
      }
    } else {
      var top = springboard.querySelector(".sb-top");
      if (top) top.insertAdjacentHTML("afterend", markup);
      else springboard.insertAdjacentHTML("afterbegin", markup);
      state.lastMarkup = markup;
    }
    injectCareerIcon(springboard);
  }

  function fixUniversalLinks() {
    var link = global.document.querySelector("#quantusDeviceUi .qu-link");
    if (link) { link.href = "https://management-xo2-pro.netlify.app/career-model.html"; link.target = "_blank"; link.rel = "noopener"; }
  }

  function scheduleRender() {
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(function () { renderHomeExpansion(); fixUniversalLinks(); }, 50);
  }

  function detach() {
    state.refs.forEach(function (entry) { try { entry.ref.off("value", entry.handler); } catch (_) {} });
    state.refs = [];
  }

  function listen(db, path, key) {
    var ref = db.ref(path);
    var handler = function (snapshot) { state[key] = snapshot.val() || {}; scheduleRender(); };
    ref.on("value", handler, function () {});
    state.refs.push({ ref: ref, handler: handler });
  }

  function connectData() {
    var q = api();
    var sync = global.QuantusDeviceSync;
    if (!q || !sync || !sync.state || !sync.state.db || !sync.state.user || sync.state.user.isAnonymous) return;
    var uid = sync.state.user.uid;
    if (state.userId === uid && state.refs.length) return;
    detach(); state.userId = uid;
    var db = sync.state.db;
    listen(db, "bmpruefung", "bm");
    listen(db, "smarter/documents", "smarter");
    listen(db, "leseplan/docs", "leseplan");
    listen(db, "leseplan/aufbereitung", "leseplanAufbereitung");
    listen(db, "careerModel/users/" + uid, "career");
  }

  function start() {
    var observer = new MutationObserver(scheduleRender);
    var main = global.document.getElementById("main");
    if (main) observer.observe(main, { childList: true, subtree: true });
    var uiObserver = new MutationObserver(fixUniversalLinks);
    if (global.document.body) uiObserver.observe(global.document.body, { childList: true, subtree: true });
    global.document.addEventListener("quantus:device-state", function () { connectData(); scheduleRender(); });
    global.document.addEventListener("quantus:devices", scheduleRender);
    global.document.addEventListener("quantus:live-refresh", scheduleRender);
    if (global.QuantusDeviceSync) global.QuantusDeviceSync.ready.then(function () { connectData(); scheduleRender(); });
    scheduleRender();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  TABLETNATIVE ANSICHTEN
  //
  //  BEFUND: Alle fuenf Karten des Lerncockpits riefen data-action="external".
  //  openExternal haengte den Pfad an die DESKTOP-Adresse und oeffnete ein
  //  neues Fenster; auf dem Tablet ist das Popup meist blockiert, also wurde im
  //  selben Fenster geoeffnet — die Tablet-App war weg. Fuer "#/smarter" und
  //  "#/leseplan" entstand dabei sogar eine unsinnige Adresse
  //  ("…netlify.app/#/smarter"), obwohl das Tablet fuer smarter eine eigene
  //  Ansicht besitzt.
  //
  //  Die Daten waren die ganze Zeit da: connectData abonniert bmpruefung,
  //  smarter/documents, leseplan/docs und careerModel/users/<uid> live. Es
  //  fehlten nur Ansichten. Diese hier rendern ausschliesslich daraus — nichts
  //  wird erfunden, nichts zusaetzlich geladen.
  // ══════════════════════════════════════════════════════════════════════

  function head(title, subtitle, actions) {
    var q = api();
    if (q && q.viewHeader) return q.viewHeader(title, subtitle, actions || "");
    return '<div class="view-head"><div><h1>' + esc(title) + '</h1><p>' + esc(subtitle || "") + '</p></div><div class="head-actions">' + (actions || "") + '</div></div>';
  }
  function leerHinweis(text) {
    return '<div class="qt-route-empty">' + esc(text) + '</div>';
  }
  // Ein optionaler Sprung in die Vollversion bleibt — aber als Zusatz, nicht
  // als einziger Weg.
  function vollversion(pfad, label) {
    return '<button class="btn" data-action="external" data-path="' + esc(pfad) + '">↗ ' + esc(label || "Vollversion") + '</button>';
  }
  function fortschritt(anteil) {
    var p = Math.max(0, Math.min(100, Math.round(anteil * 100)));
    return '<div class="qt-bar"><div class="qt-bar-fill" style="width:' + p + '%"></div></div>';
  }

  function renderBm() {
    var root = asObject(state.bm);
    var today = dateKey();
    var lessons = asObject(root.lessons);
    var heute = asObject(lessons[today]);
    var faellig = countDue(root.aufg, today);
    var tage = Object.keys(lessons).sort().reverse();

    return '<div class="view qt-route">' +
      head("BM Vorbereitung", "Tageslektion, Wiederholungen und Kompendium — direkt auf dem Tablet.",
        vollversion("bm.html#/lektion", "Vollversion öffnen")) +
      '<div class="dashboard-grid">' +
        '<section class="widget span-6 hero-widget"><div class="widget-head"><span class="widget-icon">∑</span><h2>Heute</h2></div>' +
          (Object.keys(heute).length
            ? '<div class="qt-route-title">' + esc(titleOf(heute, "Tageslektion")) + '</div>' +
              '<p class="muted">' + esc(heute.thema || heute.beschreibung || "Die Lektion für heute steht bereit.") + '</p>'
            : leerHinweis("Für heute ist keine Lektion hinterlegt.")) +
        '</section>' +
        '<section class="widget span-6"><div class="widget-head"><span class="widget-icon">↻</span><h2>Wiederholungen</h2></div>' +
          '<strong class="qt-route-number">' + faellig + '</strong>' +
          '<small class="muted">' + (faellig === 1 ? "Aufgabe fällig" : "Aufgaben fällig") + '</small>' +
        '</section>' +
        '<section class="widget span-12"><div class="widget-head"><span class="widget-icon">▤</span><h2>Lektionen</h2></div>' +
          (tage.length
            ? '<div class="item-list">' + tage.slice(0, 14).map(function (tag) {
                var l = asObject(lessons[tag]);
                return '<div class="list-item"><span class="badge accent">' + esc(tag) + '</span>' +
                  '<div class="item-main"><div class="item-title">' + esc(titleOf(l, "Lektion")) + '</div>' +
                  '<div class="item-meta">' + esc(l.thema || l.beschreibung || "") + '</div></div></div>';
              }).join("") + '</div>'
            : leerHinweis("Noch keine Lektionen geladen.")) +
        '</section>' +
      '</div></div>';
  }

  /*
   * LESEPLAN.
   *
   * BEFUND (Nutzer: "im leseplan sehe ich zwar den inhalt aber kann ihn nicht
   * oeffnen"): diese Ansicht zeigte Titel, Fortschritt und Zieldatum — also
   * die Verpackung. Der zu lesende Text stand nie darin.
   *
   * Er liegt in `docs[id].sektionen[<sId>].html`, und `plan[i].sektionIds`
   * sagt, welche Abschnitte zu welcher Einheit gehoeren (Datenvertrag: AI Sync
   * public/index.html, Zeile 19307 ff.). Die Ansicht setzt sie jetzt in dieser
   * Reihenfolge zusammen und zeigt sie.
   *
   * Dazu gehoert das Gegenstueck: gelesen abhaken. Das schreibt
   * plan[i].done/doneAt sowie einheitenErledigt und status — dieselben Felder,
   * die die Hauptapp fuehrt. Ein Haken, der nur lokal wirkt, waere ein zweiter
   * Datenstand.
   */
  function leseplanDoc(id) {
    var docs = asObject(state.leseplan);
    var doc = asObject(docs[id]);
    return Object.keys(doc).length ? Object.assign({ _id: id }, doc) : null;
  }

  // Der Text einer Einheit: ihre Abschnitte in der Reihenfolge, die der Plan
  // vorgibt. Faellt sektionIds aus, wird nichts erfunden — dann ist die
  // Einheit eben leer, und die Ansicht sagt es.
  function leseplanEinheitHtml(doc, unit) {
    var sektionen = asObject(doc.sektionen);
    var ids = asArray(unit && unit.sektionIds);
    if (!ids.length) return "";
    return ids.map(function (sid) {
      var abschnitt = asObject(sektionen[sid]);
      var titel = abschnitt.title ? '<h3>' + esc(abschnitt.title) + '</h3>' : "";
      return titel + String(abschnitt.html || "");
    }).join("");
  }

  function leseplanAktuelleEinheit(doc) {
    var plan = asArray(doc.plan);
    var offen = plan.filter(function (u) { return u && !u.done; });
    if (offen.length) return offen[0];
    return plan.length ? plan[plan.length - 1] : null;
  }

  function renderLeseplan() {
    var docs = values(state.leseplan);
    var next = nextReadingUnit();
    var offeneDocs = docs.filter(function (d) { return d.status !== "fertig"; });

    // Welches Dokument und welche Einheit offen sind. Ohne Wahl: das Dokument
    // der naechsten faelligen Einheit — das ist fast immer das gemeinte.
    var docId = state.leseplanDoc || (next && next.doc ? next.doc.id : null) || (docs[0] && docs[0].id) || null;
    var doc = docId ? leseplanDoc(docId) : null;
    var plan = doc ? asArray(doc.plan) : [];
    var idx = state.leseplanEinheit;
    if (doc && (idx == null || !plan[idx])) {
      var aktuell = leseplanAktuelleEinheit(doc);
      idx = aktuell ? (aktuell.index != null ? aktuell.index : plan.indexOf(aktuell)) : null;
    }
    var unit = idx != null ? plan[idx] : null;
    // Die hergeleitete Wahl zurueckschreiben. Ohne das kennen die Aktionen
    // (abhaken, blaettern) das Dokument nicht, solange man noch keines
    // angetippt hat — der erste Klick auf "Als gelesen markieren" ginge ins
    // Leere, obwohl die Einheit sichtbar vor einem steht.
    state.leseplanDoc = docId;
    state.leseplanEinheit = idx;
    var html = doc && unit ? leseplanEinheitHtml(doc, unit) : "";
    var fertig = plan.filter(function (u) { return u && u.done; }).length;
    var aufbereitung = asObject(asObject(asObject(state.leseplanAufbereitung)[docId])[idx]);
    var heute = dateKey();

    return '<div class="view qt-route">' +
      head("Leseplan", "Die Einheit von heute lesen, abhaken, weiter — alles im Tablet.",
        vollversion("index.html#/leseplan", "Vollversion öffnen")) +
      '<div class="qt-lp-layout">' +
        // ── Links: Dokumente und ihr Plan ─────────────────────────────────
        '<aside class="qt-lp-side">' +
          '<div class="qt-lp-side-head">Dokumente</div>' +
          (docs.length
            ? docs.map(function (d) {
                var dPlan = asArray(d.plan);
                var dFertig = dPlan.filter(function (u) { return u && u.done; }).length;
                return '<button class="qt-lp-doc' + (d.id === docId ? " on" : "") +
                  '" data-qt-action="lp-doc" data-id="' + esc(String(d.id)) + '">' +
                  '<strong>' + esc(titleOf(d, "Dokument")) + '</strong>' +
                  '<small>' + dFertig + ' von ' + dPlan.length + ' Einheiten' +
                  (d.zieldatum ? ' · bis ' + esc(String(d.zieldatum)) : "") + '</small>' +
                  fortschritt(dPlan.length ? dFertig / dPlan.length : 0) + '</button>';
              }).join("")
            : leerHinweis("Noch kein Dokument im Leseplan.")) +
          (doc && plan.length
            ? '<div class="qt-lp-side-head">Einheiten</div>' +
              '<div class="qt-lp-plan">' + plan.map(function (u, i) {
                var nummer = u && u.index != null ? u.index : i;
                var faellig = String(u && u.datum || "") <= heute;
                return '<button class="qt-lp-unit' + (i === idx ? " on" : "") + (u && u.done ? " done" : "") +
                  '" data-qt-action="lp-unit" data-idx="' + i + '">' +
                  '<span class="qt-lp-unit-nr">' + (Number(nummer) + 1) + '</span>' +
                  '<span class="qt-lp-unit-main"><b>' + esc(String(u && u.datum || "ohne Datum")) + '</b>' +
                  '<small>≈ ' + esc(String((u && u.estMinutes) || 0)) + ' Min</small></span>' +
                  '<span class="qt-lp-unit-state">' + (u && u.done ? "✓" : (faellig ? "fällig" : "·")) + '</span></button>';
              }).join("") + '</div>'
            : "") +
        '</aside>' +
        // ── Rechts: die Einheit selbst ────────────────────────────────────
        '<section class="qt-lp-read">' +
          (doc && unit
            ? '<div class="qt-lp-read-head">' +
                '<div><strong>' + esc(titleOf(doc, "Dokument")) + '</strong>' +
                '<small>Einheit ' + (Number(unit.index != null ? unit.index : idx) + 1) + ' von ' + plan.length +
                ' · ' + esc(String(unit.datum || "ohne Datum")) + ' · ≈ ' + esc(String(unit.estMinutes || 0)) + ' Min' +
                ' · ' + fertig + ' gelesen</small></div>' +
                '<div class="qt-lp-read-actions">' +
                  '<button class="btn" data-qt-action="lp-note" data-idx="' + idx + '">＋ Lernnotiz</button>' +
                  '<button class="btn" data-qt-action="lp-step" data-step="-1"' + (idx > 0 ? "" : " disabled") + '>‹</button>' +
                  '<button class="btn' + (unit.done ? "" : " primary") + '" data-qt-action="lp-done" data-idx="' + idx +
                    '" data-done="' + (unit.done ? "0" : "1") + '">' +
                    (unit.done ? "↺ Wieder offen" : "✓ Als gelesen markieren") + '</button>' +
                  '<button class="btn" data-qt-action="lp-step" data-step="1"' + (idx < plan.length - 1 ? "" : " disabled") + '>›</button>' +
                '</div>' +
              '</div>' +
              (aufbereitung.zusammenfassung || asArray(aufbereitung.kernpunkte).length
                ? '<div class="qt-lp-ai"><h4>Aufbereitung</h4>' +
                  (aufbereitung.zusammenfassung ? '<p>' + esc(String(aufbereitung.zusammenfassung)) + '</p>' : "") +
                  (asArray(aufbereitung.kernpunkte).length
                    ? '<ul>' + asArray(aufbereitung.kernpunkte).map(function (k) { return '<li>' + esc(String(k)) + '</li>'; }).join("") + '</ul>'
                    : "") + '</div>'
                : "") +
              (html
                ? '<div class="qt-lp-text" data-reader="true">' + html + '</div>'
                : leerHinweis("Diese Einheit enthält keinen Text — das Dokument wurde noch nicht aufbereitet."))
            : leerHinweis("Wähle links ein Dokument, um zu lesen.")) +
        '</section>' +
      '</div></div>';
  }

  function renderCareer() {
    var root = asObject(state.career);
    var next = nextCareerSession();
    var reflected = Boolean(asObject(root.reflections)[dateKey()]);
    var modules = values(root.modules).filter(function (m) { return m.status !== "archived"; });

    return '<div class="view qt-route">' +
      head("Career Model", "Dein 30-Minuten-Fachmodul und die tägliche Reflexion.",
        vollversion("career-model.html", "Vollversion öffnen")) +
      '<div class="dashboard-grid">' +
        '<section class="widget span-8 hero-widget"><div class="widget-head"><span class="widget-icon">C</span><h2>Nächste Einheit</h2></div>' +
          (next
            ? '<div class="qt-route-title">' + esc(titleOf(next.module, "Modul")) + ' · ' + esc(titleOf(next.day, "Tag")) + '</div>' +
              '<p class="muted">Tag ' + esc(String(next.day.day || next.completed + 1)) + ' · ' +
              esc(String(next.day.estimatedMinutes || 30)) + ' Min.</p>' +
              fortschritt(next.total ? next.completed / next.total : 0) +
              '<small class="muted">' + next.completed + ' von ' + next.total + ' Tagen</small>' +
              '<div class="row-actions" style="margin-top:12px"><button class="btn" data-qt-action="career-note">＋ Lernnotiz</button></div>'
            : leerHinweis("Kein Fachmodul aktiv — in der Vollversion eines importieren.")) +
        '</section>' +
        '<section class="widget span-4"><div class="widget-head"><span class="widget-icon">◍</span><h2>Reflecta</h2></div>' +
          '<strong class="qt-route-number">' + (reflected ? "✓" : "–") + '</strong>' +
          '<small class="muted">' + (reflected ? "heute erledigt" : "heute offen") + '</small>' +
        '</section>' +
        '<section class="widget span-12"><div class="widget-head"><span class="widget-icon">▦</span><h2>Module</h2></div>' +
          (modules.length
            ? '<div class="item-list">' + modules.map(function (m) {
                var order = asArray(m.dayOrder);
                var done = Object.keys(asObject(asObject(root.progress)[m.id]).completedDays || {}).length;
                return '<div class="list-item"><span class="badge' + (m.status === "active" ? " accent" : "") + '">' +
                  esc(m.status || "offen") + '</span><div class="item-main">' +
                  '<div class="item-title">' + esc(titleOf(m, "Modul")) + '</div>' +
                  '<div class="item-meta">' + done + ' von ' + order.length + ' Tagen</div>' +
                  fortschritt(order.length ? done / order.length : 0) +
                  '</div></div>';
              }).join("") + '</div>'
            : leerHinweis("Noch kein Modul importiert.")) +
        '</section>' +
      '</div></div>';
  }

  function renderRoute(route) {
    // "bm" gehoert jetzt bm-app.js — einer eigenstaendigen App mit Lernplan,
    // Kompendium und Wiederholungen. Der Rueckfall hier bleibt fuer den Fall,
    // dass diese Datei einmal nicht geladen ist.
    if (route === "bm") return renderBm();
    if (route === "leseplan") return renderLeseplan();
    if (route === "career") return renderCareer();
    return "";
  }

  /*
   * BEDIENUNG DER LERN-ANSICHTEN.
   *
   * Dieses Modul meldet sich NICHT als Tablet-Modul an (app.js kennt es ueber
   * QuantusTabletLearningHub), bekommt also kein onAction. Ein eigener
   * Handler ist deshalb der einzige Weg — er haengt am Dokument und reagiert
   * nur auf den eigenen Namensraum data-qt-action. `data-qu-action` gehoert
   * dem universellen UI-Skript; darauf zu bauen hiesse, sich auf fremden
   * Code zu verlassen, der hier gar nicht geladen sein muss.
   */
  function db() {
    var sync = global.QuantusDeviceSync;
    if (sync && sync.state && sync.state.db) return sync.state.db;
    var q = api();
    return q && typeof q.getDatabase === "function" ? q.getDatabase() : null;
  }

  function meldung(titel, text, art) {
    var q = api();
    if (q && q.toast) q.toast(titel, text || "", art || "");
  }

  function neuZeichnen() {
    var q = api();
    if (q && q.render) q.render();
  }

  // Eine Leseeinheit abhaken. Geschrieben wird dorthin, wo die Hauptapp liest:
  // plan[i].done/doneAt, dazu einheitenErledigt und status. Ein Haken, der nur
  // hier wirkt, waere ein zweiter Datenstand.
  function leseplanEinheitSetzen(docId, index, gelesen) {
    var verbindung = db();
    if (!verbindung) { meldung("Nicht gespeichert", "Keine Verbindung zur Datenbank.", "error"); return; }
    var doc = leseplanDoc(docId);
    if (!doc) return;
    var plan = asArray(doc.plan).slice();
    if (!plan[index]) return;
    plan[index] = Object.assign({}, plan[index], {
      done: Boolean(gelesen),
      doneAt: gelesen ? new Date().toISOString() : null
    });
    var fertig = plan.filter(function (u) { return u && u.done; }).length;
    verbindung.ref("leseplan/docs/" + docId).update({
      plan: plan,
      einheitenErledigt: fertig,
      status: fertig >= plan.length && plan.length ? "fertig" : "aktiv",
      updatedAt: new Date().toISOString()
    }).then(function () {
      meldung(gelesen ? "Als gelesen markiert" : "Wieder offen", fertig + " von " + plan.length + " Einheiten", "ok");
      // Nach dem Abhaken auf die naechste offene Einheit springen — sonst
      // bleibt man auf dem gerade Gelesenen stehen und muss selbst suchen.
      if (gelesen) {
        var naechste = plan.findIndex(function (u, i) { return i > index && u && !u.done; });
        if (naechste < 0) naechste = plan.findIndex(function (u) { return u && !u.done; });
        if (naechste >= 0) state.leseplanEinheit = naechste;
      }
      neuZeichnen();
    }).catch(function (fehler) {
      meldung("Nicht gespeichert", fehler.message, "error");
    });
  }

  global.document.addEventListener("click", function (event) {
    var knopf = event.target.closest ? event.target.closest("[data-qt-action]") : null;
    if (!knopf) return;
    var aktion = knopf.dataset.qtAction;

    if (aktion === "lp-doc") {
      state.leseplanDoc = knopf.dataset.id;
      state.leseplanEinheit = null;
      neuZeichnen();
      return;
    }
    if (aktion === "lp-unit") {
      state.leseplanEinheit = Number(knopf.dataset.idx);
      neuZeichnen();
      return;
    }
    if (aktion === "lp-step") {
      var doc = leseplanDoc(state.leseplanDoc);
      if (!doc) return;
      var plan = asArray(doc.plan);
      var jetzt = state.leseplanEinheit;
      if (jetzt == null) {
        var aktuell = leseplanAktuelleEinheit(doc);
        jetzt = aktuell ? plan.indexOf(aktuell) : 0;
      }
      var ziel = jetzt + Number(knopf.dataset.step || 0);
      if (ziel >= 0 && ziel < plan.length) { state.leseplanEinheit = ziel; neuZeichnen(); }
      return;
    }
    if (aktion === "lp-done") {
      leseplanEinheitSetzen(state.leseplanDoc, Number(knopf.dataset.idx), knopf.dataset.done === "1");
      return;
    }
    if (aktion === "lp-note") {
      var q = api(), lpDoc = leseplanDoc(state.leseplanDoc), unitIndex = Number(knopf.dataset.idx), lpUnit = lpDoc && asArray(lpDoc.plan)[unitIndex];
      if (!q || !lpDoc || !lpUnit || typeof q.openNoteForm !== "function") return;
      var label = titleOf(lpDoc, "Leseplan") + " · Einheit " + (unitIndex + 1);
      var content = leseplanEinheitHtml(lpDoc, lpUnit).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800);
      q.openNoteForm({ noteClass:"learning", lockClass:true, content:content, tags:[titleOf(lpDoc,"Leseplan")],
        source:{ app:"leseplan", entityType:"unit", entityId:state.leseplanDoc + ":" + unitIndex, label:label, route:"#/leseplan" } });
      return;
    }
    if (aktion === "career-note") {
      var qa = api(), next = nextCareerSession(); if (!qa || !next || typeof qa.openNoteForm !== "function") return;
      var careerLabel = titleOf(next.module,"Career Model") + " · " + titleOf(next.day,"Tag");
      qa.openNoteForm({ noteClass:"learning", lockClass:true, tags:[titleOf(next.module,"Career Model")],
        source:{ app:"career", entityType:"lesson", entityId:(next.module.id || "module") + ":" + (next.day.id || next.day.day || next.completed), label:careerLabel, route:"#/career" } });
      return;
    }
  });

  global.QuantusTabletLearningHub = { state: state, render: renderHomeExpansion, connect: connectData, renderRoute: renderRoute };
  if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})(typeof window !== "undefined" ? window : null);
