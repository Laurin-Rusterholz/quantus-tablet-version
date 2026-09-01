/*
 * CHATGPT-MODUL (Tablet).
 *
 * Die Arbeitsoberflaeche des ChatGPT-Assistenten aus AI Sync, auf dem Tablet
 * bewusst schmal:
 *   · Notes  — Leseansicht mit dem Filter "seit letzter Sitzung". Kein
 *              Erfassen, kein Abloesen (das gehoert an den Rechner).
 *   · Leads  — Leseansicht: Eingang nach Gruppen, Detail mit allen Schritten
 *              in fester Reihenfolge, Bewertungsraster, Zuweisung und
 *              erteilten Berechtigungen. Kein Bearbeiten, kein Abschliessen.
 *   · ChatGPT-Aufgaben — Marker am Element und Anlegen (einzeiliges Feld im
 *              Formular einer Sammlung). Keine Sammelansicht.
 *
 * Gelesen und geschrieben wird ausschliesslich in entities.chatgptNotes,
 * entities.chatgptLeads und entities.chatgptTasks — genau dort, wo AI Sync
 * sie fuehrt. Jede Schreibung geht durch dieselbe Firebase-Transaktion
 * (executeOperation), es gibt keinen zweiten Schreibweg.
 *
 * Drei Zaehler bleiben getrennt (Notes neu / Leads ungelesen / Aufgaben
 * offen); die Kachel auf dem App-Bildschirm zeigt die neuen Notes, weil das
 * die Zahl ist, die vor jeder Sitzung zaehlt.
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
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function payload() { var a = api(); return a ? obj(a.state.payload) : {}; }
  function col(name) { var a = api(); return a ? a.collection(name) : []; }
  function fmtDate(value) {
    var a = api();
    var day = String(value || "").slice(0, 10);
    return a && day ? a.formatDate(day) : day;
  }
  function fmtDateTime(value) {
    var a = api();
    if (!value) return "";
    return a ? a.formatDate(String(value).slice(0, 10)) + " " + (a.formatTime ? a.formatTime(value) : "") : String(value);
  }
  function head(name, subtitle, actions) { var a = api(); return a ? a.viewHeader(name, subtitle, actions || "") : ""; }
  function nothing(icon, name, hint) { var a = api(); return a ? a.emptyState(icon, name, hint) : ""; }
  function newerFirst(a, b) { return String(b.createdAt || "").localeCompare(String(a.createdAt || "")); }

  // ── Ansichtszustand — haengt an der Route, faellt beim Wechsel zurueck ────
  var ui = { route: null, tab: "notes", notesMode: "new", openLead: null, showClosed: false };

  // ── Zaehler (getrennt) ───────────────────────────────────────────────────
  function lastReadAt() { return obj(payload().chatgptNotesMeta).lastSessionReadAt || null; }
  function notes() { return col("chatgptNotes").slice().sort(newerFirst); }
  function newNotes() {
    var last = lastReadAt();
    var all = notes();
    return last ? all.filter(function (n) { return String(n.createdAt || "") > last; }) : all;
  }
  function leads() { return col("chatgptLeads").slice().sort(newerFirst); }
  function unreadLeads() { return leads().filter(function (l) { return !l.readAt && l.status !== "abgeschlossen"; }); }
  function tasks() { return col("chatgptTasks"); }
  function openTasks() { return tasks().filter(function (t) { return t.state === "offen"; }); }

  // ── Notes ────────────────────────────────────────────────────────────────
  var CATEGORY = {
    auftrag:    { label: "Auftrag",    color: "#D96B5B" },
    feedback:   { label: "Feedback",   color: "#2F8C80" },
    konvention: { label: "Konvention", color: "#C9A96E" },
    entscheid:  { label: "Entscheid",  color: "#7A8288" }
  };
  function noteCard(n, all) {
    var meta = CATEGORY[n.category] || { label: n.category || "?", color: "#7A8288" };
    var superseded = n.state === "ueberholt";
    var next = n.supersededBy ? all.filter(function (x) { return x.id === n.supersededBy; })[0] : null;
    return '<article class="entity-card cg-note' + (superseded ? " cg-superseded" : "") + '">' +
      '<div class="row-actions"><span class="muted small">' + esc(fmtDate(n.instructionDate || n.createdAt)) + "</span>" +
      '<span class="badge" style="background:' + meta.color + '22;color:' + meta.color + '">' + esc(meta.label) + "</span>" +
      (n.promptSection ? '<span class="badge">§ ' + esc(n.promptSection) + "</span>" : "") +
      (superseded ? '<span class="badge">überholt' + (next ? " → " + esc(String(next.instruction || "").slice(0, 30)) : "") + "</span>" : "") +
      "</div>" +
      '<h3 class="cg-instruction">' + esc(n.instruction || "") + "</h3>" +
      (n.derived ? '<p class="cg-derived">' + esc(n.derived) + "</p>" : "") +
      (arr(n.tags).length ? '<div class="chip-row">' + arr(n.tags).map(function (t) { return '<span class="chip">#' + esc(t) + "</span>"; }).join("") + "</div>" : "") +
      "</article>";
  }
  function renderNotes() {
    var all = notes();
    var fresh = newNotes();
    var last = lastReadAt();
    var list = ui.notesMode === "all" ? all : fresh;
    return '<div class="chip-row cg-modes">' +
      '<button class="chip' + (ui.notesMode !== "all" ? " on" : "") + '" data-action="cg-notes-mode" data-mode="new">Seit letzter Sitzung ' + fresh.length + "</button>" +
      '<button class="chip' + (ui.notesMode === "all" ? " on" : "") + '" data-action="cg-notes-mode" data-mode="all">Alle ' + all.length + "</button>" +
      "</div>" +
      '<p class="muted small">' + (ui.notesMode === "all"
        ? all.length + " Einträge insgesamt"
        : fresh.length + " neue Anweisung" + (fresh.length === 1 ? "" : "en") + " seit " + (last ? esc(fmtDate(last)) : "je")) +
      " — lesen auf dem Tablet, erfassen und ablösen am Rechner.</p>" +
      '<div class="content-grid">' + (list.map(function (n) { return noteCard(n, all); }).join("") ||
        nothing("🤖", "Keine Einträge", ui.notesMode === "all" ? "Noch keine ChatGPT Notes." : "Nichts Neues seit der letzten Sitzung.")) + "</div>";
  }

  // ── Leads ────────────────────────────────────────────────────────────────
  var STATUS = {
    neu: { label: "Neu", color: "#D96B5B" }, verstanden: { label: "Verstanden", color: "#2F8C80" },
    in_arbeit: { label: "In Arbeit", color: "#2F8C80" }, wartet: { label: "Wartet", color: "#C9A96E" },
    abgeschlossen: { label: "Abgeschlossen", color: "#7A8288" }
  };
  var STEPS = [
    { field: "interpretation", label: "Interpretation", required: true },
    { field: "openQuestions",  label: "Offene Fragen",  required: false },
    { field: "research",       label: "Recherche",      required: true },
    { field: "plan",           label: "Plan",           required: true },
    { field: "execution",      label: "Ausführung",     required: true },
    { field: "result",         label: "Ergebnis",       required: true },
    { field: "workflowNote",   label: "Workflow-Notiz", required: false }
  ];
  var ASSESSMENT = [
    { key: "menge", label: "Menge" }, { key: "werkzeug", label: "Werkzeug" }, { key: "kontext", label: "Kontext" },
    { key: "quantusNaehe", label: "Quantus-Nähe" }, { key: "recherche", label: "Recherche" }, { key: "zuschnitt", label: "Zuschnitt" }
  ];
  var ASSIGNEE = { chatgpt: "ChatGPT", cowork: "Claude Cowork" };
  function linkCount(l) {
    var n = 0;
    Object.keys(obj(l)).forEach(function (k) { if (/^linked[A-Z]/.test(k) && Array.isArray(l[k])) n += l[k].length; });
    return n;
  }
  function tally(a) {
    a = obj(a);
    var c = 0, w = 0;
    ASSESSMENT.forEach(function (x) { if (a[x.key] === "chatgpt") c += 1; else if (a[x.key] === "cowork") w += 1; });
    return { chatgpt: c, cowork: w, complete: c + w === ASSESSMENT.length, filled: c + w };
  }
  function permissions(p) {
    p = obj(p);
    var de = p.dateienErstellen;
    var erlaubt = de && typeof de === "object" ? de.erlaubt === true : de === true;
    var formate = de && typeof de === "object" ? arr(de.formate) : [];
    return "🔐 Websuche " + (p.websuche === true ? "✓" : "–") +
      " · Dateien " + (erlaubt ? "✓" + (formate.length ? " (" + esc(formate.join(", ")) + ")" : "") : "–") +
      " · Tools: " + (arr(p.externeTools).length ? esc(arr(p.externeTools).join(", ")) : "keine") +
      " · Verboten: " + (arr(p.verboten).length ? esc(arr(p.verboten).join(", ")) : "–");
  }
  function progress(l) {
    var req = STEPS.filter(function (s) { return s.required; });
    var done = req.filter(function (s) { return String(l[s.field] || "").trim(); }).length;
    var t = tally(l.assessment);
    if (t.complete && ASSIGNEE[l.assignee] && String(l.assignmentReason || "").trim()) done += 1;
    if (linkCount(l) > 0) done += 1;
    return { done: done, total: req.length + 2 };
  }
  // Raster als kompakte Zeile mit zwei Spalten, Ergebnis, Begruendung,
  // Berechtigungen — ohne Klick sichtbar, auf der Karte wie im Detail.
  function assessmentSummary(l) {
    var a = obj(l.assessment);
    var t = tally(a);
    var cells = ASSESSMENT.map(function (c) {
      var v = a[c.key];
      return '<span class="cg-ass-cell ' + (v || "leer") + '">' + esc(c.label) + ": <strong>" +
        (v === "chatgpt" ? "ChatGPT" : v === "cowork" ? "Cowork" : "—") + "</strong></span>";
    }).join("");
    return '<div class="cg-assessment">' +
      '<div class="cg-ass-grid">' + cells + "</div>" +
      '<div class="cg-ass-result">' + t.chatgpt + " : " + t.cowork + " → <strong>" + esc(ASSIGNEE[l.assignee] || "nicht zugewiesen") + "</strong>" +
      (t.complete ? "" : ' <span class="cg-warn">(' + t.filled + "/" + ASSESSMENT.length + " bewertet)</span>") + "</div>" +
      (String(l.assignmentReason || "").trim() ? '<div class="muted small cg-reason">' + esc(l.assignmentReason) + "</div>" : "") +
      '<div class="muted small cg-perms">' + permissions(l.grantedPermissions) + "</div>" +
      (l.assignee === "cowork" ? '<div class="muted small">' + (l.handoverAt ? "Übergeben " + esc(fmtDateTime(l.handoverAt)) : "noch nicht übergeben") +
        (l.returnedAt ? " · zurück " + esc(fmtDateTime(l.returnedAt)) : "") + "</div>" : "") +
      (l.handoverPacket ? '<details class="cg-packet"><summary class="muted small">📦 Übergabepaket (' + String(l.handoverPacket).length + " Zeichen)</summary><pre class=\"cg-packet-text\">" + esc(l.handoverPacket) + "</pre></details>" : "") +
      "</div>";
  }
  function leadCard(l) {
    var s = STATUS[l.status] || STATUS.neu;
    var p = progress(l);
    var unread = !l.readAt && l.status !== "abgeschlossen";
    return '<article class="entity-card cg-lead' + (unread ? " cg-unread" : "") + '" data-action="cg-lead-open" data-id="' + attr(l.id) + '" role="button" tabindex="0">' +
      '<div class="row-actions">' + (unread ? '<span class="badge coral">Ungelesen</span>' : "") +
      '<span class="badge" style="background:' + s.color + '22;color:' + s.color + '">' + esc(s.label) + (l.closedBy === "laurin" ? " · hinfällig" : "") + "</span>" +
      '<span class="muted small">' + esc(fmtDate(l.createdAt)) + "</span></div>" +
      "<h3>" + esc(l.title || "(Ohne Titel)") + "</h3>" +
      "<p>" + esc(String(l.rawInput || "").slice(0, 160)) + (String(l.rawInput || "").length > 160 ? "…" : "") + "</p>" +
      assessmentSummary(l) +
      (l.status !== "abgeschlossen" ? '<div class="cg-progress"><div class="cg-progress-bar" style="width:' + Math.round(p.done / p.total * 100) + '%"></div></div>' : "") +
      (l.status === "wartet" && l.blockedReason ? '<div class="muted small cg-warn">⏸ ' + esc(l.blockedReason) + "</div>" : "") +
      "</article>";
  }
  function linkedNames(l) {
    var a = api();
    var e = obj(payload().entities);
    var out = [];
    Object.keys(obj(l)).forEach(function (k) {
      if (!/^linked[A-Z]/.test(k) || !Array.isArray(l[k])) return;
      var store = k.slice(6, 7).toLowerCase() + k.slice(7);
      var map = obj(e[store]);
      l[k].forEach(function (id) {
        var x = map[id];
        if (x) out.push(store + ": " + (a ? a.itemTitle(x, x.instruction || "(Ohne Titel)") : (x.title || x.name || x.instruction || id)));
      });
    });
    return out;
  }
  function renderLeadDetail(id) {
    var l = leads().filter(function (x) { return x.id === id; })[0];
    if (!l) { ui.openLead = null; return renderLeads(); }
    var s = STATUS[l.status] || STATUS.neu;
    var p = progress(l);
    var closed = l.status === "abgeschlossen";
    var planIdx = 3;
    var steps = STEPS.map(function (step, i) {
      var text = String(l[step.field] || "").trim();
      var block = '<section class="cg-step' + (text ? " done" : "") + '"><div class="cg-step-head"><span class="cg-step-no">' + (i + 1 + (i > planIdx ? 1 : 0)) + "</span><strong>" + esc(step.label) + "</strong>" +
        (step.required ? ' <span class="cg-warn small">Pflicht</span>' : ' <span class="muted small">optional</span>') + "</div>" +
        '<div class="cg-step-text">' + (text ? esc(text) : '<span class="muted">—</span>') + "</div></section>";
      if (i === planIdx) {
        var t = tally(l.assessment);
        var done = t.complete && ASSIGNEE[l.assignee] && String(l.assignmentReason || "").trim();
        block += '<section class="cg-step' + (done ? " done" : "") + '"><div class="cg-step-head"><span class="cg-step-no">5</span><strong>Bewertung &amp; Zuweisung</strong> <span class="cg-warn small">Pflicht</span></div>' +
          assessmentSummary(l) + "</section>";
      }
      return block;
    }).join("");
    var links = linkedNames(l);
    return '<div class="row-actions"><button class="btn" data-action="cg-lead-back">← Eingang</button>' +
      '<span class="badge" style="background:' + s.color + '22;color:' + s.color + '">' + esc(s.label) + (l.closedBy === "laurin" ? " · hinfällig" : "") + "</span>" +
      '<span class="muted small">Erfasst ' + esc(fmtDateTime(l.createdAt)) + (l.readAt ? " · gelesen " + esc(fmtDateTime(l.readAt)) : " · ungelesen") +
      (l.closedAt ? " · abgeschlossen " + esc(fmtDateTime(l.closedAt)) : "") + "</span></div>" +
      "<h2>" + esc(l.title || "(Ohne Titel)") + "</h2>" +
      '<section class="cg-step"><div class="cg-step-head"><strong>Wortlaut (Laurin)</strong></div><div class="cg-step-text cg-raw">' + esc(l.rawInput || "") + "</div>" +
      (l.obsoleteReason ? '<div class="muted small">Hinfällig, weil: ' + esc(l.obsoleteReason) + "</div>" : "") + "</section>" +
      '<div class="cg-progress-line"><strong>Fortschritt</strong> ' + p.done + "/" + p.total + '<div class="cg-progress"><div class="cg-progress-bar" style="width:' + Math.round(p.done / p.total * 100) + '%"></div></div></div>' +
      (l.status === "wartet" && l.blockedReason ? '<div class="cg-warn">⏸ Wartet: ' + esc(l.blockedReason) + "</div>" : "") +
      steps +
      '<section class="cg-step' + (links.length ? " done" : "") + '"><div class="cg-step-head"><span class="cg-step-no">9</span><strong>Verknüpfungen</strong> <span class="cg-warn small">mindestens eine</span></div>' +
      (links.length ? '<div class="chip-row">' + links.map(function (x) { return '<span class="chip">' + esc(x) + "</span>"; }).join("") + "</div>" : '<div class="muted small">Keine Verknüpfungen.</div>') + "</section>" +
      (arr(l.comments).length ? '<section class="cg-step"><div class="cg-step-head"><strong>Kommentare</strong></div>' + arr(l.comments).map(function (c) {
        return '<div class="cg-comment"><span class="muted small">' + esc(fmtDateTime(c.createdAt)) + "</span><div>" + esc(c.text || "") + "</div></div>";
      }).join("") + "</section>" : "") +
      '<p class="muted small">Bearbeiten, Bewerten und Abschliessen geschieht am Rechner' + (closed ? "" : " — der Lead bleibt hier lesbar") + ".</p>";
  }
  function renderLeads() {
    if (ui.openLead) return renderLeadDetail(ui.openLead);
    var all = leads();
    var unread = all.filter(function (l) { return !l.readAt && l.status !== "abgeschlossen"; });
    var active = all.filter(function (l) { return l.readAt && ["neu", "verstanden", "in_arbeit"].indexOf(l.status) >= 0; });
    var waiting = all.filter(function (l) { return l.readAt && l.status === "wartet"; });
    var closed = all.filter(function (l) { return l.status === "abgeschlossen"; });
    function group(title, list, color) {
      return list.length ? '<h2 class="cg-group" style="color:' + color + '">' + esc(title) + " (" + list.length + ")</h2>" +
        '<div class="content-grid">' + list.map(leadCard).join("") + "</div>" : "";
    }
    return '<p class="muted small">' + unread.length + " ungelesen · " + (active.length + waiting.length) + " offen · " + closed.length + " abgeschlossen — Leads werden am Rechner oder Handy erfasst und vom Assistenten am Rechner bearbeitet.</p>" +
      group("🔴 Ungelesen", unread, "#D96B5B") +
      group("🟢 Neu / In Arbeit", active, "#2F8C80") +
      group("🟡 Wartet", waiting, "#C9A96E") +
      (!all.length ? nothing("📥", "Noch keine Leads", "Erfasst werden Leads am Rechner oder auf dem Handy.") : "") +
      (closed.length ? '<button class="chip' + (ui.showClosed ? " on" : "") + '" data-action="cg-leads-closed">Abgeschlossen ' + closed.length + "</button>" +
        (ui.showClosed ? '<div class="content-grid">' + closed.map(leadCard).join("") + "</div>" : "") : "");
  }

  // ── Modulrahmen ──────────────────────────────────────────────────────────
  function render(route) {
    if (ui.route !== route) { ui.route = route; ui.openLead = null; }
    var nNotes = newNotes().length, nLeads = unreadLeads().length, nTasks = openTasks().length;
    var tabs = '<div class="chip-row cg-tabs">' +
      '<button class="chip' + (ui.tab === "notes" ? " on" : "") + '" data-action="cg-tab" data-tab="notes">🧠 Notes' + (nNotes ? ' <span class="cg-count" style="background:#2F8C80">' + nNotes + "</span>" : "") + "</button>" +
      '<button class="chip' + (ui.tab === "leads" ? " on" : "") + '" data-action="cg-tab" data-tab="leads">📥 Leads' + (nLeads ? ' <span class="cg-count" style="background:#D96B5B">' + nLeads + "</span>" : "") + "</button>" +
      '<span class="chip cg-static">🪶 ChatGPT-Aufgaben' + (nTasks ? ' <span class="cg-count" style="background:#C9A96E">' + nTasks + "</span>" : "") + " — am Element</span>" +
      "</div>";
    return '<div class="view cg-view">' +
      head("ChatGPT", "Notes lesen, Leads lesen, ChatGPT-Aufgaben am Element anlegen. Erfassen und bearbeiten geschieht in AI Sync.", "") +
      tabs + (ui.tab === "leads" ? renderLeads() : renderNotes()) + "</div>";
  }

  // ── ChatGPT-Aufgaben am Element ──────────────────────────────────────────
  // Sammlung → Typname wie in AI Sync (anchorKind), damit der Rechner den
  // Anker aufloest und die Sammelansicht dort den Sprung kennt.
  var KIND_OF = {
    tasks: "task", projects: "project", notes: "note", meetings: "meeting", concepts: "concept", goals: "goal",
    strategies: "strategy", programs: "program", organizations: "organization", persons: "person", ideas: "idea",
    decisions: "decision", protocols: "protocol", workflows: "workflow", theses: "thesis", articles: "article"
  };
  function kindOf(collectionName) {
    if (KIND_OF[collectionName]) return KIND_OF[collectionName];
    var s = String(collectionName || "");
    return /ies$/.test(s) ? s.slice(0, -3) + "y" : s.replace(/s$/, "");
  }
  function tasksFor(kind, id) {
    return tasks().filter(function (t) { return t.anchorKind === kind && String(t.anchorId) === String(id); })
      .sort(function (a, b) {
        var ao = a.state === "erledigt" ? 1 : 0, bo = b.state === "erledigt" ? 1 : 0;
        return ao !== bo ? ao - bo : newerFirst(a, b);
      });
  }
  // Kleiner Sand-Marker mit Anzahl — fuer Laurin unauffaellig.
  function marker(collectionName, id) {
    var open = tasksFor(kindOf(collectionName), id).filter(function (t) { return t.state !== "erledigt"; }).length;
    return open ? '<span class="badge sand cg-marker" title="' + open + ' offene ChatGPT-Aufgabe(n)">🪶 ' + open + "</span>" : "";
  }
  function taskSection(collectionName, item) {
    if (!item || !item.id) return "";
    var kind = kindOf(collectionName);
    var a = api();
    var label = a ? a.itemTitle(item, "") : (item.title || item.name || "");
    var list = tasksFor(kind, item.id);
    var open = list.filter(function (t) { return t.state !== "erledigt"; });
    var rows = list.map(function (t) {
      return '<div class="cg-task-row' + (t.state === "erledigt" ? " done" : "") + '"><div class="cg-task-text">' + esc(t.text) + "</div>" +
        '<div class="muted small">' + esc(fmtDate(t.createdAt)) + " · " + (t.createdBy === "assistant" ? "Assistent" : "Laurin") +
        (t.state === "wartet" ? ' · <span class="cg-warn">wartet: ' + esc(t.blockedReason || "") + "</span>" : "") +
        (t.state === "erledigt" && t.resolvedAt ? " · erledigt " + esc(fmtDate(t.resolvedAt)) : "") + "</div></div>";
    }).join("");
    return '<section class="entity-linked-notes cg-task-section" data-cg-section data-collection="' + attr(collectionName) + '" data-id="' + attr(item.id) + '">' +
      '<div class="widget-head"><span class="widget-icon">🤖</span><h3>ChatGPT-Aufgaben' + (open.length ? ' <span class="badge sand">🪶 ' + open.length + "</span>" : "") + "</h3></div>" +
      (open.length ? '<div class="cg-notice">' + open.length + " offene ChatGPT-Aufgabe" + (open.length > 1 ? "n" : "") + " — der Assistent arbeitet sie am Rechner ab.</div>" : "") +
      '<div class="item-list">' + (rows || '<div class="muted small">Keine ChatGPT-Aufgaben.</div>') + "</div>" +
      '<div class="cg-task-add"><input data-action="cg-task-input" data-collection="' + attr(collectionName) + '" data-id="' + attr(item.id) + '" data-label="' + attr(label) + '" placeholder="ChatGPT-Aufgabe — Enter genügt (z.B. Adresse nachtragen)" autocomplete="off">' +
      '<button class="btn small-btn" type="button" data-action="cg-task-add" data-collection="' + attr(collectionName) + '" data-id="' + attr(item.id) + '" data-label="' + attr(label) + '">＋</button></div>' +
      "</section>";
  }
  // Ohne aufloesbaren Anker wird nichts angelegt.
  function createTask(collectionName, id, text, label) {
    var a = api();
    text = String(text || "").trim();
    if (!a || !text) return Promise.resolve(false);
    if (!collectionName || !id) { a.toast("Kein Anker", "Eine ChatGPT-Aufgabe braucht ein Element.", "warn"); return Promise.resolve(false); }
    var item = col(collectionName).filter(function (x) { return String(x.id) === String(id); })[0];
    if (!item) { a.toast("Anker fehlt", "Das Element wurde nicht gefunden.", "warn"); return Promise.resolve(false); }
    var kind = kindOf(collectionName);
    var now = new Date().toISOString();
    var taskId = a.Core.makeId("chatgptTask");
    // executeOperation liefert false, sobald die Aenderung nur vorgemerkt
    // wurde (offline, nicht angemeldet) — lokal ist sie dann trotzdem drin.
    // Massgeblich ist deshalb der Datenstand, nicht der Rueckgabewert.
    return a.executeOperation(a.makeOperation("entity", "create", "chatgptTasks", taskId, {
      text: text, state: "offen", anchorKind: kind, anchorId: item.id, anchorLabel: label || a.itemTitle(item, ""),
      createdBy: "laurin", resolvedAt: null, blockedReason: null, comments: [], createdAt: now
    }), { silent: true }).then(function () {
      return col("chatgptTasks").some(function (t) { return t.id === taskId; }) ? taskId : null;
    });
  }
  function refreshSection(node) {
    var section = node && node.closest ? node.closest("[data-cg-section]") : null;
    if (!section) return;
    var item = col(section.dataset.collection).filter(function (x) { return String(x.id) === section.dataset.id; })[0];
    var html = taskSection(section.dataset.collection, item);
    if (!html) return;
    var wrap = document.createElement("div");
    wrap.innerHTML = html;
    section.replaceWith(wrap.firstElementChild);
    var input = document.querySelector('[data-cg-section] [data-action="cg-task-input"]');
    if (input) input.focus();
  }
  function submitTask(input) {
    var value = input.value;
    createTask(input.dataset.collection, input.dataset.id, value, input.dataset.label).then(function (taskId) {
      if (!taskId) return;
      input.value = "";
      var a = api();
      if (a) a.toast("ChatGPT-Aufgabe angelegt", String(value).slice(0, 60), "ok");
      refreshSection(input);
    });
  }

  // ── Aktionen ─────────────────────────────────────────────────────────────
  function onAction(action, button) {
    var a = api();
    if (!a) return false;
    if (action === "cg-tab") { ui.tab = button.dataset.tab; ui.openLead = null; a.render(); return true; }
    if (action === "cg-notes-mode") { ui.notesMode = button.dataset.mode; a.render(); return true; }
    if (action === "cg-lead-open") { ui.tab = "leads"; ui.openLead = button.dataset.id; a.render(); return true; }
    if (action === "cg-lead-back") { ui.openLead = null; a.render(); return true; }
    if (action === "cg-leads-closed") { ui.showClosed = !ui.showClosed; a.render(); return true; }
    if (action === "cg-task-add") {
      var section = button.closest("[data-cg-section]");
      var input = section ? section.querySelector('[data-action="cg-task-input"]') : null;
      if (input) submitTask(input);
      return true;
    }
    return false;
  }
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Enter") return;
    var input = event.target && event.target.closest ? event.target.closest('[data-action="cg-task-input"]') : null;
    if (!input) return;
    event.preventDefault();
    submitTask(input);
  });

  (window.__quantusTabletModules = window.__quantusTabletModules || []).push({
    key: "chatgpt",
    routes: ["chatgptnotes"],
    render: render,
    onAction: onAction
  });
  window.QuantusChatgpt = {
    render: render, onAction: onAction, taskSection: taskSection, marker: marker, createTask: createTask,
    newNotesCount: function () { return newNotes().length; },
    unreadLeadsCount: function () { return unreadLeads().length; },
    openTasksCount: function () { return openTasks().length; },
    // Die Kachel zeigt die neuen Notes — die Zahl, die vor jeder Sitzung zaehlt.
    badge: function () { return newNotes().length; }
  };
})();
