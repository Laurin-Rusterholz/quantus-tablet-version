(function () {
  "use strict";

  // ==========================================================================
  //  Google Kalender — echte Google-Termine im Tablet
  //  --------------------------------------------------------------------
  //  Backend: derselbe Quantus-Proxy wie am Desktop und im Handy, unveraendert.
  //    <aiSyncUrl>/.netlify/functions/gcal-auth  (Status, Login, Logout)
  //    <aiSyncUrl>/.netlify/functions/gcal-api   (authentifizierter Calendar-v3-Proxy)
  //  EIN Google-Konto, EIN serverseitig gespeicherter Token — verbunden wird
  //  geraeteuebergreifend einmal. Das Tablet haelt nie einen eigenen
  //  Client-Secret oder Access-Token (wie mail-app.js fuer Gmail).
  //
  //  Die OAuth-Weiterleitung landet danach auf dem Ursprung von AI Sync (die
  //  einzige bei Google registrierte Redirect-URI), nicht hier. "Verbinden"
  //  oeffnet deshalb ein neues Fenster; beim Zurueckwechseln in dieses Tab
  //  wird der Status automatisch neu geladen — kein Server-Umbau noetig.
  //
  //  Ersetzt den bisherigen generischen "Separat oeffnen"-Platzhalter fuer
  //  die Route "googlecalendar" (FULL_APP_DEFS behaelt Icon/Gruppe fuer die
  //  Navigation; moduleFor() in app.js bevorzugt dieses Modul automatisch).
  // ==========================================================================

  var RANGE_DAYS = 14;
  var PREFS_KEY = "quantus-tablet-gcal-prefs-v1";

  var ui = {
    status: null,
    statusLoading: true,
    calendars: [],
    selected: {},          // { [calId]: true }
    events: [],
    loading: false,
    error: "",
    loadedOnce: false,
    focusBound: false
  };

  function api() { return window.__quantusTablet || null; }
  function esc(value) {
    var a = api();
    return a ? a.esc(value) : String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function rerender() { var a = api(); if (a && a.state.route === "googlecalendar") a.render(); }
  function notify(title, message, tone) { var a = api(); if (a) a.toast(title, message, tone); }
  function baseUrl() { var a = api(); return a ? a.appBaseUrl() : ""; }

  // ── Kalenderauswahl lokal merken (pro Geraet, wie am Desktop/Handy) ────────
  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; }
    catch (error) { return {}; }
  }
  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ selected: Object.keys(ui.selected).filter(function (id) { return ui.selected[id]; }) })); }
    catch (error) { /* Speicher voll — Auswahl ist nur eine Bequemlichkeit */ }
  }

  // ── Backend ─────────────────────────────────────────────────────────────
  async function gcAuth(action) {
    var response = await fetch(baseUrl() + "/.netlify/functions/gcal-auth?action=" + encodeURIComponent(action));
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) { var error = new Error(data.error || ("HTTP " + response.status)); error.status = response.status; throw error; }
    return data;
  }
  async function gcApi(method, path, query, body) {
    var response = await fetch(baseUrl() + "/.netlify/functions/gcal-api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: method, path: path, query: query || null, body: body || null })
    });
    var data = await response.json().catch(function () { return null; });
    if (!response.ok) {
      var error = new Error((data && (data.error || data.message)) || ("HTTP " + response.status));
      error.status = response.status; error.data = data; throw error;
    }
    return data;
  }

  // ── Event-Helfer ────────────────────────────────────────────────────────
  function isAllDay(ev) { return !!(ev.start && ev.start.date && !ev.start.dateTime); }
  function evStartIso(ev) { var s = ev.start || {}; return s.dateTime || (s.date ? s.date + "T00:00:00" : null); }
  function evDay(ev) { var s = ev.start || {}; return s.date || (s.dateTime || "").slice(0, 10); }
  function calById(id) {
    for (var i = 0; i < ui.calendars.length; i++) if (ui.calendars[i].id === id) return ui.calendars[i];
    return null;
  }
  function calWritable(id) { var c = calById(id); return !!(c && (c.accessRole === "owner" || c.accessRole === "writer")); }

  // ── Laden ───────────────────────────────────────────────────────────────
  async function loadStatus() {
    ui.statusLoading = true; rerender();
    try { ui.status = await gcAuth("status"); }
    catch (error) { ui.status = { connected: false, error: error.status === 401 ? "Zugriff nicht autorisiert." : (error.message || null) }; }
    ui.statusLoading = false; rerender();
    if (ui.status && ui.status.connected) loadAll();
  }

  function restoreSelection() {
    var prefs = loadPrefs();
    var ids = Array.isArray(prefs.selected)
      ? prefs.selected.filter(function (id) { return calById(id); })
      : [];
    if (!ids.length) {
      ids = ui.calendars.filter(function (c) { return c.selected || c.primary; }).map(function (c) { return c.id; });
      if (!ids.length && ui.calendars.length) ids = [ui.calendars[0].id];
    }
    ui.selected = {};
    ids.forEach(function (id) { ui.selected[id] = true; });
    savePrefs();
  }

  async function loadEvents() {
    var min = new Date(); min.setHours(0, 0, 0, 0);
    var max = new Date(min.getTime() + RANGE_DAYS * 86400000);
    var ids = Object.keys(ui.selected).filter(function (id) { return ui.selected[id]; });
    var all = [];
    await Promise.all(ids.map(async function (calId) {
      try {
        var res = await gcApi("GET", "/calendars/" + encodeURIComponent(calId) + "/events", {
          timeMin: min.toISOString(), timeMax: max.toISOString(),
          singleEvents: "true", orderBy: "startTime", maxResults: "2500"
        });
        var cal = calById(calId) || {};
        (res.items || []).forEach(function (ev) {
          if (ev.status === "cancelled") return;
          ev._calId = calId; ev._calSummary = cal.summaryOverride || cal.summary || calId; ev._calColor = cal.backgroundColor || "#0a84ff";
          all.push(ev);
        });
      } catch (error) { console.warn("[gcal] Termine laden fehlgeschlagen fuer", calId, error.message); }
    }));
    all.sort(function (a, b) { return (evStartIso(a) || "").localeCompare(evStartIso(b) || ""); });
    ui.events = all;
  }

  async function loadAll() {
    ui.loading = true; ui.error = ""; rerender();
    try {
      var list = await gcApi("GET", "/users/me/calendarList");
      ui.calendars = list.items || [];
      restoreSelection();
      await loadEvents();
    } catch (error) {
      if (error.status === 401 || (error.data && error.data.error === "NOT_CONNECTED")) ui.status = { connected: false };
      else ui.error = error.message || "Fehler beim Laden";
    }
    ui.loading = false; rerender();
  }

  // ── Verbinden/Trennen ───────────────────────────────────────────────────
  function armFocusRecheck() {
    if (ui.focusBound) return;
    ui.focusBound = true;
    var onFocus = function () { loadStatus(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) onFocus(); });
  }
  function connect() {
    armFocusRecheck();
    var url = baseUrl() + "/.netlify/functions/gcal-auth?action=login&return=googlecalendar";
    var win = window.open(url, "_blank");
    if (!win) { notify("Pop-up blockiert", "Bitte in den Browsereinstellungen erlauben.", "error"); return; }
    notify("Google-Anmeldung geoeffnet", "Danach hierher zurueckwechseln.", "ok");
  }
  async function disconnect() {
    if (!confirm("Google trennen? Die Verbindung gilt fuer alle Quantus-Geraete (Kalender und Mail teilen sich dieselbe Anmeldung).")) return;
    try { await gcAuth("logout"); notify("Getrennt", "Google wurde getrennt.", "ok"); ui.status = { connected: false }; ui.events = []; ui.calendars = []; rerender(); }
    catch (error) { notify("Trennen fehlgeschlagen", error.message || String(error), "error"); }
  }

  // ── Erstellen/Bearbeiten ────────────────────────────────────────────────
  function localDateTimeValue(date) {
    var d = date || new Date();
    function pad(n) { return String(n).padStart(2, "0"); }
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function writableCalendarOptions(selectedId) {
    return ui.calendars.filter(function (c) { return c.accessRole === "owner" || c.accessRole === "writer"; })
      .map(function (c) {
        return '<option value="' + esc(c.id) + '" ' + (c.id === selectedId ? "selected" : "") + '>' +
          esc(c.summaryOverride || c.summary || c.id) + (c.primary ? " (primaer)" : "") + '</option>';
      }).join("");
  }

  var editingEvent = null; // Event-Objekt waehrend das Formular offen ist (Loeschen braucht es)

  function eventSheet(existingEv) {
    var a = api(); if (!a) return;
    editingEvent = existingEv || null;
    var isEdit = !!existingEv;
    var allDay = existingEv ? isAllDay(existingEv) : false;
    var now = new Date(); now.setMinutes(0, 0, 0); now.setHours(now.getHours() + 1);
    var later = new Date(now.getTime() + 3600000);
    var startIso = existingEv ? evStartIso(existingEv) : now.toISOString();
    var endIso = existingEv ? ((existingEv.end && (existingEv.end.dateTime || existingEv.end.date)) || startIso) : later.toISOString();
    var writableIds = Object.keys(ui.selected).filter(function (id) { return ui.selected[id] && calWritable(id); });
    var primaryCal = ui.calendars.filter(function (c) { return c.primary; })[0];
    var defaultCal = existingEv ? existingEv._calId : (writableIds[0] || (primaryCal && primaryCal.id) || "");

    a.sheet(isEdit ? "Termin bearbeiten" : "Neuer Termin",
      '<form data-form="gcal-event" data-calid="' + esc(defaultCal) + '"><div class="form-grid">' +
      '<div class="field full"><label>Titel *</label><input name="summary" required value="' + esc((existingEv && existingEv.summary) || "") + '" placeholder="Worum geht es?"></div>' +
      '<div class="field full"><label>Kalender</label><select name="calId" ' + (isEdit ? "disabled" : "") + '>' + writableCalendarOptions(defaultCal) + '</select></div>' +
      '<div class="field full" style="flex-direction:row;align-items:center;gap:10px"><label style="margin:0"><input type="checkbox" name="allDay" data-gcal-allday ' + (allDay ? "checked" : "") + '> Ganztaegig</label></div>' +
      '<div class="field" data-gcal-start><label>Beginn *</label><input name="start" type="' + (allDay ? "date" : "datetime-local") + '" required value="' + (allDay ? String(startIso).slice(0, 10) : localDateTimeValue(new Date(startIso))) + '"></div>' +
      '<div class="field" data-gcal-end><label>Ende *</label><input name="end" type="' + (allDay ? "date" : "datetime-local") + '" required value="' + (allDay ? String(endIso).slice(0, 10) : localDateTimeValue(new Date(endIso))) + '"></div>' +
      '<div class="field full"><label>Ort</label><input name="location" value="' + esc((existingEv && existingEv.location) || "") + '"></div>' +
      '<div class="field full"><label>Beschreibung</label><textarea name="description" rows="3">' + esc((existingEv && existingEv.description) || "") + '</textarea></div>' +
      '</div><div class="sheet-foot">' +
      (isEdit ? '<button class="btn danger" type="button" data-action="gcal-delete">Loeschen</button>' : "") +
      '<button class="btn" type="button" data-action="close-overlay">Abbrechen</button>' +
      '<button class="btn primary" type="submit">Speichern</button></div></form>', "wide");
  }

  // ── Als Notiz speichern ─────────────────────────────────────────────────
  function saveEventAsNote(ev) {
    var a = api();
    if (!a || typeof a.openNoteForm !== "function") return;
    var label = ev.summary || "Termin";
    a.openNoteForm({
      noteClass: "research",
      lockClass: true,
      title: "Notiz zu: " + label,
      tags: [label],
      source: { app: "googlecalendar", entityType: "event", entityId: ev._calId + "::" + ev.id, label: label, route: ev.htmlLink || null }
    });
  }

  // ── Rendering ───────────────────────────────────────────────────────────
  function connectionCard() {
    if (ui.statusLoading) return '<section class="widget span-12"><div class="muted">Verbindungsstatus wird geladen…</div></section>';
    if (!ui.status || !ui.status.connected) {
      return '<section class="widget span-12">' +
        '<div class="widget-head"><span class="widget-icon">31</span><h2>Nicht mit Google verbunden</h2></div>' +
        '<p class="muted">Verbinde dich einmal, um echte Google-Termine hier zu sehen und zu bearbeiten. Gilt geraeteuebergreifend fuer Kalender und Mail.</p>' +
        (ui.status && ui.status.error ? '<p class="muted" style="color:var(--danger,#e5484d)">' + esc(ui.status.error) + '</p>' : "") +
        '<button class="btn primary" data-action="gcal-connect">Mit Google verbinden</button>' +
        '</section>';
    }
    return '<section class="widget span-12" style="display:flex;align-items:center;justify-content:space-between;gap:12px">' +
      '<div><strong>Verbunden</strong> als ' + esc(ui.status.email || "Google-Konto") + '</div>' +
      '<button class="btn" data-action="gcal-disconnect">Trennen</button></section>';
  }

  function calendarPicker() {
    if (!ui.calendars.length) return "";
    return '<section class="widget span-12"><div class="widget-head"><span class="widget-icon">◉</span><h2>Sichtbare Kalender</h2></div>' +
      '<div class="row-actions" style="flex-wrap:wrap">' +
      ui.calendars.map(function (c) {
        var on = !!ui.selected[c.id];
        return '<button type="button" class="chip' + (on ? " accent" : "") + '" data-action="gcal-toggle-cal" data-id="' + esc(c.id) + '">' +
          '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:' + esc(c.backgroundColor || "#0a84ff") + '"></span>' +
          esc(c.summaryOverride || c.summary || c.id) + (c.primary ? " ★" : "") + '</button>';
      }).join("") + '</div></section>';
  }

  function agendaSection() {
    var a = api();
    if (ui.loading) return '<section class="widget span-12"><div class="muted">Termine werden geladen…</div></section>';
    if (ui.error) return '<section class="widget span-12">' + (a ? a.emptyState("⚠", "Fehler beim Laden", ui.error) : esc(ui.error)) + '</section>';
    if (!ui.events.length) return '<section class="widget span-12">' + (a ? a.emptyState("31", "Keine Termine", "Keine Google-Termine in den naechsten " + RANGE_DAYS + " Tagen.") : "Keine Termine.") + '</section>';
    var byDay = {};
    ui.events.forEach(function (ev) { var d = evDay(ev); (byDay[d] = byDay[d] || []).push(ev); });
    var todayKey = new Date(); todayKey.setHours(0, 0, 0, 0);
    todayKey = todayKey.toISOString().slice(0, 10);
    return Object.keys(byDay).sort().map(function (day) {
      var label = new Date(day + "T12:00:00").toLocaleDateString("de-CH", { weekday: "long", day: "2-digit", month: "long" });
      return '<section class="widget span-6"><div class="widget-head"><span class="widget-icon">◉</span><h2>' + esc(label) + (day === todayKey ? " · Heute" : "") + '</h2></div><div class="item-list">' +
        byDay[day].map(function (ev) {
          var time = isAllDay(ev) ? "Ganztaegig" : (a ? a.formatTime(evStartIso(ev)) : "");
          return '<div class="list-item" style="border-left:3px solid ' + esc(ev._calColor) + ';padding-left:8px">' +
            '<div class="item-main"><div class="item-title" data-action="gcal-open" data-cal="' + esc(ev._calId) + '" data-id="' + esc(ev.id) + '" style="cursor:pointer">' + esc(ev.summary || "(ohne Titel)") + '</div>' +
            '<div class="item-meta">' + esc(time) + (ev.location ? " · " + esc(ev.location) : "") + " · " + esc(ev._calSummary) + '</div></div>' +
            '<button class="icon-action" data-action="gcal-note" data-cal="' + esc(ev._calId) + '" data-id="' + esc(ev.id) + '" aria-label="Als Notiz speichern">＋✎</button>' +
            '</div>';
        }).join("") + '</div></section>';
    }).join("");
  }

  function render(route) {
    var a = api();
    var head = a ? a.viewHeader("Google Kalender",
      ui.status && ui.status.connected ? (ui.events.length + " Termine · naechste " + RANGE_DAYS + " Tage") : "Nicht verbunden",
      ui.status && ui.status.connected ? '<button class="btn primary" data-action="gcal-new">＋ Termin</button>' : "") : "";
    return '<div class="view">' + head +
      '<div class="dashboard-grid">' + connectionCard() +
      (ui.status && ui.status.connected ? calendarPicker() + agendaSection() : "") +
      '</div></div>';
  }

  function mount(route, root) {
    if (!root || route !== "googlecalendar") return;
    if (!ui.loadedOnce) { ui.loadedOnce = true; loadStatus(); }
  }

  // ── Aktionen ────────────────────────────────────────────────────────────
  async function onAction(action, button) {
    if (action === "gcal-connect") { connect(); return true; }
    if (action === "gcal-disconnect") { disconnect(); return true; }
    if (action === "gcal-toggle-cal") {
      var id = button.dataset.id;
      ui.selected[id] = !ui.selected[id];
      savePrefs();
      loadEvents().then(rerender);
      return true;
    }
    if (action === "gcal-new") {
      var writable = ui.calendars.some(function (c) { return c.accessRole === "owner" || c.accessRole === "writer"; });
      if (!writable) { notify("Kein Schreibzugriff", "Kein beschreibbarer Kalender verfuegbar.", "error"); return true; }
      eventSheet(null);
      return true;
    }
    if (action === "gcal-open") {
      var ev = ui.events.find(function (e) { return e.id === button.dataset.id && e._calId === button.dataset.cal; });
      if (ev) eventSheet(ev);
      return true;
    }
    if (action === "gcal-note") {
      var noteEv = ui.events.find(function (e) { return e.id === button.dataset.id && e._calId === button.dataset.cal; });
      if (noteEv) saveEventAsNote(noteEv);
      return true;
    }
    if (action === "gcal-delete") {
      if (!editingEvent) return true;
      if (!confirm('"' + (editingEvent.summary || "Termin") + '" bei Google Kalender loeschen?')) return true;
      var a = api();
      try {
        await gcApi("DELETE", "/calendars/" + encodeURIComponent(editingEvent._calId) + "/events/" + encodeURIComponent(editingEvent.id), { sendUpdates: "all" });
        if (a) a.closeOverlay();
        notify("Geloescht", "Termin wurde geloescht.", "ok");
        await loadEvents(); rerender();
      } catch (error) { notify("Loeschen fehlgeschlagen", error.message || String(error), "error"); }
      return true;
    }
    return false;
  }

  async function onSubmit(type, form, data) {
    if (type !== "gcal-event") return false;
    var a = api();
    var summary = String(data.get("summary") || "").trim();
    if (!summary) { notify("Titel fehlt", "Bitte einen Titel eingeben.", "error"); return true; }
    var isEdit = !!editingEvent;
    var calId = isEdit ? editingEvent._calId : String(data.get("calId") || form.dataset.calid || "");
    if (!calId) { notify("Kein Kalender", "Kein beschreibbarer Kalender verfuegbar.", "error"); return true; }
    var allDayOn = !!data.get("allDay");
    var startRaw = String(data.get("start") || "");
    var endRaw = String(data.get("end") || "");
    if (!startRaw || !endRaw) { notify("Zeit fehlt", "Beginn und Ende sind erforderlich.", "error"); return true; }
    var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    var start, end;
    if (allDayOn) {
      start = { date: startRaw };
      var endDate = new Date(endRaw + "T00:00:00");
      if (endDate.getTime() <= new Date(startRaw + "T00:00:00").getTime()) endDate.setDate(endDate.getDate() + 1);
      end = { date: endDate.toISOString().slice(0, 10) };
    } else {
      var startDate = new Date(startRaw); endDate = new Date(endRaw);
      if (isNaN(startDate) || isNaN(endDate)) { notify("Ungueltige Zeit", "Bitte gueltige Zeitangaben waehlen.", "error"); return true; }
      if (endDate.getTime() <= startDate.getTime()) { notify("Zeitfehler", "Das Ende muss nach dem Beginn liegen.", "error"); return true; }
      start = { dateTime: startDate.toISOString(), timeZone: tz };
      end = { dateTime: endDate.toISOString(), timeZone: tz };
    }
    var resource = {
      summary: summary, start: start, end: end,
      location: String(data.get("location") || "").trim() || undefined,
      description: String(data.get("description") || "").trim() || undefined
    };
    try {
      if (isEdit) await gcApi("PATCH", "/calendars/" + encodeURIComponent(calId) + "/events/" + encodeURIComponent(editingEvent.id), { sendUpdates: "none" }, resource);
      else await gcApi("POST", "/calendars/" + encodeURIComponent(calId) + "/events", { sendUpdates: "none" }, resource);
      if (a) a.closeOverlay();
      notify(isEdit ? "Aktualisiert" : "Erstellt", summary, "ok");
      editingEvent = null;
      await loadEvents(); rerender();
    } catch (error) { notify("Speichern fehlgeschlagen", error.message || String(error), "error"); }
    return true;
  }

  (window.__quantusTabletModules = window.__quantusTabletModules || []).push({
    key: "googlecalendar",
    routes: ["googlecalendar"],
    render: render,
    mount: mount,
    onAction: onAction,
    onSubmit: onSubmit
  });
})();
