(function (global) {
  "use strict";

  if (!global || global.QuantusTabletLearningHub) return;

  var state = {
    bm: null,
    smarter: null,
    leseplan: null,
    career: null,
    userId: "",
    refs: [],
    mounted: false,
    renderTimer: null
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
    return '<section id="quantusLearningHub" class="qt-learning-hub"><div class="qt-learning-head"><div><span>LESEN & WEITERBILDEN</span><h2>Dein Lerncockpit</h2><p>BM, Smarter, Leseplan, Career Model und Pinnboards werden live aktualisiert.</p></div><button type="button" data-qu-action="toggle" class="qt-device-summary">⇄ ' + esc(deviceSummary()) + '</button></div><div class="qt-learning-grid">' + bmCard() + smarterCard() + leseplanCard() + careerCard() + canvasCard() + '</div></section>';
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

  function renderHomeExpansion() {
    var springboard = global.document.querySelector(".springboard");
    if (!springboard) return;
    var markup = hubHtml();
    var existing = springboard.querySelector("#quantusLearningHub");
    if (existing) {
      if (existing.outerHTML !== markup) existing.outerHTML = markup;
    } else {
      var top = springboard.querySelector(".sb-top");
      if (top) top.insertAdjacentHTML("afterend", markup);
      else springboard.insertAdjacentHTML("afterbegin", markup);
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

  function renderLeseplan() {
    var docs = values(state.leseplan);
    var next = nextReadingUnit();
    var offen = docs.filter(function (d) { return d.status !== "fertig"; });

    return '<div class="view qt-route">' +
      head("Leseplan", "Dokumente auf ihr Zieldatum verteilt — die nächste Einheit zuoberst.",
        vollversion("index.html#/leseplan", "Vollversion öffnen")) +
      '<div class="dashboard-grid">' +
        '<section class="widget span-12 hero-widget"><div class="widget-head"><span class="widget-icon">▤</span><h2>Als Nächstes</h2></div>' +
          (next
            ? '<div class="qt-route-title">' + esc(titleOf(next.doc, "Leseeinheit")) + '</div>' +
              '<p class="muted">Einheit ' + (Number(next.unit.index != null ? next.unit.index : next.index) + 1) +
              ' · ca. ' + esc(String(next.unit.estMinutes || 10)) + ' Min. · ' + esc(String(next.unit.datum || "ohne Datum")) + '</p>'
            : leerHinweis("Kein offener Abschnitt — alles gelesen.")) +
        '</section>' +
        '<section class="widget span-12"><div class="widget-head"><span class="widget-icon">◧</span><h2>Dokumente</h2></div>' +
          (offen.length
            ? '<div class="item-list">' + offen.map(function (d) {
                var plan = asArray(d.plan);
                var fertig = plan.filter(function (u) { return u && u.done; }).length;
                return '<div class="list-item"><div class="item-main">' +
                  '<div class="item-title">' + esc(titleOf(d, "Dokument")) + '</div>' +
                  '<div class="item-meta">' + fertig + ' von ' + plan.length + ' Einheiten' +
                  (d.zieldatum ? ' · bis ' + esc(String(d.zieldatum)) : "") + '</div>' +
                  fortschritt(plan.length ? fertig / plan.length : 0) +
                  '</div></div>';
              }).join("") + '</div>'
            : leerHinweis("Keine offenen Dokumente.")) +
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
              '<small class="muted">' + next.completed + ' von ' + next.total + ' Tagen</small>'
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
    if (route === "bm") return renderBm();
    if (route === "leseplan") return renderLeseplan();
    if (route === "career") return renderCareer();
    return "";
  }

  global.QuantusTabletLearningHub = { state: state, render: renderHomeExpansion, connect: connectData, renderRoute: renderRoute };
  if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})(typeof window !== "undefined" ? window : null);
