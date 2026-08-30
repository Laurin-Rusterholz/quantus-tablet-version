/*
 * BRIEFING-PDF — das taegliche Morgen-PDF als eigene App.
 *
 * BEFUND (Nutzer): "ich kann auf dem tablet das morning briefing nicht
 * oeffnen. das ist ein pdf welches ich jeden tag bekomme, was mir aber
 * nicht angezeigt wird. es soll auf dem tablet eine spezielle app mit
 * einem shortcut bekommen, sonst wird es in quantus unter nachrichten
 * angezeigt."
 *
 * Das taeglich zugestellte PDF landet in AI Syncs Firebase-Storage-Mailbox
 * (netlify/functions/briefing-put | briefing-list | briefing-get |
 * briefing-deliver) — das ist WEDER das Daily-Briefing-Dashboard
 * (briefing-app.js, Route "dailybriefing": Zahlen zu Aufgaben/Terminen/
 * Routinen) NOCH das Archiv vergangener Tage (native-modules.js, Route
 * "briefings": Tagesziele/Notiz/Reflexion je Tag) — beide zeigen TEXT aus
 * dem Datenstand, kein PDF. Die Route "briefings" ist darum bereits an
 * dieses Archiv vergeben (Playwright hat das beim Testen dieses Fixes
 * gezeigt: mein erster Versuch, dieselbe Route zu benutzen, wurde von
 * native-modules.js gewonnen — Skriptreihenfolge in index.html entscheidet
 * bei zwei Modulen mit derselben Route). Diese App bekommt deshalb die
 * eigene Route "briefingpdf" und einen eigenen Katalogeintrag, statt den
 * bestehenden zu kapern.
 *
 * AI Sync spiegelt jedes gelieferte PDF zusaetzlich als Nachricht in
 * scheduledMessages (bootSyncMessages, public/index.html) — das ist das
 * "sonst ... unter Nachrichten" aus der Meldung, ein Notbehelf fuer Geraete
 * ohne eigene Ansicht, kein Ersatz dafuer.
 *
 * Dieses Modul spricht dieselben vier Endpunkte direkt an wie die
 * Desktop-Ansicht (offene CORS, kein neues Secret — derselbe Weg wie
 * gcal-auth/gcal-api in googlecalendar-app.js) und zeigt das PDF ueber den
 * vorhandenen QuantusPdfViewer: dieselbe [data-nm-pdf]-Anbindung, die
 * mountPdfViewer() in app.js bei jedem Neuzeichnen ohnehin bedient.
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
  function baseUrl() { var a = api(); return a ? a.appBaseUrl() : ""; }
  var FN = "/.netlify/functions";
  var READ_KEY = "quantus-tablet-briefingpdf-read";

  var ui = {
    laedt: false,
    geladen: false,
    fehler: null,
    items: [],
    offen: null,      // id des gerade angezeigten Briefings
    blobUrl: null,
    ladeFehler: null
  };

  function readSet() {
    try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || "[]")); } catch (error) { return new Set(); }
  }
  function markRead(id) {
    try { var s = readSet(); s.add(id); localStorage.setItem(READ_KEY, JSON.stringify(Array.from(s))); } catch (error) { /* Speicher voll — Lesemarkierung ist nur Komfort */ }
  }

  function fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(2) + " MB";
  }

  async function ladeListe() {
    ui.laedt = true; ui.fehler = null;
    var a = api();
    try {
      var response = await fetch(baseUrl() + FN + "/briefing-list", { cache: "no-store" });
      var data = await response.json().catch(function () { return null; });
      if (!response.ok) throw new Error((data && data.error) || ("HTTP " + response.status));
      ui.items = (data && Array.isArray(data.items)) ? data.items : [];
    } catch (error) {
      ui.fehler = error.message || String(error);
      ui.items = [];
    }
    ui.laedt = false; ui.geladen = true;
    if (a) a.render();
  }

  async function ladePdf(id) {
    var a = api();
    try {
      var response = await fetch(baseUrl() + FN + "/briefing-get?id=" + encodeURIComponent(id), { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      var blob = await response.blob();
      if (ui.offen !== id) return;   // inzwischen geschlossen oder gewechselt
      ui.blobUrl = URL.createObjectURL(blob);
      if (a) a.render();
    } catch (error) {
      if (ui.offen !== id) return;
      ui.ladeFehler = error.message || String(error);
      if (a) a.render();
    }
  }

  async function loeschen(id) {
    if (!confirm("Dieses Briefing löschen?")) return;
    var a = api();
    try {
      var response = await fetch(baseUrl() + FN + "/briefing-list?id=" + encodeURIComponent(id), { method: "DELETE" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      if (a) a.toast("Gelöscht", "Briefing entfernt", "ok");
      ladeListe();
    } catch (error) {
      if (a) a.toast("Nicht gelöscht", error.message || String(error), "error");
    }
  }

  function herunterladen(id) {
    var eintrag = ui.items.find(function (item) { return item.id === id; }) || {};
    var link = document.createElement("a");
    link.href = baseUrl() + FN + "/briefing-get?id=" + encodeURIComponent(id) + "&download=1";
    link.download = eintrag.filename || (id + ".pdf");
    document.body.appendChild(link); link.click(); link.remove();
  }

  // ── Liste ─────────────────────────────────────────────────────────────────
  function renderListe() {
    var a = api();
    var reads = readSet();
    var sortiert = ui.items.slice().sort(function (x, y) {
      return Date.parse(y.createdAt || y.date || 0) - Date.parse(x.createdAt || x.date || 0);
    });
    var inhalt;
    if (ui.laedt) {
      inhalt = a.emptyMini("Briefings werden geladen …");
    } else if (ui.fehler) {
      inhalt = '<div class="empty-state"><span style="font-size:40px">⚠</span><h2>Nicht erreichbar</h2><p>' + esc(ui.fehler) + "</p></div>";
    } else if (!sortiert.length) {
      inhalt = a.emptyState("📭", "Noch keine Briefings", "Sobald dein Morgen-Job ein PDF zustellt, erscheint es hier.");
    } else {
      inhalt = '<div class="item-list">' + sortiert.map(function (item) {
        var neu = !reads.has(item.id);
        return '<div class="list-item">' +
          '<span style="font-size:22px">' + (neu ? "🆕" : "📄") + "</span>" +
          '<div class="item-main" data-action="bf-open" data-id="' + attr(item.id) + '" role="button" tabindex="0" style="cursor:pointer">' +
            '<div class="item-title">' + esc(item.title || "Morning Briefing") + "</div>" +
            '<div class="item-meta">' + esc(a.formatDate(item.createdAt || item.date)) + " · " + esc(fmtSize(item.size)) + "</div>" +
          "</div>" +
          '<button class="icon-action" data-action="bf-download" data-id="' + attr(item.id) + '" aria-label="Herunterladen">⬇</button>' +
          '<button class="icon-action" data-action="bf-delete" data-id="' + attr(item.id) + '" aria-label="Löschen">⌫</button>' +
        "</div>";
      }).join("") + "</div>";
    }
    return '<div class="view">' +
      a.viewHeader("Briefing-PDF", "Dein tägliches Morgen-PDF — direkt aus AI Sync.",
        '<button class="btn" data-action="bf-refresh">↻ Aktualisieren</button>') +
      a.loginBanner() +
      inhalt +
    "</div>";
  }

  // ── Geoeffnetes PDF ───────────────────────────────────────────────────────
  function renderViewer() {
    var a = api();
    var eintrag = ui.items.find(function (item) { return item.id === ui.offen; }) || {};
    var titel = eintrag.title || "Briefing";
    var head = a.viewHeader(titel, "",
      '<button class="btn" data-action="bf-close">‹ Alle Briefing-PDFs</button>' +
      '<button class="btn" data-action="bf-download" data-id="' + attr(ui.offen) + '">⬇ Herunterladen</button>');
    if (ui.ladeFehler) {
      return '<div class="view">' + head + '<div class="empty-state"><span style="font-size:40px">⚠</span><h2>Konnte nicht geladen werden</h2><p>' + esc(ui.ladeFehler) + "</p></div></div>";
    }
    if (!ui.blobUrl) {
      return '<div class="view">' + head + a.emptyMini("PDF wird geladen …") + "</div>";
    }
    var name = (eintrag.filename || (titel + ".pdf"));
    return '<div class="view">' + head +
      '<div class="nm-pdf-host" data-nm-pdf="' + attr(ui.blobUrl) + '" data-nm-pdf-name="' + attr(name) + '">' +
        (window.QuantusPdfViewer ? window.QuantusPdfViewer.placeholder(name) : "") +
      "</div></div>";
  }

  function render() { return ui.offen ? renderViewer() : renderListe(); }

  function mount() {
    // Kein route-Vergleich hier: mount() wird laut app.js/render() nur fuer
    // das Modul aufgerufen, dessen Route gerade aktiv ist — route waere
    // immer "briefings" und ein Vergleich damit nie aussagekraeftig (siehe
    // BEFUND in sticky-app.js/briefing-app.js). Der eigene geladen/laedt-
    // Schutz verhindert stattdessen doppeltes Nachladen bei jedem Neuaufbau.
    if (!ui.geladen && !ui.laedt) ladeListe();
  }

  function onAction(action, button) {
    var a = api();
    if (!a) return false;
    if (action === "bf-refresh") { ladeListe(); return true; }
    if (action === "bf-open") {
      var id = button.dataset.id;
      ui.offen = id; ui.blobUrl = null; ui.ladeFehler = null;
      markRead(id);
      a.render();
      ladePdf(id);
      return true;
    }
    if (action === "bf-close") {
      if (ui.blobUrl) { try { URL.revokeObjectURL(ui.blobUrl); } catch (error) {} }
      ui.offen = null; ui.blobUrl = null; ui.ladeFehler = null;
      a.render();
      return true;
    }
    if (action === "bf-download") { herunterladen(button.dataset.id); return true; }
    if (action === "bf-delete") { loeschen(button.dataset.id); return true; }
    return false;
  }

  // Beim Verlassen der Blob-URL freigeben — sonst haeuft jeder Besuch eine
  // weitere Datei im Speicher an, die nie wieder freigegeben wird.
  window.addEventListener("hashchange", function () {
    var route = (location.hash || "").replace(/^#\/?/, "").split("?")[0];
    if (route !== "briefingpdf" && ui.blobUrl) {
      try { URL.revokeObjectURL(ui.blobUrl); } catch (error) {}
      ui.offen = null; ui.blobUrl = null; ui.ladeFehler = null;
    }
  });

  (window.__quantusTabletModules = window.__quantusTabletModules || []).push({
    key: "briefingpdf",
    routes: ["briefingpdf"],
    render: render,
    mount: mount,
    onAction: onAction
  });
})();
