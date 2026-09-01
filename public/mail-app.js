(function () {
  "use strict";

  // ==========================================================================
  //  Mail — eigenstaendiges Mail-Programm der Tablet-App
  //  --------------------------------------------------------------------
  //  Zweispaltig (Ordnerliste + Nachricht), Suche, Lesen, Antworten,
  //  Weiterleiten, Verfassen, Gelesen/Markiert, Archiv und Papierkorb.
  //  Backend: der bestehende Quantus-Proxy der AI-Sync-App
  //  (<aiSyncUrl>/.netlify/functions/gmail-api) — kein neuer Dienst, kein
  //  Token im Tablet. Senden und Loeschen nur mit Bestaetigung.
  // ==========================================================================

  var FOLDERS = [
    { key: "inbox", label: "Posteingang", icon: "▼", q: "in:inbox" },
    { key: "unread", label: "Ungelesen", icon: "●", q: "is:unread in:inbox" },
    { key: "starred", label: "Markiert", icon: "★", q: "is:starred" },
    { key: "sent", label: "Gesendet", icon: "▲", q: "in:sent" },
    { key: "archive", label: "Archiv", icon: "▣", q: "-in:inbox -in:trash -in:sent" },
    { key: "trash", label: "Papierkorb", icon: "⌫", q: "in:trash" }
  ];

  var CACHE_KEY = "quantus-tablet-mail-v1";
  var PAGE_SIZE = 30;

  var ui = {
    folder: "inbox",
    search: "",
    list: [],
    openId: null,
    body: null,
    loading: false,
    bodyLoading: false,
    error: "",
    loadedOnce: false
  };

  // Zuletzt geladene VacationSettings (users.settings.getVacation) — nur fuer
  // die Anzeige "aktiv" im Kopf, die Wahrheit liegt bei Gmail.
  var vacation = null;

  function api() { return window.__quantusTablet || null; }
  function esc(value) {
    var a = api();
    return a ? a.esc(value) : String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function rerender() { var a = api(); if (a && a.state.route === "mail") a.render(); }
  function notify(title, message, tone) { var a = api(); if (a) a.toast(title, message, tone); }

  function cacheKey() { return ui.search ? "search" : ui.folder; }
  function loadCache() {
    try {
      var all = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
      return Array.isArray(all[cacheKey()]) ? all[cacheKey()] : null;
    } catch (error) { return null; }
  }
  function saveCache(list) {
    try {
      var all = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
      all[cacheKey()] = list.slice(0, 60);
      localStorage.setItem(CACHE_KEY, JSON.stringify(all));
    } catch (error) { /* Speicher voll — der Cache ist nur ein Beschleuniger */ }
  }

  // ── Backend ─────────────────────────────────────────────────────────────
  async function rpc(method, path, query, body) {
    var a = api();
    var base = a ? a.appBaseUrl() : "";
    var response = await fetch(base + "/.netlify/functions/gmail-api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: method, path: path, query: query, body: body })
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || data.message || ("HTTP " + response.status));
    return data;
  }

  function headerOf(headers, name) {
    var hit = (headers || []).find(function (entry) {
      return String(entry.name).toLowerCase() === name.toLowerCase();
    });
    return hit ? hit.value : "";
  }

  function parseAddress(value) {
    var raw = String(value || "");
    var match = /^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/.exec(raw);
    if (match) return { name: match[1].trim() || match[2].trim(), email: match[2].trim() };
    return { name: raw.trim(), email: raw.trim() };
  }

  function toSummary(message) {
    var headers = message.payload && message.payload.headers;
    var from = parseAddress(headerOf(headers, "From"));
    var labels = message.labelIds || [];
    return {
      id: message.id,
      threadId: message.threadId,
      fromName: from.name,
      fromEmail: from.email,
      toEmail: parseAddress(headerOf(headers, "To")).email,
      subject: headerOf(headers, "Subject") || "(kein Betreff)",
      date: headerOf(headers, "Date") || "",
      ts: Number(message.internalDate || 0) || Date.parse(headerOf(headers, "Date") || "") || 0,
      snippet: message.snippet || "",
      unread: labels.indexOf("UNREAD") >= 0,
      starred: labels.indexOf("STARRED") >= 0
    };
  }

  async function fetchList() {
    var folder = FOLDERS.find(function (entry) { return entry.key === ui.folder; }) || FOLDERS[0];
    var query = ui.search || folder.q;
    var list = await rpc("GET", "/users/me/messages", { maxResults: PAGE_SIZE, q: query });
    var ids = (list.messages || []).slice(0, PAGE_SIZE);
    var results = await Promise.all(ids.map(function (entry) {
      return rpc("GET", "/users/me/messages/" + encodeURIComponent(entry.id), {
        format: "metadata", metadataHeaders: ["From", "To", "Subject", "Date"]
      }).then(toSummary).catch(function () { return null; });
    }));
    return results.filter(Boolean).sort(function (x, y) { return y.ts - x.ts; });
  }

  function decodeBody(data) {
    try {
      var base64 = String(data || "").replace(/-/g, "+").replace(/_/g, "/");
      var binary = atob(base64);
      var bytes = Uint8Array.from(binary, function (char) { return char.charCodeAt(0); });
      return new TextDecoder("utf-8").decode(bytes);
    } catch (error) { return ""; }
  }

  // Nur Text anzeigen: fremdes HTML wird entschaerft, nie eingebettet.
  function extractBody(payload) {
    var out = { text: "", html: "", attachments: [] };
    var walk = function (part) {
      if (!part) return;
      var mime = part.mimeType || "";
      if (part.filename && part.body && part.body.attachmentId) {
        out.attachments.push({ name: part.filename, size: part.body.size || 0 });
      } else if (mime === "text/plain" && part.body && part.body.data && !out.text) {
        out.text = decodeBody(part.body.data);
      } else if (mime === "text/html" && part.body && part.body.data && !out.html) {
        out.html = decodeBody(part.body.data);
      }
      (part.parts || []).forEach(walk);
    };
    walk(payload);
    return out;
  }

  function htmlToText(html) {
    return String(html || "")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // ── Anzeige ─────────────────────────────────────────────────────────────
  function initials(name) {
    var parts = String(name || "?").trim().split(/\s+/).slice(0, 2);
    return parts.map(function (word) { return word[0] || ""; }).join("").toUpperCase() || "?";
  }

  function tone(email) {
    var tones = ["violet", "blue", "green", "sand", "red", "pink"];
    var sum = 0;
    String(email || "").split("").forEach(function (char) { sum += char.charCodeAt(0); });
    return tones[sum % tones.length];
  }

  function when(item) {
    if (!item.ts) return "";
    var a = api();
    var date = new Date(item.ts);
    var sameDay = date.toDateString() === new Date().toDateString();
    return sameDay ? (a ? a.formatTime(date.toISOString()) : "") : (a ? a.formatDate(date.toISOString()) : "");
  }

  function rowHtml(item) {
    return '<div class="mail-row' + (item.unread ? " unread" : "") + (ui.openId === item.id ? " active" : "") +
      '" data-action="mail-open" data-id="' + esc(item.id) + '">' +
      '<span class="mail-avatar tone-' + tone(item.fromEmail) + '">' + esc(initials(item.fromName || item.fromEmail)) + "</span>" +
      '<div class="mail-row-main"><div class="mail-row-top">' +
      '<span class="mail-from">' + esc(item.fromName || item.fromEmail || "Unbekannt") + "</span>" +
      '<span class="mail-when">' + esc(when(item)) + "</span></div>" +
      '<div class="mail-subject">' + esc(item.subject) + "</div>" +
      '<div class="mail-snippet">' + esc(String(item.snippet || "").slice(0, 130)) + "</div></div>" +
      '<button class="mail-star' + (item.starred ? " on" : "") + '" data-action="mail-star" data-id="' +
      esc(item.id) + '" aria-label="Markieren">' + (item.starred ? "★" : "☆") + "</button></div>";
  }

  function detailHtml() {
    var a = api();
    if (ui.bodyLoading) return '<div class="mail-detail"><p class="muted">Nachricht wird geladen…</p></div>';
    var item = ui.list.find(function (entry) { return entry.id === ui.openId; });
    if (!item) {
      return '<div class="mail-detail mail-empty">' +
        (a ? a.emptyState("✉", "Keine Nachricht gewaehlt", "Waehle links eine Nachricht aus.") : "") + "</div>";
    }
    var body = ui.body && ui.body.id === item.id ? ui.body : null;
    var text = body ? (body.text || htmlToText(body.html)) : "";
    return '<div class="mail-detail">' +
      '<div class="mail-detail-head"><div class="row-actions">' +
      '<button class="btn small-btn" data-action="mail-reply" data-id="' + esc(item.id) + '">↩ Antworten</button>' +
      '<button class="btn small-btn" data-action="mail-forward" data-id="' + esc(item.id) + '">↪ Weiterleiten</button>' +
      '<button class="btn small-btn" data-action="mail-note" data-id="' + esc(item.id) + '">＋✎ Als Notiz</button>' +
      '<button class="btn small-btn" data-action="mail-toggle-read" data-id="' + esc(item.id) + '">' +
        (item.unread ? "Als gelesen" : "Als ungelesen") + "</button>" +
      '<button class="btn small-btn" data-action="mail-archive" data-id="' + esc(item.id) + '">▣ Archiv</button>' +
      '<button class="btn small-btn danger" data-action="mail-trash" data-id="' + esc(item.id) + '">⌫ Papierkorb</button>' +
      "</div></div>" +
      '<h1 class="mail-detail-subject">' + esc(item.subject) + "</h1>" +
      '<div class="mail-detail-meta"><span class="mail-avatar tone-' + tone(item.fromEmail) + '">' +
      esc(initials(item.fromName || item.fromEmail)) + "</span><div>" +
      '<div class="mail-detail-from">' + esc(item.fromName || item.fromEmail) + "</div>" +
      '<div class="muted small">' + esc(item.fromEmail) + " · " +
      esc(item.ts ? new Date(item.ts).toLocaleString("de-CH") : "") + "</div></div></div>" +
      (body && body.attachments.length
        ? '<div class="mail-attachments">' + body.attachments.map(function (file) {
            return '<span class="mail-attachment">▰ ' + esc(file.name) + "</span>";
          }).join("") + "</div>"
        : "") +
      '<div class="mail-body">' + esc(text || item.snippet || "") + "</div></div>";
  }

  function listHtml() {
    var a = api();
    if (ui.loading && !ui.list.length) return '<p class="muted" style="padding:18px">Nachrichten werden geladen…</p>';
    if (ui.error && !ui.list.length) {
      return '<div class="mail-error">' +
        (a ? a.emptyState("⚠", "Nicht verbunden", "Mail laeuft ueber die AI-Sync-Verbindung. Melde dich dort mit Google an. (" + ui.error + ")") : "") +
        '<div class="row-actions" style="justify-content:center"><button class="btn primary" data-action="mail-refresh">Erneut versuchen</button></div></div>';
    }
    if (!ui.list.length) return '<p class="muted" style="padding:18px">Dieser Ordner ist leer.</p>';
    return '<div class="mail-list">' + ui.list.map(rowHtml).join("") + "</div>";
  }

  function render() {
    var a = api();
    var folder = FOLDERS.find(function (entry) { return entry.key === ui.folder; }) || FOLDERS[0];
    var unread = ui.list.filter(function (item) { return item.unread; }).length;
    return '<div class="view mail-view">' +
      (a ? a.viewHeader("Mail", ui.search ? "Suche: " + ui.search : folder.label + (unread ? " · " + unread + " ungelesen" : ""),
        '<button class="btn" data-action="mail-refresh">⟳ Aktualisieren</button>' +
        '<button class="btn' + (vacation && vacation.enableAutoReply ? " primary" : "") + '" data-action="mail-vacation">🌴 Abwesenheit' +
        (vacation && vacation.enableAutoReply ? " · aktiv" : "") + '</button>' +
        '<button class="btn primary" data-action="mail-compose">✎ Neue E-Mail</button>') : "") +
      '<div class="mail-shell">' +
        '<aside class="mail-sidebar">' +
          '<div class="mail-search"><input id="mailSearch" type="search" placeholder="Alle Mails durchsuchen" value="' +
          esc(ui.search) + '" autocomplete="off"></div>' +
          '<nav class="mail-folders">' + FOLDERS.map(function (entry) {
            return '<button class="mail-folder' + (ui.folder === entry.key && !ui.search ? " on" : "") +
              '" data-action="mail-folder" data-folder="' + entry.key + '"><span>' + entry.icon + "</span>" +
              esc(entry.label) + "</button>";
          }).join("") + "</nav>" +
          (ui.error && ui.list.length ? '<p class="muted small" style="padding:8px 4px">Offline — gespeicherter Stand.</p>' : "") +
        "</aside>" +
        '<section class="mail-pane-list">' + listHtml() + "</section>" +
        '<section class="mail-pane-detail">' + detailHtml() + "</section>" +
      "</div></div>";
  }

  // ── Datenfluss ──────────────────────────────────────────────────────────
  async function refresh(showSpinner) {
    if (showSpinner !== false) { ui.loading = true; ui.error = ""; rerender(); }
    try {
      ui.list = await fetchList();
      ui.error = "";
      saveCache(ui.list);
    } catch (error) {
      ui.error = error.message || String(error);
      var cached = loadCache();
      if (cached && cached.length) ui.list = cached;
    } finally {
      ui.loading = false;
      rerender();
    }
  }

  async function openMessage(id) {
    ui.openId = id;
    ui.bodyLoading = true;
    rerender();
    try {
      var full = await rpc("GET", "/users/me/messages/" + encodeURIComponent(id), { format: "full" });
      var parts = extractBody(full.payload);
      ui.body = { id: id, text: parts.text, html: parts.html, attachments: parts.attachments };
      var item = ui.list.find(function (entry) { return entry.id === id; });
      if (item && item.unread) {
        item.unread = false;
        rpc("POST", "/users/me/messages/" + encodeURIComponent(id) + "/modify", {}, { removeLabelIds: ["UNREAD"] })
          .catch(function () { item.unread = true; });
      }
    } catch (error) {
      ui.body = { id: id, text: "", html: "", attachments: [] };
      notify("Nachricht", error.message || String(error), "error");
    } finally {
      ui.bodyLoading = false;
      rerender();
    }
  }

  function quoteOf(item) {
    var body = ui.body && ui.body.id === item.id ? ui.body : null;
    var text = body ? (body.text || htmlToText(body.html)) : (item.snippet || "");
    return "\n\n> " + String(text).split("\n").slice(0, 40).join("\n> ");
  }

  function composeSheet(options) {
    var a = api();
    if (!a) return;
    var data = options || {};
    a.sheet(data.title || "Neue E-Mail",
      '<form data-form="mail-compose"><div class="form-grid">' +
      '<div class="field full"><label>An</label><input name="to" type="email" value="' + esc(data.to || "") + '" required></div>' +
      '<div class="field full"><label>Kopie (optional)</label><input name="cc" type="email"></div>' +
      '<div class="field full"><label>Betreff</label><input name="subject" value="' + esc(data.subject || "") + '"></div>' +
      '<div class="field full"><label>Text</label><textarea name="text" rows="14">' + esc(data.body || "") + "</textarea></div>" +
      '</div><p class="muted small">Vor dem Versand erscheint eine Bestaetigung mit Vorschau.</p>' +
      '<div class="sheet-foot"><button class="btn" type="button" data-action="close-overlay">Abbrechen</button>' +
      '<button class="btn primary" type="submit">Senden…</button></div></form>', "wide");
  }

  // ── Abwesenheitsantwort (VacationSettings) ─────────────────────────────
  // Nutzt denselben Gmail-Proxy wie der Rest der Mail-App: GET/PUT
  // /users/me/settings/vacation (Scope gmail.settings.basic, schon Teil der
  // bestehenden AI-Sync-Google-Verbindung). Das eingegebene Enddatum ist
  // inklusive gemeint, Gmails endTime ist exklusiv — deshalb +1 Tag beim
  // Senden und -1 Tag beim Einlesen fuers Formular. Ein PUT geschieht
  // ausschliesslich nach einer sichtbaren Bestaetigung in onSubmitVacation.
  function vacYmdToMs(ymd) {
    if (!ymd) return null;
    var parts = String(ymd).split("-");
    if (parts.length !== 3) return null;
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0, 0);
    return isNaN(date.getTime()) ? null : date.getTime();
  }
  function vacMsToYmd(ms) {
    if (ms == null) return "";
    var n = Number(ms);
    if (!isFinite(n)) return "";
    var date = new Date(n);
    if (isNaN(date.getTime())) return "";
    var mm = String(date.getMonth() + 1);
    var dd = String(date.getDate());
    if (mm.length < 2) mm = "0" + mm;
    if (dd.length < 2) dd = "0" + dd;
    return date.getFullYear() + "-" + mm + "-" + dd;
  }
  function vacFmtDe(ymd) {
    var parts = String(ymd || "").split("-");
    return parts.length === 3 ? (parts[2] + "." + parts[1] + "." + parts[0]) : (ymd || "(offen)");
  }

  function vacationSheet(data) {
    var v = data || {};
    var startYmd = vacMsToYmd(v.startTime);
    var endYmd = v.endTime != null ? vacMsToYmd(Number(v.endTime) - 1) : "";
    var a = api();
    if (!a) return;
    a.sheet("Abwesenheit",
      '<form data-form="mail-vacation"><div class="form-grid">' +
      '<div class="field full"><label><input type="checkbox" name="active"' + (v.enableAutoReply ? " checked" : "") +
      '> Automatische Abwesenheitsantwort aktiv</label></div>' +
      '<div class="field"><label>Erster Tag</label><input name="start" type="date" value="' + esc(startYmd) + '"></div>' +
      '<div class="field"><label>Letzter Tag (inklusive)</label><input name="end" type="date" value="' + esc(endYmd) + '"></div>' +
      '<div class="field full"><label>Betreff</label><input name="subject" value="' + esc(v.responseSubject || "") + '"></div>' +
      '<div class="field full"><label>Antworttext</label><textarea name="text" rows="8">' +
      esc(v.responseBodyPlainText || v.responseBodyHtml || "") + "</textarea></div>" +
      '<div class="field full"><label><input type="checkbox" name="contacts"' + (v.restrictToContacts ? " checked" : "") +
      '> Nur an meine Kontakte antworten</label></div>' +
      '<div class="field full"><label><input type="checkbox" name="domain"' + (v.restrictToDomain ? " checked" : "") +
      '> Nur innerhalb meiner Organisation/Domain antworten</label></div>' +
      '</div><p class="muted small">Leere Datumsfelder bedeuten unbefristet. Vor dem Aktivieren erscheint eine Bestaetigung mit Vorschau.</p>' +
      '<div class="sheet-foot"><button class="btn" type="button" data-action="close-overlay">Abbrechen</button>' +
      '<button class="btn primary" type="submit">Speichern…</button></div></form>', "wide");
  }

  async function openVacationSheet() {
    try {
      vacation = await rpc("GET", "/users/me/settings/vacation");
    } catch (error) {
      notify("Abwesenheit", error.message || String(error), "error");
      vacation = vacation || {};
    }
    vacationSheet(vacation || {});
  }

  async function onSubmitVacation(form, data) {
    var a = api();
    var activeInput = form.querySelector('[name="active"]');
    var contactsInput = form.querySelector('[name="contacts"]');
    var domainInput = form.querySelector('[name="domain"]');
    var active = !!(activeInput && activeInput.checked);
    var startYmd = String(data.get("start") || "").trim();
    var endYmd = String(data.get("end") || "").trim();
    var subject = String(data.get("subject") || "").trim();
    var text = String(data.get("text") || "").trim();
    var contacts = !!(contactsInput && contactsInput.checked);
    var domain = !!(domainInput && domainInput.checked);
    if (active && !text) { notify("Antworttext fehlt", "Bitte einen Antworttext eingeben, bevor die Abwesenheitsantwort aktiviert wird.", "error"); return true; }
    if (startYmd && endYmd && startYmd > endYmd) { notify("Zeitraum", "Der erste Tag muss vor oder gleich dem letzten Tag liegen.", "error"); return true; }
    var range = (startYmd || endYmd) ? (vacFmtDe(startYmd) + " bis " + vacFmtDe(endYmd)) : "unbefristet";
    var question = active
      ? ("Automatische Abwesenheitsantwort wirklich aktivieren?\n\nZeitraum: " + range +
         "\nBetreff: " + (subject || "(kein Betreff)") + "\nText: " + text.slice(0, 200))
      : "Abwesenheitsantwort deaktivieren?";
    if (!confirm(question)) return true;
    var payload = {
      enableAutoReply: active,
      responseSubject: subject,
      responseBodyPlainText: text,
      restrictToContacts: contacts,
      restrictToDomain: domain
    };
    if (startYmd) { var startMs = vacYmdToMs(startYmd); if (startMs != null) payload.startTime = String(startMs); }
    if (endYmd) { var endMs = vacYmdToMs(endYmd); if (endMs != null) payload.endTime = String(endMs + 86400000); }
    try {
      var result = await rpc("PUT", "/users/me/settings/vacation", null, payload);
      vacation = result || payload;
      if (a) a.closeOverlay();
      notify(active ? "Abwesenheit aktiv" : "Abwesenheit deaktiviert",
        active ? "Gmail antwortet jetzt automatisch auf eingehende Mails." : "Die automatische Antwort ist deaktiviert.", "ok");
      rerender();
    } catch (error) {
      notify("Abwesenheit", error.message || String(error), "error");
    }
    return true;
  }

  function encodeRaw(fields) {
    var lines = [
      "To: " + fields.to,
      fields.cc ? "Cc: " + fields.cc : null,
      "Subject: =?UTF-8?B?" + btoa(unescape(encodeURIComponent(fields.subject || ""))) + "?=",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      btoa(unescape(encodeURIComponent(fields.text || "")))
    ].filter(function (line) { return line != null; });
    return btoa(unescape(encodeURIComponent(lines.join("\r\n"))))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // ── Aktionen ────────────────────────────────────────────────────────────
  async function onAction(action, button) {
    if (action === "mail-folder") {
      ui.folder = button.dataset.folder;
      ui.search = "";
      ui.openId = null;
      ui.body = null;
      ui.list = loadCache() || [];
      refresh();
      return true;
    }
    if (action === "mail-refresh") { refresh(); return true; }
    if (action === "mail-open") { openMessage(button.dataset.id); return true; }

    if (action === "mail-star") {
      var starItem = ui.list.find(function (entry) { return entry.id === button.dataset.id; });
      if (!starItem) return true;
      var nextStar = !starItem.starred;
      starItem.starred = nextStar;
      rerender();
      try {
        await rpc("POST", "/users/me/messages/" + encodeURIComponent(button.dataset.id) + "/modify", {},
          nextStar ? { addLabelIds: ["STARRED"] } : { removeLabelIds: ["STARRED"] });
      } catch (error) {
        starItem.starred = !nextStar;
        notify("Markierung", error.message || String(error), "error");
        rerender();
      }
      return true;
    }

    if (action === "mail-toggle-read") {
      var readItem = ui.list.find(function (entry) { return entry.id === button.dataset.id; });
      if (!readItem) return true;
      var nextUnread = !readItem.unread;
      readItem.unread = nextUnread;
      rerender();
      try {
        await rpc("POST", "/users/me/messages/" + encodeURIComponent(button.dataset.id) + "/modify", {},
          nextUnread ? { addLabelIds: ["UNREAD"] } : { removeLabelIds: ["UNREAD"] });
      } catch (error) {
        readItem.unread = !nextUnread;
        notify("Status", error.message || String(error), "error");
        rerender();
      }
      return true;
    }

    if (action === "mail-archive") {
      try {
        await rpc("POST", "/users/me/messages/" + encodeURIComponent(button.dataset.id) + "/modify", {},
          { removeLabelIds: ["INBOX"] });
        ui.list = ui.list.filter(function (entry) { return entry.id !== button.dataset.id; });
        ui.openId = null; ui.body = null;
        saveCache(ui.list);
        notify("Archiviert", "Die Nachricht liegt jetzt im Archiv.", "ok");
        rerender();
      } catch (error) { notify("Archivieren", error.message || String(error), "error"); }
      return true;
    }

    if (action === "mail-trash") {
      var trashItem = ui.list.find(function (entry) { return entry.id === button.dataset.id; });
      if (!trashItem) return true;
      if (!confirm('"' + trashItem.subject + '" in den Papierkorb verschieben?')) return true;
      try {
        await rpc("POST", "/users/me/messages/" + encodeURIComponent(button.dataset.id) + "/modify", {},
          { addLabelIds: ["TRASH"], removeLabelIds: ["INBOX"] });
        ui.list = ui.list.filter(function (entry) { return entry.id !== button.dataset.id; });
        ui.openId = null; ui.body = null;
        saveCache(ui.list);
        notify("Papierkorb", "Die Nachricht wurde verschoben.", "ok");
        rerender();
      } catch (error) { notify("Papierkorb", error.message || String(error), "error"); }
      return true;
    }

    if (action === "mail-compose") { composeSheet({}); return true; }
    if (action === "mail-vacation") { openVacationSheet(); return true; }

    if (action === "mail-note") {
      var noteItem = ui.list.find(function (entry) { return entry.id === button.dataset.id; });
      var noteApi = api();
      if (!noteItem || !noteApi || typeof noteApi.openNoteForm !== "function") return true;
      var noteBody = ui.body && ui.body.id === noteItem.id
        ? (ui.body.text || htmlToText(ui.body.html))
        : (noteItem.snippet || "");
      // Bewusste Vorschau vor dem Speichern: Mail-Inhalte werden nie automatisch
      // in Noteflow kopiert. Der Nutzer kann den Text hier kuerzen oder verwerfen.
      noteApi.openNoteForm({
        noteClass: "research",
        lockClass: true,
        title: noteItem.subject || "E-Mail-Notiz",
        content: noteBody,
        tags: ["Mail"],
        source: {
          app: "mail",
          entityType: "email",
          entityId: noteItem.id,
          label: noteItem.subject || noteItem.fromName || "E-Mail",
          route: "#/mail"
        }
      });
      return true;
    }

    if (action === "mail-reply" || action === "mail-forward") {
      var item = ui.list.find(function (entry) { return entry.id === button.dataset.id; });
      if (!item) return true;
      if (action === "mail-reply") {
        composeSheet({
          title: "Antworten",
          to: item.fromEmail,
          subject: /^re:/i.test(item.subject) ? item.subject : "Re: " + item.subject,
          body: quoteOf(item)
        });
      } else {
        composeSheet({
          title: "Weiterleiten",
          subject: /^fwd:/i.test(item.subject) ? item.subject : "Fwd: " + item.subject,
          body: "\n\n--- Weitergeleitete Nachricht ---\nVon: " + (item.fromName || item.fromEmail) +
            "\nBetreff: " + item.subject + quoteOf(item)
        });
      }
      return true;
    }
    return false;
  }

  async function onSubmit(type, form, data) {
    if (type === "mail-vacation") return onSubmitVacation(form, data);
    if (type !== "mail-compose") return false;
    var a = api();
    var to = String(data.get("to") || "").trim();
    var cc = String(data.get("cc") || "").trim();
    var subject = String(data.get("subject") || "");
    var text = String(data.get("text") || "");
    if (!to) { notify("Empfaenger fehlt", "Bitte eine Adresse eintragen.", "error"); return true; }
    if (!confirm("E-Mail an " + to + " senden?\n\nBetreff: " + (subject || "(kein Betreff)"))) return true;
    try {
      await rpc("POST", "/users/me/messages/send", {}, { raw: encodeRaw({ to: to, cc: cc, subject: subject, text: text }) });
      if (a) a.closeOverlay();
      notify("Gesendet", to, "ok");
      if (ui.folder === "sent") refresh(false);
    } catch (error) {
      notify("Senden fehlgeschlagen", error.message || String(error), "error");
    }
    return true;
  }

  function mount(route, root) {
    if (!root || ["mail", "gmail", "messages"].indexOf(route) < 0) return;
    var input = root.querySelector("#mailSearch");
    if (input) {
      input.addEventListener("change", function () {
        var value = input.value.trim();
        if (value === ui.search) return;
        ui.search = value;
        ui.openId = null;
        ui.body = null;
        refresh();
      });
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") { event.preventDefault(); input.blur(); }
      });
    }
    if (!ui.list.length) {
      var cached = loadCache();
      if (cached && cached.length) { ui.list = cached; }
    }
    if (!ui.loadedOnce) { ui.loadedOnce = true; refresh(!ui.list.length); }
  }

  // Fuer den Homebildschirm: Anzahl ungelesener Nachrichten.
  window.QuantusMailUnread = function () {
    return ui.list.filter(function (item) { return item.unread; }).length;
  };

  (window.__quantusTabletModules = window.__quantusTabletModules || []).push({
    key: "mail",
    // "messages" gehoert NICHT hierher: das ist in AI Sync
    // entities.scheduledMessages — Nachrichten, die man sich selbst auf einen
    // Zeitpunkt legt. Solange die Route hier stand, oeffnete „Nachrichten"
    // den Gmail-Posteingang, und der eigentliche Bestand war unerreichbar.
    // Die native Ansicht dafuer steht in native-modules.js.
    routes: ["mail", "gmail"],
    render: render,
    mount: mount,
    onAction: onAction,
    onSubmit: onSubmit
  });
})();
