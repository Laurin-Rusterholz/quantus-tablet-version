/*
 * CHATGPT-MODUL (Tablet).
 *
 * Die Arbeitsoberflaeche des ChatGPT-Assistenten aus AI Sync, auf dem Tablet
 * bewusst schmal:
 *   · Notes  — Leseansicht mit dem Filter "seit letzter Sitzung". Kein
 *              Erfassen, kein Abloesen (das gehoert an den Rechner).
 *   · Leads  — Leseansicht: Eingang nach Gruppen, Detail mit allen Schritten
 *              in fester Reihenfolge, Bewertungsraster, Zuweisung und
 *              erteilten Berechtigungen. Kein freies Editieren, kein
 *              Abschliessen — MIT DEN AUSNAHMEN AUS DEM MASTER-PDF
 *              (Tagesbriefing-Gesamtkonzept-v2, "compact parity"), die der
 *              App-Besitzer ausdruecklich verlangt hat: eine offene
 *              Rueckfrage des Assistenten (pendingQuestion) laesst sich
 *              einmalig beantworten, ein zurueckgekommenes Cowork-Paket
 *              laesst sich als geprueft markieren, und — neu — Delegation,
 *              Intake und Dokument-Anhang sind auf dem Tablet ebenfalls
 *              compact vorhanden (siehe unten). Jede Ausnahme setzt nur
 *              genau ihre eigenen Felder — kein Bewerten, kein Zuweisen
 *              eines Leads, kein freies Editieren irgendeines anderen Feldes.
 *   · ChatGPT-Aufgaben — Marker am Element und Anlegen (einzeiliges Feld im
 *              Formular einer Sammlung). Keine Sammelansicht.
 *   · Delegation — ein Umschalt-Knopf auf der Aufgabenkarte (app.js,
 *              entityCard) delegiert genau EINE Aufgabe an ChatGPT: legt
 *              (oder reaktiviert) genau einen verknuepften Lead an, spiegelt
 *              exakt AI Sync (Desktop) case "task-delegate-chatgpt".
 *   · Intake  — ein einzeiliges Feld auf dem Hauptbildschirm (Notes/Leads-
 *              Liste) erstellt sofort einen neuen Lead — die einfachste
 *              Auspraegung von "Anfrage einreichen" auf dem Tablet, ohne
 *              eine zweite Warteschlange neben den Leads.
 *   · Anhang  — im Lead-Detail laesst sich eine Datei an den GEOEFFNETEN
 *              Lead anhaengen, ueber denselben ~50MB-Upload wie Tablet
 *              Canvas (window.QuantusTabletWorkspace.uploadTo, unveraendert).
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
  // Intake — "Anfrage einreichen" auf dem Hauptbildschirm (Notes/Leads-
  // Liste), nicht im Lead-Detail (dort bleibt es bei reinem Lesen plus den
  // schmalen Ausnahmen). Ein Absenden legt sofort einen Lead an (addChatgptLead)
  // — die einfachste Auspraegung von "Anfrage einreichen" auf dem Tablet.
  function renderIntakeBar() {
    return '<div class="cg-intake"><input type="text" data-action="cg-intake-input" placeholder="Anfrage an ChatGPT einreichen — kurzer Text genügt" autocomplete="off">' +
      '<button class="btn small-btn" type="button" data-action="cg-intake-submit">Anfrage einreichen</button></div>';
  }
  function renderNotes() {
    var all = notes();
    var fresh = newNotes();
    var last = lastReadAt();
    var list = ui.notesMode === "all" ? all : fresh;
    return renderIntakeBar() +
      '<div class="chip-row cg-modes">' +
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
  // Neue, rein additive Felder aus AI Sync (Tagesbriefing-Gesamtkonzept-v2).
  // Reine Anzeige — "nicht gesetzt" statt eine Erfindung, wenn das Feld fehlt.
  // Einheitlich mit AI Sync (Desktop) V3_OPERATIONAL_STATE_LABEL — dieselben
  // deutschen Bezeichnungen auf allen drei Clients.
  var OPERATIONAL_STATE = {
    doing: "In Arbeit (ChatGPT)", waiting_external: "Wartet extern", followup_scheduled: "Follow-up terminiert",
    decision_required: "Entscheidung gefragt", information_required: "Frage gestellt",
    delegated_cowork: "Bei Cowork", review: "Cowork-Rücklauf zu prüfen", done: "Erledigt", cancelled: "Storniert"
  };
  function opStateLabel(value) { return OPERATIONAL_STATE[value] || (value ? String(value) : "nicht gesetzt"); }
  function operationalLine(l) {
    var line = '<div class="muted small cg-opline">Status: <strong>' + esc(opStateLabel(l.operationalState)) + "</strong>";
    if (l.responsibleParty) line += " · Verantwortlich: " + esc(l.responsibleParty);
    if (l.nextAction || l.nextActionAt) {
      line += " · Nächster Schritt: " + esc(l.nextAction || "nicht gesetzt") +
        (l.nextActionAt ? " (" + esc(fmtDateTime(l.nextActionAt)) + ")" : "");
    }
    if (l.waitingOn || l.waitingSince || l.followUpAt) {
      line += " · Wartet auf: " + esc(l.waitingOn || "nicht gesetzt") +
        (l.waitingSince ? " seit " + esc(fmtDateTime(l.waitingSince)) : "") +
        (l.followUpAt ? " · Nachfrage " + esc(fmtDateTime(l.followUpAt)) : "");
    }
    return line + "</div>";
  }
  // Rueckfrage des Assistenten — einmalig beantwortbar (answeredAt gesetzt
  // heisst: erledigt, kein zweites Mal). Sobald beantwortet, nur noch Anzeige.
  function questionBlock(l) {
    var q = obj(l.pendingQuestion);
    if (!q.text) return "";
    if (q.answeredAt) {
      return '<div class="cg-question cg-question-done"><div class="cg-step-head"><strong>Rückfrage beantwortet</strong></div>' +
        '<div class="cg-step-text">' + esc(q.text) + "</div>" +
        '<div class="muted small">Antwort: ' + esc(q.answer || "") + " · " + esc(fmtDateTime(q.answeredAt)) + "</div></div>";
    }
    var options = arr(q.options);
    return '<div class="cg-question cg-question-open" data-cg-question data-id="' + attr(l.id) + '">' +
      '<div class="cg-step-head"><strong>Rückfrage vom Assistenten</strong> <span class="cg-warn small">offen</span></div>' +
      '<div class="cg-step-text">' + esc(q.text) + "</div>" +
      (options.length ? '<div class="chip-row">' + options.map(function (o) { return '<span class="chip">' + esc(o) + "</span>"; }).join("") + "</div>" : "") +
      (q.recommendation ? '<div class="muted small">Empfehlung: ' + esc(q.recommendation) + "</div>" : "") +
      '<textarea data-action="cg-question-input" rows="2" placeholder="Antwort…"></textarea>' +
      '<button class="btn small-btn" type="button" data-action="cg-question-submit" data-id="' + attr(l.id) + '">Antworten</button>' +
      "</div>";
  }
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
      ((l.assignee === "cowork" || l.handoverAt || l.expectedReturnAt || l.returnedAt) ? '<div class="muted small cg-handover">' +
        (l.handoverAt ? "Übergeben " + esc(fmtDateTime(l.handoverAt)) : "noch nicht übergeben") +
        (l.expectedReturnAt ? " · erwartet zurück " + esc(fmtDateTime(l.expectedReturnAt)) : "") +
        (l.returnedAt ? " · zurück " + esc(fmtDateTime(l.returnedAt)) + (l.returnChecked ? " · geprüft" : " · ungeprüft") : "") +
        "</div>" : "") +
      (l.handoverPacket ? '<details class="cg-packet"><summary class="muted small">📦 Übergabepaket (' + String(l.handoverPacket).length + " Zeichen)</summary><pre class=\"cg-packet-text\">" + esc(l.handoverPacket) + "</pre></details>" : "") +
      (l.returnedAt && !l.returnChecked ? '<button class="btn small-btn cg-return-btn" type="button" data-action="cg-return-checked" data-id="' + attr(l.id) + '">Rücklauf geprüft</button>' : "") +
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
      operationalLine(l) +
      assessmentSummary(l) +
      questionBlock(l) +
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
  function formatBytes(bytes) {
    var value = Number(bytes) || 0;
    if (!value) return "0 B";
    var units = ["B", "KB", "MB", "GB"];
    var index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), 3);
    return (value / Math.pow(1024, index)).toFixed(index ? 1 : 0) + " " + units[index];
  }
  // Dokument-Anhang am geoeffneten Lead — ueber denselben ~50MB-Upload wie
  // Tablet Canvas (window.QuantusTabletWorkspace.uploadTo), keine eigene
  // Upload-Logik. Anzeige nur der Felder, die der bestehende Upload wirklich
  // liefert (name/size/url) — kein erfundener "verarbeitet"/"indexiert"-Status.
  function attachmentSection(l) {
    var files = arr(l.files);
    var rows = files.map(function (f) {
      return '<div class="cg-attachment-row"><span class="cg-attachment-name">' + esc(f.name || "Datei") + "</span>" +
        '<span class="muted small">' + esc(formatBytes(f.size)) + "</span>" +
        (f.url ? '<a class="btn small-btn" href="' + attr(f.url) + '" target="_blank" rel="noopener noreferrer">Öffnen</a>' : "") + "</div>";
    }).join("");
    return '<section class="cg-step cg-upload"><div class="cg-step-head"><strong>Anhänge</strong>' +
      (files.length ? ' <span class="badge">' + files.length + "</span>" : "") + "</div>" +
      '<div class="item-list">' + (rows || '<div class="muted small">Keine Anhänge.</div>') + "</div>" +
      '<label class="btn small-btn" for="cgLeadUpload-' + attr(l.id) + '">📎 Dokument anhängen</label>' +
      '<input data-action="cg-lead-upload-input" type="file" id="cgLeadUpload-' + attr(l.id) + '" data-id="' + attr(l.id) + '" style="display:none">' +
      "</section>";
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
      operationalLine(l) +
      '<section class="cg-step"><div class="cg-step-head"><strong>Wortlaut (Laurin)</strong></div><div class="cg-step-text cg-raw">' + esc(l.rawInput || "") + "</div>" +
      (l.obsoleteReason ? '<div class="muted small">Hinfällig, weil: ' + esc(l.obsoleteReason) + "</div>" : "") + "</section>" +
      '<div class="cg-progress-line"><strong>Fortschritt</strong> ' + p.done + "/" + p.total + '<div class="cg-progress"><div class="cg-progress-bar" style="width:' + Math.round(p.done / p.total * 100) + '%"></div></div></div>' +
      (l.status === "wartet" && l.blockedReason ? '<div class="cg-warn">⏸ Wartet: ' + esc(l.blockedReason) + "</div>" : "") +
      questionBlock(l) +
      steps +
      '<section class="cg-step' + (links.length ? " done" : "") + '"><div class="cg-step-head"><span class="cg-step-no">9</span><strong>Verknüpfungen</strong> <span class="cg-warn small">mindestens eine</span></div>' +
      (links.length ? '<div class="chip-row">' + links.map(function (x) { return '<span class="chip">' + esc(x) + "</span>"; }).join("") + "</div>" : '<div class="muted small">Keine Verknüpfungen.</div>') + "</section>" +
      (arr(l.comments).length ? '<section class="cg-step"><div class="cg-step-head"><strong>Kommentare</strong></div>' + arr(l.comments).map(function (c) {
        return '<div class="cg-comment"><span class="muted small">' + esc(fmtDateTime(c.createdAt)) + "</span><div>" + esc(c.text || "") + "</div></div>";
      }).join("") + "</section>" : "") +
      attachmentSection(l) +
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
    return renderIntakeBar() +
      '<p class="muted small">' + unread.length + " ungelesen · " + (active.length + waiting.length) + " offen · " + closed.length + " abgeschlossen — Leads werden am Rechner oder Handy erfasst und vom Assistenten am Rechner bearbeitet.</p>" +
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

  // ── Neuer Lead — Standardform wie AI Sync createChatgptLead() ────────────
  // Genutzt von Intake (Anfrage einreichen) und von der Delegation, wenn noch
  // kein Lead existiert — eine einzige Stelle fuer die Lead-Grundform, wie am
  // Rechner. `extra` ueberschreibt/ergaenzt einzelne Felder (z. B.
  // operationalState bei der Delegation). Ohne Titel UND Wortlaut wird nichts
  // angelegt.
  function addChatgptLead(title, rawInput, extra, forcedId) {
    var a = api();
    title = String(title || "").trim();
    rawInput = String(rawInput || "").trim();
    if (!a || (!title && !rawInput)) return Promise.resolve(null);
    if (!title) title = rawInput.split("\n")[0].slice(0, 80);
    if (!rawInput) rawInput = title;
    // forcedId (Review-Fix 25.09.2026): erlaubt einer deterministischen ID
    // (siehe delegateTask unten) statt der Zufalls-ID von Core.makeId — ohne
    // bestehende Aufrufer (submitIntake u. a.) zu aendern.
    var id = forcedId || a.Core.makeId("chatgptLead");
    var patch = Object.assign({
      title: title, rawInput: rawInput, status: "neu", readAt: null,
      interpretation: "", openQuestions: "", research: "", plan: "", execution: "", result: "", workflowNote: "",
      blockedReason: null, closedAt: null, closedBy: null, externalLinks: [], comments: [], files: [],
      assessment: { menge: null, werkzeug: null, kontext: null, quantusNaehe: null, recherche: null, zuschnitt: null },
      assignee: null, assignmentReason: "", handoverPacket: null,
      grantedPermissions: { websuche: false, dateienErstellen: { erlaubt: false, formate: [] }, externeTools: [], verboten: [] },
      handoverAt: null, returnedAt: null
    }, extra || {});
    return a.executeOperation(a.makeOperation("entity", "create", "chatgptLeads", id, patch), { silent: true }).then(function () {
      return col("chatgptLeads").some(function (x) { return x.id === id; }) ? id : null;
    });
  }
  function submitIntake(input) {
    var value = String(input.value || "").trim();
    var a = api();
    if (!value) { if (a) a.toast("Anfrage fehlt", "Bitte einen Text eintragen.", "warn"); return; }
    addChatgptLead("", value).then(function (leadId) {
      if (!leadId) return;
      input.value = "";
      if (!a) return;
      a.toast("Anfrage eingereicht", value.split("\n")[0].slice(0, 60), "ok");
      a.render();
    });
  }

  // ── Delegation: Aufgabe → ChatGPT (Tagesbriefing-Gesamtkonzept-v2) ───────
  // Spiegelt AI Sync (Desktop), case "task-delegate-chatgpt" in handleClick:
  // GENAU EIN verknuepfter Lead pro Aufgabe (task.delegatedLeadId ist die
  // Sperre und wird bei einem geschlossenen Lead reaktiviert statt verdoppelt
  // — idempotent ueber beliebig viele Delegieren/Zurueckholen-Wechsel), zwei
  // getrennte Schreiboperationen (Lead, Aufgabe) statt eines zusammengefassten
  // Patches, damit Lead und Aufgabe auf allen Clients eigene Entitaeten
  // bleiben. Aufgerufen aus app.js (entityCard, data-action
  // "cg-task-delegate") ueber onAction unten.
  function delegateTask(taskId) {
    var a = api();
    if (!a) return Promise.resolve(false);
    var task = col("tasks").filter(function (t) { return t.id === taskId; })[0];
    if (!task) return Promise.resolve(false);
    var wasDelegated = (task.assignee || "user") === "chatgpt";
    var existingLead = task.delegatedLeadId ? leads().filter(function (l) { return l.id === task.delegatedLeadId; })[0] : null;
    var now = new Date().toISOString();

    if (wasDelegated) {
      // Zurueckholen: die Aufgabe geht an "user", der verknuepfte Lead bleibt
      // bestehen (Historie), wird aber als hinfaellig geschlossen — kein
      // verwaister zweiter Lead beim naechsten Delegieren.
      var closeOp = existingLead && existingLead.status !== "abgeschlossen"
        ? a.executeOperation(a.makeOperation("entity", "update", "chatgptLeads", existingLead.id, {
            status: "abgeschlossen", closedAt: now, closedBy: "laurin",
            obsoleteReason: "Aufgabe wieder zurückgeholt", operationalState: "cancelled", updatedAt: now
          }), { silent: true })
        : Promise.resolve(true);
      var backOp = a.executeOperation(a.makeOperation("entity", "update", "tasks", taskId, { assignee: "user" }), { silent: true });
      return Promise.all([closeOp, backOp]).then(function (r) { return r.every(Boolean); });
    }

    if (existingLead) {
      // Wiederverwendung: derselbe Lead wird reaktiviert statt einen zweiten
      // anzulegen (idempotent).
      var reusePatch = { operationalState: "doing", updatedAt: now };
      if (existingLead.status === "abgeschlossen") {
        reusePatch.status = "neu"; reusePatch.closedAt = null; reusePatch.closedBy = null; reusePatch.obsoleteReason = null;
      }
      var reuseOp = a.executeOperation(a.makeOperation("entity", "update", "chatgptLeads", existingLead.id, reusePatch), { silent: true });
      var toChatgptOp = a.executeOperation(a.makeOperation("entity", "update", "tasks", taskId, { assignee: "chatgpt" }), { silent: true });
      return Promise.all([reuseOp, toChatgptOp]).then(function (r) { return r.every(Boolean); });
    }

    // Noch kein Lead: deterministische ID aus der Aufgaben-Id (Review-Fix
    // 25.09.2026, spiegelt AI Sync intake-to-lead/task-delegate-chatgpt) statt
    // Core.makeId()s Zufalls-ID. Zwei offline Geraete, die dieselbe, noch
    // nicht delegierte Aufgabe unabhaengig delegieren, berechnen dieselbe ID
    // — der bestehende Merge nach id (newerItem/mergeById in sync-core.js)
    // fuehrt beide Versuche zu EINEM Datensatz zusammen, statt einen zweiten,
    // ueber delegatedLeadId nicht mehr erreichbaren Lead anzulegen.
    var leadId = "chatgptLead_from_task_" + taskId;
    var deterministicExisting = leads().filter(function (l) { return l.id === leadId; })[0];
    if (deterministicExisting) {
      // Existiert der Lead unter der deterministischen ID bereits (z. B. weil
      // ein Zwischen-Sync ihn brachte, das eigene delegatedLeadId-Feld aber
      // noch nicht nachzog), wird er wiederverwendet statt neu angelegt —
      // sonst koennte eine echte, dort bereits begonnene Bearbeitung
      // ueberschrieben werden.
      var reuseDetOp = a.executeOperation(a.makeOperation("entity", "update", "chatgptLeads", leadId, { operationalState: "doing", updatedAt: now }), { silent: true });
      var toChatgptDetOp = a.executeOperation(a.makeOperation("entity", "update", "tasks", taskId, { assignee: "chatgpt", delegatedLeadId: leadId }), { silent: true });
      return Promise.all([reuseDetOp, toChatgptDetOp]).then(function (r) { return r.every(Boolean); });
    }
    return addChatgptLead(task.title, "Delegierte Aufgabe: " + (task.title || ""), { operationalState: "doing" }, leadId).then(function (createdId) {
      if (!createdId) return false;
      return a.executeOperation(a.makeOperation("entity", "update", "tasks", taskId, { assignee: "chatgpt", delegatedLeadId: createdId }), { silent: true });
    });
  }

  // Dokument an den geoeffneten Lead anhaengen — nutzt den bestehenden
  // ~50MB-Upload aus Tablet Canvas unveraendert (window.QuantusTabletWorkspace.
  // uploadTo); hier wird nur auf chatgptLeads/<id> gezeigt. Modulgrenze: erst
  // typeof pruefen (CLAUDE.md, Fallstrick 1), nicht im Kopf annehmen, dass es
  // da ist.
  function attachDocument(leadId, fileList) {
    var a = api();
    var ws = window.QuantusTabletWorkspace;
    if (!a || !leadId || !fileList || !fileList.length) return Promise.resolve(false);
    if (!ws || typeof ws.uploadTo !== "function") {
      if (a) a.toast("Anhang nicht möglich", "Das Hochladen ist auf diesem Gerät nicht verfügbar.", "warn");
      return Promise.resolve(false);
    }
    // Review-Fix (25.09.2026): uploadTo()/uploadFiles() liefern seit diesem
    // Fix ehrlich zurueck, ob der Upload wirklich gelang — vorher wurde hier
    // IMMER true gemeldet, auch wenn jede Datei fehlschlug (nur als Toast
    // sichtbar, nie im Rueckgabewert an den Aufrufer). Ein Wurf (z. B.
    // Storage nicht erreichbar) wird ebenfalls als Fehlschlag gemeldet statt
    // die Promise unbehandelt abzulehnen.
    return Promise.resolve(ws.uploadTo("chatgptLeads", leadId, fileList))
      .then(function (ok) { return ok === true; })
      .catch(function (error) {
        if (a) a.toast("Anhang fehlgeschlagen", (error && error.message) || "Unbekannter Fehler", "error");
        return false;
      });
  }

  // ── Zwei weitere schmale Ausnahmen vom "nur lesen" (Rueckfrage, Ruecklauf) ─
  // Beides schreibt ausschliesslich die hier genannten Felder auf GENAU
  // diesem Lead (dieselbe id, dieselbe Sammlung chatgptLeads) — kein neues
  // Element, keine zweite Fassung, kein Bewerten/Zuweisen/Abschliessen.
  //
  // Rueckfrage des Assistenten: einmalig beantwortbar. answeredAt ist die
  // Sperre — ein zweiter Aufruf auf einem bereits beantworteten oder
  // fehlenden pendingQuestion tut nichts (kein zweites Schreiben moeglich).
  // Review-Fix: die vorherige Fassung schrieb answer/answeredAt/
  // operationalState/updatedAt DIREKT auf das lebende Lead-Objekt, BEVOR
  // makeOperation/executeOperation liefen. Da leads() nur die Liste flach
  // kopiert (die Elemente selbst bleiben dieselben Referenzen wie in
  // state.payload), war das keine Kopie, sondern eine Mutation des "Vorher"-
  // Standes: applyEntityOperation liest genau dieses Objekt als `existing`
  // fuer den Konflikt-/Zeitstempelvergleich — der "Vorher"-Wert enthielt so
  // bereits den "Nachher"-Wert. Schlimmer: bei einer ABGELEHNTEN Operation
  // (Konflikt/Tombstone) oder einem Fehlschlag bricht executeOperation vor
  // dem Setzen von state.payload ab — aber das Lead-Objekt war durch die
  // Mutation VORHER schon veraendert, der abgelehnte Zustand blieb sichtbar
  // stehen. Jetzt: keine Mutation vor der Operation, der Patch wird aus
  // einer reinen Kopie gebaut, und der echte Erfolg/Misserfolg von
  // executeOperation wird durchgereicht (nicht mehr blind "true").
  function answerQuestion(id, text) {
    var a = api();
    text = String(text || "").trim();
    if (!a || !text) return Promise.resolve(false);
    var l = leads().filter(function (x) { return x.id === id; })[0];
    if (!l || !l.pendingQuestion || l.pendingQuestion.answeredAt) return Promise.resolve(false);
    // Auf allen Clients gleich behandelt: ein geschlossener Lead wird durch
    // eine Antwort nicht reaktiviert (Konsistenz mit Desktop/AI Sync).
    if (l.status === "abgeschlossen") return Promise.resolve(false);
    var now = new Date().toISOString();
    var patchQuestion = Object.assign({}, l.pendingQuestion, { answer: text, answeredAt: now });
    var operation = a.makeOperation("entity", "update", "chatgptLeads", id, {
      pendingQuestion: patchQuestion, operationalState: "doing", updatedAt: now,
      // Auf allen Clients gleich: die faellige Rueckfrage ist erledigt,
      // der letzte Stand wird vermerkt.
      questionForBriefingAt: null, lastAction: "Antwort erhalten: " + text.slice(0, 140)
    });
    return a.executeOperation(operation, { silent: true });
  }
  // Cowork-Ruecklauf als geprueft markieren — nur wenn wirklich zurueck UND
  // noch nicht geprueft; sonst kein zweites Setzen. Siehe answerQuestion:
  // keine Mutation vor der Operation, echtes Ergebnis wird durchgereicht.
  function markReturnChecked(id) {
    var a = api();
    if (!a) return Promise.resolve(false);
    var l = leads().filter(function (x) { return x.id === id; })[0];
    if (!l || !l.returnedAt || l.returnChecked) return Promise.resolve(false);
    if (l.status === "abgeschlossen") return Promise.resolve(false);
    var now = new Date().toISOString();
    var operation = a.makeOperation("entity", "update", "chatgptLeads", id, {
      returnChecked: true, operationalState: "doing", updatedAt: now
    });
    return a.executeOperation(operation, { silent: true });
  }
  function submitQuestionAnswer(button) {
    var wrap = button.closest ? button.closest("[data-cg-question]") : null;
    var area = wrap && wrap.querySelector ? wrap.querySelector('[data-action="cg-question-input"]') : null;
    var a = api();
    var text = area ? area.value : "";
    if (!String(text || "").trim()) { if (a) a.toast("Antwort fehlt", "Bitte eine Antwort eintragen.", "warn"); return; }
    answerQuestion(button.dataset.id, text).then(function (done) {
      if (!done) return;
      if (a) a.toast("Antwort gespeichert", "", "ok");
      if (a) a.render();
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
    if (action === "cg-question-submit") { submitQuestionAnswer(button); return true; }
    if (action === "cg-return-checked") {
      markReturnChecked(button.dataset.id).then(function (done) {
        if (!done) return;
        a.toast("Rücklauf geprüft", "", "ok");
        a.render();
      });
      return true;
    }
    if (action === "cg-intake-submit") {
      var wrap = button.closest ? button.closest(".cg-intake") : null;
      var input = wrap && wrap.querySelector ? wrap.querySelector('[data-action="cg-intake-input"]') : null;
      if (input) submitIntake(input);
      return true;
    }
    // Delegation: Aufgabe → ChatGPT. Der Knopf lebt auf der Aufgabenkarte in
    // app.js (entityCard) — die Modulgrenze ist hier egal, onAction bekommt
    // jede Aktion der App gereicht (app.js handleClick, tabletModules()).
    if (action === "cg-task-delegate") {
      var task = col("tasks").filter(function (t) { return t.id === button.dataset.id; })[0];
      var wasDelegated = Boolean(task && (task.assignee || "user") === "chatgpt");
      delegateTask(button.dataset.id).then(function (done) {
        if (!done) return;
        a.toast(wasDelegated ? "Zurückgeholt" : "An ChatGPT delegiert", task ? (task.title || "") : "", "ok");
        a.render();
      });
      return true;
    }
    return false;
  }
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Enter") return;
    var taskInput = event.target && event.target.closest ? event.target.closest('[data-action="cg-task-input"]') : null;
    if (taskInput) { event.preventDefault(); submitTask(taskInput); return; }
    var intakeInput = event.target && event.target.closest ? event.target.closest('[data-action="cg-intake-input"]') : null;
    if (intakeInput) { event.preventDefault(); submitIntake(intakeInput); }
  });
  // Datei-Input feuert "change", nicht "click" — eigener Listener wie bereits
  // in tablet-workspace.js ueblich (data-tw-change), hier fuer den Lead-Anhang.
  document.addEventListener("change", function (event) {
    var input = event.target && event.target.closest ? event.target.closest('[data-action="cg-lead-upload-input"]') : null;
    if (!input) return;
    var leadId = input.dataset.id;
    var fileList = input.files;
    attachDocument(leadId, fileList).then(function (done) {
      input.value = "";
      var a = api();
      if (!done || !a) return;
      a.toast("Dokument angehängt", "", "ok");
      a.render();
    });
  });

  (window.__quantusTabletModules = window.__quantusTabletModules || []).push({
    key: "chatgpt",
    routes: ["chatgptnotes"],
    render: render,
    onAction: onAction
  });
  window.QuantusChatgpt = {
    render: render, onAction: onAction, taskSection: taskSection, marker: marker, createTask: createTask,
    answerQuestion: answerQuestion, markReturnChecked: markReturnChecked,
    delegateTask: delegateTask, addChatgptLead: addChatgptLead, attachDocument: attachDocument,
    newNotesCount: function () { return newNotes().length; },
    unreadLeadsCount: function () { return unreadLeads().length; },
    openTasksCount: function () { return openTasks().length; },
    // Die Kachel zeigt die neuen Notes — die Zahl, die vor jeder Sitzung zaehlt.
    badge: function () { return newNotes().length; }
  };
})();
