(function () {
  "use strict";

  // ==========================================================================
  //  Homebildschirm — Springboard im Stil des Apple-Homebildschirms,
  //  durchgehend im Quantus-Design (gleiche Farbtoken wie AI Sync).
  //  Widget-Reihe, seitlich blaetterbare Seiten mit App-Symbolen, Seitenpunkte
  //  und ein Dock. Der bisherige Karten-Ueberblick bleibt als Route
  //  "dashboard" erhalten und ist als eigenes Symbol verlinkt.
  // ==========================================================================

  var DOCK_KEY = "quantus-tablet-springboard-v1";

  var PAGES = [
    {
      title: "Alltag",
      apps: [
        { key: "dashboard", label: "Dashboard", icon: "▤", tone: "violet" },
        { key: "daily", label: "Heute", icon: "☀", tone: "sand" },
        { key: "tasks", label: "Aufgaben", icon: "✓", tone: "green" },
        { key: "projects", label: "Projekte", icon: "▧", tone: "blue" },
        { key: "calendar", label: "Kalender", icon: "31", tone: "red" },
        { key: "meetings", label: "Meetings", icon: "◉", tone: "coral" },
        { key: "habits", label: "Routinen", icon: "◌", tone: "green" },
        { key: "time", label: "Zeit", icon: "◷", tone: "sand" },
        { key: "workload", label: "Auslastung", icon: "▥", tone: "coral" },
        { key: "updates", label: "Updates", icon: "↥", tone: "blue" },
        { key: "workspace", label: "Canvas", icon: "✎", tone: "violet" },
        { key: "split", label: "Split", icon: "◫", tone: "grey" }
      ]
    },
    {
      title: "Wissen & Geld",
      apps: [
        { key: "notes", label: "Noteflow", icon: "✎", tone: "violet" },
        { key: "ideas", label: "Ideen", icon: "✦", tone: "sand" },
        { key: "reading", label: "Lesen", icon: "▤", tone: "blue" },
        { key: "learning", label: "Recall Lab", icon: "▣", tone: "red" },
        { key: "concepts", label: "Konzepte", icon: "◆", tone: "coral" },
        { key: "knowledge", label: "Wissen", icon: "◈", tone: "blue" },
        { key: "smarter", label: "Smarter", icon: "Σ", tone: "sand" },
        { key: "thesis", label: "Thesis", icon: "T", tone: "coral" },
        { key: "journal", label: "Journal", icon: "J", tone: "green" },
        { key: "budget", label: "Budget", icon: "₣", tone: "green" },
        { key: "flowertech", label: "FlowerTech", icon: "❀", tone: "pink" },
        { key: "statistics", label: "Statistik", icon: "▥", tone: "blue" }
      ]
    },
    {
      title: "Steuern & Kontakte",
      apps: [
        { key: "goals", label: "Ziele", icon: "◎", tone: "green" },
        { key: "strategies", label: "Strategien", icon: "◇", tone: "blue" },
        { key: "programs", label: "Programme", icon: "▦", tone: "sand" },
        { key: "decisions", label: "Entscheide", icon: "⚖", tone: "red" },
        { key: "measures", label: "Massnahmen", icon: "!", tone: "coral" },
        { key: "organizations", label: "Firmen", icon: "▥", tone: "blue" },
        { key: "persons", label: "Personen", icon: "♙", tone: "violet" },
        { key: "protocols", label: "Protokolle", icon: "¶", tone: "sand" },
        { key: "workflows", label: "Workflows", icon: "↻", tone: "green" },
        { key: "reports", label: "Berichte", icon: "▤", tone: "grey" },
        { key: "settings", label: "Einstellungen", icon: "⚙", tone: "grey" },
        { key: "apps", label: "Alle Apps", icon: "▦", tone: "grey" }
      ]
    },
    {
      title: "Werkzeuge",
      apps: [
        { key: "drive", label: "Drive", icon: "▰", tone: "blue" },
        { key: "docstudio", label: "DocStudio", icon: "D", tone: "coral" },
        { key: "nobraine", label: "No-Braine", icon: "N", tone: "green" },
        { key: "bm", label: "BM Lernen", icon: "∑", tone: "sand" },
        { key: "pdfeditor", label: "PDF", icon: "P", tone: "red" },
        { key: "browser", label: "Browser", icon: "◎", tone: "blue" },
        { key: "briefings", label: "Briefings", icon: "B", tone: "green" },
        { key: "weekplanning", label: "Wochenplan", icon: "▤", tone: "violet" },
        { key: "googlecalendar", label: "Google Kal.", icon: "31", tone: "blue" },
        { key: "messages", label: "Nachrichten", icon: "✉", tone: "coral" },
        { key: "quantusproject", label: "Quantus", icon: "Q", tone: "violet" },
        { key: "reflecta", label: "Reflecta", icon: "◐", tone: "grey" }
      ]
    }
  ];

  var DEFAULT_DOCK = ["mail", "tasks", "polaris", "workspace"];

  function api() { return window.__quantusTablet || null; }
  function esc(value) {
    var a = api();
    return a ? a.esc(value) : String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function allApps() {
    var map = {};
    PAGES.forEach(function (page) {
      page.apps.forEach(function (app) { map[app.key] = app; });
    });
    map.mail = { key: "mail", label: "Mail", icon: "✉", tone: "blue" };
    map.polaris = { key: "polaris", label: "Polaris", icon: "✦", tone: "green" };
    map.home = { key: "home", label: "Home", icon: "⌂", tone: "violet" };
    return map;
  }

  function loadDock() {
    try {
      var raw = JSON.parse(localStorage.getItem(DOCK_KEY) || "null");
      if (raw && Array.isArray(raw.dock) && raw.dock.length) return raw.dock.slice(0, 5);
    } catch (error) {}
    return DEFAULT_DOCK.slice();
  }

  function saveDock(list) {
    try { localStorage.setItem(DOCK_KEY, JSON.stringify({ dock: list })); } catch (error) {}
  }

  // ── Kennzeichnungen auf den Symbolen ────────────────────────────────────
  function badgeFor(key) {
    var a = api();
    if (!a) return 0;
    try {
      if (key === "tasks" || key === "daily") return a.todayTasks().length;
      if (key === "learning") return a.dueCards().length;
      if (key === "mail") return typeof window.QuantusMailUnread === "function" ? window.QuantusMailUnread() : 0;
      if (key === "projects") return a.collection("projects").filter(function (item) { return !a.isDone(item); }).length;
      if (key === "meetings") {
        var today = a.localDateKey();
        return a.collection("meetings").filter(function (item) {
          return String(item.date || "").slice(0, 10) >= today;
        }).length;
      }
      if (key === "flowertech") {
        var ft = (a.state.payload && a.state.payload.flowertech) || {};
        var invoices = Array.isArray(ft.invoices) ? ft.invoices : [];
        return invoices.filter(function (invoice) {
          return invoice.status !== "paid" && invoice.status !== "cancelled";
        }).length;
      }
    } catch (error) {}
    return 0;
  }

  function iconHtml(app, inDock) {
    var badge = badgeFor(app.key);
    return '<button class="sb-app' + (inDock ? " in-dock" : "") + '" data-action="go" data-route="' +
      esc(app.key) + '" data-sb-key="' + esc(app.key) + '" title="' + esc(app.label) + '">' +
      '<span class="sb-icon tone-' + esc(app.tone || "violet") + '"><span class="sb-glyph">' + esc(app.icon) + "</span>" +
      (badge > 0 ? '<span class="sb-badge">' + (badge > 99 ? "99+" : badge) + "</span>" : "") +
      '</span><span class="sb-label">' + esc(app.label) + "</span></button>";
  }

  // ── Widgets ─────────────────────────────────────────────────────────────
  function widgets() {
    var a = api();
    if (!a) return "";
    var tasks = a.todayTasks();
    var overdue = tasks.filter(function (task) {
      var due = String(task.dueDate || task.date || "").slice(0, 10);
      return due && due < a.localDateKey();
    }).length;
    var habits = a.activeHabits();
    // Dieselbe Regel wie ueberall sonst: eine Routine MIT Schritten gilt erst
    // als erledigt, wenn alle stehen. Vorher zaehlte dieser Kasten nur
    // completions und wich damit von Briefing, Handy und Hauptapp ab.
    var doneHabits = habits.filter(function (habit) { return a.isHabitDoneOn(habit, a.localDateKey()); }).length;
    var meetings = a.collection("meetings").concat(a.collection("calendarEvents"))
      .filter(function (item) { return String(item.date || item.start || "").slice(0, 10) >= a.localDateKey(); })
      .sort(function (x, y) {
        return String(x.date || x.start || "").localeCompare(String(y.date || y.start || ""));
      });
    var next = meetings[0];
    var date = new Intl.DateTimeFormat("de-CH", {
      weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Zurich"
    }).format(new Date());

    return '<div class="sb-widgets">' +
      '<button class="sb-widget wide" data-action="go" data-route="daily">' +
        '<div class="sb-widget-head">☀ ' + esc(date) + "</div>" +
        '<div class="sb-widget-big">' + tasks.length + "</div>" +
        '<div class="sb-widget-sub">offene Aufgaben' + (overdue ? " · " + overdue + " ueberfaellig" : "") + "</div></button>" +
      '<button class="sb-widget" data-action="go" data-route="learning">' +
        '<div class="sb-widget-head">▣ Recall Lab</div>' +
        '<div class="sb-widget-big">' + a.dueCards().length + "</div>" +
        '<div class="sb-widget-sub">Karten faellig</div></button>' +
      '<button class="sb-widget" data-action="go" data-route="habits">' +
        '<div class="sb-widget-head">◌ Routinen</div>' +
        '<div class="sb-widget-big">' + doneHabits + "/" + habits.length + "</div>" +
        '<div class="sb-widget-sub">heute erledigt</div></button>' +
      '<button class="sb-widget wide" data-action="go" data-route="calendar">' +
        '<div class="sb-widget-head">◉ Als Naechstes</div>' +
        '<div class="sb-widget-line">' + esc(next ? a.itemTitle(next, "Termin") : "Nichts geplant") + "</div>" +
        '<div class="sb-widget-sub">' + esc(next ? a.formatDate(next.date || next.start) : "Freier Kalender") + "</div></button>" +
      "</div>";
  }

  /*
   * DAS MORGENBRIEFING AUF DEM HOMEBILDSCHIRM.
   *
   * BEFUND (Bildschirmfoto): auf Home war vom Tag nichts zu sehen. app.js hat
   * dafuer einen Hero (briefingHero), aber renderHome() laeuft gar nicht:
   * dieses Modul ist fuer die Route "home" registriert und ueberschreibt sie.
   * Der Hero war fuer den Homebildschirm toter Code.
   *
   * Der Block liest DASSELBE Modell wie die Briefing-Ansicht
   * (briefingModell) — zwei Rechnungen fuer denselben Tag waeren zwei
   * Wahrheiten.
   */
  function briefingBlock() {
    var a = api();
    if (!a || typeof a.briefingModell !== "function") return "";
    var tag = a.localDateKey();
    var b;
    try { b = a.briefingModell(tag); } catch (e) { return ""; }

    var routinenFertig = (b.routinen || []).filter(function (h) { return a.isHabitDoneOn(h, tag); }).length;
    var zieleFertig = (b.tagesziele || []).filter(function (g) { return g && g.completed; }).length;
    var naechster = (b.meetings || []).slice().sort(function (x, y) {
      return String(x.startTime || x.time || x.start || "").localeCompare(String(y.startTime || y.time || y.start || ""));
    })[0];

    var zeilen = [];
    if (naechster) {
      zeilen.push('<li><b>' + esc(a.formatTime(naechster.startTime || naechster.time || naechster.start) || "—") +
        "</b> " + esc(a.itemTitle(naechster, "Termin")) + "</li>");
    }
    (b.tagesziele || []).filter(function (g) { return g && !g.completed; }).slice(0, 2).forEach(function (g) {
      zeilen.push("<li>◎ " + esc(g.title || "") + "</li>");
    });
    if ((b.ueberfaellig || []).length) {
      zeilen.push('<li class="warn">' + (b.ueberfaellig.length) + " überfällig</li>");
    }
    (b.beliefs || []).slice(0, 1).forEach(function (x) {
      zeilen.push("<li>✦ " + esc(x && x.text ? x.text : String(x || "")) + "</li>");
    });
    if (!zeilen.length) zeilen.push("<li>Nichts Dringendes — freier Lauf.</li>");

    // Ohne Daten sagt der Block, WARUM er leer ist. Ein stummer leerer Kasten
    // waere hier das Schlimmste: man haelt ihn fuer kaputt statt fuer leer.
    var leerGrund = (!a.state.user)
      ? "Nicht angemeldet — melde dich an, um deinen Tag zu laden."
      : (!a.state.remoteReady ? "Noch keine Daten geladen." : "");

    return '<button class="sb-briefing" data-action="go" data-route="daily">' +
      '<span class="sb-bf-head">☀ Morgenbriefing</span>' +
      '<span class="sb-bf-nums">' +
        "<span><b>" + (b.meetings || []).length + "</b> Termine</span>" +
        "<span><b>" + (b.faellig || []).length + "</b> fällig</span>" +
        "<span><b>" + routinenFertig + "/" + (b.routinen || []).length + "</b> Routinen</span>" +
        "<span><b>" + zieleFertig + "/" + (b.tagesziele || []).length + "</b> Tagesziele</span>" +
      "</span>" +
      (leerGrund ? '<span class="sb-bf-hint">' + esc(leerGrund) + "</span>"
                 : '<ul class="sb-bf-lines">' + zeilen.join("") + "</ul>") +
      '<span class="sb-bf-more">Vollständiges Daily Briefing öffnen ›</span>' +
      "</button>";
  }

  function render() {
    var a = api();
    var dock = loadDock().map(function (key) { return allApps()[key]; }).filter(Boolean);
    var hour = new Date().getHours();
    var greeting = hour < 12 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";

    return '<div class="springboard" id="springboard">' +
      '<div class="sb-top"><div><div class="sb-greet">' + greeting + ', Laurin.</div>' +
      '<div class="sb-sub">' + esc(a && a.state.user ? "Gleicher Datenstand wie AI Sync und Handy." : "Melde dich an, um deinen Quantus-Tag zu laden.") +
      "</div></div><div class=\"sb-actions\">" +
      '<button class="sb-round' + (dockModus ? " on" : "") + '" data-action="sb-dock-modus" ' +
        'aria-pressed="' + (dockModus ? "true" : "false") + '" ' +
        'title="Dock bearbeiten" aria-label="Dock bearbeiten">▤</button>' +
      '<button class="sb-round" data-action="search" aria-label="Suchen">⌕</button>' +
      '<button class="sb-round" data-action="polaris" aria-label="Polaris">✦</button>' +
      '<button class="sb-round" data-action="new-entity" data-collection="tasks" aria-label="Neue Aufgabe">＋</button>' +
      "</div></div>" +
      (dockModus ? '<div class="sb-dockhint">Dock bearbeiten: Tippe ein Symbol an, um es ins Dock zu legen ' +
        'oder herauszunehmen. Nochmals auf ▤ tippen beendet den Modus.</div>' : "") +
      briefingBlock() +
      widgets() +
      '<div class="sb-pages" id="sbPages">' + PAGES.map(function (page) {
        return '<section class="sb-page"><div class="sb-page-title">' + esc(page.title) + "</div>" +
          '<div class="sb-grid">' + page.apps.map(function (app) { return iconHtml(app, false); }).join("") + "</div></section>";
      }).join("") + "</div>" +
      '<div class="sb-footer">' +
      '<div class="sb-dots" id="sbDots">' + PAGES.map(function (page, index) {
        return '<button class="sb-dot' + (index === 0 ? " on" : "") + '" data-sb-page="' + index +
          '" aria-label="Seite ' + (index + 1) + '"></button>';
      }).join("") + "</div>" +
      '<div class="sb-dock">' + dock.map(function (app) { return iconHtml(app, true); }).join("") + "</div>" +
      "</div></div>";
  }

  /*
   * BEFUND (gemessen, Chromium): ein Tipp von 760 ms oder laenger oeffnete die
   * App NICHT mehr. Er galt als langer Druck, legte das Symbol ins Dock,
   * loeste ein Neuzeichnen aus — das war das Flimmern — und onAction sperrte
   * den folgenden Klick weitere 700 ms. Gemessene Schwelle:
   *     80 ms ✓   300 ms ✓   600 ms ✓   760 ms ✗   900 ms ✗   1100 ms ✗
   * Ein bewusster Fingertipp auf einem Tablet dauert leicht so lang. Damit
   * verschluckte eine VERSTECKTE Geste die Hauptfunktion des Bildschirms.
   *
   * Die Schwelle hochzusetzen haette das Problem nur verschoben. Stattdessen
   * gilt jetzt: EIN TIPP OEFFNET IMMER. Das Dock wird in einem eigenen,
   * sichtbaren Modus umgeraeumt ("Dock bearbeiten"), in dem ein Tipp
   * ausdruecklich etwas anderes tut. Was nicht heimlich passiert, kann auch
   * nichts verschlucken.
   */
  var dockModus = false;

  function toggleDock(key) {
    var list = loadDock();
    var index = list.indexOf(key);
    if (index >= 0) list.splice(index, 1);
    else { if (list.length >= 5) list.pop(); list.unshift(key); }
    saveDock(list);
    var a = api();
    if (a) {
      a.toast(index >= 0 ? "Aus dem Dock entfernt" : "Ins Dock gelegt", key, "ok");
      a.render();
    }
  }

  function mount(route, root) {
    if (route !== "home" || !root) return;
    var pages = root.querySelector("#sbPages");
    var dots = root.querySelectorAll(".sb-dot");
    if (pages && dots.length) {
      var sync = function () {
        var index = Math.round(pages.scrollLeft / Math.max(1, pages.clientWidth));
        dots.forEach(function (dot, i) { dot.classList.toggle("on", i === index); });
      };
      pages.addEventListener("scroll", function () {
        clearTimeout(pages._sbTimer);
        pages._sbTimer = setTimeout(sync, 80);
      }, { passive: true });
      dots.forEach(function (dot) {
        dot.addEventListener("click", function () {
          pages.scrollTo({ left: pages.clientWidth * Number(dot.dataset.sbPage || 0), behavior: "smooth" });
        });
      });
    }
  }

  /*
   * Im Dock-Modus tut ein Tipp auf ein Symbol ausdruecklich etwas anderes:
   * er legt es ins Dock oder holt es heraus. Ausserhalb dieses Modus wird
   * NIE etwas abgefangen — ein Tipp oeffnet immer die App.
   */
  function onAction(action, button) {
    if (action === "sb-dock-modus") {
      dockModus = !dockModus;
      var a0 = api();
      if (a0) a0.render();
      return true;
    }
    if (!dockModus) return false;
    if (action !== "go" || !button.dataset.sbKey) return false;
    toggleDock(button.dataset.sbKey);
    return true;
  }

  (window.__quantusTabletModules = window.__quantusTabletModules || []).push({
    key: "springboard",
    routes: ["home"],
    render: render,
    mount: mount,
    onAction: onAction
  });
})();
