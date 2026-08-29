/*
 * NATIVE MODULANSICHTEN.
 *
 * Bis hierher endeten alle AI-Sync-Werkzeuge ohne eigene Tablet-Ansicht in
 * renderModule(): eine Kachel mit ein paar Kennzahlen und dem Knopf „Separat
 * oeffnen". Auf dem Tablet hiess das — die App laesst sich hier gar nicht
 * benutzen, sie schickt einen in die Desktop-App.
 *
 * Dieses Modul baut fuer JEDES dieser Werkzeuge eine eigenstaendige,
 * bedienbare Tablet-Ansicht. Gelesen und geschrieben wird ausschliesslich in
 * den Bereichen, in denen AI Sync die Daten ohnehin fuehrt (siehe
 * ai-sync public/index.html, emptyData()) — ein eigener Ablageort waere ein
 * zweiter Datenstand, den niemand mehr zusammenfuehrt.
 *
 * Jede Ansicht ist ein Eintrag in VIEWS. Der Schluessel ist die Route.
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
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function payload() { var a = api(); return a ? obj(a.state.payload) : {}; }
  function col(name) { var a = api(); return a ? a.collection(name) : []; }
  function listArea(path) {
    var host = payload();
    var parts = String(path).split(".");
    for (var i = 0; i < parts.length - 1; i += 1) host = obj(host[parts[i]]);
    return arr(host[parts[parts.length - 1]]);
  }

  // ── Ansichtszustand ──────────────────────────────────────────────────────
  // Modul-lokale Variablen ueberleben den Ansichtswechsel nicht von selbst.
  // Deshalb haengt JEDER Zustand hier an der Route: beim Wechsel wird der
  // Zustand der alten Ansicht nicht mehr gelesen, statt irgendwo nachzuwirken.
  var ui = {
    route: null,
    tab: {},        // route → gewaehlter Reiter
    search: {},     // route → Suchtext
    open: {},       // route → geoeffnetes Element
    day: {},        // route → gewaehlter Tag
    weekOffset: 0
  };
  function tab(route, fallback) { return ui.tab[route] || fallback; }
  function search(route) { return ui.search[route] || ""; }

  // ── Datum und Dauer ──────────────────────────────────────────────────────
  function today() { var a = api(); return a ? a.localDateKey() : new Date().toISOString().slice(0, 10); }
  function dayKey(date) { var a = api(); return a ? a.localDateKey(date) : new Date(date).toISOString().slice(0, 10); }
  function addDays(key, count) {
    var d = new Date(key + "T12:00:00");
    d.setDate(d.getDate() + count);
    return dayKey(d);
  }
  function mondayOf(key) {
    var d = new Date(key + "T12:00:00");
    var weekday = (d.getDay() + 6) % 7; // Montag = 0
    return addDays(key, -weekday);
  }
  function weekdayName(key) {
    return new Intl.DateTimeFormat("de-CH", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Zurich" })
      .format(new Date(key + "T12:00:00"));
  }
  function duration(seconds) {
    var total = Math.max(0, Math.round(Number(seconds) || 0));
    var hours = Math.floor(total / 3600);
    var minutes = Math.round((total % 3600) / 60);
    return hours ? hours + " h " + (minutes < 10 ? "0" : "") + minutes + " min" : minutes + " min";
  }
  function fmtDate(value, options) { var a = api(); return a ? a.formatDate(value, options) : String(value || ""); }
  function fmtTime(value) { var a = api(); return a ? a.formatTime(value) : String(value || ""); }
  function title(item, fallback) { var a = api(); return a ? a.itemTitle(item, fallback) : (item && item.title) || fallback || ""; }
  function text(item) { var a = api(); return a ? a.itemText(item) : (item && item.description) || ""; }

  // ── Bausteine ────────────────────────────────────────────────────────────
  function head(name, subtitle, actions) {
    var a = api();
    return a ? a.viewHeader(name, subtitle, actions || "") : "";
  }
  function banner() {
    var a = api();
    return a && typeof a.loginBanner === "function" ? a.loginBanner() : "";
  }
  function nothing(icon, name, hint) {
    var a = api();
    return a ? a.emptyState(icon, name, hint) : "";
  }
  function nothingSmall(name) {
    var a = api();
    return a ? a.emptyMini(name) : "";
  }
  function widget(span, icon, name, body, actions) {
    return '<section class="widget span-' + span + '"><div class="widget-head"><span class="widget-icon">' + esc(icon) +
      "</span><h2>" + esc(name) + "</h2>" + (actions || "") + "</div>" + body + "</section>";
  }
  function metrics(list) {
    return '<div class="budget-metrics">' + list.map(function (entry) {
      return '<div class="budget-metric"><small>' + esc(entry.label) + "</small><strong>" + esc(entry.value) + "</strong></div>";
    }).join("") + "</div>";
  }
  function searchField(route, placeholder) {
    return '<div class="search-field"><span>⌕</span><input data-action="nm-search" data-route="' + attr(route) +
      '" placeholder="' + attr(placeholder) + '" value="' + attr(search(route)) + '" autocomplete="off"></div>';
  }
  function chips(route, entries, fallback) {
    var active = tab(route, fallback);
    return '<div class="chip-row">' + entries.map(function (entry) {
      return '<button class="chip' + (active === entry.key ? " on" : "") + '" data-action="nm-tab" data-route="' + attr(route) +
        '" data-tab="' + attr(entry.key) + '">' + esc(entry.label) +
        (entry.count == null ? "" : " " + entry.count) + "</button>";
    }).join("") + "</div>";
  }
  function matches(route, haystack) {
    var needle = search(route).trim().toLowerCase();
    if (!needle) return true;
    return String(haystack || "").toLowerCase().indexOf(needle) >= 0;
  }

  // Schreibhilfen. Jede Aenderung geht durch dieselbe Firebase-Transaktion wie
  // in AI Sync — es gibt keinen zweiten Schreibweg.
  function writeEntity(action, name, id, patch, options) {
    var a = api();
    if (!a) return Promise.resolve(false);
    return a.executeOperation(a.makeOperation("entity", action, name, id, patch), options);
  }
  function writeList(action, area, id, patch, options) {
    var a = api();
    if (!a) return Promise.resolve(false);
    return a.executeOperation(a.makeOperation("list", action, area, id, patch), options);
  }
  function newId(prefix) {
    var a = api();
    return a ? a.Core.makeId(prefix) : prefix + "_" + Math.random().toString(36).slice(2);
  }

  // =========================================================================
  //  ZEITERFASSUNG
  // =========================================================================
  function runningTimers() {
    var timers = obj(payload().timers);
    return Object.keys(timers).map(function (taskId) {
      var timer = obj(timers[taskId]);
      return { taskId: taskId, startTs: timer.startTs, note: timer.note || "" };
    }).filter(function (entry) { return entry.startTs; });
  }
  function timeEntries() {
    return col("timeEntries").slice().sort(function (x, y) {
      return String(y.startTs || y.createdAt || "").localeCompare(String(x.startTs || x.createdAt || ""));
    });
  }
  function taskById(id) {
    return col("tasks").find(function (item) { return item.id === id; }) || null;
  }
  function secondsBetween(from, to) {
    return Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
  }

  function renderTime() {
    var running = runningTimers();
    var entries = timeEntries();
    var heute = today();
    var weekStart = mondayOf(heute);
    var todaySec = 0;
    var weekSec = 0;
    var perProject = {};
    entries.forEach(function (entry) {
      var key = dayKey(new Date(entry.startTs || entry.createdAt || Date.now()));
      var seconds = Number(entry.durationSec) || 0;
      if (key === heute) todaySec += seconds;
      if (key >= weekStart) weekSec += seconds;
      var task = taskById(entry.taskId);
      var project = task && task.projectId ? task.projectId : "_ohne";
      perProject[project] = (perProject[project] || 0) + seconds;
    });
    var projects = col("projects");
    var projectRows = Object.keys(perProject).sort(function (x, y) { return perProject[y] - perProject[x]; }).slice(0, 8);
    var maxProject = projectRows.length ? perProject[projectRows[0]] : 0;
    var openTasks = col("tasks").filter(function (item) { var a = api(); return a && !a.isDone(item); }).slice(0, 60);

    var groups = {};
    entries.slice(0, 120).forEach(function (entry) {
      var key = dayKey(new Date(entry.startTs || entry.createdAt || Date.now()));
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    });
    var days = Object.keys(groups).sort().reverse().slice(0, 10);

    return '<div class="view">' +
      head("Zeiterfassung", "Laufende Messungen, Tagesbilanz und alle Buchungen aus deinem Quantus-Datenstand.",
        '<button class="btn" data-action="nm-tab" data-route="time" data-tab="manual">＋ Zeit von Hand buchen</button>') +
      banner() +
      metrics([
        { label: "Heute", value: duration(todaySec) },
        { label: "Diese Woche", value: duration(weekSec) },
        { label: "Laufend", value: running.length },
        { label: "Buchungen", value: entries.length }
      ]) +
      '<div class="dashboard-grid">' +
        widget(6, "◷", "Laufende Messung", running.length
          ? '<div class="item-list">' + running.map(function (entry) {
              var task = taskById(entry.taskId);
              return '<div class="list-item"><span class="badge accent nm-live" data-since="' + attr(entry.startTs) + '">' +
                esc(duration(secondsBetween(entry.startTs, new Date().toISOString()))) + "</span>" +
                '<div class="item-main"><div class="item-title">' + esc(task ? title(task, "Aufgabe") : "Aufgabe " + entry.taskId) +
                '</div><div class="item-meta">seit ' + esc(fmtTime(entry.startTs)) + (entry.note ? " · " + esc(entry.note) : "") + "</div></div>" +
                '<button class="btn small-btn" data-action="nm-timer-stop" data-id="' + attr(entry.taskId) + '">■ Stoppen</button></div>';
            }).join("") + "</div>"
          : nothingSmall("Keine laufende Messung – waehle unten eine Aufgabe.")) +
        widget(6, "▶", "Messung starten",
          '<form data-form="nm-timer-start"><div class="field"><label>Aufgabe</label><select name="taskId" required>' +
          '<option value="">Aufgabe waehlen …</option>' +
          openTasks.map(function (task) {
            return '<option value="' + attr(task.id) + '">' + esc(title(task, "Aufgabe")) + "</option>";
          }).join("") + "</select></div>" +
          '<div class="field"><label>Notiz (freiwillig)</label><input name="note" autocomplete="off" placeholder="Woran arbeitest du?"></div>' +
          '<button class="btn primary" type="submit">Messung starten</button></form>') +
        widget(6, "＋", "Zeit von Hand buchen",
          '<form data-form="nm-time-manual"><div class="field"><label>Aufgabe</label><select name="taskId">' +
          '<option value="">Ohne Aufgabe</option>' +
          openTasks.map(function (task) {
            return '<option value="' + attr(task.id) + '">' + esc(title(task, "Aufgabe")) + "</option>";
          }).join("") + "</select></div>" +
          '<div class="field"><label>Datum</label><input name="date" type="date" value="' + attr(heute) + '"></div>' +
          '<div class="field"><label>Dauer in Minuten</label><input name="minutes" type="number" min="1" step="1" value="30" required></div>' +
          '<div class="field"><label>Notiz</label><input name="note" autocomplete="off"></div>' +
          '<button class="btn primary" type="submit">Buchen</button></form>') +
        widget(6, "▧", "Nach Projekt", projectRows.length
          ? projectRows.map(function (key) {
              var project = projects.find(function (item) { return item.id === key; });
              var pct = maxProject ? Math.max(2, Math.round((perProject[key] / maxProject) * 100)) : 0;
              return '<div class="stat-bar-row"><span class="stat-bar-label">' +
                esc(project ? title(project, "Projekt") : "Ohne Projekt") + '</span><div class="stat-bar"><i class="accent" style="width:' +
                pct + '%"></i></div><strong>' + esc(duration(perProject[key])) + "</strong></div>";
            }).join("")
          : nothingSmall("Noch keine Zeit gebucht")) +
        widget(12, "▤", "Buchungen", days.length
          ? days.map(function (key) {
              var sum = groups[key].reduce(function (total, entry) { return total + (Number(entry.durationSec) || 0); }, 0);
              return '<div class="nm-daygroup"><div class="nm-daygroup-head"><strong>' + esc(weekdayName(key)) +
                "</strong><span>" + esc(duration(sum)) + "</span></div>" +
                '<div class="item-list">' + groups[key].map(function (entry) {
                  var task = taskById(entry.taskId);
                  return '<div class="list-item"><span class="badge">' + esc(duration(entry.durationSec)) + "</span>" +
                    '<div class="item-main"><div class="item-title">' + esc(task ? title(task, "Aufgabe") : (entry.note || "Zeitbuchung")) +
                    '</div><div class="item-meta">' + esc(fmtTime(entry.startTs)) +
                    (entry.endTs ? " – " + esc(fmtTime(entry.endTs)) : "") + (entry.note && task ? " · " + esc(entry.note) : "") + "</div></div>" +
                    '<button class="icon-action" data-action="nm-time-delete" data-id="' + attr(entry.id) + '" aria-label="Buchung loeschen">⌫</button></div>';
                }).join("") + "</div></div>";
            }).join("")
          : nothingSmall("Noch keine Zeitbuchungen")) +
      "</div></div>";
  }

  // =========================================================================
  //  AUSLASTUNG
  // =========================================================================
  function renderWorkload() {
    var a = api();
    var heute = today();
    var start = addDays(mondayOf(heute), ui.weekOffset * 7);
    var days = [];
    for (var i = 0; i < 7; i += 1) days.push(addDays(start, i));
    var tasks = col("tasks").filter(function (item) { return a && !a.isDone(item); });
    var entries = timeEntries();

    var perDay = days.map(function (key) {
      var due = tasks.filter(function (task) { return String(task.dueDate || task.date || "").slice(0, 10) === key; });
      var tracked = entries.filter(function (entry) {
        return dayKey(new Date(entry.startTs || entry.createdAt || Date.now())) === key;
      }).reduce(function (total, entry) { return total + (Number(entry.durationSec) || 0); }, 0);
      var meetings = col("meetings").concat(col("calendarEvents")).filter(function (item) {
        return String(item.date || item.start || "").slice(0, 10) === key;
      });
      return { key: key, due: due, tracked: tracked, meetings: meetings };
    });
    var maxLoad = Math.max(1, ...perDay.map(function (day) { return day.due.length + day.meetings.length; }));
    var overdue = tasks.filter(function (task) {
      var due = String(task.dueDate || task.date || "").slice(0, 10);
      return due && due < heute;
    });
    var unplanned = tasks.filter(function (task) { return !String(task.dueDate || task.date || "").slice(0, 10); });

    var projects = col("projects");
    var perProject = projects.map(function (project) {
      var open = tasks.filter(function (task) { return task.projectId === project.id; });
      var tracked = entries.filter(function (entry) {
        var task = taskById(entry.taskId);
        return task && task.projectId === project.id;
      }).reduce(function (total, entry) { return total + (Number(entry.durationSec) || 0); }, 0);
      return { project: project, open: open.length, tracked: tracked };
    }).filter(function (row) { return row.open || row.tracked; })
      .sort(function (x, y) { return y.open - x.open; }).slice(0, 10);
    var maxOpen = perProject.length ? Math.max.apply(null, perProject.map(function (row) { return row.open; })) : 1;

    return '<div class="view">' +
      head("Auslastung", "Wie voll deine Woche wirklich ist — aus Faelligkeiten, Terminen und gebuchter Zeit.",
        '<button class="btn" data-action="nm-week" data-step="-1">‹ Woche</button>' +
        '<button class="btn" data-action="nm-week" data-step="0">Diese Woche</button>' +
        '<button class="btn" data-action="nm-week" data-step="1">Woche ›</button>') +
      banner() +
      metrics([
        { label: "Offene Aufgaben", value: tasks.length },
        { label: "Ueberfaellig", value: overdue.length },
        { label: "Ohne Termin", value: unplanned.length },
        { label: "Woche gebucht", value: duration(perDay.reduce(function (total, day) { return total + day.tracked; }, 0)) }
      ]) +
      '<div class="dashboard-grid">' +
        widget(12, "▥", "Last je Tag · Woche ab " + fmtDate(start),
          '<div class="nm-loadrow">' + perDay.map(function (day) {
            var load = day.due.length + day.meetings.length;
            var pct = Math.max(4, Math.round((load / maxLoad) * 100));
            var tone = load >= 6 ? "coral" : load >= 3 ? "sand" : "accent";
            return '<div class="nm-loadcol' + (day.key === heute ? " on" : "") + '">' +
              '<div class="nm-loadbar"><i class="' + tone + '" style="height:' + pct + '%"></i></div>' +
              "<strong>" + load + "</strong><small>" + esc(weekdayName(day.key)) + "</small>" +
              '<small class="muted">' + esc(day.tracked ? duration(day.tracked) : "—") + "</small></div>";
          }).join("") + "</div>" +
          '<p class="muted small" style="margin-top:10px">Balken = faellige Aufgaben und Termine an diesem Tag. ' +
          "Ab sechs wird der Tag rot — das ist die Grenze, ab der erfahrungsgemaess etwas liegen bleibt.</p>") +
        widget(6, "▧", "Last je Projekt", perProject.length
          ? perProject.map(function (row) {
              var pct = maxOpen ? Math.max(2, Math.round((row.open / maxOpen) * 100)) : 0;
              return '<div class="stat-bar-row"><span class="stat-bar-label">' + esc(title(row.project, "Projekt")) +
                '</span><div class="stat-bar"><i class="blue" style="width:' + pct + '%"></i></div><strong>' +
                row.open + "</strong></div>";
            }).join("")
          : nothingSmall("Keine offenen Projektaufgaben")) +
        widget(6, "!", "Ueberfaellig", overdue.length
          ? '<div class="item-list">' + overdue.slice(0, 12).map(function (task) {
              return '<div class="list-item" data-action="edit-entity" data-collection="tasks" data-id="' + attr(task.id) + '">' +
                '<span class="badge coral">' + esc(fmtDate(task.dueDate || task.date)) + "</span>" +
                '<div class="item-main"><div class="item-title">' + esc(title(task, "Aufgabe")) + "</div></div></div>";
            }).join("") + "</div>"
          : nothingSmall("Nichts ueberfaellig — sauber.")) +
      "</div></div>";
  }

  // =========================================================================
  //  WOCHENPLAN (auch No-Braine)
  // =========================================================================
  function renderWeekplan(route) {
    var a = api();
    var heute = today();
    var start = addDays(mondayOf(heute), ui.weekOffset * 7);
    var days = [];
    for (var i = 0; i < 7; i += 1) days.push(addDays(start, i));
    var tasks = col("tasks").filter(function (item) { return a && !a.isDone(item); });
    var unplanned = tasks.filter(function (task) { return !String(task.dueDate || task.date || "").slice(0, 10); });

    var columns = days.map(function (key) {
      var list = tasks.filter(function (task) { return String(task.dueDate || task.date || "").slice(0, 10) === key; });
      var events = col("meetings").concat(col("calendarEvents")).filter(function (item) {
        return String(item.date || item.start || "").slice(0, 10) === key;
      });
      return '<section class="nm-daycol' + (key === heute ? " on" : "") + '">' +
        '<div class="nm-daycol-head"><strong>' + esc(weekdayName(key)) + "</strong><span>" + list.length + "</span></div>" +
        (events.length ? '<div class="nm-daycol-events">' + events.slice(0, 4).map(function (event) {
          return "<div>" + esc(fmtTime(event.start || event.time) || "•") + " " + esc(title(event, "Termin")) + "</div>";
        }).join("") + "</div>" : "") +
        '<div class="nm-daycol-body">' + (list.length ? list.map(function (task) {
          return '<article class="nm-plancard">' +
            '<button class="nm-plancard-main" data-action="edit-entity" data-collection="tasks" data-id="' + attr(task.id) + '">' +
            esc(title(task, "Aufgabe")) + "</button>" +
            '<div class="nm-plancard-foot">' +
            '<button class="icon-action" data-action="nm-plan-move" data-id="' + attr(task.id) + '" data-date="' +
              attr(addDays(key, -1)) + '" aria-label="Einen Tag frueher">‹</button>' +
            '<button class="icon-action" data-action="nm-plan-done" data-id="' + attr(task.id) + '" aria-label="Erledigt">✓</button>' +
            '<button class="icon-action" data-action="nm-plan-move" data-id="' + attr(task.id) + '" data-date="' +
              attr(addDays(key, 1)) + '" aria-label="Einen Tag spaeter">›</button>' +
            "</div></article>";
        }).join("") : '<p class="muted small">Frei</p>') + "</div>" +
        '<form class="nm-daycol-add" data-form="nm-plan-add" data-date="' + attr(key) + '">' +
        '<input name="title" placeholder="＋ Aufgabe" autocomplete="off"></form>' +
        "</section>";
    }).join("");

    return '<div class="view">' +
      head(route === "nobraine" ? "No-Braine — Wochenplan" : "Wochenplanung",
        "Deine Woche als Tafel. Aufgaben lassen sich direkt auf einen anderen Tag schieben.",
        '<button class="btn" data-action="nm-week" data-step="-1">‹ Woche</button>' +
        '<button class="btn" data-action="nm-week" data-step="0">Diese Woche</button>' +
        '<button class="btn" data-action="nm-week" data-step="1">Woche ›</button>') +
      banner() +
      '<div class="nm-week">' + columns + "</div>" +
      widget(12, "◌", "Noch ohne Tag (" + unplanned.length + ")", unplanned.length
        ? '<div class="item-list">' + unplanned.slice(0, 20).map(function (task) {
            return '<div class="list-item"><span>◌</span><div class="item-main"><div class="item-title">' +
              esc(title(task, "Aufgabe")) + '</div></div><select data-action="nm-plan-assign" data-id="' + attr(task.id) + '">' +
              '<option value="">Auf Tag legen …</option>' + days.map(function (key) {
                return '<option value="' + attr(key) + '">' + esc(weekdayName(key)) + "</option>";
              }).join("") + "</select></div>";
          }).join("") + "</div>"
        : nothingSmall("Alles verplant")) +
      "</div>";
  }

  // =========================================================================
  //  GOOGLE KALENDER
  // =========================================================================
  function renderGoogleCalendar() {
    var heute = today();
    var events = col("calendarEvents").concat(col("meetings"))
      .map(function (event) { return { event: event, key: String(event.date || event.start || event.startAt || "").slice(0, 10) }; })
      .filter(function (entry) { return entry.key && entry.key >= heute; })
      .sort(function (x, y) {
        return x.key.localeCompare(y.key) ||
          String(x.event.start || x.event.time || "").localeCompare(String(y.event.start || y.event.time || ""));
      });
    var groups = {};
    events.forEach(function (entry) { (groups[entry.key] = groups[entry.key] || []).push(entry.event); });
    var days = Object.keys(groups).sort().slice(0, 21);
    var synced = col("calendarEvents").length;

    return '<div class="view">' +
      head("Google Kalender", "Die synchronisierten Google-Termine deines Quantus-Kalenders als Agenda.",
        '<button class="btn" data-action="go" data-route="calendar">◉ Quantus-Kalender</button>' +
        '<button class="btn primary" data-action="new-entity" data-collection="meetings">＋ Termin</button>') +
      banner() +
      metrics([
        { label: "Google-Termine", value: synced },
        { label: "Eigene Meetings", value: col("meetings").length },
        { label: "Kommende Tage", value: days.length }
      ]) +
      '<div class="dashboard-grid">' + (days.length ? days.map(function (key) {
        return widget(6, "31", fmtDate(key, { weekday: "long", day: "2-digit", month: "long" }) + (key === heute ? " · Heute" : ""),
          '<div class="item-list">' + groups[key].map(function (event) {
            var google = Boolean(event.googleId || event.gcalId || event.source === "google");
            return '<div class="list-item"><span class="badge ' + (google ? "blue" : "accent") + '">' +
              esc(fmtTime(event.start || event.startAt || event.time) || "Ganztags") + "</span>" +
              '<div class="item-main"><div class="item-title">' + esc(title(event, "Termin")) + "</div>" +
              '<div class="item-meta">' + esc(event.location || event.place || event.description || (google ? "Google Kalender" : "Quantus")) +
              "</div></div></div>";
          }).join("") + "</div>");
      }).join("") : nothing("31", "Keine kommenden Termine", "Synchronisiere den Google-Kalender in AI Sync oder lege hier ein Meeting an.")) +
      "</div></div>";
  }

  // =========================================================================
  //  WISSENSBASIS
  // =========================================================================
  function renderKnowledge() {
    var route = "knowledge";
    var kind = tab(route, "all");
    var notes = col("notes").map(function (item) { return { kind: "notes", item: item }; });
    var articles = col("articles").map(function (item) { return { kind: "articles", item: item }; });
    var concepts = col("concepts").map(function (item) { return { kind: "concepts", item: item }; });
    var all = notes.concat(articles).concat(concepts);
    var list = all.filter(function (entry) {
      if (kind !== "all" && entry.kind !== kind) return false;
      return matches(route, title(entry.item, "") + " " + text(entry.item));
    });
    var labels = { notes: "Notiz", articles: "Artikel", concepts: "Konzept" };

    return '<div class="view">' +
      head("Wissensbasis", "Notizen, Artikel und Konzepte deines Quantus-Wissens an einem Ort — durchsuchbar.",
        '<button class="btn" data-action="go" data-route="notes">✎ Noteflow</button>' +
        '<button class="btn primary" data-action="new-entity" data-collection="notes">＋ Notiz</button>') +
      banner() +
      '<div class="filterbar">' + searchField(route, "Wissen durchsuchen") +
        chips(route, [
          { key: "all", label: "Alles", count: all.length },
          { key: "notes", label: "Notizen", count: notes.length },
          { key: "articles", label: "Artikel", count: articles.length },
          { key: "concepts", label: "Konzepte", count: concepts.length }
        ], "all") + "</div>" +
      '<div class="content-grid">' + (list.length ? list.slice(0, 90).map(function (entry) {
        var editable = entry.kind !== "articles";
        return '<article class="entity-card"><div class="row-actions"><span class="badge accent">' +
          esc(labels[entry.kind]) + "</span></div><h3>" + esc(title(entry.item, labels[entry.kind])) + "</h3><p>" +
          esc(text(entry.item).slice(0, 220) || "Kein Text hinterlegt") + '</p><div class="card-foot"><span class="muted small">' +
          esc(fmtDate(entry.item.updatedAt || entry.item.createdAt)) + '</span><span class="spacer"></span>' +
          (editable ? '<button class="icon-action" data-action="edit-entity" data-collection="' + attr(entry.kind) +
            '" data-id="' + attr(entry.item.id) + '" aria-label="Bearbeiten">✎</button>' : "") +
          '<button class="icon-action" data-action="nm-to-card" data-front="' + attr(title(entry.item, "")) +
            '" data-back="' + attr(text(entry.item).slice(0, 300)) + '" aria-label="Als Karteikarte lernen">▣</button>' +
          "</div></article>";
      }).join("") : nothing("◈", "Nichts gefunden", "Andere Suche versuchen oder eine neue Notiz anlegen.")) +
      "</div></div>";
  }

  // =========================================================================
  //  THESIS STUDIO
  // =========================================================================
  function renderThesis() {
    var route = "thesis";
    var theses = col("theses").filter(function (item) { return matches(route, title(item, "") + " " + text(item)); });
    var openId = ui.open[route];
    var open = theses.find(function (item) { return item.id === openId; }) || theses[0] || null;
    var notes = col("notes");

    return '<div class="view">' +
      head("Thesis Studio", "Deine Thesen, ihre Kernfrage und der laufende Text — direkt auf dem Tablet schreibbar.",
        '<button class="btn primary" data-action="nm-thesis-new">＋ These</button>') +
      banner() +
      '<div class="reading-layout">' +
        '<aside class="library-panel"><div class="panel-head"><strong>Thesen</strong><span class="badge">' + theses.length +
          "</span></div>" + searchField(route, "Thesen durchsuchen") +
          '<div class="library-list">' + (theses.length ? theses.map(function (item) {
            return '<div class="doc-row' + (open && open.id === item.id ? " on" : "") + '" data-action="nm-open" data-route="' +
              route + '" data-id="' + attr(item.id) + '"><strong class="truncate" style="display:block">' +
              esc(title(item, "These")) + '</strong><small class="muted">' + esc(item.status || "Entwurf") + "</small></div>";
          }).join("") : nothingSmall("Noch keine These")) + "</aside>" +
        '<section class="reader-panel">' + (open
          ? '<form class="nm-editor" data-form="nm-thesis" data-id="' + attr(open.id) + '">' +
            '<div class="panel-head"><strong class="truncate">' + esc(title(open, "These")) + "</strong>" +
            '<button class="icon-action" type="button" data-action="nm-thesis-delete" data-id="' + attr(open.id) + '" aria-label="Loeschen">⌫</button>' +
            '<button class="btn primary small-btn" type="submit">Sichern</button></div>' +
            '<div class="nm-editor-body">' +
            '<div class="field"><label>Titel</label><input name="title" value="' + attr(open.title || "") + '" required></div>' +
            '<div class="field"><label>Kernfrage</label><input name="question" value="' + attr(open.question || "") + '"></div>' +
            '<div class="field"><label>Stand</label><select name="status">' +
              ["Entwurf", "In Arbeit", "Zur Pruefung", "Fertig"].map(function (value) {
                return '<option value="' + attr(value) + '"' + ((open.status || "Entwurf") === value ? " selected" : "") + ">" + esc(value) + "</option>";
              }).join("") + "</select></div>" +
            '<div class="field"><label>Text</label><textarea name="description" rows="16">' +
              esc(open.description || open.content || "") + "</textarea></div>" +
            '<div class="field"><label>Verknuepfte Notiz</label><select name="noteId"><option value="">Keine</option>' +
              notes.slice(0, 80).map(function (note) {
                return '<option value="' + attr(note.id) + '"' + (open.noteId === note.id ? " selected" : "") + ">" +
                  esc(title(note, "Notiz")) + "</option>";
              }).join("") + "</select></div>" +
            "</div></form>"
          : '<div class="reader-empty"><div><span style="font-size:48px">T</span><h2>Noch keine These</h2>' +
            '<p>Lege deine erste These an — Titel, Kernfrage und Text bleiben mit AI Sync synchron.</p>' +
            '<button class="btn primary" data-action="nm-thesis-new">＋ These</button></div></div>') +
        "</section></div></div>";
  }

  // =========================================================================
  //  JOURNAL
  // =========================================================================
  function renderJournal() {
    var route = "journal";
    var which = tab(route, "documents");
    var documents = listArea("journal.documents");
    var letters = listArea("journal.selfLetters");
    var topics = listArea("journal.topics");
    var pushes = arr(payload().mobilePushes);

    var body;
    if (which === "letters") {
      body = widget(12, "✉", "Briefe an mich",
        '<form class="nm-inline" data-form="nm-journal-letter">' +
        '<input name="title" placeholder="Titel des Briefs" autocomplete="off" required>' +
        '<input name="deliveryDate" type="date" aria-label="Zustelldatum">' +
        '<textarea name="content" rows="4" placeholder="Was willst du deinem spaeteren Ich sagen?" required></textarea>' +
        '<button class="btn primary" type="submit">Brief ablegen</button></form>' +
        '<div class="item-list">' + (letters.length ? letters.slice().reverse().map(function (letter) {
          var due = String(letter.deliveryDate || "").slice(0, 10);
          var open = due && due > today();
          return '<div class="list-item"><span class="badge ' + (open ? "sand" : "accent") + '">' +
            esc(open ? "ab " + fmtDate(due) : "offen") + "</span>" +
            '<div class="item-main"><div class="item-title">' + esc(letter.title || "Brief") + "</div>" +
            '<div class="item-meta">' + esc(open ? "Noch verschlossen — der Text erscheint am Zustelltag." : String(letter.content || "").slice(0, 160)) +
            "</div></div>" +
            '<button class="icon-action" data-action="nm-list-delete" data-area="journal.selfLetters" data-id="' +
              attr(letter.id) + '" aria-label="Loeschen">⌫</button></div>';
        }).join("") : nothingSmall("Noch kein Brief an dich selbst")) + "</div>");
    } else if (which === "topics") {
      body = widget(12, "✦", "Gedanken",
        '<form class="nm-inline row" data-form="nm-journal-topic">' +
        '<input name="text" placeholder="Gedanke festhalten …" autocomplete="off" required>' +
        '<button class="btn primary" type="submit">Merken</button></form>' +
        '<div class="item-list">' + (topics.length ? topics.slice().reverse().map(function (topic) {
          return '<div class="list-item"><span>✦</span><div class="item-main"><div class="item-title">' +
            esc(topic.text || "") + '</div><div class="item-meta">' + esc(fmtDate(topic.createdAt)) + "</div></div>" +
            '<button class="icon-action" data-action="nm-list-delete" data-area="journal.topics" data-id="' +
              attr(topic.id) + '" aria-label="Loeschen">⌫</button></div>';
        }).join("") : nothingSmall("Noch keine Gedanken festgehalten")) + "</div>");
    } else if (which === "mobile") {
      body = widget(12, "▤", "Vom Handy geschickt",
        '<div class="item-list">' + (pushes.length ? pushes.slice().reverse().slice(0, 40).map(function (push) {
          return '<div class="list-item"><span class="badge blue">Handy</span><div class="item-main"><div class="item-title">' +
            esc(push.title || "Eintrag") + '</div><div class="item-meta">' + esc(String(push.text || push.content || "").slice(0, 180)) +
            "</div></div></div>";
        }).join("") : nothingSmall("Das Handy hat noch nichts geschickt")) + "</div>");
    } else {
      var openId = ui.open[route];
      var open = documents.find(function (item) { return item.id === openId; }) || null;
      body = '<div class="reading-layout">' +
        '<aside class="library-panel"><div class="panel-head"><strong>Eintraege</strong><span class="badge">' +
          documents.length + "</span>" +
          '<button class="icon-action" data-action="nm-journal-new" aria-label="Neuer Eintrag">＋</button></div>' +
          '<div class="library-list">' + (documents.length ? documents.slice().reverse().map(function (doc) {
            return '<div class="doc-row' + (open && open.id === doc.id ? " on" : "") + '" data-action="nm-open" data-route="' +
              route + '" data-id="' + attr(doc.id) + '"><strong class="truncate" style="display:block">' +
              esc(doc.title || "Eintrag") + '</strong><small class="muted">' +
              esc(nurText(doc.content).slice(0, 60) || fmtDate(doc.updatedAt || doc.createdAt)) + "</small></div>";
          }).join("") : nothingSmall("Noch kein Eintrag")) + "</div></aside>" +
        '<section class="reader-panel">' + (open
          ? '<form class="nm-editor" data-form="nm-journal-doc" data-id="' + attr(open.id) + '">' +
            '<div class="panel-head"><strong class="truncate">' + esc(open.title || "Eintrag") + "</strong>" +
            '<button class="icon-action" type="button" data-action="nm-list-delete" data-area="journal.documents" data-id="' +
              attr(open.id) + '" aria-label="Loeschen">⌫</button>' +
            '<button class="btn primary small-btn" type="submit">Sichern</button></div>' +
            '<div class="nm-editor-body">' +
            '<div class="field"><label>Titel</label><input name="title" value="' + attr(open.title || "") + '" required></div>' +
            // Der Inhalt ist HTML und wird als HTML bearbeitet — genau wie im
            // Journal Booklet. Ein textarea wuerde die Auszeichnung zeigen
            // statt den Text, und beim Sichern alles doppelt escapen.
            '<div class="field"><label>Text</label>' +
            '<div class="nm-richtext" contenteditable="true" data-nm-richtext="content" ' +
              'data-placeholder="Schreib los …" spellcheck="true">' + alsHtml(open.content) + "</div></div>" +
            "</div></form>"
          : '<div class="reader-empty"><div><span style="font-size:48px">J</span><h2>Journal</h2>' +
            '<p>Waehle links einen Eintrag oder lege einen neuen an.</p>' +
            '<button class="btn primary" data-action="nm-journal-new">＋ Eintrag</button></div></div>') +
        "</section></div>";
    }

    return '<div class="view">' +
      head("Journal", "Eintraege, Briefe an dich selbst und Gedanken — im selben Datenstand wie das Journal Booklet in AI Sync.", "") +
      banner() +
      '<div class="filterbar">' + chips(route, [
        { key: "documents", label: "Eintraege", count: documents.length },
        { key: "letters", label: "Briefe an mich", count: letters.length },
        { key: "topics", label: "Gedanken", count: topics.length },
        { key: "mobile", label: "Vom Handy", count: pushes.length }
      ], "documents") + "</div>" + body + "</div>";
  }

  // =========================================================================
  //  REFLECTA
  // =========================================================================
  var REFLECTA_QUESTIONS = [
    { key: "a", label: "Was ist heute gelungen?" },
    { key: "b", label: "Was hat mich aufgehalten?" },
    { key: "c", label: "Was habe ich gelernt?" },
    { key: "d", label: "Worauf freue ich mich morgen?" },
    { key: "e", label: "Was lasse ich bewusst liegen?" }
  ];
  var REFLECTA_RATINGS = [
    { key: "f", label: "Energie" },
    { key: "g", label: "Fokus" },
    { key: "h", label: "Zufriedenheit" },
    { key: "i", label: "Ruhe" },
    { key: "j", label: "Fortschritt" }
  ];

  function renderReflecta() {
    var route = "reflecta";
    var reflections = listArea("reflections").slice().sort(function (x, y) {
      return String(y.date || "").localeCompare(String(x.date || ""));
    });
    var heute = today();
    var mine = reflections.find(function (item) { return String(item.date || "").slice(0, 10) === heute; }) || null;
    var openId = ui.open[route];
    var open = openId ? reflections.find(function (item) { return item.id === openId; }) : null;
    var avg = function (entry) {
      var ratings = obj(entry.ratings);
      var list = REFLECTA_RATINGS.map(function (r) { return Number(ratings[r.key]) || 0; }).filter(Boolean);
      return list.length ? Math.round((list.reduce(function (a2, b) { return a2 + b; }, 0) / list.length) * 10) / 10 : 0;
    };
    var streak = 0;
    var cursor = heute;
    while (reflections.some(function (item) { return String(item.date || "").slice(0, 10) === cursor; })) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }

    var form = '<form class="nm-reflect" data-form="nm-reflect" data-id="' + attr(mine ? mine.id : "") + '">' +
      '<div class="nm-reflect-grid">' + REFLECTA_QUESTIONS.map(function (question) {
        return '<div class="field"><label>' + esc(question.label) + '</label><textarea name="q_' + question.key +
          '" rows="3">' + esc(mine ? obj(mine.openQuestions)[question.key] || "" : "") + "</textarea></div>";
      }).join("") + "</div>" +
      '<div class="nm-reflect-ratings">' + REFLECTA_RATINGS.map(function (rating) {
        var value = mine ? Number(obj(mine.ratings)[rating.key]) || 3 : 3;
        return '<label class="nm-rating"><span>' + esc(rating.label) + '</span>' +
          '<input type="range" name="r_' + rating.key + '" min="1" max="5" step="1" value="' + value + '">' +
          '<b>' + value + "</b></label>";
      }).join("") + "</div>" +
      '<div class="field"><label>Gelerntes (eine Zeile pro Punkt)</label><textarea name="learnings" rows="3">' +
        esc(arr(mine && mine.learnings).join("\n")) + "</textarea></div>" +
      '<button class="btn primary" type="submit">' + (mine ? "Reflexion aktualisieren" : "Reflexion sichern") + "</button></form>";

    return '<div class="view">' +
      head("Reflecta", "Der taegliche Rueckblick: fuenf Fragen, fuenf Werte, ein Satz Gelerntes.", "") +
      banner() +
      metrics([
        { label: "Reflexionen", value: reflections.length },
        { label: "Serie", value: streak + " Tage" },
        { label: "Heute", value: mine ? "erfasst" : "offen" },
        { label: "Schnitt heute", value: mine ? avg(mine) || "—" : "—" }
      ]) +
      '<div class="dashboard-grid">' +
        widget(7, "◐", mine ? "Heute · " + fmtDate(heute) : "Reflexion fuer heute", form) +
        widget(5, "▤", "Rueckblick", reflections.length
          ? '<div class="item-list">' + reflections.slice(0, 20).map(function (entry) {
              return '<div class="list-item" data-action="nm-open" data-route="' + route + '" data-id="' + attr(entry.id) + '">' +
                '<span class="badge accent">' + esc(avg(entry) || "—") + "</span>" +
                '<div class="item-main"><div class="item-title">' + esc(fmtDate(entry.date)) + "</div>" +
                '<div class="item-meta">' + esc(String(obj(entry.openQuestions).a || "").slice(0, 90) || "Ohne Notiz") + "</div></div>" +
                '<button class="icon-action" data-action="nm-list-delete" data-area="reflections" data-id="' +
                  attr(entry.id) + '" aria-label="Loeschen">⌫</button></div>';
            }).join("") + "</div>"
          : nothingSmall("Noch keine Reflexion")) +
        (open ? widget(12, "◐", "Reflexion vom " + fmtDate(open.date),
          REFLECTA_QUESTIONS.map(function (question) {
            var value = obj(open.openQuestions)[question.key];
            return value ? '<div class="nm-qa"><strong>' + esc(question.label) + "</strong><p>" + esc(value) + "</p></div>" : "";
          }).join("") +
          '<div class="chip-row">' + REFLECTA_RATINGS.map(function (rating) {
            return '<span class="chip">' + esc(rating.label) + " " + esc(obj(open.ratings)[rating.key] || "—") + "</span>";
          }).join("") + "</div>") : "") +
      "</div></div>";
  }

  // =========================================================================
  //  NACHRICHTEN AN MICH
  // =========================================================================
  function renderMessages() {
    var route = "messages";
    var now = new Date().toISOString();
    var all = col("scheduledMessages");
    var due = all.filter(function (item) { return !item.isRead && String(item.deliverAt || "") <= now; });
    var planned = all.filter(function (item) { return String(item.deliverAt || "") > now; });
    var read = all.filter(function (item) { return item.isRead; });
    var which = tab(route, "due");
    var list = which === "planned" ? planned : which === "read" ? read : due;
    list = list.filter(function (item) { return matches(route, title(item, "") + " " + (item.content || "")); });

    return '<div class="view">' +
      head("Nachrichten an mich", "Botschaften, die du dir selbst auf einen Zeitpunkt legst — derselbe Bestand wie in AI Sync.",
        '<button class="btn" data-action="go" data-route="mail">✉ Mail</button>') +
      banner() +
      widget(12, "✉", "Neue Nachricht an mich",
        '<form class="nm-inline" data-form="nm-message">' +
        '<input name="title" placeholder="Betreff" autocomplete="off" required>' +
        '<textarea name="content" rows="3" placeholder="Was soll dich an diesem Tag erreichen?" required></textarea>' +
        '<div class="nm-inline-row"><input name="deliverAt" type="datetime-local" required>' +
        '<select name="priority"><option value="3">Normal</option><option value="1">Hoch</option><option value="5">Niedrig</option></select>' +
        '<button class="btn primary" type="submit">Planen</button></div></form>') +
      '<div class="filterbar">' + searchField(route, "Nachrichten durchsuchen") +
        chips(route, [
          { key: "due", label: "Faellig", count: due.length },
          { key: "planned", label: "Geplant", count: planned.length },
          { key: "read", label: "Gelesen", count: read.length }
        ], "due") + "</div>" +
      '<div class="content-grid">' + (list.length ? list.map(function (item) {
        return '<article class="entity-card"><div class="row-actions">' +
          '<span class="badge ' + (which === "planned" ? "sand" : which === "read" ? "" : "accent") + '">' +
          esc(fmtDate(item.deliverAt, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })) + "</span>" +
          (Number(item.priority) === 1 ? '<span class="badge coral">Hoch</span>' : "") + "</div>" +
          "<h3>" + esc(title(item, "Nachricht")) + "</h3><p>" + esc(String(item.content || "").slice(0, 240)) + "</p>" +
          '<div class="card-foot"><span class="spacer"></span>' +
          (item.isRead
            ? '<button class="btn small-btn" data-action="nm-message-unread" data-id="' + attr(item.id) + '">Wieder offen</button>'
            : '<button class="btn small-btn" data-action="nm-message-read" data-id="' + attr(item.id) + '">Gelesen</button>') +
          '<button class="icon-action" data-action="delete-entity" data-collection="scheduledMessages" data-id="' +
            attr(item.id) + '" aria-label="Loeschen">⌫</button></div></article>';
      }).join("") : nothing("✉", "Nichts hier", "Lege dir oben eine Nachricht auf einen kuenftigen Tag.")) +
      "</div></div>";
  }

  // =========================================================================
  //  UPDATES
  // =========================================================================
  function renderUpdates() {
    var route = "updates";
    var all = col("updates");
    var open = all.filter(function (item) { return !item.checked; });
    var done = all.filter(function (item) { return item.checked; });
    var which = tab(route, "open");
    var list = (which === "done" ? done : open).filter(function (item) {
      return matches(route, (item.text || "") + " " + (item.category || ""));
    });
    var categories = {};
    open.forEach(function (item) {
      var key = item.category || "Allgemein";
      categories[key] = (categories[key] || 0) + 1;
    });
    var programs = col("programs");

    return '<div class="view">' +
      head("Updates", "Kurze Meldungen und Merker, die sonst zwischen den Aufgaben untergehen.", "") +
      banner() +
      widget(12, "↥", "Neues Update",
        '<form class="nm-inline" data-form="nm-update">' +
        '<input name="text" placeholder="Was gibt es Neues?" autocomplete="off" required>' +
        '<div class="nm-inline-row"><input name="category" placeholder="Kategorie" autocomplete="off">' +
        '<select name="priority"><option value="normal">Normal</option><option value="hoch">Hoch</option><option value="tief">Tief</option></select>' +
        '<select name="programId"><option value="">Ohne Programm</option>' +
          programs.map(function (program) {
            return '<option value="' + attr(program.id) + '">' + esc(title(program, "Programm")) + "</option>";
          }).join("") + "</select>" +
        '<button class="btn primary" type="submit">Hinzufuegen</button></div></form>') +
      '<div class="filterbar">' + searchField(route, "Updates durchsuchen") +
        chips(route, [
          { key: "open", label: "Offen", count: open.length },
          { key: "done", label: "Erledigt", count: done.length }
        ], "open") + "</div>" +
      (Object.keys(categories).length
        ? '<div class="chip-row" style="margin-bottom:12px">' + Object.keys(categories).sort().map(function (key) {
            return '<span class="chip">' + esc(key) + " " + categories[key] + "</span>";
          }).join("") + "</div>"
        : "") +
      '<div class="item-list">' + (list.length ? list.map(function (item) {
        return '<div class="list-item"><button class="nm-check' + (item.checked ? " on" : "") +
          '" data-action="nm-update-toggle" data-id="' + attr(item.id) + '" aria-label="Abhaken">' +
          (item.checked ? "✓" : "") + "</button>" +
          '<div class="item-main"><div class="item-title' + (item.checked ? " nm-struck" : "") + '">' + esc(item.text || "") + "</div>" +
          '<div class="item-meta">' + esc(item.category || "Allgemein") +
          (item.priority && item.priority !== "normal" ? " · " + esc(item.priority) : "") + " · " +
          esc(fmtDate(item.createdAt)) + "</div></div>" +
          '<button class="icon-action" data-action="delete-entity" data-collection="updates" data-id="' +
            attr(item.id) + '" aria-label="Loeschen">⌫</button></div>';
      }).join("") : nothingSmall("Nichts offen")) +
      "</div>";
  }

  // =========================================================================
  //  MASSNAHMEN
  // =========================================================================
  function renderMeasures() {
    var a = api();
    var decisions = col("decisions");
    var tasks = col("tasks");
    var measures = tasks.filter(function (task) {
      return task.kind === "measure" || task.isMeasure || Boolean(task.decisionId);
    });
    var openMeasures = measures.filter(function (task) { return a && !a.isDone(task); });

    return '<div class="view">' +
      head("Massnahmen", "Was aus deinen Entscheidungen tatsaechlich folgt — jede Massnahme haengt an ihrem Entscheid.",
        '<button class="btn" data-action="go" data-route="decisions">⚖ Entscheidungen</button>') +
      banner() +
      metrics([
        { label: "Entscheidungen", value: decisions.length },
        { label: "Massnahmen", value: measures.length },
        { label: "Offen", value: openMeasures.length },
        { label: "Ohne Massnahme", value: decisions.filter(function (decision) {
            return !measures.some(function (task) { return task.decisionId === decision.id; });
          }).length }
      ]) +
      '<div class="dashboard-grid">' + (decisions.length ? decisions.map(function (decision) {
        var own = measures.filter(function (task) { return task.decisionId === decision.id; });
        return widget(6, "⚖", title(decision, "Entscheidung"),
          '<p class="muted small">' + esc(text(decision).slice(0, 180) || "Keine Begruendung hinterlegt") + "</p>" +
          '<div class="item-list">' + (own.length ? own.map(function (task) {
            var isDone = a && a.isDone(task);
            return '<div class="list-item"><button class="nm-check' + (isDone ? " on" : "") +
              '" data-action="nm-measure-toggle" data-id="' + attr(task.id) + '" aria-label="Erledigt">' +
              (isDone ? "✓" : "") + "</button>" +
              '<div class="item-main"><div class="item-title' + (isDone ? " nm-struck" : "") + '">' +
              esc(title(task, "Massnahme")) + '</div><div class="item-meta">' +
              esc(task.dueDate ? "bis " + fmtDate(task.dueDate) : "ohne Termin") + "</div></div></div>";
          }).join("") : nothingSmall("Aus diesem Entscheid folgt noch nichts")) + "</div>" +
          '<form class="nm-inline row" data-form="nm-measure" data-decision="' + attr(decision.id) + '">' +
          '<input name="title" placeholder="＋ Massnahme" autocomplete="off">' +
          '<input name="dueDate" type="date" aria-label="Termin"></form>');
      }).join("") : nothing("⚖", "Noch keine Entscheidungen", "Halte einen Entscheid fest — die Massnahmen haengen sich hier daran.")) +
      "</div></div>";
  }

  // =========================================================================
  //  DRIVE UND LESEN
  // =========================================================================
  function driveDocs() {
    var a = api();
    if (!a) return [];
    var map = obj(a.state.driveDocs);
    return Object.keys(map).map(function (key) {
      var doc = obj(map[key]);
      return Object.assign({}, doc, { id: doc.id || key });
    }).filter(function (doc) { return doc.status !== "papierkorb"; })
      .sort(function (x, y) { return Date.parse(y.aktualisiert || y.erstellt || 0) - Date.parse(x.aktualisiert || x.erstellt || 0); });
  }
  function isPdf(doc) { return /pdf/i.test(doc.mimeType || doc.dateiname || ""); }
  function docName(doc) { return doc.titel_final || doc.dateiname || "Dokument"; }

  function renderDrive() {
    var route = "drive";
    var docs = driveDocs();
    var areas = {};
    docs.forEach(function (doc) {
      var key = doc.bereich || "Ohne Bereich";
      areas[key] = (areas[key] || 0) + 1;
    });
    var area = tab(route, "all");
    var list = docs.filter(function (doc) {
      if (area !== "all" && (doc.bereich || "Ohne Bereich") !== area) return false;
      return matches(route, docName(doc) + " " + (doc.bereich || "") + " " + (doc.textauszug || ""));
    });

    return '<div class="view">' +
      head("Quantus Drive", "Alle Dokumente deines Drives — nach Bereich sortiert, durchsuchbar, direkt lesbar.",
        '<button class="btn" data-action="go" data-route="reading">▤ Lesen</button>' +
        '<button class="btn" data-action="workspace">✎ Canvas</button>') +
      banner() +
      '<div class="filterbar">' + searchField(route, "Dokumente durchsuchen") +
        chips(route, [{ key: "all", label: "Alle", count: docs.length }].concat(
          Object.keys(areas).sort().map(function (key) { return { key: key, label: key, count: areas[key] }; })
        ), "all") + "</div>" +
      '<div class="content-grid">' + (list.length ? list.slice(0, 120).map(function (doc) {
        return '<article class="entity-card"><div class="row-actions"><span class="badge ' + (isPdf(doc) ? "coral" : "accent") + '">' +
          esc(isPdf(doc) ? "PDF" : (doc.mimeType || "Dokument").split("/").pop()) + "</span>" +
          (doc.bereich ? '<span class="badge">' + esc(doc.bereich) + "</span>" : "") + "</div>" +
          "<h3>" + esc(docName(doc)) + "</h3><p>" + esc(String(doc.textauszug || doc.text || "").slice(0, 180) || "Kein Textauszug") + "</p>" +
          '<div class="card-foot"><span class="muted small">' + esc(fmtDate(doc.aktualisiert || doc.erstellt)) +
          '</span><span class="spacer"></span>' +
          '<button class="btn small-btn" data-action="open-doc" data-id="' + attr(doc.id) + '">Lesen</button>' +
          (doc.downloadUrl || doc.fileUrl
            ? '<button class="icon-action" data-action="external-url" data-url="' + attr(doc.downloadUrl || doc.fileUrl) +
              '" aria-label="Original oeffnen">↗</button>'
            : "") + "</div></article>";
      }).join("") : nothing("▰", "Keine Dokumente", "Lade in Quantus Drive ein Dokument hoch — es erscheint hier sofort.")) +
      "</div></div>";
  }

  function renderPdf() {
    var route = "pdfeditor";
    var pdfs = driveDocs().filter(isPdf).filter(function (doc) { return matches(route, docName(doc)); });
    var openId = ui.open[route];
    var open = pdfs.find(function (doc) { return doc.id === openId; }) || pdfs[0] || null;
    var url = open ? (open.downloadUrl || open.fileUrl || "") : "";

    return '<div class="view">' +
      head("PDF", "Alle PDFs aus Quantus Drive lesen — mit voller Betrachter-Bedienung und Handschrift auf dem Canvas.",
        '<button class="btn" data-action="workspace">✎ Auf dem Canvas annotieren</button>') +
      banner() +
      '<div class="reading-layout">' +
        '<aside class="library-panel"><div class="panel-head"><strong>PDFs</strong><span class="badge">' + pdfs.length +
          "</span></div>" + searchField(route, "PDFs durchsuchen") +
          '<div class="library-list">' + (pdfs.length ? pdfs.map(function (doc) {
            return '<div class="doc-row' + (open && open.id === doc.id ? " on" : "") + '" data-action="nm-open" data-route="' +
              route + '" data-id="' + attr(doc.id) + '"><strong class="truncate" style="display:block">' + esc(docName(doc)) +
              '</strong><small class="muted">' + esc(doc.bereich || "Drive") + "</small></div>";
          }).join("") : nothingSmall("Keine PDFs im Drive")) + "</div></aside>" +
        '<section class="reader-panel">' + (open && url
          ? '<div class="panel-head"><button class="icon-action" data-action="reader-wide" title="Liste ein-/ausblenden">◫</button>' +
            '<button class="icon-action" data-action="reader-full" title="Vollbild">⛶</button>' +
            '<button class="icon-action" data-action="external-url" data-url="' + attr(url) + '" aria-label="Original">↗</button>' +
            '<strong class="truncate">' + esc(docName(open)) + "</strong></div>" +
            '<div class="reader-pdf" data-reader="true"><iframe title="' + attr(docName(open)) + '" src="' + attr(url) +
            '#view=FitH" allowfullscreen></iframe></div>'
          : '<div class="reader-empty"><div><span style="font-size:48px">P</span><h2>Kein PDF gewaehlt</h2>' +
            "<p>Waehle links ein PDF aus Quantus Drive.</p></div></div>") +
        "</section></div></div>";
  }

  // =========================================================================
  //  DOCSTUDIO
  // =========================================================================
  var DOC_TEMPLATES = [
    { key: "brief", label: "Brief", body: "Sehr geehrte Damen und Herren\n\n\n\nFreundliche Gruesse\n" },
    { key: "einladung", label: "Einladung", body: "Einladung zu …\n\nWann:\nWo:\nWorum geht es:\n" },
    { key: "protokoll", label: "Protokoll", body: "Anwesend:\n\nTraktanden:\n1.\n2.\n\nBeschluesse:\n" },
    { key: "offerte", label: "Offerte", body: "Leistung:\nUmfang:\nPreis:\nGueltig bis:\n" },
    { key: "leer", label: "Leeres Blatt", body: "" }
  ];

  function renderDocStudio() {
    var route = "docstudio";
    var documents = listArea("journal.documents").filter(function (doc) {
      return matches(route, (doc.title || "") + " " + (doc.content || ""));
    });
    var openId = ui.open[route];
    var open = documents.find(function (doc) { return doc.id === openId; }) || null;

    return '<div class="view">' +
      head("DocStudio", "Dokumente schreiben, ablegen und drucken — im selben Bestand wie das Journal in AI Sync.",
        DOC_TEMPLATES.map(function (template) {
          return '<button class="btn" data-action="nm-doc-new" data-template="' + attr(template.key) + '">＋ ' +
            esc(template.label) + "</button>";
        }).join("")) +
      banner() +
      '<div class="reading-layout">' +
        '<aside class="library-panel"><div class="panel-head"><strong>Dokumente</strong><span class="badge">' +
          documents.length + "</span></div>" + searchField(route, "Dokumente durchsuchen") +
          '<div class="library-list">' + (documents.length ? documents.slice().reverse().map(function (doc) {
            return '<div class="doc-row' + (open && open.id === doc.id ? " on" : "") + '" data-action="nm-open" data-route="' +
              route + '" data-id="' + attr(doc.id) + '"><strong class="truncate" style="display:block">' +
              esc(doc.title || "Dokument") + '</strong><small class="muted">' + esc(doc.type || "Dokument") + " · " +
              esc(fmtDate(doc.updatedAt || doc.createdAt)) + "</small></div>";
          }).join("") : nothingSmall("Noch kein Dokument")) + "</div></aside>" +
        '<section class="reader-panel">' + (open
          ? '<form class="nm-editor" data-form="nm-doc" data-id="' + attr(open.id) + '">' +
            '<div class="panel-head"><strong class="truncate">' + esc(open.title || "Dokument") + "</strong>" +
            '<button class="icon-action" type="button" data-action="nm-doc-print" data-id="' + attr(open.id) + '" aria-label="Drucken">⎙</button>' +
            '<button class="icon-action" type="button" data-action="nm-list-delete" data-area="journal.documents" data-id="' +
              attr(open.id) + '" aria-label="Loeschen">⌫</button>' +
            '<button class="btn primary small-btn" type="submit">Sichern</button></div>' +
            '<div class="nm-editor-body">' +
            '<div class="field"><label>Titel</label><input name="title" value="' + attr(open.title || "") + '" required></div>' +
            '<div class="field"><label>Art</label><select name="type">' + DOC_TEMPLATES.map(function (template) {
              return '<option value="' + attr(template.key) + '"' + (open.type === template.key ? " selected" : "") + ">" +
                esc(template.label) + "</option>";
            }).join("") + "</select></div>" +
            '<div class="field"><label>Inhalt</label><textarea name="content" rows="20">' + esc(open.content || "") + "</textarea></div>" +
            "</div></form>"
          : '<div class="reader-empty"><div><span style="font-size:48px">D</span><h2>DocStudio</h2>' +
            "<p>Waehle links ein Dokument oder starte oben aus einer Vorlage.</p></div></div>") +
        "</section></div></div>";
  }

  // =========================================================================
  //  BROWSER — Startseite mit Lesezeichen
  // =========================================================================
  function renderBrowser() {
    var route = "browser";
    var links = listArea("readingList").filter(function (entry) { return entry.type === "link" && entry.url; });
    var open = links.filter(function (entry) { return !entry.completedAt; });
    var docLinks = driveDocs().filter(function (doc) { return doc.downloadUrl || doc.fileUrl; }).slice(0, 12);
    var list = open.filter(function (entry) { return matches(route, (entry.title || "") + " " + entry.url); });

    return '<div class="view">' +
      head("Browser", "Deine Startseite: Adresse eingeben oder ein Lesezeichen antippen — beides oeffnet in einem eigenen Fenster.", "") +
      banner() +
      widget(12, "◎", "Adresse oeffnen",
        '<form class="nm-inline row" data-form="nm-browser-open">' +
        '<input name="url" type="text" inputmode="url" placeholder="beispiel.ch oder https://…" autocomplete="off" required>' +
        '<button class="btn primary" type="submit">Oeffnen</button></form>' +
        '<div class="chip-row" style="margin-top:10px">' +
        [["Google", "https://www.google.com"], ["Wikipedia", "https://de.wikipedia.org"],
         ["AI Sync", ""], ["SRF", "https://www.srf.ch"]].map(function (entry) {
          if (!entry[1]) {
            return '<button class="chip" data-action="external" data-path="index.html">' + esc(entry[0]) + "</button>";
          }
          return '<button class="chip" data-action="external-url" data-url="' + attr(entry[1]) + '">' + esc(entry[0]) + "</button>";
        }).join("") + "</div>") +
      '<div class="filterbar">' + searchField(route, "Lesezeichen durchsuchen") + "</div>" +
      '<div class="dashboard-grid">' +
        widget(6, "▤", "Leseliste",
          '<form class="nm-inline row" data-form="nm-browser-save">' +
          '<input name="url" placeholder="Link fuer spaeter sichern" autocomplete="off" required>' +
          '<button class="btn primary" type="submit">Merken</button></form>' +
          '<div class="item-list">' + (list.length ? list.slice(0, 30).map(function (entry) {
            return '<div class="list-item"><span>🔗</span><div class="item-main"><div class="item-title">' +
              esc(entry.title || entry.url) + '</div><div class="item-meta truncate">' + esc(entry.url) + "</div></div>" +
              '<button class="icon-action" data-action="external-url" data-url="' + attr(entry.url) + '" aria-label="Oeffnen">↗</button>' +
              '<button class="icon-action" data-action="nm-list-delete" data-area="readingList" data-id="' + attr(entry.id) +
              '" aria-label="Entfernen">⌫</button></div>';
          }).join("") : nothingSmall("Noch nichts gemerkt")) + "</div>") +
        widget(6, "▰", "Aus Quantus Drive", docLinks.length
          ? '<div class="item-list">' + docLinks.map(function (doc) {
              return '<div class="list-item"><span>▰</span><div class="item-main"><div class="item-title">' +
                esc(docName(doc)) + '</div><div class="item-meta">' + esc(doc.bereich || "Drive") + "</div></div>" +
                '<button class="icon-action" data-action="open-doc" data-id="' + attr(doc.id) + '" aria-label="Lesen">▤</button></div>';
            }).join("") + "</div>"
          : nothingSmall("Keine Dokumente mit Link")) +
      "</div></div>";
  }

  // =========================================================================
  //  BRIEFINGS — Archiv
  // =========================================================================
  function renderBriefings() {
    var briefing = obj(payload().dailyBriefing);
    var log = obj(briefing.dailyLog);
    var goals = obj(payload().dailyGoals);
    var reflections = listArea("reflections");
    var keys = {};
    Object.keys(log).forEach(function (key) { keys[key] = true; });
    Object.keys(goals).forEach(function (key) { keys[key] = true; });
    reflections.forEach(function (entry) { if (entry.date) keys[String(entry.date).slice(0, 10)] = true; });
    var days = Object.keys(keys).sort().reverse().slice(0, 60);
    var heute = today();

    return '<div class="view">' +
      head("Briefings", "Das Archiv deiner Tage: Tagesziele, Notiz und Reflexion — ein Tipp oeffnet den Tag im Daily Briefing.",
        '<button class="btn primary" data-action="go" data-route="daily">☀ Heutiges Briefing</button>') +
      banner() +
      metrics([
        { label: "Erfasste Tage", value: days.length },
        { label: "Routinen", value: arr(briefing.routines).length },
        { label: "Glaubenssaetze", value: arr(briefing.beliefs).length },
        { label: "Reflexionen", value: reflections.length }
      ]) +
      '<div class="dashboard-grid">' + (days.length ? days.map(function (key) {
        var dayGoals = arr(goals[key]);
        var done = dayGoals.filter(function (goal) { return goal && goal.completed; }).length;
        var note = String(obj(log[key]).notes || "");
        return widget(4, "☀", fmtDate(key, { weekday: "short", day: "2-digit", month: "long" }) + (key === heute ? " · Heute" : ""),
          '<div class="chip-row"><span class="chip">' + done + "/" + dayGoals.length + " Tagesziele</span>" +
          (note ? '<span class="chip">Notiz</span>' : "") + "</div>" +
          (dayGoals.length ? '<div class="item-list">' + dayGoals.slice(0, 4).map(function (goal) {
            return '<div class="list-item"><span>' + (goal.completed ? "✓" : "◎") + '</span><div class="item-main">' +
              '<div class="item-title' + (goal.completed ? " nm-struck" : "") + '">' + esc(goal.title || "") + "</div></div></div>";
          }).join("") + "</div>" : "") +
          (note ? '<p class="muted small">' + esc(note.slice(0, 160)) + "</p>" : "") +
          '<button class="btn small-btn" data-action="nm-briefing-open" data-tag="' + attr(key) + '">Tag oeffnen ›</button>');
      }).join("") : nothing("B", "Noch kein Archiv", "Sobald du Tagesziele oder eine Tagesnotiz erfasst, erscheint der Tag hier.")) +
      "</div></div>";
  }

  // =========================================================================
  //  QUANTUS PROJEKT
  // =========================================================================
  function renderQuantusProject() {
    var a = api();
    var quantus = function (item) {
      return /quantus|ai.?sync|tablet/i.test(title(item, "") + " " + text(item) + " " + (item.category || ""));
    };
    var projects = col("projects").filter(quantus);
    var tasks = col("tasks").filter(function (task) {
      return quantus(task) || projects.some(function (project) { return project.id === task.projectId; });
    });
    var ideas = col("ideas").filter(quantus);
    var updates = col("updates").filter(function (item) { return /quantus|tablet/i.test(item.text || ""); });
    var openTasks = tasks.filter(function (task) { return a && !a.isDone(task); });

    return '<div class="view">' +
      head("Quantus Projekt", "Die Weiterentwicklung von Quantus selbst: offene Arbeiten, Ideen und das Logbuch.",
        '<button class="btn" data-action="go" data-route="updates">↥ Updates</button>' +
        '<button class="btn primary" data-action="new-entity" data-collection="ideas">＋ Idee</button>') +
      banner() +
      metrics([
        { label: "Offene Arbeiten", value: openTasks.length },
        { label: "Projekte", value: projects.length },
        { label: "Ideen", value: ideas.length },
        { label: "Logbuch", value: updates.length }
      ]) +
      '<div class="dashboard-grid">' +
        widget(6, "✓", "Offene Arbeiten", openTasks.length
          ? '<div class="item-list">' + openTasks.slice(0, 15).map(function (task) {
              return '<div class="list-item" data-action="edit-entity" data-collection="tasks" data-id="' + attr(task.id) + '">' +
                '<span>✓</span><div class="item-main"><div class="item-title">' + esc(title(task, "Aufgabe")) + "</div>" +
                '<div class="item-meta">' + esc(task.dueDate ? fmtDate(task.dueDate) : "ohne Termin") + "</div></div></div>";
            }).join("") + "</div>"
          : nothingSmall("Nichts offen")) +
        widget(6, "✦", "Ideen", ideas.length
          ? '<div class="item-list">' + ideas.slice(0, 15).map(function (idea) {
              return '<div class="list-item" data-action="edit-entity" data-collection="ideas" data-id="' + attr(idea.id) + '">' +
                '<span>✦</span><div class="item-main"><div class="item-title">' + esc(title(idea, "Idee")) + "</div>" +
                '<div class="item-meta">' + esc(text(idea).slice(0, 80)) + "</div></div></div>";
            }).join("") + "</div>"
          : nothingSmall("Noch keine Idee festgehalten")) +
        widget(12, "↥", "Logbuch", updates.length
          ? '<div class="item-list">' + updates.slice(0, 20).map(function (item) {
              return '<div class="list-item"><span class="badge accent">' + esc(fmtDate(item.createdAt)) + "</span>" +
                '<div class="item-main"><div class="item-title">' + esc(item.text || "") + "</div></div></div>";
            }).join("") + "</div>"
          : nothingSmall("Noch kein Eintrag im Logbuch")) +
      "</div></div>";
  }

  // =========================================================================
  //  SMARTER
  // =========================================================================
  /*
   * SMARTER.
   *
   * BEFUND (Nutzer: "in smarter kann ich nichts lesen, nur Fragen"): diese
   * Ansicht las `doc.summary` und `doc.text`. BEIDE FELDER GIBT ES NICHT.
   * Der Lernstoff steht in `doc.documentHtml` (ein fertiges Dokument) oder,
   * bei aelteren Eintraegen, in `doc.theoryHtml` — genau wie in AI Sync
   * (public/index.html, smarterNativeToday). Uebrig blieben also die Fragen,
   * und der zu lernende Text war unerreichbar.
   *
   * ZWEITER BEFUND an derselben Stelle: die Fragefelder heissen in den
   * Dokumenten `q` und `a`. Gelesen wurden nur question/frage/front und
   * answer/antwort/back — bei den kurzen Feldnamen stand als Frage das Wort
   * "Frage" und als Antwort nichts.
   *
   * DRITTER: es gab kein Antwortfeld. Smarter ist zum Selbst-Beantworten
   * gedacht; die Antworten liegen am Dokument unter `answers[qid]` und
   * werden nach smarter/documents/<tag>/answers/<qid> geschrieben.
   */
  /*
   * JOURNAL-INHALTE SIND HTML.
   *
   * BEFUND (Nutzer: "im journal wird nichts richtig angezeigt, absaetze
   * werden nicht als absaetze sondern <div> angezeigt"): der Text der
   * Journal-Dokumente kommt aus dem contenteditable des Journal Booklet
   * (ai-sync public/index.html, #jbEditorArea) und ist damit HTML — jede
   * Zeile ein <div>. Diese Ansicht hat ihn mit esc() entschaerft und in ein
   * <textarea> gelegt: sichtbar wurde die Auszeichnung selbst statt des
   * Textes, und beim Sichern waere daraus doppelt escapter Text geworden.
   *
   * Gelesen und geschrieben wird jetzt HTML — dasselbe Format, das der
   * Desktop fuehrt. Fuer Vorschauen in Listen braucht es reinen Text.
   */
  function nurText(html) {
    return String(html == null ? "" : html)
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
      .replace(/\s+/g, " ").trim();
  }

  // Sieht der Inhalt nach HTML aus? Alter Bestand kann reiner Text sein — der
  // wird beim Anzeigen in Absaetze umgebrochen statt als eine Wand gezeigt.
  function alsHtml(inhalt) {
    var text = String(inhalt == null ? "" : inhalt);
    if (/<(p|div|br|h[1-6]|ul|ol|li|b|i|strong|em)\b/i.test(text)) return text;
    return text.split(/\n{2,}/).map(function (absatz) {
      return "<p>" + esc(absatz).replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }

  function smarterFrage(item, index) {
    if (typeof item === "string") return { id: "q" + (index + 1), frage: item, antwort: "" };
    var entry = obj(item);
    return {
      id: entry.id || ("q" + (index + 1)),
      frage: entry.q || entry.question || entry.frage || entry.front || "",
      antwort: entry.a || entry.answer || entry.antwort || entry.back || ""
    };
  }

  function smarterTitel(doc, tag) {
    var entry = obj(doc);
    if (entry.title && String(entry.title).trim()) return String(entry.title).trim();
    if (entry.unitTitle && String(entry.unitTitle).trim()) return String(entry.unitTitle).trim();
    var treffer = /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(String(entry.theoryHtml || ""));
    if (treffer) {
      var text = treffer[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text) return text;
    }
    return "Lerndokument " + (tag || "");
  }

  function renderSmarter() {
    var a = api();
    var route = "smarter";
    var docs = a ? obj(a.state.smarterDocs) : {};
    var keys = Object.keys(docs).sort().reverse();
    var openKey = ui.open[route] || keys[0] || null;
    var open = openKey ? obj(docs[openKey]) : null;
    var questions = arr(open && open.questions).map(smarterFrage);
    var answers = obj(open && open.answers);
    var beantwortet = questions.filter(function (frage) {
      return frage.id && String(obj(answers[frage.id]).text || "").trim();
    }).length;
    var erledigt = Boolean(open && open.done);

    // Das fertige Dokument ist eigenstaendiges HTML mit eigenen Stilen. Es
    // gehoert deshalb in ein abgeschottetes iframe — im Fliesstext der App
    // wuerden seine Regeln auf die ganze Ansicht durchschlagen. `sandbox`
    // ohne allow-scripts: der Inhalt wird angezeigt, mehr darf er nicht.
    var lesestoff = "";
    if (open && open.documentHtml) {
      lesestoff = '<div class="nm-doc-frame"><iframe class="nm-doc-iframe" title="Smarter Lerndokument" ' +
        'sandbox="allow-same-origin" srcdoc="' + attr(String(open.documentHtml)) + '"></iframe></div>';
    } else if (open && open.theoryHtml) {
      // Alter Bestand ohne fertiges Dokument: die Theorie steht als HTML da
      // und stammt aus demselben Workflow — sie wird eingebettet gerendert.
      lesestoff = '<div class="nm-theorie">' + String(open.theoryHtml) + "</div>";
    } else if (open) {
      lesestoff = '<p class="muted">Fuer diesen Tag liegt kein Lerndokument vor — nur die Fragen unten.</p>';
    }

    return '<div class="view">' +
      head("Smarter", "Lernstoff lesen, die Fragen selbst beantworten, dann die Musterantwort aufdecken.",
        (open ? '<button class="btn" data-action="nm-smarter-done" data-id="' + attr(openKey) + '">' +
          (erledigt ? "↺ Wieder offen" : "✓ Erledigt") + "</button>" : "") +
        '<button class="btn" data-action="go" data-route="learning">▣ Recall Lab</button>') +
      banner() +
      '<div class="reading-layout">' +
        '<aside class="library-panel"><div class="panel-head"><strong>Lektionen</strong><span class="badge">' + keys.length +
          "</span></div>" +
          '<div class="library-list">' + (keys.length ? keys.map(function (key) {
            var doc = obj(docs[key]);
            var fragen = arr(doc.questions).length;
            return '<div class="doc-row' + (openKey === key ? " on" : "") + '" data-action="nm-open" data-route="' + route +
              '" data-id="' + attr(key) + '"><strong class="truncate" style="display:block">' +
              esc(smarterTitel(doc, key)) + '</strong><small class="muted">' + esc(fmtDate(key)) +
              (fragen ? " · " + fragen + " Fragen" : "") + (doc.done ? " · ✓" : "") + "</small></div>";
          }).join("") : nothingSmall("Noch keine Lektion geladen")) + "</div></aside>" +
        '<section class="reader-panel">' + (open
          ? '<div class="panel-head"><button class="icon-action" data-action="reader-wide" title="Liste ein-/ausblenden">◫</button>' +
            '<button class="icon-action" data-action="reader-full" title="Vollbild">⛶</button>' +
            '<strong class="truncate">' + esc(smarterTitel(open, openKey)) + "</strong>" +
            '<span class="badge">' + beantwortet + "/" + questions.length + " beantwortet</span>" +
            (questions.length ? '<button class="btn small-btn" data-action="nm-smarter-reveal-all">Alles aufdecken</button>' : "") +
            "</div>" +
            '<div class="reader-content" data-reader="true"><article>' +
            lesestoff +
            (questions.length
              ? '<h2 class="nm-fragen-titel">Fragen</h2>' + questions.map(function (frage, index) {
                  var gespeichert = String(obj(answers[frage.id]).text || "");
                  return '<div class="nm-qa nm-quiz" data-qid="' + attr(frage.id) + '">' +
                    "<strong>" + (index + 1) + ". " + esc(frage.frage || "Frage") + "</strong>" +
                    '<label class="nm-eigene"><span>Deine Antwort</span>' +
                    '<textarea class="nm-antwort" data-action="nm-smarter-answer" data-day="' + attr(openKey) +
                      '" data-qid="' + attr(frage.id) + '" rows="3" placeholder="Antworte aus dem Kopf, bevor du aufdeckst.">' +
                      esc(gespeichert) + "</textarea>" +
                    '<small class="nm-speicherstand" data-fb="' + attr(frage.id) + '"></small></label>' +
                    (frage.antwort
                      ? '<button class="btn small-btn nm-reveal" data-action="nm-smarter-reveal">Musterantwort zeigen</button>' +
                        '<p class="nm-answer" hidden>' + esc(frage.antwort) + "</p>"
                      : '<small class="muted">Zu dieser Frage gibt es keine Musterantwort.</small>') +
                    '<button class="btn small-btn" data-action="nm-to-card" data-front="' + attr(frage.frage) +
                      '" data-back="' + attr(frage.antwort) + '">▣ Als Karteikarte</button></div>';
                }).join("")
              : "") +
            "</article></div>"
          : '<div class="reader-empty"><div><span style="font-size:48px">Σ</span><h2>Smarter</h2>' +
            "<p>Waehle links eine Tageslektion.</p></div></div>") +
        "</section></div></div>";
  }

  // =========================================================================
  //  REGISTRIERUNG
  // =========================================================================
  var VIEWS = {
    time: renderTime,
    workload: renderWorkload,
    weekplanning: renderWeekplan,
    nobraine: renderWeekplan,
    googlecalendar: renderGoogleCalendar,
    knowledge: renderKnowledge,
    thesis: renderThesis,
    journal: renderJournal,
    reflecta: renderReflecta,
    messages: renderMessages,
    updates: renderUpdates,
    measures: renderMeasures,
    drive: renderDrive,
    pdfeditor: renderPdf,
    docstudio: renderDocStudio,
    browser: renderBrowser,
    briefings: renderBriefings,
    quantusproject: renderQuantusProject,
    smarter: renderSmarter
  };

  function render(route) {
    // Beim Wechsel der Route den Zustand der VORHERIGEN Ansicht fallen lassen.
    // Sonst wirkt eine Suche oder ein geoeffnetes Element in einer ganz
    // anderen Ansicht weiter — genau der Fehler, den currentRLRoute einmal
    // verursacht hat.
    if (ui.route !== route) {
      ui.route = route;
      if (route !== "workload" && route !== "weekplanning" && route !== "nobraine") ui.weekOffset = 0;
    }
    var view = VIEWS[route];
    return view ? view(route) : "";
  }

  // Die laufende Zeitmessung zaehlt ohne vollstaendiges Neuzeichnen weiter:
  // nur die Zahl wird ersetzt. Ein render() im Sekundentakt wuerde jede
  // Eingabe im Formular darunter zerstoeren.
  var liveTimer = null;
  function mount(route, root) {
    if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
    if (!root) return;
    var nodes = root.querySelectorAll(".nm-live");
    if (!nodes.length) return;
    liveTimer = setInterval(function () {
      // Der Handler prueft selbst, ob seine Ansicht ueberhaupt noch steht.
      if (!document.body.contains(nodes[0])) { clearInterval(liveTimer); liveTimer = null; return; }
      Array.prototype.forEach.call(nodes, function (node) {
        node.textContent = duration(secondsBetween(node.dataset.since, new Date().toISOString()));
      });
    }, 1000);
  }

  (window.__quantusTabletModules = window.__quantusTabletModules || []).push({
    key: "native-modules",
    routes: Object.keys(VIEWS),
    render: render,
    mount: mount,
    onAction: onAction,
    onSubmit: onSubmit
  });

  // ── Aktionen ─────────────────────────────────────────────────────────────
  function onAction(action, button) {
    var a = api();
    if (!a) return false;

    if (action === "nm-tab") { ui.tab[button.dataset.route] = button.dataset.tab; a.render(); return true; }
    if (action === "nm-open") { ui.open[button.dataset.route] = button.dataset.id; a.render(); return true; }
    if (action === "nm-week") {
      var step = Number(button.dataset.step);
      ui.weekOffset = step === 0 ? 0 : ui.weekOffset + step;
      a.render();
      return true;
    }

    // Zeiterfassung
    if (action === "nm-timer-stop") {
      var taskId = button.dataset.id;
      var timer = obj(obj(payload().timers)[taskId]);
      var start = timer.startTs;
      if (!start) return true;
      var end = new Date().toISOString();
      writeEntity("create", "timeEntries", newId("timeEntry"), {
        taskId: taskId, startTs: start, endTs: end,
        durationSec: secondsBetween(start, end), note: timer.note || "", billable: false
      }, { silent: true }).then(function () {
        return a.executeOperation(a.makeOperation("timer", "delete", null, taskId, {}), { silent: true });
      }).then(function () {
        a.toast("Messung gestoppt", duration(secondsBetween(start, end)) + " gebucht", "ok");
      });
      return true;
    }
    if (action === "nm-time-delete") {
      writeEntity("delete", "timeEntries", button.dataset.id, {}, { silent: true });
      a.toast("Buchung entfernt", "", "ok");
      return true;
    }

    // Wochenplan
    if (action === "nm-plan-move") {
      writeEntity("update", "tasks", button.dataset.id, { dueDate: button.dataset.date }, { silent: true });
      return true;
    }
    if (action === "nm-plan-done") {
      writeEntity("update", "tasks", button.dataset.id, { status: "done", completedAt: new Date().toISOString() }, { silent: true });
      return true;
    }

    // Nachrichten
    if (action === "nm-message-read") {
      writeEntity("update", "scheduledMessages", button.dataset.id,
        { isRead: true, isDelivered: true, deliveredAt: new Date().toISOString() }, { silent: true });
      return true;
    }
    if (action === "nm-message-unread") {
      writeEntity("update", "scheduledMessages", button.dataset.id, { isRead: false }, { silent: true });
      return true;
    }

    // Updates und Massnahmen
    if (action === "nm-update-toggle") {
      var update = col("updates").find(function (item) { return item.id === button.dataset.id; });
      writeEntity("update", "updates", button.dataset.id, { checked: !(update && update.checked) }, { silent: true });
      return true;
    }
    if (action === "nm-measure-toggle") {
      var task = col("tasks").find(function (item) { return item.id === button.dataset.id; });
      var done = task && a.isDone(task);
      writeEntity("update", "tasks", button.dataset.id, { status: done ? "open" : "done" }, { silent: true });
      return true;
    }

    // Listenbereiche
    if (action === "nm-list-delete") {
      writeList("delete", button.dataset.area, button.dataset.id, {}, { silent: true });
      if (ui.open[ui.route] === button.dataset.id) ui.open[ui.route] = null;
      a.toast("Geloescht", "", "ok");
      return true;
    }

    // Thesis
    if (action === "nm-thesis-new") {
      var thesisId = newId("thesis");
      writeEntity("create", "theses", thesisId, { title: "Neue These", question: "", status: "Entwurf", description: "" });
      ui.open.thesis = thesisId;
      return true;
    }
    if (action === "nm-thesis-delete") {
      writeEntity("delete", "theses", button.dataset.id, {}, { silent: true });
      ui.open.thesis = null;
      a.toast("These geloescht", "", "ok");
      return true;
    }

    // Journal und DocStudio
    if (action === "nm-journal-new") {
      var docId = newId("jdoc");
      writeList("create", "journal.documents", docId, { title: "Neuer Eintrag", content: "", type: "journal" });
      ui.open.journal = docId;
      return true;
    }
    if (action === "nm-doc-new") {
      var template = DOC_TEMPLATES.find(function (entry) { return entry.key === button.dataset.template; }) || DOC_TEMPLATES[0];
      var newDocId = newId("doc");
      writeList("create", "journal.documents", newDocId, {
        title: template.label + " vom " + fmtDate(today()), content: template.body, type: template.key
      });
      ui.open.docstudio = newDocId;
      return true;
    }
    if (action === "nm-doc-print") {
      var printable = listArea("journal.documents").find(function (entry) { return entry.id === button.dataset.id; });
      if (!printable) return true;
      var frame = window.open("", "_blank");
      if (!frame) { a.toast("Drucken nicht moeglich", "Das Tablet erlaubt kein zweites Fenster.", "error"); return true; }
      frame.document.write('<!doctype html><meta charset="utf-8"><title>' + esc(printable.title || "Dokument") +
        "</title><style>body{font:16px/1.6 Georgia,serif;max-width:44em;margin:3em auto;padding:0 1em;white-space:pre-wrap}" +
        "h1{font-size:1.6em}</style><h1>" + esc(printable.title || "Dokument") + "</h1>" + esc(printable.content || ""));
      frame.document.close();
      frame.focus();
      frame.print();
      return true;
    }

    // Briefing-Archiv
    if (action === "nm-briefing-open") {
      a.state.dbTag = button.dataset.tag;
      a.go("daily");
      return true;
    }

    // Smarter
    /*
     * Der Smarter-Bestand liegt NICHT im Quantus-Datenstand, sondern in einem
     * eigenen RTDB-Knoten (smarter/documents/<tag>) — genau dort schreibt auch
     * AI Sync. Der Datenstand der App bleibt davon unberuehrt und laeuft
     * weiterhin ausschliesslich ueber die gemeinsame Transaktion.
     */
    if (action === "nm-smarter-done") {
      var tag = button.dataset.id;
      var docs = obj(a.state.smarterDocs);
      var jetztErledigt = !obj(docs[tag]).done;
      smarterSchreiben(tag + "/done", jetztErledigt, function (fehler) {
        if (fehler) a.toast("Nicht gespeichert", fehler.message, "error");
        else a.toast(jetztErledigt ? "Als erledigt markiert" : "Wieder offen", esc(tag), "ok");
      });
      return true;
    }
    if (action === "nm-smarter-reveal") {
      var block = button.closest(".nm-quiz");
      if (block) {
        var answer = block.querySelector(".nm-answer");
        if (answer) answer.hidden = !answer.hidden;
      }
      return true;
    }
    if (action === "nm-smarter-reveal-all") {
      document.querySelectorAll(".nm-answer").forEach(function (node) { node.hidden = false; });
      return true;
    }

    // Aus einem beliebigen Text eine Karteikarte machen
    if (action === "nm-to-card") {
      a.executeOperation(a.makeOperation("flashcard", "create", null, newId("card"), {
        front: button.dataset.front || "", back: button.dataset.back || "", source: "Tablet"
      }), { silent: true });
      a.toast("Karteikarte angelegt", "Im Recall Lab faellig", "ok");
      return true;
    }
    return false;
  }

  // ── Formulare ────────────────────────────────────────────────────────────
  function onSubmit(type, form, data) {
    var a = api();
    if (!a) return false;
    var value = function (name) { return String(data.get(name) || "").trim(); };

    if (type === "nm-timer-start") {
      var taskId = value("taskId");
      if (!taskId) return true;
      a.executeOperation(a.makeOperation("timer", "create", null, taskId, {
        startTs: new Date().toISOString(), note: value("note")
      }), { silent: true });
      a.toast("Messung laeuft", "", "ok");
      return true;
    }
    if (type === "nm-time-manual") {
      var minutes = Math.max(1, Number(data.get("minutes")) || 0);
      var date = value("date") || today();
      var startTs = new Date(date + "T09:00:00").toISOString();
      writeEntity("create", "timeEntries", newId("timeEntry"), {
        taskId: value("taskId") || null,
        startTs: startTs,
        endTs: new Date(Date.parse(startTs) + minutes * 60000).toISOString(),
        durationSec: minutes * 60,
        note: value("note"),
        billable: false
      });
      form.reset();
      return true;
    }
    if (type === "nm-plan-add") {
      var planTitle = value("title");
      if (!planTitle) return true;
      writeEntity("create", "tasks", newId("task"), {
        title: planTitle, description: "", status: "open",
        dueDate: form.dataset.date, source: "tablet-wochenplan"
      }, { silent: true });
      form.reset();
      a.toast("Aufgabe geplant", planTitle, "ok");
      return true;
    }
    if (type === "nm-thesis") {
      writeEntity("update", "theses", form.dataset.id, {
        title: value("title"), question: value("question"),
        status: value("status"), description: value("description"), noteId: value("noteId") || null
      });
      return true;
    }
    if (type === "nm-journal-doc" || type === "nm-doc") {
      // Die Schreibflaeche ist ein contenteditable und steht deshalb NICHT in
      // den Formulardaten — FormData kennt nur echte Felder. Ohne diesen Griff
      // waere jeder Eintrag beim Sichern leer.
      var flaeche = form.querySelector('[data-nm-richtext="content"]');
      var inhalt = flaeche ? flaeche.innerHTML : String(data.get("content") || "");
      writeList("update", "journal.documents", form.dataset.id, {
        title: value("title"), content: inhalt, type: value("type") || "journal"
      });
      return true;
    }
    if (type === "nm-journal-letter") {
      writeList("create", "journal.selfLetters", newId("letter"), {
        title: value("title"), content: String(data.get("content") || ""),
        deliveryDate: value("deliveryDate") || null, delivered: false
      });
      form.reset();
      return true;
    }
    if (type === "nm-journal-topic") {
      writeList("create", "journal.topics", newId("topic"), { text: value("text") }, { silent: true });
      form.reset();
      a.toast("Gedanke gemerkt", "", "ok");
      return true;
    }
    if (type === "nm-reflect") {
      var openQuestions = {};
      REFLECTA_QUESTIONS.forEach(function (question) { openQuestions[question.key] = String(data.get("q_" + question.key) || ""); });
      var ratings = {};
      REFLECTA_RATINGS.forEach(function (rating) { ratings[rating.key] = Number(data.get("r_" + rating.key)) || 3; });
      var learnings = String(data.get("learnings") || "").split("\n").map(function (line) { return line.trim(); }).filter(Boolean);
      var id = form.dataset.id || newId("reflection");
      writeList(form.dataset.id ? "update" : "create", "reflections", id, {
        date: today(), openQuestions: openQuestions, ratings: ratings, learnings: learnings
      });
      return true;
    }
    if (type === "nm-message") {
      var deliverAt = value("deliverAt");
      writeEntity("create", "scheduledMessages", newId("message"), {
        title: value("title"), content: String(data.get("content") || ""),
        deliverAt: deliverAt ? new Date(deliverAt).toISOString() : new Date().toISOString(),
        priority: Number(data.get("priority")) || 3,
        isDelivered: false, isRead: false, isPinned: false, recurrence: "none", sourceType: "tablet"
      });
      form.reset();
      return true;
    }
    if (type === "nm-update") {
      writeEntity("create", "updates", newId("update"), {
        text: value("text"), category: value("category") || "Allgemein",
        priority: value("priority") || "normal", programId: value("programId") || null, checked: false
      }, { silent: true });
      form.reset();
      a.toast("Update hinzugefuegt", "", "ok");
      return true;
    }
    if (type === "nm-measure") {
      var measureTitle = value("title");
      if (!measureTitle) return true;
      writeEntity("create", "tasks", newId("task"), {
        title: measureTitle, description: "", status: "open",
        dueDate: value("dueDate") || null, decisionId: form.dataset.decision, kind: "measure"
      }, { silent: true });
      form.reset();
      a.toast("Massnahme angelegt", measureTitle, "ok");
      return true;
    }
    if (type === "nm-browser-open") {
      a.openExternalUrl(normaliseUrl(value("url")));
      form.reset();
      return true;
    }
    if (type === "nm-browser-save") {
      var url = normaliseUrl(value("url"));
      if (!url) return true;
      writeList("create", "readingList", newId("read"), { type: "link", url: url, title: url }, { silent: true });
      form.reset();
      a.toast("Gemerkt", url, "ok");
      return true;
    }
    return false;
  }

  // Schreibt in den Smarter-Knoten. Ohne Datenbank (nicht angemeldet, offline)
  // sagt es das, statt stumm nichts zu tun.
  function smarterSchreiben(pfad, wert, fertig) {
    var a = api();
    var db = a && typeof a.getDatabase === "function" ? a.getDatabase() : null;
    if (!db) { if (fertig) fertig(new Error("Keine Verbindung zur Datenbank")); return; }
    try {
      db.ref("smarter/documents/" + pfad).set(wert)
        .then(function () { if (fertig) fertig(null); })
        .catch(function (fehler) { if (fertig) fertig(fehler); });
    } catch (fehler) { if (fertig) fertig(fehler); }
  }

  /*
   * Die eigene Antwort wird beim Tippen gesichert — gebuendelt, nicht bei
   * jedem Zeichen. Der Stand steht unter dem Feld, damit man sieht, dass es
   * angekommen ist; ein stummes Feld laesst einen im Ungewissen, ob die
   * Antwort den Ansichtswechsel ueberlebt.
   */
  var antwortTimer = {};
  document.addEventListener("input", function (event) {
    var feld = event.target.closest('[data-action="nm-smarter-answer"]');
    if (!feld) return;
    var qid = feld.dataset.qid;
    var tag = feld.dataset.day;
    var stand = document.querySelector('[data-fb="' + qid + '"]');
    if (stand) stand.textContent = "…";
    clearTimeout(antwortTimer[qid]);
    antwortTimer[qid] = setTimeout(function () {
      smarterSchreiben(tag + "/answers/" + qid, { text: feld.value, updatedAt: new Date().toISOString() }, function (fehler) {
        if (!stand) return;
        stand.textContent = fehler ? "nicht gespeichert" : "gespeichert ✓";
        stand.className = "nm-speicherstand" + (fehler ? " fehler" : " ok");
      });
    }, 700);
  });

  // „beispiel.ch" ist eine Adresse, aber kein gueltiges Ziel: ohne Schema
  // haette openExternalUrl sie stumm verworfen.
  function normaliseUrl(input) {
    var value = String(input || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (/^[\w.-]+\.[a-z]{2,}/i.test(value)) return "https://" + value;
    return "";
  }

  // Die Suchfelder der Ansichten. Sie laufen ueber ein eigenes Ereignis, damit
  // sie nicht mit der Sammlungssuche von app.js kollidieren.
  var searchDebounce = null;
  document.addEventListener("input", function (event) {
    var input = event.target.closest('[data-action="nm-search"]');
    if (!input) return;
    var route = input.dataset.route;
    ui.search[route] = input.value;
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(function () {
      searchDebounce = null;
      var a = api();
      if (!a) return;
      a.render();
      requestAnimationFrame(function () {
        var next = document.querySelector('[data-action="nm-search"][data-route="' + route + '"]');
        if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
      });
    }, 160);
  });

  document.addEventListener("change", function (event) {
    var select = event.target.closest('[data-action="nm-plan-assign"]');
    if (!select || !select.value) return;
    writeEntity("update", "tasks", select.dataset.id, { dueDate: select.value }, { silent: true });
  });

  // Die Schieberegler in Reflecta zeigen ihren Wert sofort an.
  document.addEventListener("input", function (event) {
    var range = event.target.closest('.nm-rating input[type="range"]');
    if (!range) return;
    var label = range.parentElement.querySelector("b");
    if (label) label.textContent = range.value;
  });
})();
