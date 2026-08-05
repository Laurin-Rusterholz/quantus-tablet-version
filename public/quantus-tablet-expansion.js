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
    return card("BM Vorbereitung", title, sub, "∑", "sand", "external", "bm.html#/lektion");
  }

  function latestSmarter() {
    return values(state.smarter).sort(function (a, b) {
      return parseTime(b.generatedAt || b.createdAt || b.aktualisiert || b.date || b.id) - parseTime(a.generatedAt || a.createdAt || a.aktualisiert || a.date || a.id);
    })[0] || null;
  }

  function smarterCard() {
    var doc = latestSmarter();
    return card("Smarter", titleOf(doc, "Tagesstoff öffnen"), doc ? (doc.status === "delivered" ? "Heute bereit" : "Neuester Lernstoff") : "Noch kein Tagesdokument", "Σ", "violet", "external", "#/smarter");
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
    return card("Leseplan", title, sub, "▤", "blue", "external", "#/leseplan");
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
    return card("Career Model", title, sub, "C", "green", "external", "career-model.html");
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
    button.setAttribute("data-action", "external");
    button.setAttribute("data-path", "career-model.html");
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

  global.QuantusTabletLearningHub = { state: state, render: renderHomeExpansion, connect: connectData };
  if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})(typeof window !== "undefined" ? window : null);
