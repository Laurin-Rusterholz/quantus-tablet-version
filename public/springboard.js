(function () {
  "use strict";

  // ==========================================================================
  //  Homebildschirm — Springboard im Stil des Apple-Homebildschirms,
  //  durchgehend im Quantus-Design (gleiche Farbtoken wie AI Sync).
  //  Widget-Reihe, seitlich blaetterbare Seiten mit App-Symbolen, Seitenpunkte
  //  und ein Dock. Der bisherige Karten-Ueberblick bleibt als Route
  //  "dashboard" erhalten und ist als eigenes Symbol verlinkt.
  // ==========================================================================

  // v1 hielt nur das Dock. v2 haelt die GANZE Anordnung: welche Seite welche
  // Symbole traegt, in welcher Reihenfolge, und das Dock. Der alte Schluessel
  // wird beim ersten Start noch gelesen, damit ein bestehendes Dock nicht
  // verloren geht.
  var DOCK_KEY = "quantus-tablet-springboard-v1";
  var LAYOUT_KEY = "quantus-tablet-springboard-v2";
  var DOCK_MAX = 6;

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
    map.sticky = { key: "sticky", label: "Sticky Boards", icon: "▦", tone: "sand" };
    map.polaris = { key: "polaris", label: "Polaris", icon: "✦", tone: "green" };
    map.home = { key: "home", label: "Home", icon: "⌂", tone: "violet" };
    return map;
  }

  // ── Anordnung ───────────────────────────────────────────────────────────
  // Die Anordnung ist der einzige Ort, an dem steht, was wo liegt. Gerendert
  // wird immer aus ihr — PAGES liefert nur noch die Voreinstellung und die
  // Beschriftung der Seiten.
  function defaultLayout() {
    return {
      pages: PAGES.map(function (page) { return { title: page.title, apps: page.apps.map(function (app) { return app.key; }) }; }),
      dock: DEFAULT_DOCK.slice()
    };
  }

  function loadLayout() {
    var layout = null;
    try { layout = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "null"); } catch (error) {}
    if (!layout || !Array.isArray(layout.pages) || !layout.pages.length) {
      layout = defaultLayout();
      // Ein bereits eingerichtetes Dock aus v1 uebernehmen.
      try {
        var old = JSON.parse(localStorage.getItem(DOCK_KEY) || "null");
        if (old && Array.isArray(old.dock) && old.dock.length) layout.dock = old.dock.slice(0, DOCK_MAX);
      } catch (error) {}
    }
    return normaliseLayout(layout);
  }

  /*
   * Die gespeicherte Anordnung und der Katalog der Apps laufen auseinander:
   * eine neue App kommt dazu, eine alte faellt weg. Ohne Abgleich waere eine
   * neue App auf dem Homebildschirm unsichtbar — genau der Fehler, den man
   * erst merkt, wenn man sie sucht.
   *
   * Regel: Unbekannte Schluessel fliegen raus, fehlende werden hinten
   * angehaengt, und ein Symbol liegt nie doppelt.
   */
  function normaliseLayout(input) {
    var catalog = allApps();
    var seen = {};
    var layout = { pages: [], dock: [] };

    /*
     * Das Dock zuerst — und ein Symbol liegt danach an GENAU EINEM Ort.
     *
     * Vorher wurden Seiten und Dock unabhaengig voneinander gefuellt. Weil
     * das Standard-Dock (Mail, Aufgaben, Polaris, Canvas) Symbole enthaelt,
     * die auch auf einer Seite stehen, war „Aufgaben" zweimal auf dem
     * Homebildschirm zu sehen. Beim Verschieben wurde daraus ein echtes
     * Problem: place() nimmt ein Symbol ueberall heraus und legt es einmal
     * ab — die zweite Kopie waere kommentarlos verschwunden.
     */
    layout.dock = (Array.isArray(input.dock) ? input.dock : []).filter(function (key) {
      if (!catalog[key] || seen[key]) return false;
      seen[key] = true;
      return true;
    }).slice(0, DOCK_MAX);

    (Array.isArray(input.pages) ? input.pages : []).forEach(function (page, index) {
      var apps = (Array.isArray(page && page.apps) ? page.apps : []).filter(function (key) {
        if (!catalog[key] || seen[key]) return false;
        seen[key] = true;
        return true;
      });
      layout.pages.push({ title: (page && page.title) || (PAGES[index] && PAGES[index].title) || "Seite " + (index + 1), apps: apps });
    });
    if (!layout.pages.length) layout.pages = defaultLayout().pages;

    // Fehlende Apps hinten anhaengen — jede App bleibt erreichbar.
    Object.keys(catalog).forEach(function (key) {
      if (seen[key] || key === "home") return;
      layout.pages[layout.pages.length - 1].apps.push(key);
      seen[key] = true;
    });
    return layout;
  }

  function saveLayout(layout) {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch (error) {}
  }

  function loadDock() { return loadLayout().dock; }

  // Ein Symbol aus der Anordnung herausnehmen (Seiten und Dock).
  function pluck(layout, key) {
    layout.pages.forEach(function (page) {
      var index = page.apps.indexOf(key);
      if (index >= 0) page.apps.splice(index, 1);
    });
    var dockIndex = layout.dock.indexOf(key);
    if (dockIndex >= 0) layout.dock.splice(dockIndex, 1);
  }

  // Ein Symbol vor ein anderes legen — oder ans Ende einer Seite / ins Dock.
  function place(layout, key, target) {
    if (key === target.key) return false;
    pluck(layout, key);
    if (target.zone === "dock") {
      var at = target.key ? layout.dock.indexOf(target.key) : layout.dock.length;
      if (at < 0) at = layout.dock.length;
      if (layout.dock.length >= DOCK_MAX) {
        // Das Dock ist voll: das letzte Symbol weicht auf die erste Seite aus.
        // pluck() davor, sonst laege es kurz an zwei Orten.
        var pushedOut = layout.dock[layout.dock.length - 1];
        if (pushedOut) {
          pluck(layout, pushedOut);
          layout.pages[0].apps.push(pushedOut);
        }
        if (at > layout.dock.length) at = layout.dock.length;
      }
      layout.dock.splice(at, 0, key);
      return true;
    }
    var page = layout.pages[target.page];
    if (!page) return false;
    var index = target.key ? page.apps.indexOf(target.key) : page.apps.length;
    if (index < 0) index = page.apps.length;
    page.apps.splice(index, 0, key);
    return true;
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

  function iconHtml(app, zone, pageIndex) {
    var badge = badgeFor(app.key);
    var inDock = zone === "dock";
    var picked = arrangeMode && aufgehoben === app.key;
    return '<button class="sb-app' + (inDock ? " in-dock" : "") + (arrangeMode ? " arranging" : "") +
      (picked ? " picked" : "") + '" data-action="go" data-route="' + esc(app.key) +
      '" data-sb-key="' + esc(app.key) + '" data-sb-zone="' + esc(zone) +
      '" data-sb-page="' + esc(pageIndex == null ? "" : pageIndex) + '" title="' + esc(app.label) + '">' +
      '<span class="sb-icon tone-' + esc(app.tone || "violet") + '"><span class="sb-glyph">' + esc(app.icon) + "</span>" +
      (badge > 0 && !arrangeMode ? '<span class="sb-badge">' + (badge > 99 ? "99+" : badge) + "</span>" : "") +
      (arrangeMode && inDock ? '<span class="sb-remove" data-sb-remove="' + esc(app.key) + '" aria-hidden="true">−</span>' : "") +
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
    var layout = loadLayout();
    var catalog = allApps();
    var dock = layout.dock.map(function (key) { return catalog[key]; }).filter(Boolean);
    var hour = new Date().getHours();
    var greeting = hour < 12 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";
    var picked = aufgehoben ? catalog[aufgehoben] : null;

    return '<div class="springboard' + (arrangeMode ? " arranging" : "") + '" id="springboard">' +
      '<div class="sb-top"><div><div class="sb-greet">' + greeting + ', Laurin.</div>' +
      '<div class="sb-sub">' + esc(a && a.state.user ? "Gleicher Datenstand wie AI Sync und Handy." : "Melde dich an, um deinen Quantus-Tag zu laden.") +
      "</div></div><div class=\"sb-actions\">" +
      '<button class="sb-round' + (arrangeMode ? " on" : "") + '" data-action="sb-arrange" ' +
        'aria-pressed="' + (arrangeMode ? "true" : "false") + '" ' +
        'title="Homebildschirm anordnen" aria-label="Homebildschirm anordnen">▤</button>' +
      '<button class="sb-round" data-action="search" aria-label="Suchen">⌕</button>' +
      '<button class="sb-round" data-action="polaris" aria-label="Polaris">✦</button>' +
      '<button class="sb-round" data-action="new-entity" data-collection="tasks" aria-label="Neue Aufgabe">＋</button>' +
      "</div></div>" +
      (arrangeMode
        ? '<div class="sb-dockhint">' +
          '<strong>Anordnen.</strong> ' +
          (picked
            ? 'Aufgehoben: <b>' + esc(picked.label) + '</b>. Tippe das Ziel an — ein anderes Symbol, eine freie ' +
              'Flaeche der Seite oder das Dock. Nochmals auf dasselbe Symbol tippen legt es zurueck.'
            : 'Tippe ein Symbol an, um es aufzuheben — oder zieh es direkt an seinen neuen Platz. ' +
              'Seitlich wischen wechselt die Seite.') +
          '<span class="sb-dockhint-actions">' +
          (picked ? '<button class="btn small-btn" data-action="sb-drop-cancel">Ablegen abbrechen</button>' : "") +
          '<button class="btn small-btn" data-action="sb-reset">Zuruecksetzen</button>' +
          '<button class="btn primary small-btn" data-action="sb-arrange">Fertig</button>' +
          "</span></div>"
        : "") +
      briefingBlock() +
      widgets() +
      '<div class="sb-pages" id="sbPages">' + layout.pages.map(function (page, pageIndex) {
        return '<section class="sb-page"><div class="sb-page-title">' + esc(page.title) + "</div>" +
          '<div class="sb-grid" data-sb-zone="page" data-sb-page="' + pageIndex + '">' +
          page.apps.map(function (key) {
            var app = catalog[key];
            return app ? iconHtml(app, "page", pageIndex) : "";
          }).join("") +
          (arrangeMode ? '<div class="sb-drop-end" data-sb-zone="page" data-sb-page="' + pageIndex +
            '" aria-hidden="true">＋</div>' : "") +
          "</div></section>";
      }).join("") + "</div>" +
      '<div class="sb-footer">' +
      '<div class="sb-dots" id="sbDots">' + layout.pages.map(function (page, index) {
        return '<button class="sb-dot' + (index === 0 ? " on" : "") + '" data-sb-page="' + index +
          '" aria-label="Seite ' + (index + 1) + '"></button>';
      }).join("") + "</div>" +
      '<div class="sb-dock" data-sb-zone="dock">' + dock.map(function (app) { return iconHtml(app, "dock", null); }).join("") +
        (arrangeMode && dock.length < DOCK_MAX
          ? '<div class="sb-drop-end" data-sb-zone="dock" aria-hidden="true">＋</div>' : "") +
      "</div></div></div>";
  }

  /*
   * ANORDNEN.
   *
   * BEFUND (gemessen, Chromium): frueher raeumte ein LANGER DRUCK das Dock um.
   * Ein Tipp ab 760 ms galt als langer Druck und oeffnete die App nicht mehr:
   *     80 ms ✓   300 ms ✓   600 ms ✓   760 ms ✗   900 ms ✗   1100 ms ✗
   * Ein bewusster Fingertipp auf einem Tablet dauert leicht so lang — eine
   * versteckte Geste verschluckte damit die Hauptfunktion des Bildschirms.
   *
   * Daran aendert sich nichts: EIN TIPP OEFFNET IMMER. Umgeraeumt wird nur in
   * einem sichtbaren Modus, in dem ein Tipp ausdruecklich etwas anderes tut.
   *
   * Im Anordnen-Modus gibt es zwei Wege, und beide fuehren zum selben Ziel:
   *   1. Aufheben und ablegen — ein Tipp hebt auf, der naechste legt ab.
   *      Das funktioniert mit Finger, Stift und Maus gleichermassen und
   *      braucht keine ruhige Hand.
   *   2. Ziehen — fuer alle, die es gewohnt sind.
   * Die Zeiger-Handler fuer das Ziehen haengen NUR waehrend des Modus am
   * Dokument und werden beim Verlassen wieder abgemeldet. Ausserhalb des
   * Modus liegt kein einziger Zeiger-Handler auf den Symbolen — sonst waere
   * der alte Fehler mit einem neuen Namen zurueck.
   */
  var arrangeMode = false;
  var aufgehoben = null;   // Schluessel des aufgehobenen Symbols

  function setArrange(on) {
    if (arrangeMode === on) return;
    arrangeMode = on;
    aufgehoben = null;
    if (on) startDragging(); else stopDragging();
    var a = api();
    if (a) a.render();
  }

  // Wohin ein Tipp oder ein Zug zeigt: Zone (Seite oder Dock), Seitennummer
  // und — wenn direkt auf einem Symbol — vor welches Symbol.
  function zoneOf(node) {
    if (!node || !node.closest) return null;
    var icon = node.closest(".sb-app");
    if (icon && icon.dataset.sbZone) {
      return {
        zone: icon.dataset.sbZone,
        page: Number(icon.dataset.sbPage || 0),
        key: icon.dataset.sbKey
      };
    }
    var zone = node.closest("[data-sb-zone]");
    if (!zone) return null;
    return { zone: zone.dataset.sbZone, page: Number(zone.dataset.sbPage || 0), key: null };
  }

  function moveTo(key, target) {
    if (!key || !target) return false;
    var layout = loadLayout();
    if (!place(layout, key, target)) return false;
    saveLayout(layout);
    return true;
  }

  function resetLayout() {
    try { localStorage.removeItem(LAYOUT_KEY); } catch (error) {}
    try { localStorage.removeItem(DOCK_KEY); } catch (error) {}
    aufgehoben = null;
    var a = api();
    if (a) { a.toast("Zurueckgesetzt", "Der Homebildschirm steht wieder wie am Anfang.", "ok"); a.render(); }
  }

  // ── Ziehen ──────────────────────────────────────────────────────────────
  var drag = null;

  function onPointerDown(event) {
    /*
     * BEFUND (gemessen, Chromium): nach einem Zug ins Dock zeichnete das
     * Ablegen neu — die angetippte Kachel war damit aus dem Dokument
     * verschwunden, und Chromium schickte den erwarteten Streuklick gar
     * nicht mehr. Der Faenger blieb bis zu 400 ms scharf und verschluckte
     * dann den NAECHSTEN echten Klick: wer nach dem Ziehen zuegig auf
     * „Fertig" tippte, sah gar nichts passieren.
     *
     * Jede neue Beruehrung meldet den Faenger deshalb sofort ab. Der
     * Streuklick nach einem Zug hat kein eigenes pointerdown — er ist der
     * einzige, den es noch trifft. Die Zeitschranke bleibt nur als
     * Notbremse.
     */
    releaseSwallow();
    if (!arrangeMode || event.button > 0) return;
    var icon = event.target.closest && event.target.closest(".sb-app");
    if (!icon || !icon.dataset.sbKey) return;
    drag = {
      key: icon.dataset.sbKey,
      icon: icon,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      ghost: null
    };
  }

  function onPointerMove(event) {
    if (!drag) return;
    var dx = event.clientX - drag.startX;
    var dy = event.clientY - drag.startY;
    // Erst ab 8 px gilt es als Ziehen. Darunter ist es ein Tipp, und der
    // hebt auf oder legt ab — sonst wuerde ein leichtes Zittern das
    // Aufheben verschlucken.
    if (!drag.moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.ghost = drag.icon.cloneNode(true);
      drag.ghost.className = "sb-ghost";
      document.body.appendChild(drag.ghost);
      drag.icon.classList.add("dragging");
    }
    event.preventDefault();
    drag.ghost.style.left = event.clientX + "px";
    drag.ghost.style.top = event.clientY + "px";
    document.querySelectorAll(".sb-app.drop-target").forEach(function (node) { node.classList.remove("drop-target"); });
    if (drag.ghost) drag.ghost.style.visibility = "hidden";
    var under = document.elementFromPoint(event.clientX, event.clientY);
    if (drag.ghost) drag.ghost.style.visibility = "";
    var overIcon = under && under.closest ? under.closest(".sb-app") : null;
    if (overIcon && overIcon !== drag.icon) overIcon.classList.add("drop-target");
  }

  function onPointerUp(event) {
    if (!drag) return;
    var current = drag;
    drag = null;
    if (current.ghost) {
      current.ghost.style.visibility = "hidden";
      var under = document.elementFromPoint(event.clientX, event.clientY);
      current.ghost.remove();
      current.icon.classList.remove("dragging");
      var target = zoneOf(under);
      if (current.moved) {
        // Nach einem Zug folgt noch ein click auf dasselbe Symbol. Ohne
        // Gegenmassnahme wuerde er das gerade abgelegte Symbol sofort wieder
        // aufheben — der Zug saehe aus, als haette er nicht funktioniert.
        // Geschluckt wird GENAU EIN Klick, und nur direkt nach einem Zug.
        swallowNextClick();
        if (target && moveTo(current.key, target)) {
          aufgehoben = null;
          var a = api();
          if (a) a.render();
        }
      }
      return;
    }
    // Nicht gezogen: der Klick-Handler uebernimmt (aufheben oder ablegen).
  }

  var swallowTimer = null;
  function swallowOnce(event) {
    event.stopPropagation();
    event.preventDefault();
    releaseSwallow();
  }
  function releaseSwallow() {
    document.removeEventListener("click", swallowOnce, true);
    if (swallowTimer) { clearTimeout(swallowTimer); swallowTimer = null; }
  }
  function swallowNextClick() {
    releaseSwallow();
    document.addEventListener("click", swallowOnce, true);
    // Kommt kein Klick (etwa nach einem Stift-Zug), wird der Faenger nach
    // einem Wimpernschlag wieder abgemeldet — er darf nie liegen bleiben.
    swallowTimer = setTimeout(releaseSwallow, 400);
  }

  function onPointerCancel() {
    if (!drag) return;
    if (drag.ghost) drag.ghost.remove();
    drag.icon.classList.remove("dragging");
    drag = null;
  }

  function startDragging() {
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerCancel, true);
  }

  function stopDragging() {
    onPointerCancel();
    releaseSwallow();
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp, true);
    document.removeEventListener("pointercancel", onPointerCancel, true);
  }

  /*
   * BEFUND (gemessen, Chromium): der Anordnen-Modus blieb beim Wechsel in
   * eine andere Ansicht stehen — samt seiner Zeiger-Handler am Dokument.
   *
   * Die Aufraeumung stand in mount(). Das sah richtig aus und lief nie:
   * app.js ruft mount() NUR auf dem Modul, dem die aktuelle Route gehoert
   * (`moduleFor(state.route)`). Der Homebildschirm besitzt nur "home" —
   * beim Verlassen erfaehrt er also gar nichts davon. Genau die Klasse von
   * Fehler, vor der CLAUDE.md unter „Zustandsreste" warnt: registriert
   * wird beim Betreten, abgemeldet wird nie.
   *
   * Der Modus haengt sich deshalb selbst an die Route. Das ist kein
   * Zeiger-Handler auf den Symbolen — die Regel „ein Tipp oeffnet immer"
   * bleibt unberuehrt.
   */
  function endeWennNichtHome() {
    var route = (location.hash || "#/home").replace(/^#\/?/, "").split("?")[0];
    if (route === "home" || !arrangeMode) return;
    arrangeMode = false;
    aufgehoben = null;
    stopDragging();
  }
  window.addEventListener("hashchange", endeWennNichtHome);

  function mount(route, root) {
    if (route !== "home") {
      if (arrangeMode) { arrangeMode = false; aufgehoben = null; stopDragging(); }
      return;
    }
    if (!root) return;
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
   * Im Anordnen-Modus tut ein Tipp auf ein Symbol ausdruecklich etwas
   * anderes: er hebt es auf oder legt es ab. Ausserhalb dieses Modus wird
   * NIE etwas abgefangen — ein Tipp oeffnet immer die App.
   */
  function onAction(action, button, event) {
    if (action === "sb-arrange") { setArrange(!arrangeMode); return true; }
    if (action === "sb-reset") { resetLayout(); return true; }
    if (action === "sb-drop-cancel") {
      aufgehoben = null;
      var a0 = api();
      if (a0) a0.render();
      return true;
    }
    if (!arrangeMode) return false;
    if (action !== "go" || !button.dataset.sbKey) return false;

    var a = api();
    var key = button.dataset.sbKey;

    // Das Minuszeichen auf einem Dock-Symbol nimmt es aus dem Dock.
    if (event && event.target && event.target.closest && event.target.closest("[data-sb-remove]")) {
      var layout = loadLayout();
      var index = layout.dock.indexOf(key);
      if (index >= 0) {
        layout.dock.splice(index, 1);
        layout.pages[0].apps.push(key);
        saveLayout(layout);
        if (a) { a.toast("Aus dem Dock genommen", allApps()[key] ? allApps()[key].label : key, "ok"); a.render(); }
      }
      return true;
    }

    if (!aufgehoben) {
      aufgehoben = key;
      if (a) a.render();
      return true;
    }
    if (aufgehoben === key) { aufgehoben = null; if (a) a.render(); return true; }
    if (moveTo(aufgehoben, zoneOf(button))) {
      aufgehoben = null;
      if (a) a.render();
    }
    return true;
  }

  // Ablegen auf einer freien Flaeche — Seitenende oder Dock.
  document.addEventListener("click", function (event) {
    if (!arrangeMode || !aufgehoben) return;
    var end = event.target.closest && event.target.closest(".sb-drop-end");
    if (!end) return;
    if (moveTo(aufgehoben, { zone: end.dataset.sbZone, page: Number(end.dataset.sbPage || 0), key: null })) {
      aufgehoben = null;
      var a = api();
      if (a) a.render();
    }
  });

  // Der App-Bildschirm ("Alle Apps") startet das Anordnen von aussen.
  window.QuantusTabletSpringboard = {
    startArrange: function () { setArrange(true); },
    stopArrange: function () { setArrange(false); },
    layout: loadLayout,
    reset: resetLayout
  };

  (window.__quantusTabletModules = window.__quantusTabletModules || []).push({
    key: "springboard",
    routes: ["home"],
    render: render,
    mount: mount,
    onAction: onAction
  });
})();
