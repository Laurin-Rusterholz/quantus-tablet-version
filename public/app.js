(function () {
  "use strict";

  const Core = window.QuantusSyncCore;
  if (!Core) throw new Error("QuantusSyncCore fehlt");
  const Notes = window.QuantusNotesCore;
  if (!Notes) throw new Error("QuantusNotesCore fehlt");

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyC6xVo-wmXC4JjG7qMQnOExIjU-UDvBluE",
    authDomain: "jupidu-36804.firebaseapp.com",
    databaseURL: "https://jupidu-36804-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "jupidu-36804",
    storageBucket: "jupidu-36804.firebasestorage.app",
    messagingSenderId: "11390726952",
    appId: "1:11390726952:web:aba2f101b6c5ca2bc5561d"
  };

  const RTDB_URL = FIREBASE_CONFIG.databaseURL;
  const APP_STORE_PATH = "appStore/app-data_json";
  const DEFAULT_AI_SYNC_URL = "https://management-xo2-pro.netlify.app";
  const LOCAL_KEYS = {
    settings: "quantus-tablet-settings-v1",
    pending: "quantus-tablet-pending-v1",
    device: "quantus-tablet-device-v1",
    snapshot: "quantus-tablet-snapshot-v1",
    drafts: "quantus-tablet-drafts-v1",
    pins: "quantus-tablet-pins-v1"
  };
  // Obergrenzen fuer die lokale Speicherung: Snapshot nur bis ~3.5 MB in
  // localStorage ablegen, Warteschlange nie unbegrenzt wachsen lassen.
  const SNAPSHOT_MAX_BYTES = 3500000;
  const PENDING_MAX_OPS = 500;

  // AI-Sync-Modulkatalog. Module mit einer eigenen Tablet-Ansicht (Aufgaben,
  // Projekte, Notizen, Kalender, Ziele, Strategien und weitere) rendern nativ.
  // Alle uebrigen Werkzeuge oeffnen als native Uebersicht und lassen sich bei
  // Bedarf in einem separaten Fenster starten – nichts wird mehr eingebettet.
  const FULL_APP_DEFS = [
    { key: "dashboard", label: "Dashboard", icon: "⌂", tone: "green", fullRoute: "dashboard", group: "Übersicht" },
    { key: "daily", label: "Heute", icon: "☀", tone: "sand", fullRoute: "today", group: "Übersicht" },
    { key: "dailybriefing", label: "Morgenbriefing", icon: "☀", tone: "sand", fullRoute: "dailybriefing", group: "Übersicht" },
    { key: "tasks", label: "Aufgaben", icon: "✓", tone: "green", fullRoute: "tasks", group: "Planen" },
    { key: "projects", label: "Projekte", icon: "▧", tone: "blue", fullRoute: "projects", group: "Planen" },
    { key: "weekplanning", label: "Wochenplanung", icon: "▤", tone: "blue", fullPath: "nobraine.html", group: "Planen" },
    { key: "calendar", label: "Kalender", icon: "◉", tone: "coral", fullRoute: "calendar", group: "Planen" },
    { key: "googlecalendar", label: "Google Kalender", icon: "31", tone: "blue", fullRoute: "googlecalendar", group: "Planen" },
    { key: "time", label: "Zeiterfassung", icon: "◷", tone: "green", fullRoute: "time", group: "Planen" },
    { key: "workload", label: "Auslastung", icon: "▥", tone: "coral", fullRoute: "workload", group: "Planen" },
    { key: "goals", label: "Ziele", icon: "◎", tone: "green", fullRoute: "goals", group: "Planen" },
    { key: "strategies", label: "Strategien", icon: "◇", tone: "blue", fullRoute: "strategies", group: "Planen" },
    { key: "programs", label: "Programme", icon: "▦", tone: "coral", fullRoute: "programs", group: "Planen" },
    { key: "concepts", label: "Konzeptor", icon: "◆", tone: "coral", fullRoute: "concepts", group: "Wissen" },
    { key: "notes", label: "Noteflow", icon: "✎", tone: "green", fullRoute: "notes", group: "Wissen" },
    { key: "reading", label: "Reading Hub", icon: "▤", tone: "blue", fullRoute: "readinghub", group: "Wissen" },
    { key: "learning", label: "Recall Lab", icon: "▣", tone: "sand", fullRoute: "learn", group: "Wissen" },
    { key: "smarter", label: "Smarter", icon: "Σ", tone: "sand", fullRoute: "smarter", group: "Wissen" },
    { key: "knowledge", label: "Wissensbasis", icon: "◈", tone: "blue", fullRoute: "knowledge", group: "Wissen" },
    { key: "ideas", label: "Ideen", icon: "✦", tone: "sand", fullRoute: "ideas", group: "Wissen" },
    { key: "thesis", label: "Thesis Studio", icon: "T", tone: "coral", fullRoute: "thesis", group: "Wissen" },
    { key: "journal", label: "Journal", icon: "J", tone: "green", fullRoute: "journal", group: "Wissen" },
    { key: "reflecta", label: "Reflecta", icon: "◐", tone: "blue", fullRoute: "reflecta", group: "Wissen" },
    { key: "meetings", label: "Meetings", icon: "◉", tone: "coral", fullRoute: "meetings", group: "Zusammenarbeit" },
    { key: "organizations", label: "Organisationen", icon: "▥", tone: "blue", fullRoute: "organizations", group: "Zusammenarbeit" },
    { key: "persons", label: "Personen", icon: "♙", tone: "green", fullRoute: "persons", group: "Zusammenarbeit" },
    { key: "messages", label: "Nachrichten", icon: "✉", tone: "coral", fullRoute: "messages", group: "Zusammenarbeit" },
    { key: "gmail", label: "Gmail", icon: "M", tone: "coral", fullRoute: "gmail", group: "Zusammenarbeit" },
    { key: "protocols", label: "Protokolle", icon: "¶", tone: "sand", fullRoute: "protocols", group: "Zusammenarbeit" },
    { key: "workflows", label: "Workflows", icon: "↻", tone: "blue", fullRoute: "workflows", group: "Zusammenarbeit" },
    { key: "updates", label: "Updates", icon: "↥", tone: "green", fullRoute: "updates", group: "Steuern" },
    { key: "decisions", label: "Entscheidungen", icon: "⚖", tone: "sand", fullRoute: "decisions", group: "Steuern" },
    { key: "measures", label: "Massnahmen", icon: "!", tone: "coral", fullRoute: "measures", group: "Steuern" },
    { key: "statistics", label: "Statistiken", icon: "▥", tone: "blue", fullRoute: "statistics", group: "Steuern" },
    { key: "reports", label: "Berichte", icon: "▤", tone: "green", fullRoute: "reports", group: "Steuern" },
    { key: "budget", label: "Budget", icon: "₣", tone: "sand", fullRoute: "budget", group: "Steuern" },
    { key: "habits", label: "Habits", icon: "◌", tone: "green", fullRoute: "habits", group: "Steuern" },
    { key: "drive", label: "Quantus Drive", icon: "▰", tone: "blue", fullPath: "drive.html", group: "Werkzeuge" },
    { key: "docstudio", label: "DocStudio", icon: "D", tone: "coral", fullPath: "docstudio.html", group: "Werkzeuge" },
    { key: "nobraine", label: "No-Braine", icon: "N", tone: "green", fullPath: "nobraine.html", group: "Werkzeuge" },
    { key: "bm", label: "BM Lernen", icon: "∑", tone: "sand", fullPath: "bm.html", group: "Werkzeuge" },
    { key: "pdfeditor", label: "PDF-Editor", icon: "PDF", tone: "coral", fullRoute: "pdfeditor", group: "Werkzeuge" },
    { key: "browser", label: "Browser", icon: "◎", tone: "blue", fullRoute: "browser", group: "Werkzeuge" },
    { key: "briefings", label: "Briefings", icon: "B", tone: "green", fullRoute: "briefings", group: "Werkzeuge" },
    { key: "quantusproject", label: "Quantus Projekt", icon: "Q", tone: "blue", fullRoute: "quantusproject", group: "Werkzeuge" },
    { key: "polaris", label: "Polaris", icon: "✦", tone: "green", fullRoute: "polaris", group: "Werkzeuge", allow: "microphone; clipboard-read; clipboard-write" }
  ];

  const APP_DEFS = [
    { key: "home", label: "Home", icon: "⌂", tone: "green", local: true, group: "Tablet" },
    { key: "dashboard", label: "Dashboard", icon: "▤", tone: "green", local: true, group: "Tablet" },
    { key: "mail", label: "Mail", icon: "✉", tone: "blue", local: true, group: "Tablet" },
    { key: "flowertech", label: "FlowerTech", icon: "❀", tone: "coral", local: true, group: "Tablet" },
    { key: "workspace", label: "Tablet Canvas", icon: "✎", tone: "coral", local: true, group: "Tablet" },
    // Sticky Boards sind eine eigene App: erst alle Boards, dann eines im
    // Vollbild. Vorher kam man an ein Board nur ueber das Element, an dem es
    // haengt — wer wissen wollte, welche es ueberhaupt gibt, musste jede
    // Aufgabe einzeln aufmachen.
    { key: "sticky", label: "Sticky Boards", icon: "▦", tone: "sand", local: true, group: "Tablet" },
    ...FULL_APP_DEFS,
    { key: "split", label: "Split-Screen", icon: "◫", tone: "blue", local: true, group: "Tablet" },
    { key: "settings", label: "Einstellungen", icon: "⚙", tone: "blue", local: true, group: "Tablet" }
  ];

  // ── Tablet-Module ────────────────────────────────────────────────────────
  // Eigenstaendige Programme (Homebildschirm, Mail, FlowerTech) melden sich
  // ueber window.__quantusTabletModules an. Sie liefern eigene Routen,
  // Klick-Aktionen und Formulare, ohne app.js aufzublaehen.
  function tabletModules() {
    return Array.isArray(window.__quantusTabletModules) ? window.__quantusTabletModules : [];
  }
  function moduleFor(route) {
    return tabletModules().find((mod) => Array.isArray(mod.routes) && mod.routes.includes(route)) || null;
  }

  const FULL_APPS = Object.fromEntries(FULL_APP_DEFS.map((app) => [app.key, app]));

  const ROUTE_TITLES = {
    home: "Home", daily: "Heute", reading: "Lesen", notes: "Noteflow",
    concepts: "Konzeptor", learning: "Lernen", tasks: "Aufgaben",
    projects: "Projekte", meetings: "Meetings", habits: "Habits",
    budget: "Budget", split: "Split-Screen", polaris: "Polaris",
    settings: "Einstellungen", apps: "Alle Apps", workspace: "Tablet Canvas",
    // Ohne Eintrag hier faellt go() still auf "home" zurueck — genau das sah
    // auf dem Tablet aus wie "die App laesst sich nicht oeffnen".
    bm: "BM Vorbereitung", leseplan: "Leseplan", career: "Career Model",
    dashboard: "Dashboard", mail: "Mail", flowertech: "FlowerTech", sticky: "Sticky Boards",
    ...Object.fromEntries(FULL_APP_DEFS.map((app) => [app.key, app.label]))
  };

  // Native Tablet-Sammlungen. Jede Sammlung wird als eigenstaendige Tablet-Ansicht
  // gerendert (Liste, Formular, Suche) und synchronisiert ueber dieselbe
  // Firebase-Transaktion wie AI Sync. Der Schluessel ist zugleich der Name der
  // Entitaet im Quantus-Payload, damit Operationen und Polaris-Inbox passen.
  const COLLECTION_CONFIG = {
    tasks: { label: "Aufgabe", plural: "Aufgaben", icon: "✓", route: "tasks" },
    projects: { label: "Projekt", plural: "Projekte", icon: "▧", route: "projects" },
    notes: { label: "Notiz", plural: "Notizen", icon: "✎", route: "notes" },
    meetings: { label: "Meeting", plural: "Meetings", icon: "◉", route: "meetings" },
    concepts: { label: "Konzept", plural: "Konzepte", icon: "◇", route: "concepts" },
    goals: { label: "Ziel", plural: "Ziele", icon: "◎", route: "goals" },
    strategies: { label: "Strategie", plural: "Strategien", icon: "◇", route: "strategies" },
    programs: { label: "Programm", plural: "Programme", icon: "▦", route: "programs" },
    organizations: { label: "Organisation", plural: "Organisationen", icon: "▥", route: "organizations" },
    persons: { label: "Person", plural: "Personen", icon: "♙", route: "persons" },
    ideas: { label: "Idee", plural: "Ideen", icon: "✦", route: "ideas" },
    decisions: { label: "Entscheidung", plural: "Entscheidungen", icon: "⚖", route: "decisions" },
    protocols: { label: "Protokoll", plural: "Protokolle", icon: "¶", route: "protocols" },
    workflows: { label: "Workflow", plural: "Workflows", icon: "↻", route: "workflows" }
  };

  // Routen mit einer eigenstaendigen Tablet-Ansicht. Alle uebrigen AI-Sync-Module
  // oeffnen als native Modul-Uebersicht mit optionalem Sprung in ein separates
  // Fenster – es wird bewusst keine fremde App mehr in einem iframe eingebettet.
  const NATIVE_ROUTES = new Set([
    "home", "dashboard", "mail", "flowertech", "daily", "dailybriefing", "reading",
    "learning", "habits", "budget", "polaris", "concepts", "calendar", "workspace",
    "split", "settings", "apps", "bm", "leseplan", "career",
    // Statistiken und Berichte rendert renderRoute() selbst. Sie fehlten hier,
    // und weil der App-Bildschirm seine Einordnung aus dieser Liste zieht,
    // meldete er sie faelschlich als "ohne eigene Tablet-Ansicht".
    "statistics", "reports", "sticky",
    ...Object.keys(COLLECTION_CONFIG)
  ]);

  const state = {
    route: "home",
    payload: Core.makeEmptyPayload(),
    wrapper: null,
    user: null,
    authReady: false,
    remoteReady: false,
    syncStatus: "offline",
    syncMessage: "Nicht angemeldet",
    authFehler: null,     // letzter Anmeldefehler {code, text} — bleibt sichtbar
    lastSync: null,
    driveDocs: {},
    smarterDocs: {},
    selectedDocId: null,
    selectedBookId: null,
    noteFilter: { mode: "inbox", value: "" },
    dbTag: null,          // gewaehlter Tag im Daily Briefing (null = heute)
    budgetMonat: null,    // gewaehlter Monat im Budget (null = laufender)
    pending: [],
    settings: loadJson(LOCAL_KEYS.settings, { aiSyncUrl: DEFAULT_AI_SYNC_URL, theme: "dark" }),
    deviceId: getDeviceId(),
    search: "",
    sort: "new",
    statusFilter: "all",
    pins: loadJson(LOCAL_KEYS.pins, []),
    drafts: loadJson(LOCAL_KEYS.drafts, {}),
    snapshotAt: null,
    splitLeft: "reading",
    splitRight: "notes",
    // Der App-Bildschirm: Suchtext und Darstellung (Raster oder Liste).
    appsSearch: "",
    appsView: "grid"
  };
  // Warteschlange beim Start direkt verdichten: alte Mehrfach-Operationen auf
  // demselben Element schrumpfen zu einer, kaputte Eintraege werden entfernt.
  state.pending = Core.compactQueue(loadJson(LOCAL_KEYS.pending, []));

  let firebaseApp = null;
  let auth = null;
  let db = null;
  let storage = null;
  let listeners = [];
  let clockTimer = null;
  let renderScheduled = false;

  const main = document.getElementById("main");
  const overlayRoot = document.getElementById("overlayRoot");
  const viewTitle = document.getElementById("viewTitle");

  function loadJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value == null ? fallback : value;
    } catch (_) { return fallback; }
  }

  function saveJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) {
      // Speicher voll: Der Snapshot ist nur ein Beschleuniger und darf weichen,
      // damit Warteschlange, Einstellungen und Entwuerfe sicher gespeichert bleiben.
      try {
        if (key !== LOCAL_KEYS.snapshot) localStorage.removeItem(LOCAL_KEYS.snapshot);
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (_) { return false; }
    }
  }

  let snapshotTimer = null;
  // Letzten bekannten Datenstand lokal ablegen, damit die App auch offline und
  // vor dem ersten Firebase-Kontakt sofort mit echten Inhalten startet.
  function saveSnapshot() {
    if (!state.remoteReady) return;
    const snapshot = { payload: state.payload, savedAt: new Date().toISOString() };
    if (Core.estimateSize(snapshot) > SNAPSHOT_MAX_BYTES) return;
    if (saveJson(LOCAL_KEYS.snapshot, snapshot)) state.snapshotAt = snapshot.savedAt;
  }

  function scheduleSnapshot() {
    if (snapshotTimer) clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(() => { snapshotTimer = null; saveSnapshot(); }, 1500);
  }

  function hydrateFromSnapshot() {
    const stored = loadJson(LOCAL_KEYS.snapshot, null);
    if (!stored || !stored.payload) return;
    state.payload = Core.normalisePayload(stored.payload);
    state.snapshotAt = stored.savedAt || null;
    setSync("offline", `Lokaler Datenstand vom ${relativeTime(state.snapshotAt)} geladen`);
  }

  function exportBackup() {
    const backup = {
      app: "quantus-tablet",
      exportedAt: new Date().toISOString(),
      deviceId: state.deviceId,
      payload: state.payload,
      pending: state.pending
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `quantus-tablet-backup-${localDateKey()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    toast("Backup erstellt", "Der komplette Datenstand inklusive Warteschlange wurde heruntergeladen.", "ok");
  }

  function importBackupFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        const incoming = parsed && parsed.payload ? parsed.payload : parsed;
        state.payload = Core.mergePayloads(state.payload, incoming);
        if (Array.isArray(parsed && parsed.pending) && parsed.pending.length) {
          state.pending = Core.compactQueue([...state.pending, ...parsed.pending]);
          saveJson(LOCAL_KEYS.pending, state.pending);
        }
        state.remoteReady = true;
        saveSnapshot();
        scheduleRender();
        toast("Backup eingespielt", "Die Daten wurden feldweise zusammengefuehrt – die neuere Version gewinnt.", "ok");
        flushPending();
      } catch (error) {
        toast("Backup unlesbar", error.message || "Die Datei ist kein gueltiges Quantus-Backup.", "error");
      }
    };
    reader.readAsText(file);
  }

  function clearLocalCache() {
    try { localStorage.removeItem(LOCAL_KEYS.snapshot); } catch (_) {}
    try { localStorage.removeItem(LOCAL_KEYS.drafts); } catch (_) {}
    state.drafts = {};
    state.snapshotAt = null;
    toast("Lokaler Cache geleert", "Warteschlange und Einstellungen bleiben erhalten.", "ok");
    render();
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value >= 1048576) return `${(value / 1048576).toFixed(1)} MB`;
    if (value >= 1024) return `${Math.round(value / 1024)} KB`;
    return `${value} B`;
  }

  function getDeviceId() {
    let id = "";
    try { id = localStorage.getItem(LOCAL_KEYS.device) || ""; } catch (_) {}
    if (!id) {
      id = Core.makeId("tablet");
      try { localStorage.setItem(LOCAL_KEYS.device, id); } catch (_) {}
    }
    return id;
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function attr(value) { return esc(value); }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asMap(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function values(map) { return Object.values(asMap(map)).filter(Boolean); }
  function isDeleted(item) { return item && (item.deleted || item.archived || item.status === "deleted" || item.deletedAt); }
  function isDone(item) { return item && ["done", "completed", "erledigt", "closed"].includes(item.status); }
  function itemTitle(item, fallback) { return item && (item.title || item.name || item.subject || item.titel) || fallback || "Ohne Titel"; }
  function itemText(item) { return item && (item.description || item.content || item.text || item.notes || item.notiz || "") || ""; }

  function noteContent(note) { return String(note && (note.content == null ? note.description || "" : note.content) || ""); }
  function noteClassLabel(value) { return Notes.NOTE_CLASS_LABELS[value] || "Notiz"; }
  function notebooks() { return collection("notebooks"); }
  let noteTagCacheMap = null;
  let noteTagCache = [];
  function noteTags() {
    const map = asMap(state.payload.entities && state.payload.entities.notes);
    if (map !== noteTagCacheMap) { noteTagCacheMap = map; noteTagCache = Notes.collectTags(map); }
    return noteTagCache;
  }
  function sourceOf(note) { return Notes.normalizeSource(note && note.source); }

  const CONTEXT_NOTE_COLLECTIONS = new Set([
    "tasks", "projects", "meetings", "concepts", "strategies", "goals", "programs",
    "organizations", "persons", "decisions", "protocols", "workflows", "articles", "theses"
  ]);

  function contextSource(collectionName, item) {
    const app = collectionName === "theses" ? "thesis" : collectionName;
    const entityType = COLLECTION_CONFIG[collectionName] && COLLECTION_CONFIG[collectionName].label.toLowerCase()
      || collectionName.replace(/s$/, "");
    return {
      app,
      entityType,
      entityId: item && item.id || null,
      label: itemTitle(item, COLLECTION_CONFIG[collectionName] && COLLECTION_CONFIG[collectionName].label || "Kontext"),
      route: `#/${COLLECTION_CONFIG[collectionName] && COLLECTION_CONFIG[collectionName].route || app}`
    };
  }

  function collection(name) {
    return values(state.payload.entities && state.payload.entities[name])
      .filter((item) => !isDeleted(item))
      .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0));
  }

  function localDateKey(date) {
    const d = date || new Date();
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }

  function formatDate(value, options) {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat("de-CH", options || { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  }

  function formatTime(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 5);
    return new Intl.DateTimeFormat("de-CH", { hour: "2-digit", minute: "2-digit" }).format(d);
  }

  function money(value, currency) {
    return new Intl.NumberFormat("de-CH", { style: "currency", currency: currency || "CHF", maximumFractionDigits: 2 }).format(Number(value) || 0);
  }

  function relativeTime(value) {
    if (!value) return "noch nie";
    const diff = Date.now() - new Date(value).getTime();
    if (diff < 10000) return "gerade eben";
    if (diff < 60000) return `vor ${Math.floor(diff / 1000)} Sekunden`;
    if (diff < 3600000) return `vor ${Math.floor(diff / 60000)} Minuten`;
    return formatDate(value, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function toast(title, message, type) {
    const node = document.createElement("div");
    node.className = `toast ${type || ""}`;
    node.innerHTML = `<strong>${esc(title)}</strong>${message ? `<span>${esc(message)}</span>` : ""}`;
    document.getElementById("toasts").appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  // Loeschen ist auf dem Tablet nie endgueltig: Der Hinweis bietet acht Sekunden
  // lang eine Ein-Klick-Wiederherstellung an.
  const deleteUndo = new Map();
  function undoToast(collectionName, id, undoToken) {
    const node = document.createElement("div");
    node.className = "toast";
    node.innerHTML = `<strong>Eintrag ausgeblendet</strong><span>Aus Versehen? Einfach zurückholen.</span><button class="btn small-btn" data-action="undo-delete" data-collection="${attr(collectionName)}" data-id="${attr(id)}" data-undo-token="${attr(undoToken || "")}">Rückgängig</button>`;
    document.getElementById("toasts").appendChild(node);
    setTimeout(() => { node.remove(); if (undoToken) deleteUndo.delete(undoToken); }, 8000);
  }

  function setSync(status, message) {
    state.syncStatus = status;
    state.syncMessage = message || "";
    const dot = document.getElementById("syncDot");
    const label = document.getElementById("syncLabel");
    if (dot) dot.className = `status-dot ${status}`;
    if (label) label.textContent = status === "synced" ? "Synchron" : status === "syncing" ? "Synchronisiert" : status === "error" ? "Fehler" : "Offline";
  }

  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => { renderScheduled = false; render(); });
  }

  function getRoute() {
    const raw = (location.hash || "#/home").replace(/^#\/?/, "").split("?")[0];
    return ROUTE_TITLES[raw] ? raw : "home";
  }

  function go(route) {
    closeOverlay();
    const next = ROUTE_TITLES[route] ? route : "home";
    if (location.hash === `#/${next}`) { state.route = next; render(); }
    else location.hash = `#/${next}`;
  }

  function updateClock() {
    const node = document.getElementById("clock");
    if (node) node.textContent = new Intl.DateTimeFormat("de-CH", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" }).format(new Date());
  }

  function initFirebase() {
    if (!window.firebase) {
      state.authReady = true;
      setSync("error", "Firebase konnte nicht geladen werden");
      scheduleRender();
      return;
    }
    try {
      firebaseApp = window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(FIREBASE_CONFIG);
      auth = firebaseApp.auth();
      db = firebaseApp.database(RTDB_URL);
      storage = firebaseApp.storage();
      auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
      // Rueckkehr aus signInWithRedirect abschliessen. Ohne diesen Aufruf
      // bleibt ein Fehler auf dem Rueckweg (haeufig auth/unauthorized-domain)
      // vollstaendig unsichtbar: die App startet einfach wieder abgemeldet,
      // und es sieht aus, als haette man nie auf "Anmelden" getippt.
      try {
        auth.getRedirectResult().then((ergebnis) => {
          if (ergebnis && ergebnis.user) {
            state.authFehler = null;
            toast("Angemeldet", "Die gemeinsamen Quantus-Daten werden geladen.", "ok");
          }
        }).catch((error) => { meldeAuthFehler(error); });
      } catch (_) {}
      auth.onAuthStateChanged(handleAuth, (error) => {
        state.authReady = true;
        setSync("error", error.message);
        scheduleRender();
      });
    } catch (error) {
      state.authReady = true;
      setSync("error", error.message);
      scheduleRender();
    }
  }

  function detachListeners() {
    listeners.forEach(({ ref, event, handler }) => ref.off(event, handler));
    listeners = [];
  }

  function listen(ref, event, handler, errorHandler) {
    ref.on(event, handler, errorHandler);
    listeners.push({ ref, event, handler });
  }

  function handleAuth(user) {
    detachListeners();
    state.user = user || null;
    state.authReady = true;
    updateAccountButton();
    if (!user) {
      state.remoteReady = false;
      setSync("offline", "Für die gemeinsame AI-Sync-Datenbank anmelden");
      scheduleRender();
      return;
    }
    attachDataListeners();
  }

  function attachDataListeners() {
    setSync("syncing", "Quantus-Daten werden geladen");
    const appRef = db.ref(APP_STORE_PATH);
    listen(appRef, "value", (snapshot) => {
      const parsed = Core.parseWrapper(snapshot.val());
      state.wrapper = parsed.wrapper;
      state.payload = parsed.payload;
      state.remoteReady = true;
      state.lastSync = new Date();
      setSync("synced", "AI Sync und Tablet sind auf demselben Stand");
      scheduleRender();
      scheduleSnapshot();
      flushPending();
    }, (error) => {
      setSync("error", error.message);
      toast("Synchronisation blockiert", "Melde dich erneut an oder autorisiere diese Domain in Firebase.", "error");
    });

    const driveRef = db.ref("driveDocs");
    listen(driveRef, "value", (snapshot) => { state.driveDocs = asMap(snapshot.val()); scheduleRender(); }, () => {});
    const smarterRef = db.ref("smarter/documents");
    listen(smarterRef, "value", (snapshot) => { state.smarterDocs = asMap(snapshot.val()); scheduleRender(); }, () => {});
  }

  // ══════════════════════════════════════════════════════════════════════
  //  ANMELDUNG AUF DEM TABLET
  //
  //  BEFUND (gemessen, Chromium, echte index.html): signIn() rief
  //  ausschliesslich signInWithPopup. Kam von dort ein Fehler, war Schluss —
  //  eine Meldung mit dem rohen Firebase-Text und kein zweiter Weg:
  //      Popup blockiert          → ["signInWithPopup"] → "Anmeldung fehlgeschlagen"
  //      Standalone nicht moeglich → ["signInWithPopup"] → "Anmeldung fehlgeschlagen"
  //      Popup sofort geschlossen  → ["signInWithPopup"] → "Anmeldung fehlgeschlagen"
  //  Und beim Start wurde getRedirectResult NIE aufgerufen (gemessen:
  //  nur ["setPersistence"]) — eine Anmeldung ueber Weiterleitung konnte
  //  also gar nicht ankommen.
  //
  //  Das trifft genau das Tablet: die App laeuft als installierte PWA
  //  ("display": "standalone"). Dort liefert window.open haeufig kein
  //  nutzbares Fenster — iPadOS oeffnet die Anmeldung in Safari, der
  //  Rueckkanal zum Opener fehlt, Firebase meldet auth/popup-blocked oder
  //  auth/operation-not-supported-in-this-environment. Es ist dasselbe
  //  Muster, an dem schon die Lern-Apps scheiterten (openWindow).
  //
  //  drive.html im Hauptprojekt geht diesen Weg laengst: Popup versuchen,
  //  bei Popup-Fehlern auf signInWithRedirect ausweichen, beim Start
  //  getRedirectResult abholen. Das Tablet macht es jetzt genauso.
  //
  //  Das Popup bleibt bewusst der erste Versuch: es ist der einzige Weg,
  //  der ohne Verlassen der App auskommt, und wo es funktioniert, soll es
  //  auch weiter benutzt werden. Die Weiterleitung ist der Ausweg, nicht
  //  der Ersatz.
  // ══════════════════════════════════════════════════════════════════════

  // Fehler, bei denen das Popup selbst der Grund ist — nicht die Anmeldung.
  const POPUP_FEHLER = new Set([
    "auth/popup-blocked",
    "auth/operation-not-supported-in-this-environment",
    "auth/web-storage-unsupported"
  ]);

  function authFehlerText(error) {
    const code = (error && error.code) || "";
    if (code === "auth/unauthorized-domain")
      return "Diese Domain ist in Firebase Authentication nicht als autorisierte Domain eingetragen.";
    if (code === "auth/popup-blocked")
      return "Das Anmeldefenster wurde blockiert.";
    if (code === "auth/operation-not-supported-in-this-environment")
      return "In der installierten App ist kein Anmeldefenster moeglich.";
    if (code === "auth/network-request-failed")
      return "Keine Verbindung zu Google — Netz, VPN oder Inhaltsblocker pruefen.";
    if (code === "auth/operation-not-allowed")
      return "Google-Anmeldung ist im Firebase-Projekt nicht aktiviert.";
    if (code === "auth/internal-error")
      return "Firebase meldet einen internen Fehler — meist eine nicht freigegebene Domain.";
    return (error && error.message) || "Unbekannter Fehler.";
  }

  // Der Fehlercode bleibt stehen, nicht nur als fluechtige Einblendung: nach
  // einer Weiterleitung ist die Einblendung laengst weg, und ohne den Code
  // laesst sich nicht sagen, WAS zu tun ist.
  function meldeAuthFehler(error) {
    if (!error) return;
    const code = (error && error.code) || "";
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
    state.authFehler = { code: code || "ohne Code", text: authFehlerText(error) };
    setSync("error", `Anmeldung: ${state.authFehler.code}`);
    toast("Anmeldung fehlgeschlagen", `${state.authFehler.text} (${state.authFehler.code})`, "error");
    scheduleRender();
  }

  async function signIn() {
    if (!auth) return toast("Anmeldung nicht verfügbar", "Firebase wurde nicht geladen.", "error");
    const provider = new window.firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    state.authFehler = null;
    try {
      await auth.signInWithPopup(provider);
      closeOverlay();
      toast("Angemeldet", "Die gemeinsamen Quantus-Daten werden geladen.", "ok");
      return;
    } catch (error) {
      // Bewusst abgebrochen — keine Weiterleitung, keine Meldung.
      if (error && error.code === "auth/popup-closed-by-user") return;
      if (error && error.code === "auth/cancelled-popup-request") return;
      if (error && POPUP_FEHLER.has(error.code)) {
        try {
          toast("Anmeldung wird geöffnet", "Das Tablet wechselt kurz zu Google und kommt danach zurück.");
          await auth.signInWithRedirect(provider);
          return;   // die Seite verlaesst sich selbst; es geht bei
                    // getRedirectResult weiter
        } catch (zweiter) {
          meldeAuthFehler(zweiter);
          return;
        }
      }
      meldeAuthFehler(error);
    }
  }

  async function signOut() {
    if (!auth) return;
    state.authFehler = null;
    await auth.signOut();
    closeOverlay();
    toast("Abgemeldet", "Lokal bleiben keine neuen Quantus-Daten sichtbar.");
  }

  function updateAccountButton() {
    const button = document.getElementById("accountButton");
    if (!button) return;
    if (!state.user) { button.textContent = "↪"; button.title = "Anmelden"; return; }
    const parts = (state.user.displayName || state.user.email || "Q T").split(/[\s@._-]+/).filter(Boolean);
    button.textContent = parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    button.title = state.user.displayName || state.user.email;
  }

  function makeOperation(kind, action, collectionName, id, patch) {
    return {
      operationId: Core.makeId("op"),
      kind,
      action: action || "update",
      collection: collectionName || undefined,
      id: id || Core.makeId(kind),
      patch: patch || {},
      updatedAt: new Date().toISOString()
    };
  }

  function makeEntityBatch(operations) {
    return makeOperation("entity-batch", "update", null, Core.makeId("batch"), { operations });
  }

  function ideaAggregate(collectionName, id) {
    const notes = asMap(state.payload.entities.notes);
    const ideas = asMap(state.payload.entities.ideas);
    let note = collectionName === "notes" ? notes[id] : null;
    let idea = collectionName === "ideas" ? ideas[id] : null;
    const noteIdentity = (entry) => {
      if (!entry) return "";
      const source = sourceOf(entry);
      const dedupe = String(entry.dedupeKey || "");
      return source.app === "ideas" && source.entityId ? String(source.entityId)
        : (/^ideas?:/.test(dedupe) ? dedupe.replace(/^ideas?:/,"") : "");
    };
    if (note && (note.noteClass === "idea" || noteIdentity(note))) {
      const identity = noteIdentity(note);
      idea = Object.values(ideas).find((candidate) => candidate && !isDeleted(candidate) && (
        candidate.noteId === note.id || candidate.centralNoteId === note.id
        || (identity && String(candidate.id) === identity)
      )) || null;
    } else if (idea) {
      const refs = [idea.noteId, idea.centralNoteId].filter(Boolean);
      note = refs.map((noteId) => notes[noteId]).find(Boolean)
        || Object.values(notes).find((candidate) => candidate && !isDeleted(candidate) && noteIdentity(candidate) === String(idea.id)) || null;
    }
    if (!note || (note.noteClass !== "idea" && !noteIdentity(note))) return [];
    const targets = [{ collection:"notes", id:note.id, item:note }];
    Object.values(ideas).forEach((candidate) => {
      if (!candidate || isDeleted(candidate)) return;
      if (candidate === idea || candidate.noteId === note.id || candidate.centralNoteId === note.id
        || (noteIdentity(note) && String(candidate.id) === noteIdentity(note))) {
        targets.push({ collection:"ideas", id:candidate.id, item:candidate });
      }
    });
    return targets;
  }

  function restorePatch(item) {
    return {
      deleted:Boolean(item && item.deleted), archived:Boolean(item && item.archived),
      status:item && item.status && item.status !== "deleted" ? item.status : "open",
      deletedAt:item && item.deletedAt || null
    };
  }

  async function saveCanonicalNote(input, existingId, options) {
    const existing = existingId ? asMap(state.payload.entities.notes)[existingId] : null;
    const id = existingId || input.id || Core.makeId(input.noteClass === "idea" ? "idea" : "note");
    const compatibility = input.content != null && input.description == null ? { description: input.content } : {};
    const complete = Notes.createNote({ ...(existing || {}), ...input, ...compatibility, id }, {
      knownTags: noteTags(),
      source: input.source,
      now: new Date().toISOString()
    });
    const fields = ["noteClass", "title", "content", "description", "tags", "notebookId", "source", "dedupeKey", "createdAt", "updatedAt", "readingKind", "learningKind", "favorite", "isFavorite"];
    const patch = existing ? {} : { ...complete };
    if (existing) fields.forEach((key) => { if (complete[key] !== undefined) patch[key] = complete[key]; });
    delete patch.id;
    await executeOperation(makeOperation("entity", existing ? "update" : "create", "notes", id, patch), options);
    return id;
  }

  function noteSavedToast(noteId, label) {
    const node = document.createElement("div");
    node.className = "toast ok";
    node.innerHTML = `<strong>${esc(label || "In Noteflow gespeichert")}</strong><span>Inbox und Schlagwortansicht sind aktualisiert.</span><button class="btn small-btn" data-action="open-saved-note" data-id="${attr(noteId)}">In Noteflow öffnen</button>`;
    document.getElementById("toasts").appendChild(node);
    setTimeout(() => node.remove(), 7000);
  }

  function queueOperation(operation) {
    if (!state.pending.some((item) => item.operationId === operation.operationId)) state.pending.push(operation);
    // Verdichten statt anhaeufen: pro Element bleibt nur der letzte Stand liegen.
    state.pending = Core.compactQueue(state.pending);
    if (state.pending.length > PENDING_MAX_OPS) {
      state.pending = state.pending.slice(state.pending.length - PENDING_MAX_OPS);
      toast("Warteschlange voll", `Nur die letzten ${PENDING_MAX_OPS} Änderungen werden vorgemerkt.`, "error");
    }
    saveJson(LOCAL_KEYS.pending, state.pending);
    setSync("offline", `${state.pending.length} Änderung(en) vorgemerkt`);
  }

  async function executeOperation(operation, options) {
    const optimistic = Core.applyOperation(state.payload, operation);
    state.payload = optimistic.payload;
    scheduleRender();

    if (!state.user || !db || !navigator.onLine) {
      queueOperation(operation);
      toast("Offline vorgemerkt", "Die Änderung wird nach der nächsten Verbindung synchronisiert.");
      return false;
    }

    setSync("syncing", "Änderung wird mit AI Sync abgeglichen");
    try {
      const result = await transactionOperation(operation);
      if (!result.committed) throw new Error("Die Firebase-Transaktion wurde nicht bestätigt.");
      state.pending = state.pending.filter((item) => item.operationId !== operation.operationId);
      saveJson(LOCAL_KEYS.pending, state.pending);
      state.lastSync = new Date();
      setSync("synced", "Änderung auf Tablet und AI Sync gespeichert");
      if (!(options && options.silent)) toast("Gespeichert", "Die Änderung ist mit AI Sync synchronisiert.", "ok");
      return true;
    } catch (error) {
      queueOperation(operation);
      toast("Synchronisation vorgemerkt", error.message || "Die Änderung wird später erneut gesendet.", "error");
      return false;
    }
  }

  // Der kanonische Knoten ist der EINZIGE Schreibweg des Tablets. Frueher lief
  // nach jeder Transaktion zusaetzlich ein Spiegel nach polaris/inbox
  // (mirrorOperation) — als "doppeltes Netz" gegen eine aeltere
  // Desktop-Speicherung. Das ist seit S4b hinfaellig und war zuletzt selbst das
  // Risiko: der Desktop las die Inbox als eigenstaendige Quelle und legte aus
  // einem Spiegelsatz eine zweite Notiz an (F-23). Ausserdem feuerte der Spiegel
  // auch dann, wenn die Transaktion die Operation als veraltet ABGELEHNT hatte —
  // der Updater gibt in dem Fall den unveraenderten Stand zurueck, die
  // Transaktion committet trotzdem, und applied wurde nie geprueft. Damit trug
  // ein bereits verworfener Stand ueber die Inbox doch noch ins Modell.
  // polaris/inbox ist ausschliesslich der n8n-/Voice-Eingang.
  function transactionOperation(operation) {
    const ref = db.ref(APP_STORE_PATH);
    return new Promise((resolve, reject) => {
      ref.transaction((current) => {
        const parsed = Core.parseWrapper(current);
        const result = Core.applyOperation(parsed.payload, operation);
        if (!result.applied && result.reason === "newer-remote-version") return current;
        return Core.buildWrapper(result.payload, state.deviceId, operation.updatedAt);
      }, (error, committed, snapshot) => {
        if (error) reject(error);
        else resolve({ committed, snapshot });
      }, false);
    });
  }

  async function flushPending() {
    if (!state.user || !db || !navigator.onLine || !state.pending.length || state.syncStatus === "syncing") return;
    state.pending = Core.compactQueue(state.pending);
    saveJson(LOCAL_KEYS.pending, state.pending);
    const queue = state.pending.slice();
    setSync("syncing", `${queue.length} vorgemerkte Änderung(en) werden synchronisiert`);
    for (const operation of queue) {
      try {
        await transactionOperation(operation);
        state.pending = state.pending.filter((item) => item.operationId !== operation.operationId);
        saveJson(LOCAL_KEYS.pending, state.pending);
      } catch (error) {
        setSync("error", error.message);
        return;
      }
    }
    state.lastSync = new Date();
    setSync("synced", "Alle vorgemerkten Änderungen wurden synchronisiert");
    toast("Wieder synchron", "Alle Offline-Änderungen sind in AI Sync angekommen.", "ok");
  }

  function loginBanner() {
    if (state.user) return "";
    // Ein gescheiterter Anmeldeversuch darf nicht mit der Einblendung
    // verschwinden — nach einer Weiterleitung ist sie ohnehin weg. Der Code
    // steht hier, weil erst er sagt, was zu tun ist.
    const fehler = state.authFehler
      ? `<p class="muted" style="color:var(--danger,#e06c75)">${esc(state.authFehler.text)} <strong>(${esc(state.authFehler.code)})</strong></p>`
      : "";
    return `<section class="widget span-12" style="min-height:auto;border-color:var(--accent)">
      <div class="widget-head"><span class="widget-icon">↪</span><h2>Mit AI Sync verbinden</h2></div>
      <p class="muted">Melde dich einmal mit demselben Google-Konto wie in Quantus an. Danach verwendet die Tablet-App dieselben Daten wie AI Sync.</p>
      ${fehler}
      <button class="btn primary" data-action="sign-in">Mit Google anmelden</button>
    </section>`;
  }

  function todayTasks() {
    const today = localDateKey();
    return collection("tasks").filter((task) => !isDone(task) && (!task.dueDate || String(task.dueDate).slice(0, 10) <= today));
  }

  function todayEvents() {
    const today = localDateKey();
    return collection("calendarEvents").filter((event) => String(event.date || event.start || event.startAt || "").slice(0, 10) === today);
  }

  function todayMeetings() {
    const today = localDateKey();
    return collection("meetings").filter((meeting) => String(meeting.date || meeting.start || meeting.startAt || "").slice(0, 10) === today);
  }

  function dueCards() {
    const cards = asArray(state.payload.recallLabData && state.payload.recallLabData.cards);
    return cards.filter((card) => card && (!card.srs || !card.srs.nextReview || Number(card.srs.nextReview) <= Date.now()));
  }

  function activeHabits() {
    return asArray(state.payload.dailyBriefing && state.payload.dailyBriefing.routines).filter((item) => item && item.aktiv !== false);
  }

  function taskItem(task) {
    const done = isDone(task);
    return `<div class="list-item ${done ? "done" : ""}" data-action="toggle-task" data-id="${attr(task.id)}">
      <span class="check">${done ? "✓" : ""}</span>
      <div class="item-main"><div class="item-title">${esc(itemTitle(task,"Aufgabe"))}</div>
      <div class="item-meta">${task.dueDate ? `Fällig ${esc(formatDate(task.dueDate))}` : "Ohne Frist"}${task.projectId ? " · Projekt" : ""}</div></div>
      ${isOverdue(task) ? `<span class="badge coral">Überfällig</span>` : ""}
      ${task.priority ? `<span class="badge ${task.priority === "high" ? "coral" : ""}">${esc(task.priority)}</span>` : ""}
    </div>`;
  }

  function habitItem(habit) {
    const today = localDateKey();
    const dates = asArray(habit.completedDates || habit.dates);
    const done = dates.includes(today) || habit.lastCompleted === today;
    return `<div class="list-item ${done ? "done" : ""}" data-action="toggle-habit" data-id="${attr(habit.id)}">
      <span class="check">${done ? "✓" : ""}</span>
      <div class="item-main"><div class="item-title">${esc(habit.name || habit.title || "Gewohnheit")}</div><div class="item-meta">${done ? "Heute erledigt" : "Heute offen"}</div></div>
      <button class="icon-action" data-action="habit-note" data-id="${attr(habit.id)}" aria-label="Erkenntnis notieren">＋✎</button>
      <span>${esc(habit.icon || "◌")}</span>
    </div>`;
  }

  function renderHome() {
    const tasks = todayTasks();
    const events = [...todayEvents(), ...todayMeetings()].sort((a, b) => String(a.start || a.time || "").localeCompare(String(b.start || b.time || "")));
    const habits = activeHabits();
    const cards = dueCards();
    const docs = values(state.driveDocs).filter((doc) => doc.status !== "papierkorb").sort((a, b) => Date.parse(b.aktualisiert || b.erstellt || 0) - Date.parse(a.aktualisiert || a.erstellt || 0));
    const date = new Intl.DateTimeFormat("de-CH", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Zurich" }).format(new Date());
    return `<div class="view">
      <div class="dashboard-grid">
        ${loginBanner()}
        <section class="widget span-7 tall hero-widget">
          <div class="hero-date">${esc(date)}</div>
          <h1 class="hero-title">Guten ${new Date().getHours() < 12 ? "Morgen" : new Date().getHours() < 18 ? "Tag" : "Abend"}, Laurin.</h1>
          <p class="muted">${state.user ? "Dein Tablet arbeitet mit demselben Quantus-Datenstand wie AI Sync." : "Verbinde die Tablet-App, um deinen aktuellen Quantus-Tag zu laden."}</p>
          ${briefingHero()}
          <div class="metric-row">
            <div class="metric"><strong>${tasks.length}</strong><small>offene Aufgaben</small></div>
            <div class="metric"><strong>${tasks.filter(isOverdue).length}</strong><small>überfällig</small></div>
            <div class="metric"><strong>${events.length}</strong><small>Termine</small></div>
            <div class="metric"><strong>${cards.length}</strong><small>Karteikarten</small></div>
          </div>
          <div class="row-actions" style="margin-top:18px"><button class="btn primary" data-action="open-shortnote">＋ Shortnote</button><button class="btn" data-action="go" data-route="daily">Daily Briefing öffnen</button><button class="btn" data-action="polaris">Polaris fragen</button></div>
        </section>
        <section class="widget span-5 tall">
          <div class="widget-head"><span class="widget-icon">✓</span><h2>Heute wichtig</h2><button data-action="go" data-route="tasks">Alle</button></div>
          <div class="item-list">${tasks.slice(0, 4).map(taskItem).join("") || emptyMini("Keine dringenden Aufgaben")}</div>
          <button class="btn ghost small-btn" style="margin-top:10px" data-action="new-entity" data-collection="tasks">＋ Aufgabe</button>
        </section>
        <section class="widget span-4">
          <div class="widget-head"><span class="widget-icon">◉</span><h2>Termine</h2><button data-action="go" data-route="meetings">Öffnen</button></div>
          <div class="item-list">${events.slice(0, 3).map((event) => `<div class="list-item"><span class="badge accent">${esc(formatTime(event.start || event.time || event.startAt) || "Heute")}</span><div class="item-main"><div class="item-title">${esc(itemTitle(event,"Termin"))}</div><div class="item-meta">${esc(event.location || event.place || "")}</div></div></div>`).join("") || emptyMini("Heute keine Termine")}</div>
        </section>
        <section class="widget span-4">
          <div class="widget-head"><span class="widget-icon">◌</span><h2>Habits</h2><button data-action="go" data-route="habits">Öffnen</button></div>
          <div class="item-list">${habits.slice(0, 3).map(habitItem).join("") || emptyMini("Noch keine Gewohnheiten")}</div>
        </section>
        <section class="widget span-4">
          <div class="widget-head"><span class="widget-icon">▤</span><h2>Weiterlesen</h2><button data-action="go" data-route="reading">Bibliothek</button></div>
          <div class="item-list">${docs.slice(0, 3).map((doc) => `<div class="list-item" data-action="open-doc" data-id="${attr(doc.id || findMapKey(state.driveDocs,doc))}"><span>▧</span><div class="item-main"><div class="item-title">${esc(doc.titel_final || doc.dateiname || "Dokument")}</div><div class="item-meta">${esc(doc.bereich || doc.mimeType || "Quantus Drive")}</div></div></div>`).join("") || emptyMini("Keine Drive-Dokumente geladen")}</div>
        </section>
        <section class="widget span-12" style="min-height:auto">
          <div class="widget-head"><span class="widget-icon">↻</span><h2>Zuletzt bearbeitet</h2><button data-action="go" data-route="reports">Alle</button></div>
          <div class="item-list">${recentActivity(5).map(({ name, config, item }) => `<div class="list-item" ${COLLECTION_CONFIG[name] ? `data-action="edit-entity" data-collection="${attr(name)}" data-id="${attr(item.id)}"` : ""}><span class="badge accent">${esc(config.label)}</span><div class="item-main"><div class="item-title">${esc(itemTitle(item))}</div><div class="item-meta">${esc(relativeTime(item.updatedAt || item.createdAt))}</div></div></div>`).join("") || emptyMini("Noch keine Aktivität – lege direkt los.")}</div>
        </section>
        <section class="widget span-12" style="min-height:auto">
          <div class="widget-head"><span class="widget-icon">▦</span><h2>Quantus Apps</h2><button data-action="apps">Alle Apps</button></div>
          <div class="apps-grid">${APP_DEFS.filter((app) => ["workspace","reading","notes","concepts","learning","projects","meetings"].includes(app.key)).map(appTile).join("")}</div>
        </section>
      </div>
    </div>`;
  }

  function emptyMini(text) { return `<div class="muted small" style="padding:18px 4px">${esc(text)}</div>`; }

  /*
   * DAS BRIEFING IM HERO.
   *
   * BEFUND: Der Startbildschirm begruesste, zeigte vier Zahlen und einen Knopf
   * "Daily Briefing oeffnen" — den Tag selbst sah man erst nach einem Klick.
   * Auf einem Tablet, das man morgens aufklappt, ist das die falsche
   * Reihenfolge.
   *
   * Der Block nimmt DIESELBEN Quellen wie renderDaily (todayEvents,
   * todayMeetings, todayTasks, activeHabits, dailyBriefing.beliefs). Er rechnet
   * nichts eigenes — sonst koennten Hero und Briefing verschiedene Zahlen
   * zeigen.
   */
  function briefingHero() {
    const termine = [...todayEvents(), ...todayMeetings()]
      .sort((a, b) => String(a.start || a.time || a.startTime || "").localeCompare(String(b.start || b.time || b.startTime || "")));
    const naechster = termine[0];
    const tasks = todayTasks();
    const ueberfaellig = tasks.filter(isOverdue);
    const habits = activeHabits();
    const erledigt = habits.filter(isHabitDoneToday).length;
    const beliefs = asArray(state.payload.dailyBriefing && state.payload.dailyBriefing.beliefs);

    const zeilen = [];
    if (naechster) {
      zeilen.push(`<li><b>${esc(formatTime(naechster.start || naechster.time || naechster.startTime) || "—")}</b> ${esc(itemTitle(naechster) || "Termin")}</li>`);
    }
    if (tasks.length) {
      zeilen.push(`<li><b>${tasks.length}</b> ${tasks.length === 1 ? "Aufgabe heute" : "Aufgaben heute"}${ueberfaellig.length ? ` · <span class="hero-warn">${ueberfaellig.length} überfällig</span>` : ""}</li>`);
    }
    if (habits.length) {
      zeilen.push(`<li><b>${erledigt}/${habits.length}</b> Routinen erledigt</li>`);
    }
    if (!zeilen.length) zeilen.push("<li>Nichts Dringendes — freier Lauf.</li>");
    const erster = beliefs.length ? beliefs[0] : null;
    const satz = erster ? (asMap(erster).text || String(erster)) : "";

    return `<div class="hero-briefing">
      <div class="hero-briefing-head">☀️ Dein Tag</div>
      <ul class="hero-briefing-list">${zeilen.join("")}</ul>
      ${satz ? `<div class="hero-briefing-belief">${esc(satz)}</div>` : ""}
    </div>`;
  }

  // Erledigt-Stempel wie in der Routinen-Ansicht — hier gebraucht, damit der
  // Hero denselben Stand zeigt wie das Briefing.
  /*
   * BEFUND: hier stand new Date().toISOString().slice(0,10) — also der Tag in
   * UTC. Ab 22 Uhr Zuercher Sommerzeit ist das bereits der Folgetag: eine
   * abends abgehakte Routine galt als offen, und der Zaehler im Hero log.
   * localDateKey() gibt es in dieser Datei laengst und rechnet in
   * Europe/Zurich.
   *
   * ZWEITER PUNKT: eine Routine MIT Sub-Einheiten gilt in der Hauptapp erst
   * als erledigt, wenn ALLE Schritte stehen (isHabitDoneOnDate). Ohne diese
   * Regel zaehlten Tablet, Handy und Hauptapp am selben Datensatz
   * verschieden.
   */
  function habitSubUnits(habit) {
    return asArray(habit && habit.subUnits).filter((u) => u && u.name);
  }
  function habitSubDone(habit, name, dayKey) {
    return asArray(habit && habit.subCompletions)
      .some((c) => c && c.date === dayKey && c.subUnitName === name);
  }
  function isHabitDoneOn(habit, dayKey) {
    const subs = habitSubUnits(habit);
    if (subs.length) return subs.every((u) => habitSubDone(habit, u.name, dayKey));
    const done = habit && (habit.completions || habit.erledigt || habit.done);
    if (Array.isArray(done)) return done.some((entry) => String(entry && (entry.date || entry)).slice(0, 10) === dayKey);
    if (done && typeof done === "object") return Boolean(done[dayKey]);
    return false;
  }
  function isHabitDoneToday(habit) { return isHabitDoneOn(habit, localDateKey()); }

  /*
   * DAS VOLLSTAENDIGE DAILY BRIEFING.
   *
   * BEFUND: hier standen vier Kacheln — Prioritaeten, Agenda, Routinen,
   * Leitgedanken. Die Hauptapp zeigt SIEBZEHN Abschnitte, und alle liegen im
   * selben Datensatz: Tagesziele, Wochenziele, Massnahmen, Nachrichten,
   * Gedanken, Leseliste, Tagesplanung, pendente Aufgaben, generelle Ziele,
   * Notizen, Projekte, Programme, Meetings, Reflexionsfragen und die
   * vergangenen Tage. Sie wurden nur nie gelesen.
   *
   * Dieses Modell liest DIESELBEN Felder wie die Handy-App
   * (store.briefingFuerTag). Laufen die beiden auseinander, faellt der
   * Waechter in beiden Repos.
   */
  function briefingModell(dayKey) {
    const payload = state.payload || {};
    const db = asMap(payload.dailyBriefing);
    const tagVon = (v) => String(v || "").slice(0, 10);
    const offen = collection("tasks").filter((t) => !isDone(t));

    const wocheStart = (() => {
      const x = new Date(dayKey + "T12:00:00");
      x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
      return localDateKey(x);
    })();

    // Massnahmen liegen VERTEILT an den Entitaeten — wortgleich zu
    // getAllActiveMeasures() der Hauptapp.
    const massnahmen = [];
    [["Aufgabe", "tasks"], ["Projekt", "projects"], ["Konzept", "concepts"], ["Strategie", "strategies"]]
      .forEach(([label, name]) => {
        collection(name).forEach((e) => asArray(e.measures).forEach((m) => {
          if (!m) return;
          massnahmen.push({ id: m.id, text: m.text, status: m.status || "active",
            parentLabel: label, parentTitle: itemTitle(e, label) });
        }));
      });

    const reflexionsfragen = [];
    collection("projects").forEach((p) => asArray(p.reflectionQuestions).forEach((q) => {
      if (!q) return;
      const letzte = asArray(q.answers).slice(-1)[0];
      reflexionsfragen.push({ id: q.id, text: q.text || q.question || "", projekt: itemTitle(p, "Projekt"),
        heuteBeantwortet: Boolean(letzte && letzte.date === dayKey) });
    }));

    const log = asMap(asMap(db.dailyLog)[dayKey]);
    const vergangene = Array.from(new Set([].concat(
      Object.keys(asMap(db.dailyLog)), Object.keys(asMap(db.timeBlocks)), Object.keys(asMap(payload.dailyGoals))
    ))).filter((k) => k < dayKey).sort().reverse().slice(0, 14);

    return {
      datum: dayKey,
      tagesziele:  asArray(asMap(payload.dailyGoals)[dayKey]),
      wochenziele: asArray(payload.weeklyGoals).filter((g) => !g.weekStart || g.weekStart === wocheStart),
      routinen:    activeHabits(),
      beliefs:     asArray(db.beliefs),
      massnahmen:  massnahmen.filter((m) => m.status === "active"),
      nachrichten: values(payload.entities && payload.entities.scheduledMessages)
                     .filter((m) => m && m.isDelivered && tagVon(m.deliveredAt) === dayKey),
      gedanken:    asArray(payload.journal && payload.journal.topics).slice().reverse(),
      leseliste:   asArray(payload.readingList),
      zeitbloecke: asArray(asMap(db.timeBlocks)[dayKey]).slice()
                     .sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || ""))),
      meetings:    [].concat(todayEvents(), todayMeetings()),
      faellig:     offen.filter((t) => tagVon(t.dueDate) === dayKey),
      ueberfaellig: offen.filter((t) => t.dueDate && tagVon(t.dueDate) < dayKey),
      pendent:     offen.filter((t) => !t.dueDate),
      ziele:       collection("goals").filter((g) => !asArray(db.hiddenGoals).includes(g.id)),
      notizen:     String(log.notes || ""),
      projekte:    collection("projects").filter((p) => asArray(db.selectedProjects).includes(p.id)),
      programme:   collection("programs").filter((p) => asArray(db.selectedPrograms).includes(p.id)),
      reflexionsfragen: reflexionsfragen,
      vergangeneTage: vergangene
    };
  }

  function dbSection(spalten, icon, titel, zaehler, inhalt, kopfAktion) {
    return `<section class="widget span-${spalten}">
      <div class="widget-head"><span class="widget-icon">${icon}</span><h2>${esc(titel)}</h2>
        ${zaehler ? `<span class="badge accent">${esc(String(zaehler))}</span>` : ""}
        ${kopfAktion || ""}</div>
      ${inhalt}
    </section>`;
  }
  function dbZeile(titel, unten, klasse) {
    return `<div class="list-item ${klasse || ""}"><div class="item-main">
      <div class="item-title">${esc(String(titel))}</div>
      ${unten ? `<div class="item-meta">${esc(String(unten))}</div>` : ""}</div></div>`;
  }

  function renderDaily() {
    const tag = state.dbTag || localDateKey();
    const heute = localDateKey();
    const b = briefingModell(tag);
    const routinenFertig = b.routinen.filter((h) => isHabitDoneOn(h, tag)).length;
    const zieleFertig = b.tagesziele.filter((g) => g && g.completed).length;
    const datumText = new Date(tag + "T12:00:00").toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long" });

    const routineZeile = (h) => {
      const on = isHabitDoneOn(h, tag);
      const subs = habitSubUnits(h);
      const fertig = subs.filter((u) => habitSubDone(h, u.name, tag)).length;
      return `<div class="list-item ${on ? "done" : ""}" data-action="toggle-habit" data-id="${attr(h.id)}">
        <span class="check">${on ? "✓" : ""}</span>
        <div class="item-main"><div class="item-title">${esc(h.text || itemTitle(h, "Routine"))}</div>
        <div class="item-meta">${subs.length ? `${fertig}/${subs.length} Schritte` : esc(h.frequency || "täglich")}</div></div>
      </div>`;
    };

    return `<div class="view">
      ${viewHeader("Daily Briefing", datumText, `<button class="btn" data-action="briefing-note" data-tag="${attr(tag)}">＋ Erkenntnis</button><button class="btn" data-action="db-day" data-tage="-1">‹ Vortag</button>${tag === heute ? "" : `<button class="btn" data-action="db-day" data-tag="heute">Heute</button>`}<button class="btn" data-action="db-day" data-tage="1">Folgetag ›</button><button class="btn" data-action="polaris">Mit Polaris besprechen</button><button class="btn primary" data-action="new-entity" data-collection="tasks">＋ Aufgabe</button>`)}
      ${loginBanner()}
      <div class="metric-row">
        <div class="metric"><strong>${b.meetings.length}</strong><small>Termine</small></div>
        <div class="metric"><strong>${b.faellig.length}</strong><small>fällig</small></div>
        <div class="metric"><strong>${b.ueberfaellig.length}</strong><small>überfällig</small></div>
        <div class="metric"><strong>${routinenFertig}/${b.routinen.length}</strong><small>Routinen</small></div>
        <div class="metric"><strong>${zieleFertig}/${b.tagesziele.length}</strong><small>Tagesziele</small></div>
      </div>
      <div class="dashboard-grid">

        ${dbSection(6, "◎", "Tagesziele", `${zieleFertig}/${b.tagesziele.length}`,
          `<div class="item-list">${b.tagesziele.map((g) => `<div class="list-item ${g.completed ? "done" : ""}" data-action="db-toggle-goal" data-id="${attr(g.id)}"><span class="check">${g.completed ? "✓" : ""}</span><div class="item-main"><div class="item-title">${esc(g.title || "")}</div></div></div>`).join("") || emptyMini("Noch kein Tagesziel.")}</div>
           <form class="quick-add" data-form="db-goal"><span>＋</span><input name="title" placeholder="Ziel für diesen Tag" autocomplete="off"><button class="btn primary small-btn" type="submit">Hinzufügen</button></form>`)}

        ${dbSection(6, "▲", "Wochenziele", b.wochenziele.length,
          `<div class="item-list">${b.wochenziele.map((g) => dbZeile(g.title || g.type || "Ziel", (g.current != null && g.target != null) ? `${g.current}/${g.target}` : "")).join("") || emptyMini("Keine Wochenziele.")}</div>`)}

        ${dbSection(7, "◷", "Tagesplanung", b.zeitbloecke.length,
          `<div class="item-list">${b.zeitbloecke.map((tb) => `<div class="list-item"><span class="badge accent">${esc(String(tb.startTime || "").slice(0,5))}</span><div class="item-main"><div class="item-title">${esc(tb.title || "Block")}</div><div class="item-meta">bis ${esc(String(tb.endTime || "").slice(0,5))}</div></div></div>`).join("") || emptyMini("Keine Zeitblöcke für diesen Tag.")}</div>`)}

        ${dbSection(5, "◉", "Agenda", b.meetings.length,
          `<div class="item-list">${b.meetings.map((m) => `<div class="list-item"><span class="badge accent">${esc(formatTime(m.start || m.startAt || m.time) || "Heute")}</span><div class="item-main"><div class="item-title">${esc(itemTitle(m,"Termin"))}</div><div class="item-meta">${esc(m.location || m.description || "")}</div></div></div>`).join("") || emptyMini("Keine Termine für diesen Tag.")}</div>`,
          `<button data-action="go" data-route="meetings">Öffnen</button>`)}

        ${dbSection(6, "✓", "Fällig heute", b.faellig.length,
          `<div class="item-list">${b.faellig.map(taskItem).join("") || emptyMini("Nichts fällig.")}</div>`)}

        ${b.ueberfaellig.length ? dbSection(6, "!", "Überfällig", b.ueberfaellig.length,
          `<div class="item-list">${b.ueberfaellig.map(taskItem).join("")}</div>`) : ""}

        ${dbSection(6, "▣", "Pendente Aufgaben", b.pendent.length,
          `<div class="item-list">${b.pendent.slice(0, 10).map(taskItem).join("") || emptyMini("Nichts Offenes ohne Datum.")}</div>`,
          `<button data-action="go" data-route="tasks">Alle</button>`)}

        ${dbSection(6, "◌", "Routinen", `${routinenFertig}/${b.routinen.length}`,
          `<div class="item-list">${b.routinen.map(routineZeile).join("") || emptyMini("Füge deine erste Routine hinzu.")}</div>`,
          `<button data-action="go" data-route="habits">Bearbeiten</button>`)}

        ${dbSection(6, "⚑", "Aktive Massnahmen", b.massnahmen.length,
          `<div class="item-list">${b.massnahmen.map((m) => dbZeile(m.text || "", `${m.parentLabel} · ${m.parentTitle}`)).join("") || emptyMini("Keine aktiven Massnahmen.")}</div>`)}

        ${dbSection(6, "✉", "Nachrichten", b.nachrichten.length,
          `<div class="item-list">${b.nachrichten.map((m) => `<div class="list-item"><div class="item-main"><div class="item-title">${esc(m.title || "Nachricht")}</div><div class="item-meta">${esc(String(m.content || "").slice(0, 200))}</div></div><span class="badge">${esc(String(m.deliveredAt || "").slice(11,16))}</span></div>`).join("") || emptyMini("Keine Nachrichten für diesen Tag.")}</div>`)}

        ${dbSection(6, "✦", "Leitgedanken", b.beliefs.length,
          b.beliefs.length ? b.beliefs.slice(0, 8).map((i) => `<blockquote style="margin:8px 0;color:var(--text2)">“${esc(i.text || i.title || i)}”</blockquote>`).join("") : emptyMini("Noch keine Leitgedanken."))}

        ${dbSection(6, "◈", "Gedanken & Fragen", b.gedanken.length,
          `<div class="item-list">${b.gedanken.slice(0, 6).map((t) => dbZeile(t.text || "", String(t.createdAt || "").slice(0, 10))).join("") || emptyMini("Noch nichts notiert.")}</div>
           <form class="quick-add" data-form="db-thought"><span>＋</span><input name="text" placeholder="Gedanke, Frage, Beobachtung" autocomplete="off"><button class="btn primary small-btn" type="submit">Notieren</button></form>`)}

        ${dbSection(6, "▤", "Leseliste", b.leseliste.length,
          `<div class="item-list">${b.leseliste.slice(0, 8).map((r) => dbZeile(itemTitle(r, "Eintrag"), r.completedAt ? "gelesen" : (r.author || ""), r.completedAt ? "done" : "")).join("") || emptyMini("Leseliste leer.")}</div>`,
          `<button data-action="go" data-route="reading">Bibliothek</button>`)}

        ${dbSection(6, "★", "Generelle Ziele", b.ziele.length,
          `<div class="item-list">${b.ziele.slice(0, 8).map((g) => dbZeile(itemTitle(g, "Ziel"), g.status || "")).join("") || emptyMini("Keine Ziele.")}</div>`,
          `<button data-action="go" data-route="goals">Alle</button>`)}

        ${dbSection(6, "▦", "Projekte im Briefing", b.projekte.length,
          `<div class="item-list">${b.projekte.map((p) => dbZeile(itemTitle(p, "Projekt"), p.status || "")).join("") || emptyMini("Keine Projekte fürs Briefing gewählt.")}</div>`)}

        ${dbSection(6, "▩", "Programme im Briefing", b.programme.length,
          `<div class="item-list">${b.programme.map((p) => dbZeile(itemTitle(p, "Programm"), p.status || "")).join("") || emptyMini("Keine Programme fürs Briefing gewählt.")}</div>`)}

        ${dbSection(6, "◍", "Reflexionsfragen", b.reflexionsfragen.length,
          `<div class="item-list">${b.reflexionsfragen.slice(0, 10).map((q) => dbZeile(q.text, `${q.projekt}${q.heuteBeantwortet ? " · heute beantwortet" : ""}`, q.heuteBeantwortet ? "done" : "")).join("") || emptyMini("Keine Reflexionsfragen hinterlegt.")}</div>`)}

        ${dbSection(6, "✎", "Tägliche Notizen", "",
          `<form data-form="db-note"><textarea name="notes" rows="5" style="width:100%;resize:vertical;font-family:inherit;padding:10px;border-radius:12px;border:1px solid var(--line);background:var(--surface2);color:var(--text)" placeholder="Was war heute?">${esc(b.notizen)}</textarea><button class="btn primary small-btn" type="submit" style="margin-top:8px">Notiz sichern</button></form>`)}

        ${dbSection(12, "▥", "Vergangene Tage", b.vergangeneTage.length,
          `<div class="chip-row">${b.vergangeneTage.map((t) => `<button class="chip" data-action="db-day" data-tag="${attr(t)}">${esc(t.slice(8) + "." + t.slice(5,7) + ".")}</button>`).join("") || emptyMini("Noch keine Historie.")}</div>`)}

      </div>
    </div>`;
  }

  function viewHeader(title, subtitle, actions) {
    return `<div class="view-head"><div><h1>${esc(title)}</h1><p>${esc(subtitle || "")}</p></div><div class="head-actions">${actions || ""}</div></div>`;
  }

  function renderCollectionView(name) {
    const config = COLLECTION_CONFIG[name];
    let items = collection(name);
    const counts = {
      all: items.length,
      open: items.filter((item) => !isDone(item) && item.status !== "in_progress").length,
      in_progress: items.filter((item) => item.status === "in_progress").length,
      done: items.filter(isDone).length
    };
    if (state.statusFilter === "open") items = items.filter((item) => !isDone(item) && item.status !== "in_progress");
    else if (state.statusFilter === "in_progress") items = items.filter((item) => item.status === "in_progress");
    else if (state.statusFilter === "done") items = items.filter(isDone);
    if (state.search) items = items.filter((item) => `${itemTitle(item)} ${itemText(item)}`.toLowerCase().includes(state.search.toLowerCase()));
    if (state.sort === "alpha") items = items.slice().sort((a, b) => itemTitle(a, "").localeCompare(itemTitle(b, ""), "de"));
    else if (state.sort === "due") items = items.slice().sort((a, b) => String(a.dueDate || a.date || "9999").localeCompare(String(b.dueDate || b.date || "9999")));
    // Angepinnte Elemente stehen immer zuoberst.
    items = [...items.filter((item) => state.pins.includes(item.id)), ...items.filter((item) => !state.pins.includes(item.id))];
    const statusChip = (key, label) => `<button class="chip ${state.statusFilter === key ? "on" : ""}" data-action="status-filter" data-status="${key}">${esc(label)} ${counts[key] != null ? counts[key] : ""}</button>`;
    return `<div class="view">
      ${viewHeader(config.plural, collectionSubtitle(name), `<button class="btn" data-action="split-with" data-route="${attr(config.route)}">◫ Split-Screen</button><button class="btn primary" data-action="new-entity" data-collection="${attr(name)}">＋ ${esc(config.label)}</button>`)}
      ${loginBanner()}
      <form class="quick-add" data-form="quick-add" data-collection="${attr(name)}"><span>＋</span><input name="title" data-quickadd placeholder="${esc(config.label)} eintippen und Enter druecken – ohne Formular" autocomplete="off"><button class="btn primary small-btn" type="submit">Hinzufuegen</button></form>
      <div class="filterbar">
        <div class="search-field"><span>⌕</span><input data-action="filter-collection" placeholder="${esc(config.plural)} durchsuchen" value="${attr(state.search)}"></div>
        <div class="chip-row">${statusChip("all", "Alle")}${statusChip("open", "Offen")}${statusChip("in_progress", "In Arbeit")}${statusChip("done", "Erledigt")}</div>
        <select class="sort-select" data-action="sort-collection" aria-label="Sortierung">
          <option value="new" ${state.sort === "new" ? "selected" : ""}>Neueste zuerst</option>
          <option value="alpha" ${state.sort === "alpha" ? "selected" : ""}>A bis Z</option>
          <option value="due" ${state.sort === "due" ? "selected" : ""}>Nach Faelligkeit</option>
        </select>
      </div>
      <div class="content-grid">${items.map((item) => entityCard(name,item)).join("") || emptyState(config.icon,`Noch keine ${config.plural}`,`Erstelle den ersten Eintrag auf dem Tablet oder in AI Sync.`)}</div>
    </div>`;
  }

  function collectionSubtitle(name) {
    if (name === "tasks") return "Aufgaben aus AI Sync – Änderungen werden sofort auf beiden Oberflächen sichtbar.";
    if (name === "projects") return "Ziele, Meilensteine und nächste Schritte an einem Ort.";
    if (name === "notes") return "Deine synchronisierte Wissens- und Notizzentrale.";
    if (name === "meetings") return "Vorbereitung, Durchführung und Nachbearbeitung deiner Sitzungen.";
    const config = COLLECTION_CONFIG[name];
    return `${config ? config.plural : "Einträge"} aus AI Sync – Änderungen sind sofort auf Tablet und Desktop sichtbar.`;
  }

  function isOverdue(item) {
    const due = String(item && (item.dueDate || item.date) || "").slice(0, 10);
    return Boolean(due) && due < localDateKey() && !isDone(item);
  }

  function entityCard(name, item) {
    const config = COLLECTION_CONFIG[name];
    const meta = item.dueDate || item.date || item.updatedAt || item.createdAt;
    const pinned = state.pins.includes(item.id);
    const contextNotes = CONTEXT_NOTE_COLLECTIONS.has(name)
      ? Notes.notesForSource(collection("notes"), contextSource(name, item).app, item.id).length
      : 0;
    return `<article class="entity-card ${pinned ? "pinned" : ""}">
      <div class="row-actions"><span class="badge accent">${esc(config.label)}</span>${item.status ? `<span class="badge">${esc(item.status)}</span>` : ""}${isOverdue(item) ? `<span class="badge coral">Überfällig</span>` : ""}${pinned ? `<span class="badge sand">Angepinnt</span>` : ""}${contextNotes ? `<span class="badge">${contextNotes} Notiz${contextNotes === 1 ? "" : "en"}</span>` : ""}</div>
      <h3>${esc(itemTitle(item,config.label))}</h3><p>${esc(itemText(item) || "Keine Beschreibung")}</p>
      <div class="card-foot"><span class="muted small">${meta ? esc(formatDate(meta)) : ""}</span><span class="spacer"></span>
        ${CONTEXT_NOTE_COLLECTIONS.has(name) ? `<button class="icon-action" data-action="context-note" data-collection="${attr(name)}" data-id="${attr(item.id)}" aria-label="Notiz hinzufügen">＋✎</button>` : ""}
        <button class="icon-action" data-action="pin-entity" data-id="${attr(item.id)}" aria-label="${pinned ? "Lösen" : "Anpinnen"}">${pinned ? "★" : "☆"}</button>
        <button class="icon-action" data-action="duplicate-entity" data-collection="${attr(name)}" data-id="${attr(item.id)}" aria-label="Duplizieren">⧉</button>
        <button class="icon-action" data-action="edit-entity" data-collection="${attr(name)}" data-id="${attr(item.id)}" aria-label="Bearbeiten">✎</button>
        <button class="icon-action" data-action="delete-entity" data-collection="${attr(name)}" data-id="${attr(item.id)}" aria-label="Löschen">⌫</button>
      </div>
    </article>`;
  }

  function emptyState(icon, title, text) {
    return `<div class="empty-state"><div><span>${esc(icon)}</span><strong>${esc(title)}</strong><p>${esc(text)}</p></div></div>`;
  }

  function tagButtons(tags) {
    return Notes.normalizeTags(tags).map((tag) => `<button class="note-tag" data-action="note-filter" data-mode="tag" data-value="${attr(tag)}">#${esc(tag)}</button>`).join("");
  }

  function noteSourceExists(note) {
    const source = sourceOf(note);
    if (!source.entityId) return true;
    if (["noteflow", "shortnote", "ideas"].includes(source.app)) return true;
    if (source.app === "readinghub") {
      return source.entityType === "document"
        ? Boolean(asMap(state.driveDocs)[source.entityId])
        : Boolean(asMap(state.payload.entities.books)[source.entityId]);
    }
    if (source.app === "smarter") return Boolean(asMap(state.smarterDocs)[source.entityId]);
    if (source.app === "bmpruefung" || source.app === "recalllab" || source.app === "leseplan") return true;
    if (source.app === "calendar" || source.app === "googlecalendar") {
      return Boolean(asMap(state.payload.entities.calendarEvents)[source.entityId]
        || asMap(state.payload.entities.meetings)[source.entityId]);
    }
    if (source.app === "articles") {
      return Notes.sourceEntityCollections(source).some((name) => Boolean(asMap(state.payload.entities[name])[source.entityId]));
    }
    const aliases = { thesis:"theses", messages:"scheduledMessages", briefing:"briefings" };
    const collectionName = aliases[source.app] || source.app;
    if (asMap(state.payload.entities[collectionName])[source.entityId]) return true;
    // Einige tablet-native Werkzeuge speichern ihre Originale in eigenstaendigen
    // synchronisierten Bereichen. Ein Backlink bleibt fuer diese Routen gueltig;
    // sie duerfen nicht faelschlich als geloeschte Quelle markiert werden.
    return ["browser", "drive", "pdfeditor", "docstudio", "journal", "reflecta", "briefings",
      "quantusproject", "flowertech", "mail", "career", "habits", "reports", "workspace", "sticky", "updates"].includes(source.app);
  }

  function noteCard(note) {
    const source = sourceOf(note);
    const notebook = note.notebookId ? asMap(state.payload.entities.notebooks)[note.notebookId] : null;
    const available = noteSourceExists(note);
    return `<article class="entity-card note-card" data-note-class="${attr(note.noteClass)}">
      <div class="row-actions"><span class="badge accent">${esc(noteClassLabel(note.noteClass))}</span>${note.notebookId ? `<span class="badge">${esc(itemTitle(notebook, "Unbekanntes Notizbuch"))}</span>` : `<span class="badge sand">Inbox</span>`}${note.favorite || note.isFavorite ? '<span class="badge">★ Favorit</span>' : ""}</div>
      <h3>${esc(itemTitle(note, noteClassLabel(note.noteClass)))}</h3>
      <p>${esc(noteContent(note).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 260) || "Kein Inhalt")}</p>
      <div class="note-tags">${tagButtons(note.tags)}</div>
      <div class="note-source ${available ? "" : "missing"}">${available ? "↗" : "!"} ${esc(available ? source.label : "Quelle nicht mehr verfügbar")}</div>
      <div class="card-foot"><span class="muted small">${esc(formatDate(note.updatedAt || note.createdAt))}</span><span class="spacer"></span>
        ${source.app !== "noteflow" ? `<button class="icon-action" data-action="note-source" data-id="${attr(note.id)}" aria-label="Quelle öffnen">↗</button>` : ""}
        <button class="icon-action" data-action="edit-note" data-id="${attr(note.id)}" aria-label="Notiz bearbeiten">✎</button>
        <button class="icon-action" data-action="delete-entity" data-collection="notes" data-id="${attr(note.id)}" aria-label="Notiz löschen">⌫</button>
      </div>
    </article>`;
  }

  function noteFilterSelect(mode, label, valuesList) {
    const current = state.noteFilter.mode === mode ? state.noteFilter.value : "";
    return `<select class="sort-select" data-action="note-filter-select" data-mode="${attr(mode)}" aria-label="${attr(label)}"><option value="">${esc(label)}</option>${valuesList.map((entry) => `<option value="${attr(entry.value)}" ${current === entry.value ? "selected" : ""}>${esc(entry.label)}</option>`).join("")}</select>`;
  }

  function renderNotes() {
    let notes = collection("notes");
    const filter = state.noteFilter || { mode: "inbox", value: "" };
    if (filter.mode === "inbox") notes = notes.filter((note) => !note.notebookId);
    else if (filter.mode === "favorites") notes = notes.filter((note) => note.favorite || note.isFavorite);
    else if (filter.mode === "class") notes = notes.filter((note) => note.noteClass === filter.value);
    else if (filter.mode === "notebook") notes = notes.filter((note) => note.notebookId === filter.value);
    else if (filter.mode === "tag") notes = notes.filter((note) => Notes.normalizeTags(note.tags).some((tag) => tag.toLocaleLowerCase("de-CH") === filter.value.toLocaleLowerCase("de-CH")));
    else if (filter.mode === "source") notes = notes.filter((note) => sourceOf(note).app === filter.value);
    if (filter.mode === "recent") notes = notes.slice(0, 20);
    if (state.search) {
      const query = state.search.toLocaleLowerCase("de-CH");
      notes = notes.filter((note) => [itemTitle(note), noteContent(note), Notes.normalizeTags(note.tags).join(" "), sourceOf(note).label].join(" ").toLocaleLowerCase("de-CH").includes(query));
    }
    const sources = Array.from(new Map(collection("notes").map((note) => {
      const source = sourceOf(note); return [source.app, { value: source.app, label: source.label || source.app }];
    })).values()).sort((a, b) => a.label.localeCompare(b.label, "de"));
    const chip = (mode, label) => `<button class="chip ${filter.mode === mode ? "on" : ""}" data-action="note-filter" data-mode="${mode}">${label}</button>`;
    return `<div class="view noteflow-view">
      ${viewHeader("Noteflow", "Alle Quantus-Notizen – zentral, synchronisiert und ohne erzwungenes Notizbuch.", `<button class="btn" data-action="open-shortnote">Kurze Notiz</button><button class="btn primary" data-action="new-note">＋ Notiz</button>`)}
      ${loginBanner()}
      <div class="filterbar note-filterbar">
        <div class="search-field"><span>⌕</span><input data-action="filter-collection" placeholder="Titel, Inhalt, Schlagwort oder Quelle" value="${attr(state.search)}"></div>
        <div class="chip-row">${chip("inbox", `Inbox ${collection("notes").filter((note) => !note.notebookId).length}`)}${chip("all", "Alle")}${chip("favorites", "Favoriten")}${chip("recent", "Zuletzt bearbeitet")}</div>
        <div class="chip-row note-class-chips">${Notes.NOTE_CLASSES.map((key) => `<button class="chip ${filter.mode === "class" && filter.value === key ? "on" : ""}" data-action="note-filter" data-mode="class" data-value="${key}">${esc(Notes.NOTE_CLASS_LABELS[key])}</button>`).join("")}</div>
        <div class="note-select-filters">${noteFilterSelect("notebook", "Notizbuch", notebooks().map((book) => ({ value: book.id, label: itemTitle(book, "Notizbuch") })))}${noteFilterSelect("tag", "Schlagwort", noteTags().map((tag) => ({ value: tag, label: "#" + tag })))}${noteFilterSelect("source", "Quelle/App", sources)}</div>
      </div>
      <div class="content-grid">${notes.map(noteCard).join("") || emptyState("✎", "Keine Notizen", filter.mode === "inbox" ? "Neue Notizen ohne Notizbuch erscheinen hier." : "Für diesen Filter gibt es noch keine Notiz.")}</div>
    </div>`;
  }

  function renderIdeas() {
    const notes = collection("notes").filter((note) => note.noteClass === "idea");
    return `<div class="view">
      ${viewHeader("Ideen", "Kategorie und Idee – danach liegt sie zentral in Noteflow und der Inbox.", `<button class="btn" data-action="go" data-route="notes">In Noteflow öffnen</button><button class="btn primary" data-action="new-idea">＋ Idee</button>`)}
      ${loginBanner()}
      <div class="content-grid">${notes.map(noteCard).join("") || emptyState("✦", "Noch keine Ideen", "Erfasse eine Kategorie und deinen Gedanken.")}</div>
    </div>`;
  }

  function renderReading() {
    const books = collection("books");
    const docs = values(state.driveDocs).map((doc) => ({ ...doc, id: doc.id || findMapKey(state.driveDocs,doc) })).filter((doc) => doc.status !== "papierkorb").sort((a,b) => Date.parse(b.aktualisiert || b.erstellt || 0) - Date.parse(a.aktualisiert || a.erstellt || 0));
    if (!state.selectedBookId && !state.selectedDocId && books.length) state.selectedBookId = books[0].id;
    const selectedBook = books.find((book) => book.id === state.selectedBookId);
    const selected = docs.find((doc) => doc.id === state.selectedDocId);
    return `<div class="view">
      ${viewHeader("Reading Hub", "Bücher nur per Titel registrieren oder Dokumente direkt lesen – weitere Angaben bleiben optional.", `<button class="btn" data-action="split-with" data-route="reading">◫ Split-Screen</button><button class="btn" data-action="external" data-path="drive.html">↗ Drive</button><button class="btn primary" data-action="register-book">＋ Buch registrieren</button>`)}
      ${loginBanner()}
      <div class="reading-layout">
        <aside class="library-panel"><div class="panel-head"><strong>Bücher</strong><span class="badge">${books.length}</span></div><div class="library-list">${books.map((book) => `<div class="doc-row ${book.id === state.selectedBookId ? "on" : ""}" data-action="open-book" data-id="${attr(book.id)}"><strong class="truncate" style="display:block">${esc(book.title || "Ohne Titel")}</strong><small class="muted">${esc(book.author || bookStatusLabel(book.status))}</small></div>`).join("") || emptyMini("Titel registrieren – Datei ist optional")}</div><div class="panel-head"><strong>Drive-Dokumente</strong><span class="badge">${docs.length}</span></div><div class="library-list">${docs.map((doc) => `<div class="doc-row ${doc.id === state.selectedDocId ? "on" : ""}" data-action="open-doc" data-id="${attr(doc.id)}"><strong class="truncate" style="display:block">${esc(doc.titel_final || doc.dateiname || "Dokument")}</strong><small class="muted">${esc(doc.bereich || doc.mimeType || "Drive")}</small></div>`).join("") || emptyMini("Keine Drive-Dokumente")}</div></aside>
        <section class="reader-panel">${selectedBook ? renderBookDetail(selectedBook) : renderReaderDocument(selected)}</section>
      </div>
    </div>`;
  }

  function bookStatusLabel(status) {
    return { registered: "Registriert / ungelesen", reading: "Lese ich", paused: "Pausiert", completed: "Gelesen", abandoned: "Abgebrochen" }[Notes.normalizeBookStatus(status)] || "Registriert / ungelesen";
  }

  function renderBookDetail(book) {
    const notes = Notes.notesForSource(collection("notes"), "readinghub", book.id).filter((note) => note.noteClass === "reading");
    const url = book.firebaseUrl || book.fileUrl || book.downloadUrl || "";
    return `<div class="book-detail">
      <div class="panel-head"><strong class="truncate">${esc(book.title)}</strong><button class="btn small-btn" data-action="edit-book" data-id="${attr(book.id)}">Metadaten</button><button class="btn primary small-btn" data-action="reading-note" data-id="${attr(book.id)}">＋ Lesenotiz</button></div>
      <div class="book-hero"><div class="book-cover">▤</div><div><span class="badge accent">${esc(bookStatusLabel(book.status))}</span><h1>${esc(book.title)}</h1><p>${esc(book.author || "Autor noch nicht ergänzt")}</p>${book.isbn ? `<small>ISBN ${esc(book.isbn)}</small>` : ""}</div></div>
      <div class="book-metadata"><span>${book.totalPages || book.pages ? `${esc(book.totalPages || book.pages)} Seiten` : "Seitenzahl offen"}</span><span>${book.progress ? `${esc(book.progress)} % gelesen` : "Fortschritt offen"}</span>${url ? `<button class="btn small-btn" data-action="external-url" data-url="${attr(url)}">Datei öffnen</button>` : ""}</div>
      <section class="book-notes"><div class="widget-head"><span class="widget-icon">✎</span><h2>Lesenotizen</h2><span class="badge">${notes.length}</span></div>${notes.map((note) => `<div class="list-item"><span class="badge sand">${esc(({ quote:"Zitat", summary:"Zusammenfassung", insight:"Erkenntnis", note:"Lesenotiz" })[note.readingKind] || "Lesenotiz")}</span><div class="item-main"><div class="item-title">${esc(itemTitle(note))}</div><div class="item-meta">${esc(noteContent(note).slice(0, 140))}</div></div><button class="icon-action" data-action="edit-note" data-id="${attr(note.id)}">✎</button></div>`).join("") || emptyMini("Nach dem Lesen eine kurze Lesenotiz festhalten.")}</section>
      <section class="book-functions"><h2>Später ergänzen</h2><p class="muted">Datei/PDF, Fortschritt, Annotationen, Zitate und RecallLab-Verknüpfungen bleiben am selben Buch erhalten.</p></section>
    </div>`;
  }

  function renderReaderDocument(doc) {
    if (!doc) return `<div class="reader-empty"><div><span style="font-size:48px">▤</span><h2>Dokument auswählen</h2><p>Öffne ein Dokument aus Quantus Drive.</p></div></div>`;
    const name = doc.titel_final || doc.dateiname || "Dokument";
    const url = doc.downloadUrl || doc.fileUrl || "";
    const isPdf = /pdf/i.test(doc.mimeType || doc.dateiname || "");
    const text = doc.textauszug || doc.text || "";
    return `<div class="panel-head"><button class="icon-action" data-action="reader-wide" title="Bibliothek ein-/ausblenden">◫</button><button class="icon-action" data-action="reader-full" title="Vollbild">⛶</button><button class="icon-action" data-action="external-url" data-url="${attr(url)}" ${url ? "" : "disabled"}>↗</button><strong class="truncate">${esc(name)}</strong><button class="btn small-btn" data-action="reading-document-note" data-id="${attr(doc.id)}">Lesenotiz</button><button class="btn small-btn" data-action="polaris-selection" data-text="${attr(name)}">Polaris</button></div>
      ${isPdf && url
        // PDF: EIGENER Behaelter ohne Lesepolster. Vorher steckte das Dokument
        // in .reader-content mit 24 px oben/unten und bis zu 54 px seitlich —
        // Polster, das ein Fliesstext braucht und ein PDF nur verkleinert.
        //
        // Und es stand in einem iframe. Auf iPadOS zeigt Safari ein PDF im
        // iframe nur als Vorschau: erste Seite, kein Blaettern, #view wird
        // ignoriert. Gerendert wird deshalb mit dem eigenen Betrachter
        // (pdf-viewer.js), der nach dem Zeichnen eingehaengt wird.
        ? `<div class="nm-pdf-host" data-nm-pdf="${attr(url)}" data-nm-pdf-name="${attr(name)}">${window.QuantusPdfViewer ? window.QuantusPdfViewer.placeholder(name) : ""}</div>`
        : `<div class="reader-content" data-reader="true"><article><h1>${esc(name)}</h1><p>${text ? esc(text) : "Für dieses Dokument ist noch kein Textauszug vorhanden. Öffne das Original über den Pfeil oben."}</p></article></div>`}`;
  }

  function findMapKey(map, object) {
    return Object.keys(asMap(map)).find((key) => map[key] === object) || object.id || "";
  }

  function renderLearning() {
    const cards = asArray(state.payload.recallLabData && state.payload.recallLabData.cards);
    const due = dueCards();
    const docEntries = Object.entries(state.smarterDocs).sort(([a],[b]) => b.localeCompare(a));
    return `<div class="view">
      ${viewHeader("Lernen", "Flashcards und Smarter-Lernstoff aus deinem Quantus-System.", `<button class="btn primary" data-action="new-flashcard">＋ Karteikarte</button>`)}
      ${loginBanner()}
      <div class="dashboard-grid">
        <section class="widget span-4"><div class="widget-head"><span class="widget-icon">▣</span><h2>Karteikarten</h2></div><div class="hero-title" style="font-size:38px">${due.length}</div><p class="muted">heute fällig · ${cards.length} insgesamt</p><div class="progress"><i style="width:${cards.length ? Math.max(4,Math.min(100,((cards.length-due.length)/cards.length)*100)) : 0}%"></i></div></section>
        <section class="widget span-8"><div class="widget-head"><span class="widget-icon">▤</span><h2>Smarter – letzter Lernstoff</h2></div>${docEntries.slice(0,3).map(([date,doc]) => `<div class="list-item"><span class="badge accent">${esc(formatDate(date))}</span><div class="item-main"><div class="item-title">${esc(doc.title || doc.titel || "Tageslektion")}</div><div class="item-meta">${asArray(doc.questions).length} Fragen</div></div><button class="icon-action" data-action="go" data-route="smarter">↗</button></div>`).join("") || emptyMini("Noch kein Smarter-Dokument geladen")}</section>
        <section class="widget span-12"><div class="widget-head"><span class="widget-icon">▣</span><h2>Fällige Karten</h2></div><div class="content-grid">${due.slice(0,12).map((card) => `<article class="entity-card"><span class="badge sand">${esc(card.deckId || "Allgemein")}</span><h3>${esc(card.front || "Vorderseite")}</h3><p>${esc(card.back || "Rückseite")}</p><div class="card-foot"><span class="spacer"></span><button class="btn small-btn" data-action="learning-card-note" data-id="${attr(card.id)}">Lernnotiz</button><button class="btn small-btn" data-action="edit-flashcard" data-id="${attr(card.id)}">Bearbeiten</button></div></article>`).join("") || emptyState("✓","Alles wiederholt","Heute sind keine Karteikarten fällig.")}</div></section>
      </div>
    </div>`;
  }

  function renderConcepts() {
    const concepts = collection("concepts");
    return `<div class="view">
      ${viewHeader("Konzeptor", "Der touchoptimierte Denkraum für Strategien, Artikel und politische Konzepte.", `<button class="btn" data-action="split-with" data-route="concepts">◫ Split-Screen</button><button class="btn primary" data-action="new-entity" data-collection="concepts">＋ Konzeptkarte</button>`)}
      ${loginBanner()}
      <div class="concept-board">${concepts.map((item,index) => {
        const x = Number(item.x) || 28 + (index % 4) * 255;
        const y = Number(item.y) || 28 + Math.floor(index / 4) * 175;
        return `<article class="concept-note" style="left:${x}px;top:${y}px"><span class="badge accent">${esc(item.category || "Konzept")}</span><h3>${esc(itemTitle(item,"Idee"))}</h3><p>${esc(itemText(item) || "Tippen, um den Gedanken auszuarbeiten.")}</p><div class="card-foot"><button class="icon-action" data-action="context-note" data-collection="concepts" data-id="${attr(item.id)}" aria-label="Notiz hinzufügen">＋✎</button><button class="icon-action" data-action="edit-entity" data-collection="concepts" data-id="${attr(item.id)}" aria-label="Konzept bearbeiten">✎</button></div></article>`;
      }).join("") || `<div class="reader-empty"><div><span style="font-size:48px">◇</span><h2>Leere Arbeitsfläche</h2><p>Erstelle deine erste Konzeptkarte.</p><button class="btn primary" data-action="new-entity" data-collection="concepts">＋ Karte</button></div></div>`}</div>
    </div>`;
  }

  function renderHabits() {
    const habits = activeHabits();
    const today = localDateKey();
    const done = habits.filter((habit) => asArray(habit.completedDates || habit.dates).includes(today) || habit.lastCompleted === today).length;
    return `<div class="view">
      ${viewHeader("Habits", "Tägliche Routinen aus Quantus abhaken und im Daily Briefing sehen.", `<button class="btn primary" data-action="new-habit">＋ Gewohnheit</button>`)}
      ${loginBanner()}
      <div class="dashboard-grid"><section class="widget span-4"><div class="widget-head"><span class="widget-icon">◌</span><h2>Heute</h2></div><div class="hero-title" style="font-size:42px">${done}/${habits.length}</div><p class="muted">Routinen abgeschlossen</p><div class="progress"><i style="width:${habits.length ? (done/habits.length)*100 : 0}%"></i></div></section><section class="widget span-8"><div class="widget-head"><span class="widget-icon">✓</span><h2>Deine Routinen</h2></div><div class="item-list">${habits.map(habitItem).join("") || emptyMini("Noch keine Gewohnheiten")}</div></section></div>
    </div>`;
  }

  /*
   * BEFUND: expense summierte die rohen Betraege. Eine Ausgabe traegt aber ein
   * NEGATIVES Vorzeichen (so schreiben Desktop und Handy), also war expense
   * negativ — und der Saldo income - expense ADDIERTE die Ausgaben. Bei 3000
   * Einnahmen und 92.50 Ausgaben stand dort 3092.50 statt 2907.50.
   *
   * Massgeblich ist ausserdem das VORZEICHEN, nicht das type-Feld: aus dem
   * CSV-Import und aus aelteren Bestaenden kommen Buchungen ohne type.
   */
  function budgetData(ym) {
    const accounts = collection("accounts");
    const tx = collection("transactions").filter((item) => !item.isFuture);
    const monat = ym || (state.budgetMonat || localDateKey().slice(0, 7));
    const month = tx.filter((item) => String(item.date || "").startsWith(monat));
    const betrag = (item) => Number(item.amount) || 0;
    const income = month.filter((item) => betrag(item) > 0).reduce((sum, item) => sum + betrag(item), 0);
    const expense = month.filter((item) => betrag(item) < 0).reduce((sum, item) => sum + Math.abs(betrag(item)), 0);
    const balance = accounts.reduce((sum,item) => sum + (Number(item.balance)||0),0);
    const kategorien = {};
    month.filter((item) => betrag(item) < 0).forEach((item) => {
      const k = item.category || "Sonstiges";
      kategorien[k] = (kategorien[k] || 0) + Math.abs(betrag(item));
    });
    return { accounts, tx, month, monat, income, expense, balance,
      kategorien: Object.entries(kategorien).sort((a, b) => b[1] - a[1]),
      currency: accounts[0] && accounts[0].currency || "CHF" };
  }

  var BUDGET_KATEGORIEN = ["Essen", "Transport", "Wohnen", "Einkauf", "Gesundheit",
    "Freizeit", "Bildung", "Abo", "Sonstiges"];

  function budgetMonatVerschieben(ym, n) {
    const [j, m] = ym.split("-").map(Number);
    const d = new Date(j, m - 1 + n, 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  function budgetMonatText(ym) {
    const [j, m] = ym.split("-").map(Number);
    return new Date(j, m - 1, 1).toLocaleDateString("de-CH", { month: "long", year: "numeric" });
  }

  /*
   * BEFUND: das Budget war auf dem Tablet ausdruecklich "Nur lesen". Erfassen
   * ging nur am Desktop oder am Handy — auf dem Geraet, das man beim Einkaufen
   * am ehesten dabei hat, gar nicht.
   *
   * Erfasst wird ueber dieselbe Entitaets-Operation wie jede andere Sammlung
   * und im FORMAT der anderen Geraete: der Betrag traegt sein Vorzeichen,
   * negativ heisst Ausgabe. Ein positiver Betrag mit type "expense" wuerde auf
   * Desktop und Handy als Einnahme zaehlen.
   */
  function renderBudget() {
    const heuteYm = localDateKey().slice(0, 7);
    const ym = state.budgetMonat || heuteYm;
    const data = budgetData(ym);
    const latest = data.month.slice()
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    const maxKat = data.kategorien.length ? data.kategorien[0][1] : 1;
    const tage = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
    const bisher = ym === heuteYm ? Number(localDateKey().slice(8, 10)) : tage;

    return `<div class="view">
      ${viewHeader("Budget", budgetMonatText(ym),
        `<button class="btn" data-action="budget-monat" data-n="-1">‹ Vormonat</button>` +
        (ym === heuteYm ? "" : `<button class="btn" data-action="budget-monat" data-n="0">Aktueller Monat</button>`) +
        `<button class="btn" data-action="budget-monat" data-n="1">Folgemonat ›</button>`)}
      ${loginBanner()}

      <div class="budget-metrics">
        <div class="budget-metric"><small>Kontostand</small><strong>${money(data.balance, data.currency)}</strong></div>
        <div class="budget-metric"><small>Einnahmen</small><strong style="color:var(--accent)">${money(data.income, data.currency)}</strong></div>
        <div class="budget-metric"><small>Ausgaben</small><strong style="color:var(--coral)">${money(data.expense, data.currency)}</strong></div>
        <div class="budget-metric"><small>Saldo</small><strong>${money(data.income - data.expense, data.currency)}</strong></div>
        <div class="budget-metric"><small>⌀ pro Tag</small><strong>${money(bisher ? data.expense / bisher : 0, data.currency)}</strong></div>
      </div>

      <div class="dashboard-grid">
        <section class="widget span-5 tall">
          <div class="widget-head"><span class="widget-icon">＋</span><h2>Erfassen</h2></div>
          <form data-form="budget-tx" class="budget-form">
            <div class="chip-row" role="group" aria-label="Art">
              <button type="button" class="chip on" data-action="budget-typ" data-typ="expense">− Ausgabe</button>
              <button type="button" class="chip" data-action="budget-typ" data-typ="income">＋ Einnahme</button>
            </div>
            <input type="hidden" name="typ" value="expense">
            <div class="field"><label>Betrag</label>
              <input name="amount" type="number" step="0.05" min="0" inputmode="decimal" required
                     placeholder="0.00" class="budget-amount"></div>
            <div class="field"><label>Kategorie</label>
              <select name="category">${BUDGET_KATEGORIEN.map((k) => `<option value="${attr(k)}">${esc(k)}</option>`).join("")}</select></div>
            <div class="field"><label>Notiz</label><input name="description" autocomplete="off"></div>
            <div class="field"><label>Datum</label>
              <input name="date" type="date" value="${attr(ym === heuteYm ? localDateKey() : ym + "-01")}"></div>
            ${data.accounts.length ? `<div class="field"><label>Konto</label>
              <select name="accountId"><option value="">Ohne Konto</option>${data.accounts.map((k) =>
                `<option value="${attr(k.id)}">${esc(itemTitle(k, "Konto"))}</option>`).join("")}</select></div>` : ""}
            <button class="btn primary" type="submit" style="width:100%">Buchung sichern</button>
          </form>
        </section>

        <section class="widget span-7 tall">
          <div class="widget-head"><span class="widget-icon">₣</span><h2>Buchungen</h2>
            <span class="badge accent">${data.month.length}</span></div>
          <div class="item-list">${latest.map((item) => {
            const neg = (Number(item.amount) || 0) < 0;
            return `<div class="list-item">
              <span class="badge ${neg ? "coral" : "accent"}">${neg ? "−" : "+"}</span>
              <div class="item-main"><div class="item-title">${esc(item.description || item.category || "Buchung")}</div>
                <div class="item-meta">${esc(formatDate(item.date))} · ${esc(item.category || "")}</div></div>
              <strong>${money(item.amount, data.currency)}</strong>
              <button class="btn ghost small-btn" data-action="budget-loeschen" data-id="${attr(item.id)}"
                      aria-label="Buchung löschen">🗑</button>
            </div>`;
          }).join("") || emptyMini("Keine Buchungen in diesem Monat.")}</div>
        </section>

        <section class="widget span-6">
          <div class="widget-head"><span class="widget-icon">▦</span><h2>Kategorien</h2></div>
          <div class="item-list">${data.kategorien.map(([k, v]) => `<div class="list-item">
            <div class="item-main"><div class="item-title">${esc(k)}</div>
              <div class="budget-bar"><span style="width:${Math.round(v / maxKat * 100)}%"></span></div></div>
            <strong>${money(v, data.currency)}</strong></div>`).join("") || emptyMini("Keine Ausgaben in diesem Monat.")}</div>
        </section>

        <section class="widget span-6">
          <div class="widget-head"><span class="widget-icon">◫</span><h2>Konten</h2></div>
          <div class="item-list">${data.accounts.map((k) => `<div class="list-item">
            <div class="item-main"><div class="item-title">${esc(itemTitle(k, "Konto"))}</div>
              <div class="item-meta">${esc(k.type || "")}</div></div>
            <strong>${money(k.balance, k.currency || data.currency)}</strong></div>`).join("")
            || emptyMini("Keine Konten hinterlegt.")}</div>
        </section>
      </div>
    </div>`;
  }

  /*
   * DER APP-BILDSCHIRM.
   *
   * Vorher war das ein reines Kachelraster, und jede Kachel trug die
   * Einordnung „Tablet" oder „Separat" — letzteres hiess: diese App laesst
   * sich hier gar nicht bedienen, sie schickt dich in die Desktop-App. Seit
   * jedes Modul eine eigene Tablet-Ansicht hat, gibt es „Separat" nicht mehr.
   *
   * Der Bildschirm zeigt jetzt, was man auf einem App-Bildschirm sucht:
   * Suche ueber alle Apps, die zuletzt benutzten zuoberst, Gruppen, die
   * lebenden Zahlen der Apps (faellige Aufgaben, Karten, ungelesene Mails)
   * und die Wahl zwischen Raster und Liste.
   */
  const RECENT_APPS_KEY = "quantus-tablet-recent-apps-v1";

  function recentApps() {
    return asArray(loadJson(RECENT_APPS_KEY, [])).filter((key) => typeof key === "string");
  }

  function rememberApp(route) {
    if (!route || route === "apps" || route === "home") return;
    const list = recentApps().filter((key) => key !== route);
    list.unshift(route);
    saveJson(RECENT_APPS_KEY, list.slice(0, 8));
  }

  // Wie viele offene Dinge in einer App warten. Dieselben Zahlen wie auf dem
  // Homebildschirm — zwei Rechnungen fuer dieselbe App waeren zwei Wahrheiten.
  function appBadge(key) {
    try {
      if (key === "tasks" || key === "daily" || key === "dailybriefing") return todayTasks().length;
      if (key === "learning") return dueCards().length;
      if (key === "mail" || key === "gmail") return typeof window.QuantusMailUnread === "function" ? window.QuantusMailUnread() : 0;
      if (key === "projects") return collection("projects").filter((item) => !isDone(item)).length;
      if (key === "updates") return collection("updates").filter((item) => !item.checked).length;
      if (key === "messages") {
        const now = new Date().toISOString();
        return collection("scheduledMessages").filter((item) => !item.isRead && String(item.deliverAt || "") <= now).length;
      }
      if (key === "time") return Object.keys(asMap(state.payload.timers)).length;
      if (COLLECTION_CONFIG[key]) return collection(key).filter((item) => !isDone(item)).length;
    } catch (_) {}
    return 0;
  }

  // Eine Route ist nativ, wenn app.js sie selbst rendert ODER ein
  // Tablet-Modul sie beansprucht. Fest verdrahten liesse die Liste beim
  // naechsten neuen Modul still veralten.
  function isNativeRoute(key) {
    if (NATIVE_ROUTES.has(key)) return true;
    return tabletModules().some((mod) => Array.isArray(mod.routes) && mod.routes.includes(key));
  }

  function appTile(app) {
    const badge = appBadge(app.key);
    return `<button class="app-tile" data-action="go" data-route="${attr(app.key)}" title="${attr(app.label)}">
      <span class="app-icon ${attr(app.tone || "")}">${esc(app.icon)}${badge > 0 ? `<span class="app-tile-badge">${badge > 99 ? "99+" : badge}</span>` : ""}</span>
      <strong>${esc(app.label)}</strong></button>`;
  }

  function appRow(app) {
    const badge = appBadge(app.key);
    return `<button class="app-row" data-action="go" data-route="${attr(app.key)}">
      <span class="app-icon ${attr(app.tone || "")}">${esc(app.icon)}</span>
      <span class="app-row-main"><strong>${esc(app.label)}</strong><small>${esc(app.group || "Weitere")}</small></span>
      ${badge > 0 ? `<span class="badge accent">${badge}</span>` : ""}
      <span class="app-row-go">›</span></button>`;
  }

  function renderApps() {
    const query = String(state.appsSearch || "").trim().toLowerCase();
    const list = state.appsView === "list" ? appRow : appTile;
    const uniqueApps = [];
    const seen = new Set();
    APP_DEFS.forEach((app) => {
      if (seen.has(app.key)) return;
      seen.add(app.key);
      uniqueApps.push(app);
    });
    const hits = query
      ? uniqueApps.filter((app) => `${app.label} ${app.group || ""} ${app.key}`.toLowerCase().includes(query))
      : uniqueApps;
    const recent = recentApps().map((key) => uniqueApps.find((app) => app.key === key)).filter(Boolean);
    const groups = [...new Set(hits.map((app) => app.group || "Weitere"))];
    const notNative = uniqueApps.filter((app) => !app.local && !isNativeRoute(app.key));

    const sections = query
      ? `<section class="app-group"><div class="app-group-head"><h2>${hits.length} Treffer</h2></div>
          <div class="${state.appsView === "list" ? "apps-list" : "apps-grid"}">${hits.map(list).join("") || emptyMini("Keine App mit diesem Namen")}</div></section>`
      : `${recent.length ? `<section class="app-group"><div class="app-group-head"><h2>Zuletzt benutzt</h2><span class="badge">${recent.length}</span></div>
          <div class="${state.appsView === "list" ? "apps-list" : "apps-grid"}">${recent.map(list).join("")}</div></section>` : ""}
        ${groups.map((group) => {
          const inGroup = hits.filter((app) => (app.group || "Weitere") === group);
          return `<section class="app-group"><div class="app-group-head"><h2>${esc(group)}</h2><span class="badge">${inGroup.length}</span></div>
            <div class="${state.appsView === "list" ? "apps-list" : "apps-grid"}">${inGroup.map(list).join("")}</div></section>`;
        }).join("")}`;

    return `<div class="view apps-catalog">
      ${viewHeader("Alle Apps", `${uniqueApps.length} Quantus-Apps – jede mit einer eigenen Tablet-Ansicht.`,
        `<button class="btn" data-action="apps-arrange">▤ Homescreen anordnen</button>`)}
      <div class="filterbar apps-filterbar">
        <div class="search-field"><span>⌕</span><input data-action="apps-search" placeholder="App suchen" value="${attr(state.appsSearch || "")}" autocomplete="off"></div>
        <div class="chip-row">
          <button class="chip ${state.appsView !== "list" ? "on" : ""}" data-action="apps-view" data-view="grid">▦ Raster</button>
          <button class="chip ${state.appsView === "list" ? "on" : ""}" data-action="apps-view" data-view="list">▤ Liste</button>
        </div>
      </div>
      ${notNative.length ? `<p class="muted small" style="margin:0 2px 14px">${notNative.length} App(en) ohne eigene Tablet-Ansicht: ${esc(notNative.map((app) => app.label).join(", "))}</p>` : ""}
      ${sections}
    </div>`;
  }

  function renderCalendar() {
    const events = [...collection("calendarEvents"), ...collection("meetings")]
      .map((event) => ({ event, key: String(event.date || event.start || event.startAt || "").slice(0, 10) }))
      .filter((entry) => entry.key)
      .sort((a, b) => a.key.localeCompare(b.key) || String(a.event.start || a.event.time || "").localeCompare(String(b.event.start || b.event.time || "")));
    const today = localDateKey();
    const upcoming = events.filter((entry) => entry.key >= today);
    const grouped = {};
    upcoming.forEach((entry) => { (grouped[entry.key] = grouped[entry.key] || []).push(entry.event); });
    const days = Object.keys(grouped).sort().slice(0, 30);
    return `<div class="view">
      ${viewHeader("Kalender", "Deine Termine und Meetings als tabletnative Agenda.", `<button class="btn" data-action="split-with" data-route="daily">◫ Split-Screen</button><button class="btn primary" data-action="new-entity" data-collection="meetings">＋ Termin</button>`)}
      ${loginBanner()}
      <div class="dashboard-grid">${days.map((day) => `<section class="widget span-6"><div class="widget-head"><span class="widget-icon">◉</span><h2>${esc(formatDate(day, { weekday: "long", day: "2-digit", month: "long" }))}${day === today ? " · Heute" : ""}</h2></div><div class="item-list">${grouped[day].map((event) => `<div class="list-item"><span class="badge accent">${esc(formatTime(event.start || event.startAt || event.time) || "Ganztags")}</span><div class="item-main"><div class="item-title">${esc(itemTitle(event, "Termin"))}</div><div class="item-meta">${esc(event.location || event.place || event.description || "")}</div></div><button class="icon-action" data-action="calendar-note" data-id="${attr(event.id)}" aria-label="Als Notiz speichern">＋✎</button></div>`).join("")}</div></section>`).join("") || emptyState("◉", "Keine kommenden Termine", "Erstelle einen Termin auf dem Tablet oder in AI Sync.")}</div>
    </div>`;
  }

  function moduleExternalPath(app) {
    return app.fullPath ? String(app.fullPath).replace(/^\/+/, "") : `index.html#/${app.fullRoute || app.key}`;
  }

  // Kleine Statistik-Helfer fuer die nativen Analyse-Ansichten.
  function countBy(list, fn) {
    const map = {};
    list.forEach((item) => { const key = fn(item) || "Ohne Status"; map[key] = (map[key] || 0) + 1; });
    return map;
  }

  function statusLabel(status) {
    const value = String(status || "").toLowerCase();
    if (["done", "completed", "erledigt", "closed"].includes(value)) return "Erledigt";
    if (["in_progress", "in-arbeit", "doing", "aktiv", "active"].includes(value)) return "In Arbeit";
    if (["open", "offen", "todo", "neu", ""].includes(value)) return "Offen";
    return status;
  }

  function barRow(label, value, max, tone) {
    const pct = max ? Math.max(2, Math.round((value / max) * 100)) : 0;
    return `<div class="stat-bar-row"><span class="stat-bar-label">${esc(label)}</span><div class="stat-bar"><i class="${tone || ""}" style="width:${pct}%"></i></div><strong>${esc(value)}</strong></div>`;
  }

  function recentActivity(limit) {
    const activity = [];
    Object.entries(COLLECTION_CONFIG).forEach(([name, config]) => collection(name).forEach((item) => activity.push({ name, config, item })));
    collection("calendarEvents").forEach((item) => activity.push({ name: "calendarEvents", config: { label: "Termin", icon: "◉" }, item }));
    return activity
      .sort((a, b) => Date.parse(b.item.updatedAt || b.item.createdAt || 0) - Date.parse(a.item.updatedAt || a.item.createdAt || 0))
      .slice(0, limit || 40);
  }

  // Native Analyse-Ansicht. Rechnet Kennzahlen direkt aus dem geladenen
  // Quantus-Datenstand – ohne die Desktop-App einzubetten.
  function renderStatistics() {
    const tasks = collection("tasks");
    const doneTasks = tasks.filter(isDone).length;
    const openTasks = tasks.length - doneTasks;
    const projects = collection("projects");
    const goals = collection("goals");
    const notes = collection("notes");
    const cards = asArray(state.payload.recallLabData && state.payload.recallLabData.cards);
    const budget = budgetData();
    const taskStatus = { Offen: openTasks, Erledigt: doneTasks };
    const maxTask = Math.max(1, ...Object.values(taskStatus));
    const projByStatus = countBy(projects, (project) => statusLabel(project.status));
    const maxProj = Math.max(1, ...Object.values(projByStatus));
    const budgetMax = Math.max(1, budget.income, budget.expense);
    const completion = tasks.length ? Math.round((doneTasks / tasks.length) * 100) : 0;
    return `<div class="view">
      ${viewHeader("Statistiken", "Kennzahlen aus deinem gesamten Quantus-Datenstand – tabletnativ berechnet.", `<button class="btn" data-action="external" data-path="index.html#/statistics">↗ Vollversion</button>`)}
      ${loginBanner()}
      <div class="budget-metrics">
        <div class="budget-metric"><small>Aufgaben erledigt</small><strong>${completion}%</strong></div>
        <div class="budget-metric"><small>Offene Aufgaben</small><strong>${openTasks}</strong></div>
        <div class="budget-metric"><small>Projekte</small><strong>${projects.length}</strong></div>
        <div class="budget-metric"><small>Ziele</small><strong>${goals.length}</strong></div>
        <div class="budget-metric"><small>Notizen</small><strong>${notes.length}</strong></div>
        <div class="budget-metric"><small>Karteikarten</small><strong>${cards.length}</strong></div>
      </div>
      <div class="dashboard-grid">
        <section class="widget span-6"><div class="widget-head"><span class="widget-icon">✓</span><h2>Aufgaben nach Status</h2></div>${Object.entries(taskStatus).map(([label, value]) => barRow(label, value, maxTask, "accent")).join("") || emptyMini("Keine Aufgaben")}</section>
        <section class="widget span-6"><div class="widget-head"><span class="widget-icon">▧</span><h2>Projekte nach Status</h2></div>${Object.entries(projByStatus).map(([label, value]) => barRow(label, value, maxProj, "blue")).join("") || emptyMini("Keine Projekte")}</section>
        <section class="widget span-6"><div class="widget-head"><span class="widget-icon">◎</span><h2>Aufgabenfortschritt</h2></div><div class="progress"><i style="width:${completion}%"></i></div><p class="muted" style="margin-top:10px">${doneTasks} von ${tasks.length} Aufgaben erledigt</p></section>
        <section class="widget span-6"><div class="widget-head"><span class="widget-icon">₣</span><h2>Budget diesen Monat</h2></div>${barRow("Einnahmen", Math.round(budget.income), budgetMax, "accent")}${barRow("Ausgaben", Math.round(budget.expense), budgetMax, "coral")}<p class="muted small" style="margin-top:8px">Saldo ${money(budget.income - budget.expense, budget.currency)}</p></section>
      </div>
    </div>`;
  }

  // Native Berichtsansicht: Bestand und juengste Aktivitaet ueber alle Bereiche.
  function renderReports() {
    const activity = recentActivity(40);
    const perType = countBy(activity, (entry) => entry.config.label);
    return `<div class="view">
      ${viewHeader("Berichte", "Aktueller Bestand und die juengsten Aktualisierungen über alle Quantus-Bereiche.", `<button class="btn" data-action="report-note">＋ Erkenntnis</button><button class="btn" data-action="external" data-path="index.html#/reports">↗ Vollversion</button>`)}
      ${loginBanner()}
      <div class="budget-metrics">${Object.entries(perType).slice(0, 6).map(([label, value]) => `<div class="budget-metric"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join("") || `<div class="budget-metric"><small>Einträge</small><strong>0</strong></div>`}</div>
      <section class="widget"><div class="widget-head"><span class="widget-icon">↻</span><h2>Letzte Aktualisierungen</h2></div><div class="item-list">${activity.map(({ config, item }) => `<div class="list-item"><span class="badge accent">${esc(config.label)}</span><div class="item-main"><div class="item-title">${esc(itemTitle(item))}</div><div class="item-meta">${esc(relativeTime(item.updatedAt || item.createdAt))}</div></div></div>`).join("") || emptyMini("Noch keine Aktivität – melde dich an, um deine Quantus-Daten zu laden.")}</div></section>
    </div>`;
  }

  // Welche echten Inhalte ein Modul ohne eigene Vollansicht nativ zeigt.
  const MODULE_COLLECTIONS = {
    knowledge: ["notes", "articles"],
    journal: ["notes"],
    reflecta: ["notes"],
    briefings: ["notes"],
    updates: ["notes"],
    messages: ["messages", "persons"],
    gmail: ["messages", "persons"],
    time: ["tasks", "projects"],
    workload: ["tasks", "projects"],
    weekplanning: ["tasks", "projects"],
    quantusproject: ["projects", "tasks"],
    googlecalendar: ["calendarEvents", "meetings"],
    measures: ["decisions", "tasks"],
    thesis: ["theses", "notes"]
  };

  function moduleSummary(app) {
    if (app.key === "drive") return [{ label: "Dokumente", value: values(state.driveDocs).filter((doc) => doc.status !== "papierkorb").length }];
    if (app.key === "smarter") return [{ label: "Lernstoff", value: Object.keys(asMap(state.smarterDocs)).length }];
    if (app.key === "learning") return [{ label: "Karten fällig", value: dueCards().length }];
    return [
      { label: "Offene Aufgaben", value: todayTasks().length },
      { label: "Projekte", value: collection("projects").length },
      { label: "Notizen", value: collection("notes").length }
    ];
  }

  // Anzeigenamen fuer Sammlungen, die keine eigene Tablet-Route haben.
  const ENTITY_LABELS = {
    articles: { label: "Artikel", plural: "Artikel", icon: "▤" },
    theses: { label: "These", plural: "Thesen", icon: "T" },
    messages: { label: "Nachricht", plural: "Nachrichten", icon: "✉" },
    calendarEvents: { label: "Termin", plural: "Termine", icon: "◉" }
  };

  // Kompakte, tabletnative Liste einer Sammlung fuer die Modul-Uebersicht.
  function moduleList(name) {
    const config = COLLECTION_CONFIG[name] || ENTITY_LABELS[name] || { label: name, plural: name, icon: "•", route: name };
    const editable = Boolean(COLLECTION_CONFIG[name]);
    const list = collection(name).slice(0, 8);
    return `<section class="widget span-6"><div class="widget-head"><span class="widget-icon">${esc(config.icon)}</span><h2>${esc(config.plural || config.label)}</h2>${editable ? `<button data-action="go" data-route="${attr(config.route)}">Öffnen</button>` : ""}</div><div class="item-list">${list.map((item) => `<div class="list-item" ${editable ? `data-action="edit-entity" data-collection="${attr(name)}" data-id="${attr(item.id)}"` : ""}><span>${esc(config.icon)}</span><div class="item-main"><div class="item-title">${esc(itemTitle(item))}</div><div class="item-meta">${esc(itemText(item).slice(0, 70)) || esc(relativeTime(item.updatedAt || item.createdAt))}</div></div></div>`).join("") || emptyMini("Noch keine Einträge")}</div></section>`;
  }

  // Native Modul-Uebersicht fuer AI-Sync-Werkzeuge ohne eigene Tablet-Ansicht.
  // Zeigt echte Inhalte aus dem geladenen Quantus-Datenstand; die Desktop-
  // Vollversion oeffnet auf Wunsch in einem separaten Fenster.
  function renderModule(app) {
    const path = moduleExternalPath(app);
    const cols = MODULE_COLLECTIONS[app.key];
    const primary = Array.isArray(cols) ? cols.find((name) => COLLECTION_CONFIG[name]) : null;
    const head = viewHeader(app.label, "Tabletnative Ansicht mit deinen echten Quantus-Inhalten – die Vollversion öffnet auf Wunsch separat.", `${primary ? `<button class="btn" data-action="new-entity" data-collection="${attr(primary)}">＋ ${esc(COLLECTION_CONFIG[primary].label)}</button>` : ""}<button class="btn" data-action="workspace">✎ Canvas</button><button class="btn primary" data-action="external" data-path="${attr(path)}">↗ Separat öffnen</button>`);
    if (Array.isArray(cols) && cols.length) {
      return `<div class="view">${head}${loginBanner()}<div class="dashboard-grid">${cols.map(moduleList).join("")}</div></div>`;
    }
    // Werkzeug ohne eigene Datensammlung: kurze Beschreibung, echte Kennzahlen
    // und die juengste Aktivitaet, damit die Seite nie leer wirkt.
    const stats = moduleSummary(app);
    const recent = recentActivity(6);
    return `<div class="view">${head}${loginBanner()}
      <section class="widget span-12 module-card">
        <div class="module-hero"><span class="app-icon ${attr(app.tone || "")}">${esc(app.icon)}</span><div><h2>${esc(app.label)}</h2><p class="muted">Dieses Werkzeug bleibt eine eigenständige Tablet-Ansicht und nutzt denselben Quantus-Datenstand wie AI Sync. Für die vollständige Desktop-Bedienung öffnet es auf Wunsch in einem separaten Fenster – du wirst nie in einer App eingesperrt.</p></div></div>
        <div class="metric-row">${stats.map((item) => `<div class="metric"><strong>${esc(item.value)}</strong><small>${esc(item.label)}</small></div>`).join("")}</div>
        <div class="row-actions" style="margin-top:16px"><button class="btn primary" data-action="external" data-path="${attr(path)}">In separatem Fenster öffnen</button><button class="btn" data-action="apps">Andere App öffnen</button></div>
      </section>
      <section class="widget span-12"><div class="widget-head"><span class="widget-icon">↻</span><h2>Zuletzt in Quantus</h2></div><div class="item-list">${recent.map(({ config, item }) => `<div class="list-item"><span class="badge accent">${esc(config.label)}</span><div class="item-main"><div class="item-title">${esc(itemTitle(item))}</div><div class="item-meta">${esc(relativeTime(item.updatedAt || item.createdAt))}</div></div></div>`).join("") || emptyMini("Noch keine Aktivität")}</div></section>
    </div>`;
  }

  function renderPolaris() {
    return `<div class="view">${viewHeader("Polaris", "Die zentrale KI-Schicht zwischen deinen Quantus-Apps.", `<button class="btn" data-action="external" data-path="index.html#/polaris">↗ Sprachmodus in der Vollversion</button>`)}
      <section class="widget hero-widget" style="max-width:900px;margin:0 auto"><div class="polaris-hero"><div class="polaris-orb"></div><h2>Womit soll ich dir helfen?</h2><p class="muted">Schnellbefehle werden direkt auf dem Tablet ausgeführt und mit AI Sync synchronisiert.</p></div>${polarisCommandBox()}</section></div>`;
  }

  function polarisCommandBox() {
    return `<form data-form="polaris"><div class="field"><input name="command" placeholder="Zum Beispiel: Neue Aufgabe: Sitzungsunterlagen lesen" autocomplete="off" required></div><div class="quick-grid"><button type="button" data-action="polaris-quick" data-command="Neue Aufgabe: ">✓ Neue Aufgabe</button><button type="button" data-action="polaris-quick" data-command="Neue Notiz: ">✎ Neue Notiz</button><button type="button" data-action="polaris-quick" data-command="Neues Projekt: ">▧ Neues Projekt</button><button type="button" data-action="go" data-route="polaris">✦ Polaris öffnen</button></div><button class="btn primary" type="submit" style="width:100%">Ausführen</button></form>`;
  }

  function renderSplit() {
    return `<div class="view">${viewHeader("Split-Screen", "Zwei Quantus-Bereiche gleichzeitig bearbeiten.", "")}
      <div class="split-layout">${splitPane("left",state.splitLeft)}${splitPane("right",state.splitRight)}</div></div>`;
  }

  function splitPane(side, route) {
    const options = ["reading","notes","tasks","projects","daily","learning"].map((key) => `<option value="${key}" ${key===route?"selected":""}>${esc(ROUTE_TITLES[key])}</option>`).join("");
    return `<section class="split-pane"><div class="split-pane-head"><strong>Bildschirm ${side === "left" ? "1" : "2"}</strong><select data-action="split-select" data-side="${side}">${options}</select><button class="icon-action" data-action="go" data-route="${attr(route)}">↗</button></div><div class="split-pane-body">${renderCompact(route)}</div></section>`;
  }

  function renderCompact(route) {
    if (route === "reading") {
      const docs = values(state.driveDocs).filter((doc) => doc.status !== "papierkorb").slice(0,15);
      return `<div class="item-list">${docs.map((doc) => `<div class="list-item" data-action="open-doc" data-id="${attr(doc.id || findMapKey(state.driveDocs,doc))}"><span>▤</span><div class="item-main"><div class="item-title">${esc(doc.titel_final || doc.dateiname || "Dokument")}</div><div class="item-meta">${esc(doc.bereich || "Drive")}</div></div></div>`).join("") || emptyMini("Keine Dokumente")}</div>`;
    }
    if (route === "daily") return `<h2>Heute</h2><div class="item-list">${todayTasks().map(taskItem).join("") || emptyMini("Keine offenen Aufgaben")}</div>`;
    if (route === "learning") return `<h2>Fällige Karten</h2><div class="item-list">${dueCards().slice(0,10).map((card) => `<div class="list-item"><span>▣</span><div class="item-main"><div class="item-title">${esc(card.front || "Karte")}</div><div class="item-meta">${esc(card.back || "")}</div></div></div>`).join("") || emptyMini("Keine Karten fällig")}</div>`;
    const map = { notes:"notes", tasks:"tasks", projects:"projects" };
    const name = map[route] || "notes";
    return `<div class="row-actions" style="margin-bottom:10px"><button class="btn primary small-btn" data-action="new-entity" data-collection="${name}">＋ Neu</button></div><div class="item-list">${collection(name).slice(0,20).map((item) => `<div class="list-item" data-action="edit-entity" data-collection="${name}" data-id="${attr(item.id)}"><span>${esc(COLLECTION_CONFIG[name].icon)}</span><div class="item-main"><div class="item-title">${esc(itemTitle(item))}</div><div class="item-meta">${esc(itemText(item).slice(0,80))}</div></div></div>`).join("") || emptyMini("Noch keine Einträge")}</div>`;
  }

  function renderSettings() {
    return `<div class="view">${viewHeader("Einstellungen", "Verbindung, Darstellung und Installation der Tablet-App.", "")}
      <div class="dashboard-grid"><section class="widget span-6"><div class="widget-head"><span class="widget-icon">↔</span><h2>Synchronisation</h2></div><div class="sync-details"><div class="detail-block"><small>Status</small><strong>${esc(state.syncMessage)}</strong></div><div class="detail-block"><small>Konto</small><strong>${esc(state.user ? (state.user.email || state.user.displayName) : "Nicht angemeldet")}</strong></div><div class="detail-block"><small>Letzter Abgleich</small><strong>${esc(relativeTime(state.lastSync))}</strong></div><div class="detail-block"><small>Offline-Warteschlange</small><strong>${state.pending.length} Änderung(en)</strong></div></div><div class="row-actions" style="margin-top:14px">${state.user ? `<button class="btn" data-action="flush-sync">Jetzt synchronisieren</button><button class="btn danger" data-action="sign-out">Abmelden</button>` : `<button class="btn primary" data-action="sign-in">Mit Google anmelden</button>`}</div></section>
      <section class="widget span-6"><div class="widget-head"><span class="widget-icon">⚙</span><h2>AI-Sync-Verknüpfung</h2></div><form data-form="settings"><div class="field"><label>Adresse der AI-Sync-Hauptapp</label><input name="aiSyncUrl" type="url" value="${attr(state.settings.aiSyncUrl || DEFAULT_AI_SYNC_URL)}" required></div><div class="field"><label>Beim Start zeigen</label><select name="startRoute"><option value="home" ${(state.settings.startRoute||"home")==="home"?"selected":""}>Homebildschirm</option><option value="dailybriefing" ${state.settings.startRoute==="dailybriefing"?"selected":""}>Morgenbriefing</option><option value="daily" ${state.settings.startRoute==="daily"?"selected":""}>Heute</option></select></div><div class="field"><label>Darstellung</label><select name="theme"><option value="dark" ${state.settings.theme==="dark"?"selected":""}>Dunkel – Schiefer</option><option value="light" ${state.settings.theme==="light"?"selected":""}>Hell – Leinen</option><option value="auto" ${state.settings.theme==="auto"?"selected":""}>Automatisch</option></select></div><button class="btn primary" type="submit">Speichern</button></form></section>
      <section class="widget span-6"><div class="widget-head"><span class="widget-icon">▰</span><h2>Speicher und Backup</h2></div>${storageDetails()}<div class="row-actions" style="margin-top:14px"><button class="btn primary" data-action="export-backup">Backup herunterladen</button><button class="btn" data-action="import-backup">Backup einspielen</button><button class="btn" data-action="clear-cache">Lokalen Cache leeren</button></div><input type="file" id="backupFileInput" accept="application/json,.json" style="display:none"></section>
      <section class="widget span-6"><div class="widget-head"><span class="widget-icon">⌨</span><h2>Tastatur-Abkürzungen</h2></div><div class="item-list">${[["Ctrl/Cmd + K","Alles durchsuchen"],["Ctrl/Cmd + P","Polaris öffnen"],["Alt + N","Neuer Eintrag in der aktuellen Ansicht"],["Ctrl/Cmd + S","Snapshot sichern und synchronisieren"],["Alt + 1 bis 9","Zwischen den Hauptansichten wechseln"],["Esc","Dialog schliessen"]].map(([keys,label]) => `<div class="list-item"><span class="badge">${esc(keys)}</span><div class="item-main"><div class="item-title">${esc(label)}</div></div></div>`).join("")}</div></section>
      <section class="widget span-12"><div class="widget-head"><span class="widget-icon">＋</span><h2>Als App installieren</h2></div><p class="muted">Öffne im Browser das Teilen-Menü und wähle „Zum Home-Bildschirm“. Danach startet Quantus Tablet ohne Browserleiste wie eine normale App.</p></section></div></div>`;
  }

  function storageDetails() {
    const stats = Core.payloadStats(state.payload);
    let snapshotBytes = 0;
    try { snapshotBytes = (localStorage.getItem(LOCAL_KEYS.snapshot) || "").length; } catch (_) {}
    return `<div class="sync-details">
      <div class="detail-block"><small>Aktive Elemente</small><strong>${stats.totalEntities}</strong></div>
      <div class="detail-block"><small>Datenstand</small><strong>${esc(formatBytes(stats.bytes))}</strong></div>
      <div class="detail-block"><small>Lokaler Snapshot</small><strong>${snapshotBytes ? esc(formatBytes(snapshotBytes)) + " · " + esc(relativeTime(state.snapshotAt)) : "Noch keiner"}</strong></div>
      <div class="detail-block"><small>Karteikarten / Routinen</small><strong>${stats.cards} / ${stats.routines}</strong></div>
    </div>
    <p class="muted small" style="margin-top:10px">Der Snapshot lädt deine Daten beim Start sofort – auch offline. Das Backup enthält zusätzlich die Offline-Warteschlange und lässt sich hier feldweise wieder einspielen.</p>`;
  }

  let renderedRoute = null;

  /*
   * DEN PDF-BETRACHTER EINHAENGEN.
   *
   * Er baut sein Innenleben selbst auf (Seiten auf Canvas), kann also nicht
   * aus einer Zeichenkette kommen. Das Einhaengen steht bewusst HIER und
   * nicht im Modul: mount() eines Moduls laeuft nur fuer dessen eigene Route,
   * und "reading" gehoert gar keinem Modul — dort waere der Betrachter nie
   * eingehaengt worden.
   */
  let offenesPdf = null;
  function mountPdfViewer() {
    const host = main.querySelector("[data-nm-pdf]");
    if (!host) {
      // Kein PDF mehr in der Ansicht: das Dokument samt Arbeiter freigeben.
      if (offenesPdf && window.QuantusPdfViewer) window.QuantusPdfViewer.close();
      offenesPdf = null;
      return;
    }
    if (!window.QuantusPdfViewer) return;
    const url = host.dataset.nmPdf;
    /*
     * Geoeffnet wird, wenn der Behaelter noch KEINEN Betrachter enthaelt oder
     * ein anderes Dokument gewaehlt ist. Auf eine blosse Merkvariable zu bauen
     * waere falsch: jedes Neuzeichnen ersetzt das Innere von #main, der
     * Betrachter ist damit weg — die Variable zeigte aber weiter auf dieselbe
     * Adresse und verhinderte das erneute Oeffnen. Zurueck bliebe ein leerer
     * Kasten, ausgerechnet dann, wenn im Hintergrund neue Daten eintreffen.
     */
    if (host.querySelector(".pdfv") && offenesPdf === url) return;
    offenesPdf = url;
    window.QuantusPdfViewer.open(host, { url, name: host.dataset.nmPdfName });
  }

  function render() {
    state.route = getRoute();
    viewTitle.textContent = ROUTE_TITLES[state.route] || "Quantus";
    document.querySelectorAll("[data-dock]").forEach((button) => button.classList.toggle("on", button.dataset.dock === state.route));
    rememberApp(state.route);
    main.innerHTML = renderRoute(state.route);
    // Beim Wechsel der Ansicht oben beginnen, sonst landet man mitten in der
    // neuen Seite. Bei reinen Datenaktualisierungen bleibt die Position.
    if (renderedRoute !== state.route) { renderedRoute = state.route; main.scrollTop = 0; }
    updateAccountButton();
    mountPdfViewer();
    window.QuantusTabletWorkspace?.mountRoute?.();
    const mounted = moduleFor(state.route);
    if (mounted && typeof mounted.mount === "function") {
      try { mounted.mount(state.route, main); }
      catch (error) { console.warn("[Tablet-Modul mount]", mounted.key, error); }
    }
  }

  // Native Tablet-Navigation. Jede App rendert ihre eigene Ansicht direkt in der
  // Tablet-Huelle. Es gibt kein eingebettetes AI-Sync-Tabsystem mehr, deshalb
  // laesst sich jederzeit frei zwischen allen Apps wechseln.
  function renderRoute(route) {
    if (route === "workspace") return window.QuantusTabletWorkspace?.renderRoute?.() || renderHome();
    /*
     * Eigenstaendige Tablet-Programme ZUERST (Homebildschirm, Mail,
     * FlowerTech, native Module, BM).
     *
     * Vorher stand die Abfrage des Lern-Hubs davor und fing "bm", "leseplan"
     * und "career" ab, bevor ein Modul ueberhaupt gefragt wurde. Ein Modul,
     * das eine dieser Routen beansprucht, wurde damit stumm uebergangen —
     * die Route sah aus, als waere sie nicht angemeldet. Jetzt gewinnt das
     * spezialisierte Modul, und der Lern-Hub ist der Rueckfall.
     */
    const mod = moduleFor(route);
    if (mod && typeof mod.render === "function") {
      try { return mod.render(route); }
      catch (error) { console.warn("[Tablet-Modul]", mod.key, error); }
    }
    // Leseplan und Career Model rendert der Lern-Hub — er abonniert ihre
    // Daten ohnehin live.
    if (route === "leseplan" || route === "career" || route === "bm") {
      return window.QuantusTabletLearningHub?.renderRoute?.(route) || renderHome();
    }
    if (route === "home") return renderHome();
    if (route === "apps") return renderApps();
    if (route === "split") return renderSplit();
    if (route === "settings") return renderSettings();
    if (route === "daily" || route === "dailybriefing") return renderDaily();
    if (route === "reading") return renderReading();
    if (route === "notes") return renderNotes();
    if (route === "ideas") return renderIdeas();
    if (route === "learning") return renderLearning();
    if (route === "habits") return renderHabits();
    if (route === "budget") return renderBudget();
    if (route === "polaris") return renderPolaris();
    if (route === "concepts") return renderConcepts();
    if (route === "calendar") return renderCalendar();
    if (route === "statistics") return renderStatistics();
    if (route === "reports") return renderReports();
    if (route === "dashboard") return renderHome();
    if (route === "drive") return renderReading();
    if (route === "smarter") return renderLearning();
    if (COLLECTION_CONFIG[route]) return renderCollectionView(route);
    if (FULL_APPS[route]) return renderModule(FULL_APPS[route]);
    return renderHome();
  }

  function appBaseUrl() {
    try {
      const url = new URL(String(state.settings.aiSyncUrl || DEFAULT_AI_SYNC_URL));
      if (!/^https?:$/.test(url.protocol)) throw new Error("Ungueltiges Protokoll");
      return url.toString().replace(/\/+$/, "");
    } catch (_) {
      return DEFAULT_AI_SYNC_URL;
    }
  }

  // Auf dem Tablet (installierte App, Popup-Blocker, Kiosk-Modus) liefert
  // window.open haeufig kein Fenster zurueck. Dann wirkt der Knopf wirkungslos.
  // Deshalb wird in diesem Fall im selben Fenster geoeffnet.
  function openWindow(url) {
    let opened = null;
    try { opened = window.open(url, "_blank"); } catch (_) { opened = null; }
    if (opened) {
      try { opened.opener = null; } catch (_) {}
      return true;
    }
    toast("Wird geoeffnet", "Das Tablet erlaubt kein zweites Fenster – die Seite oeffnet hier.", "ok");
    try { location.assign(url); } catch (_) {}
    return false;
  }

  function openExternal(path) {
    const raw = String(path || "");
    // DER GRUNDLEGENDE FEHLER: ein reiner Hash ist eine Route DIESER App, kein
    // fremdes Ziel. "#/smarter" wurde hier an die Desktop-Adresse gehaengt und
    // ergab "https://…netlify.app/#/smarter" — das Tablet sprang also in die
    // Desktop-App, obwohl es fuer smarter eine eigene Ansicht hat. Und weil
    // openWindow bei blockiertem Popup im SELBEN Fenster oeffnet, war die
    // Tablet-App danach weg.
    if (raw.charAt(0) === "#") { go(raw.replace(/^#\/?/, "").split("/")[0]); return; }
    const clean = raw.replace(/^\/+/, "");
    openWindow(`${appBaseUrl()}/${clean}`);
  }

  function openExternalUrl(url) {
    if (!/^https?:\/\//i.test(url || "")) return;
    openWindow(url);
  }

  function closeOverlay() {
    overlayRoot.innerHTML = "";
    document.querySelectorAll(".selection-tools").forEach((node) => node.remove());
  }

  function sheet(title, body, extraClass) {
    overlayRoot.innerHTML = `<div class="overlay" data-action="close-overlay"><section class="sheet ${extraClass || ""}" role="dialog" aria-modal="true" aria-label="${attr(title)}" data-overlay-panel><div class="sheet-head"><h2>${esc(title)}</h2><button class="close-button" data-action="close-overlay" aria-label="Schliessen">×</button></div>${body}</section></div>`;
    const focus = overlayRoot.querySelector("input,textarea,select,button");
    if (focus) setTimeout(() => focus.focus(), 20);
  }

  function notebookSelect(selected) {
    return `<div class="field"><label>Notizbuch <small>(optional)</small></label><select name="notebookId"><option value="">Inbox – später zuordnen</option>${notebooks().map((book) => `<option value="${attr(book.id)}" ${selected === book.id ? "selected" : ""}>${esc(itemTitle(book, "Notizbuch"))}</option>`).join("")}</select><small class="field-hint">Es wird kein neues Notizbuch automatisch erstellt.</small></div>`;
  }

  function tagEditor(tags, options) {
    const valuesList = Notes.normalizeTags(tags);
    const opts = options || {};
    return `<div class="field full tag-field" data-tag-editor data-single="${opts.single ? "true" : "false"}"><label>${esc(opts.label || "Schlagwörter")}${opts.required ? " *" : ""}</label><div class="tag-editor"><div class="tag-editor-chips" data-tag-chips>${valuesList.map((tag) => `<button type="button" class="tag-chip" data-action="remove-tag" data-tag="${attr(tag)}">#${esc(tag)} ×</button>`).join("")}</div><input type="hidden" name="${attr(opts.name || "tags")}" value="${attr(valuesList.join(", "))}"><input data-tag-autocomplete role="combobox" aria-autocomplete="list" aria-expanded="false" placeholder="${attr(opts.placeholder || "Schlagwort tippen und Enter drücken")}" autocomplete="off"><div class="tag-suggestions" data-tag-suggestions role="listbox" hidden></div></div><small class="field-hint">Bestehende Schlagwörter werden beim Tippen gefiltert. Enter übernimmt einen neuen Wert.</small></div>`;
  }

  function openNoteForm(options) {
    const opts = options || {};
    const existing = opts.id ? collection("notes").find((note) => note.id === opts.id) : null;
    const source = Notes.normalizeSource(opts.source || existing && existing.source, { app: "noteflow", label: "Noteflow", route: "#/notes" });
    const noteClass = opts.noteClass || existing && existing.noteClass || "general";
    const fixedClass = Boolean(opts.lockClass);
    const tags = opts.tags || existing && existing.tags || [];
    const readingKind = opts.readingKind || existing && existing.readingKind || "note";
    const learningKind = opts.learningKind || existing && existing.learningKind || "merksatz";
    const body = `<form data-form="note" data-id="${attr(existing && existing.id || "")}" data-source-app="${attr(source.app)}" data-source-type="${attr(source.entityType || "")}" data-source-id="${attr(source.entityId || "")}" data-source-label="${attr(source.label || "")}" data-source-route="${attr(source.route || "")}">
      <div class="form-grid">
        <div class="field"><label>Notizklasse</label>${fixedClass ? `<input type="hidden" name="noteClass" value="${attr(noteClass)}"><div class="readonly-field">${esc(noteClassLabel(noteClass))}</div>` : `<select name="noteClass" data-action="note-class-select">${Notes.NOTE_CLASSES.map((key) => `<option value="${key}" ${noteClass === key ? "selected" : ""}>${esc(Notes.NOTE_CLASS_LABELS[key])}</option>`).join("")}</select>`}</div>
        <div class="field"><label>Titel <small>(optional)</small></label><input name="title" value="${attr(opts.title == null ? existing && existing.title || "" : opts.title)}" placeholder="Wird sonst aus dem Inhalt gebildet"></div>
        <div class="field full"><label>Inhalt *</label><textarea name="content" rows="7" required>${esc(opts.content == null ? existing && noteContent(existing) || "" : opts.content)}</textarea></div>
        <div class="field" data-note-subtype="reading" ${noteClass === "reading" ? "" : "hidden"}><label>Art der Lesenotiz</label><select name="readingKind"><option value="note" ${readingKind === "note" ? "selected" : ""}>Eigene Notiz</option><option value="quote" ${readingKind === "quote" ? "selected" : ""}>Zitat</option><option value="summary" ${readingKind === "summary" ? "selected" : ""}>Zusammenfassung</option><option value="insight" ${readingKind === "insight" ? "selected" : ""}>Erkenntnis</option></select></div>
        <div class="field" data-note-subtype="learning" ${noteClass === "learning" ? "" : "hidden"}><label>Art der Lernnotiz</label><select name="learningKind">${Notes.LEARNING_KINDS.map((key) => `<option value="${key}" ${learningKind === key ? "selected" : ""}>${esc({ merksatz:"Merksatz", erklaerung:"Erklärung", fehler:"Fehleranalyse", frage:"Frage", zusammenfassung:"Zusammenfassung" }[key])}</option>`).join("")}</select></div>
        ${tagEditor(tags, { required: noteClass !== "general", label: "Schlagwörter" })}
        ${notebookSelect(opts.notebookId == null ? existing && existing.notebookId : opts.notebookId)}
        <div class="field"><label>Quelle</label><div class="readonly-field">${esc(source.label || source.app)}</div></div>
      </div>
      <div class="sheet-foot"><button class="btn" type="button" data-action="close-overlay">Abbrechen</button><button class="btn primary" type="submit">In Noteflow speichern</button></div>
    </form>`;
    sheet(existing ? "Notiz bearbeiten" : noteClassLabel(noteClass), body, "wide");
  }

  function openIdeaForm() {
    sheet("Neue Idee", `<form data-form="idea"><div class="form-grid"><div class="field full"><label>Kategorie *</label><input name="category" list="quantus-tag-list" required autocomplete="off" placeholder="Zum Beispiel: Medienprojekt"><datalist id="quantus-tag-list">${noteTags().map((tag) => `<option value="${attr(tag)}"></option>`).join("")}</datalist><small class="field-hint">Die Kategorie wird als Schlagwort gespeichert.</small></div><div class="field full"><label>Idee *</label><textarea name="idea" rows="7" required placeholder="Was ist dir eingefallen?"></textarea></div></div><div class="sheet-foot"><button class="btn" type="button" data-action="close-overlay">Abbrechen</button><button class="btn primary" type="submit">In Inbox speichern</button></div></form>`);
  }

  function openBookForm(id) {
    const book = id ? collection("books").find((item) => item.id === id) : null;
    sheet(book ? "Buch ergänzen" : "Buch registrieren", `<form data-form="book" data-id="${attr(id || "")}"><div class="form-grid"><div class="field full"><label>Titel *</label><input name="title" required value="${attr(book && book.title)}" placeholder="Nur der Titel ist notwendig"></div><div class="field"><label>Autor <small>(optional)</small></label><input name="author" value="${attr(book && book.author)}"></div><div class="field"><label>Status</label><select name="status">${Notes.BOOK_STATUSES.map((key) => `<option value="${key}" ${Notes.normalizeBookStatus(book && book.status) === key ? "selected" : ""}>${esc(bookStatusLabel(key))}</option>`).join("")}</select></div><div class="field"><label>ISBN <small>(optional)</small></label><input name="isbn" value="${attr(book && book.isbn)}"></div><div class="field"><label>Seitenzahl <small>(optional)</small></label><input name="totalPages" type="number" min="1" value="${attr(book && book.totalPages)}"></div><div class="field full"><label>Datei-/Webadresse <small>(optional)</small></label><input name="fileUrl" type="url" value="${attr(book && (book.fileUrl || book.firebaseUrl || book.downloadUrl))}"></div></div><p class="muted small">Annotationen, Lesenotizen und bestehende Verknüpfungen bleiben beim späteren Ergänzen unverändert.</p><div class="sheet-foot"><button class="btn" type="button" data-action="close-overlay">Abbrechen</button><button class="btn primary" type="submit">${book ? "Änderungen speichern" : "Titel registrieren"}</button></div></form>`);
  }

  function openShortnote(prefill) {
    const local = new Date(Date.now() + 60 * 60 * 1000);
    const localValue = new Date(local.getTime() - local.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    sheet("Shortnote", `<form data-form="shortnote"><div class="shortnote-type" role="radiogroup"><label><input type="radio" name="shortType" value="note" checked data-action="shortnote-type"> Notiz</label><label><input type="radio" name="shortType" value="message" data-action="shortnote-type"> Mitteilung</label></div><div class="field full"><label>Text *</label><textarea name="content" rows="4" required autofocus placeholder="Kurz festhalten …">${esc(prefill || "")}</textarea></div><div data-shortnote-section="note">${tagEditor([], { required:true, single:true, label:"Schlagwortkategorie" })}<p class="muted small">Die Notiz landet in der Inbox und unter diesem Schlagwort.</p></div><div data-shortnote-section="message" hidden><div class="field"><label>Zustellzeitpunkt *</label><input name="deliverAt" type="datetime-local" value="${attr(localValue)}"></div><p class="muted small">Mitteilungen werden geplant und nicht als Notiz dupliziert.</p></div><div class="sheet-foot"><button class="btn" type="button" data-action="close-overlay">Abbrechen</button><button class="btn primary" type="submit">Speichern</button></div></form>`, "shortnote-sheet");
  }

  function openContextNote(collectionName, id, noteClass) {
    const item = collection(collectionName).find((entry) => entry.id === id);
    if (!item) return toast("Quelle nicht verfügbar", "Das verknüpfte Element wurde gelöscht.", "error");
    const source = contextSource(collectionName, item);
    openNoteForm({ noteClass: noteClass || "research", lockClass: true, source, tags: [source.label], title: `Notiz · ${source.label}` });
  }

  function tagEditorValues(editor) {
    const hidden = editor && editor.querySelector('input[type="hidden"]');
    return Notes.normalizeTags(hidden && hidden.value);
  }

  function updateTagEditor(editor, tags) {
    if (!editor) return;
    const normalized = Notes.normalizeTags(tags, noteTags());
    const hidden = editor.querySelector('input[type="hidden"]');
    const chips = editor.querySelector("[data-tag-chips]");
    if (hidden) hidden.value = normalized.join(", ");
    if (chips) chips.innerHTML = normalized.map((tag) => `<button type="button" class="tag-chip" data-action="remove-tag" data-tag="${attr(tag)}">#${esc(tag)} ×</button>`).join("");
  }

  function addEditorTag(editor, raw) {
    const value = String(raw || "").trim();
    if (!editor || !value) return;
    const current = tagEditorValues(editor);
    const tags = editor.dataset.single === "true" ? [value] : current.concat([value]);
    updateTagEditor(editor, tags);
    const input = editor.querySelector("[data-tag-autocomplete]");
    const menu = editor.querySelector("[data-tag-suggestions]");
    if (input) { input.value = ""; input.setAttribute("aria-expanded", "false"); input.focus(); }
    if (menu) { menu.hidden = true; menu.innerHTML = ""; }
  }

  function openEntityForm(name, id) {
    const config = COLLECTION_CONFIG[name];
    if (!config) return;
    const existing = id ? collection(name).find((item) => item.id === id) : null;
    // Unfertige Eingaben ueberleben ein versehentliches Schliessen oder einen
    // Absturz: Beim naechsten Oeffnen steht der Entwurf wieder im Formular.
    const draft = !existing ? state.drafts[name] : null;
    const draftTitle = draft && draft.title || "";
    const draftText = draft && draft.description || "";
    const linkedNotes = existing && CONTEXT_NOTE_COLLECTIONS.has(name)
      ? Notes.notesForSource(collection("notes"), contextSource(name, existing).app, existing.id)
      : [];
    const noteSection = existing && CONTEXT_NOTE_COLLECTIONS.has(name)
      ? `<section class="entity-linked-notes"><div class="widget-head"><span class="widget-icon">✎</span><h3>Notizen</h3><button class="btn small-btn" type="button" data-action="context-note" data-collection="${attr(name)}" data-id="${attr(existing.id)}">＋ Notiz</button></div><div class="item-list">${linkedNotes.map((note) => `<button class="list-item" type="button" data-action="edit-note" data-id="${attr(note.id)}"><span class="badge accent">${esc(noteClassLabel(note.noteClass))}</span><span class="item-main"><strong class="item-title">${esc(itemTitle(note))}</strong><small class="item-meta">${esc(noteContent(note).slice(0, 100))}</small></span></button>`).join("") || emptyMini("Noch keine verknüpfte Notiz")}</div></section>`
      : "";
    const body = `<form data-form="entity" data-collection="${attr(name)}" data-id="${attr(id || "")}">${draft ? `<p class="muted small" style="margin:0 0 10px">Entwurf von ${esc(relativeTime(draft.savedAt))} wiederhergestellt.</p>` : ""}<div class="form-grid"><div class="field full"><label>Titel</label><input name="title" value="${attr(existing ? itemTitle(existing,"") : draftTitle)}" required></div><div class="field full"><label>Beschreibung / Inhalt</label><textarea name="description">${esc(existing ? itemText(existing) : draftText)}</textarea></div><div class="field"><label>Status</label><select name="status"><option value="open" ${!existing||existing.status==="open"?"selected":""}>Offen</option><option value="in_progress" ${existing&&existing.status==="in_progress"?"selected":""}>In Arbeit</option><option value="done" ${existing&&isDone(existing)?"selected":""}>Erledigt</option></select></div><div class="field"><label>${name === "meetings" ? "Datum" : "Fällig am"}</label><input name="date" type="date" value="${attr(existing && String(existing.date || existing.dueDate || "").slice(0,10))}"></div>${name === "meetings" ? `<div class="field"><label>Zeit</label><input name="time" type="time" value="${attr(existing && (existing.time || ""))}"></div><div class="field"><label>Ort</label><input name="location" value="${attr(existing && existing.location)}"></div>` : ""}</div>${noteSection}<div class="sheet-foot"><button class="btn" type="button" data-action="close-overlay">Abbrechen</button><button class="btn primary" type="submit">Mit AI Sync speichern</button></div></form>`;
    sheet(`${existing ? "Bearbeiten" : "Neu"}: ${config.label}`, body);
  }

  function openHabitForm() {
    sheet("Neue Gewohnheit", `<form data-form="habit"><div class="field"><label>Name</label><input name="name" required placeholder="Zum Beispiel: 30 Minuten lesen"></div><div class="field"><label>Symbol</label><input name="icon" value="◌" maxlength="4"></div><div class="sheet-foot"><button class="btn" type="button" data-action="close-overlay">Abbrechen</button><button class="btn primary" type="submit">Speichern</button></div></form>`);
  }

  function openFlashcardForm(id, defaults) {
    const card = id ? asArray(state.payload.recallLabData.cards).find((item) => item && item.id === id) : null;
    const source = card || defaults || {};
    sheet(card ? "Karteikarte bearbeiten" : "Neue Karteikarte", `<form data-form="flashcard" data-id="${attr(id || "")}"><div class="field"><label>Vorderseite</label><textarea name="front" required>${esc(source.front || "")}</textarea></div><div class="field"><label>Rückseite</label><textarea name="back" required>${esc(source.back || "")}</textarea></div><div class="field"><label>Deck</label><input name="deckId" value="${attr(source.deckId || "deck_general")}"></div><div class="field"><label>Quelle</label><input name="source" value="${attr(source.source || "Quantus Tablet")}"></div><div class="sheet-foot"><button class="btn" type="button" data-action="close-overlay">Abbrechen</button><button class="btn primary" type="submit">Speichern</button></div></form>`);
  }

  function openAccountSheet() {
    if (!state.user) return sheet("Mit Quantus verbinden", `<p class="muted">Die Tablet-App verwendet dieselbe Firebase-Datenbank wie AI Sync. Melde dich mit deinem Quantus-Google-Konto an.</p><div class="sheet-foot"><button class="btn primary" data-action="sign-in">Mit Google anmelden</button></div>`);
    sheet("Konto", `<div class="detail-block"><small>Angemeldet als</small><strong>${esc(state.user.displayName || "Laurin")}</strong><span class="muted">${esc(state.user.email || "")}</span></div><div class="sheet-foot"><button class="btn" data-action="go" data-route="settings">Einstellungen</button><button class="btn danger" data-action="sign-out">Abmelden</button></div>`);
  }

  function openSyncSheet() {
    // Der Spiegel nach polaris/inbox ist seit F-23 entfernt — der Text hier
    // versprach ihn trotzdem weiter. Eine Erklaerung, die nicht mehr stimmt,
    // ist schlimmer als keine: sie laesst einen an der falschen Stelle suchen.
    const konto = state.user ? (state.user.email || state.user.displayName || "angemeldet") : "nicht angemeldet";
    const fehler = state.authFehler
      ? `<p class="muted small" style="color:var(--danger,#e06c75)">Anmeldung: ${esc(state.authFehler.text)} <strong>(${esc(state.authFehler.code)})</strong></p>`
      : "";
    sheet("Synchronisation", `<div class="sync-details"><div class="detail-block"><small>Status</small><strong>${esc(state.syncMessage)}</strong></div><div class="detail-block"><small>Konto</small><strong>${esc(konto)}</strong></div><div class="detail-block"><small>Firebase-Pfad</small><strong>${esc(APP_STORE_PATH)}</strong></div><div class="detail-block"><small>Letzter Abgleich</small><strong>${esc(relativeTime(state.lastSync))}</strong></div><div class="detail-block"><small>Vorgemerkt</small><strong>${state.pending.length} Änderung(en)</strong></div></div>${fehler}<p class="muted small">Tablet-Änderungen werden als Firebase-Transaktion in den aktuellen AI-Sync-Datenstand eingefügt — derselbe Knoten, den auch AI Sync und das Handy lesen. Dadurch bleiben parallele Änderungen erhalten.</p><div class="sheet-foot">${state.user ? `<button class="btn primary" data-action="flush-sync">Jetzt abgleichen</button>` : `<button class="btn primary" data-action="sign-in">Mit Google anmelden</button>`}</div>`);
  }

  // Der Apps-Knopf im Dock fuehrt auf den App-Bildschirm. Vorher oeffnete er
  // ein Blatt ueber der App: darin liess sich weder suchen noch der
  // Homebildschirm anordnen, und es verdeckte die Ansicht darunter.
  function openAppsSheet() { go("apps"); }

  function openPolarisSheet(prefill) {
    sheet("Polaris", `<div class="polaris-hero"><div class="polaris-orb"></div><h2>Quantus, aber gesprächig.</h2><p class="muted">Erstelle direkt Aufgaben, Notizen und Projekte oder wechsle in den vollständigen Sprachmodus.</p></div>${polarisCommandBox().replace('name="command"','name="command" value="'+attr(prefill || "")+'"')}`, "polaris-sheet");
  }

  function openSearch() {
    sheet("Quantus durchsuchen", `<div class="field"><input id="globalSearch" data-action="global-search" placeholder="Aufgaben, Projekte, Notizen, Meetings …" autocomplete="off"></div><div id="searchResults" class="search-results">${searchResults("")}</div>`, "wide");
  }

  function searchResults(query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return `<p class="muted">Beginne zu tippen, um alle synchronisierten Inhalte zu durchsuchen.</p>`;
    const result = [];
    Object.entries(COLLECTION_CONFIG).forEach(([name,config]) => collection(name).forEach((item) => {
      if (`${itemTitle(item)} ${itemText(item)}`.toLowerCase().includes(q)) result.push({ name, config, item });
    }));
    return result.slice(0,50).map(({name,config,item}) => `<button class="search-result" data-action="search-result" data-collection="${attr(name)}" data-id="${attr(item.id)}"><span class="result-icon">${esc(config.icon)}</span><span class="item-main"><strong class="item-title">${esc(itemTitle(item))}</strong><small class="item-meta">${esc(config.label)} · ${esc(itemText(item).slice(0,90))}</small></span></button>`).join("") || `<p class="muted">Keine Treffer für „${esc(query)}“.</p>`;
  }

  function showSelectionTools(text) {
    document.querySelectorAll(".selection-tools").forEach((node) => node.remove());
    if (!text || text.length < 2 || text.length > 1200) return;
    const tools = document.createElement("div");
    tools.className = "selection-tools";
    tools.style.left = "50%";
    tools.style.bottom = "110px";
    tools.style.transform = "translateX(-50%)";
    tools.innerHTML = `<button data-action="reading-selection" data-text="${attr(text)}">Lesenotiz</button><button data-action="translate-selection" data-text="${attr(text)}">Übersetzen</button><button data-action="flashcard-selection" data-text="${attr(text)}">Karteikarte</button><button data-action="polaris-selection" data-text="${attr(text)}">Polaris</button>`;
    document.body.appendChild(tools);
  }

  async function translateSelection(text) {
    let translated = "";
    let note = "Trage die Übersetzung ein oder öffne den externen Übersetzer.";
    try {
      if (window.LanguageDetector && window.Translator) {
        const detector = await window.LanguageDetector.create();
        const guesses = await detector.detect(text);
        const sourceLanguage = guesses && guesses[0] && guesses[0].detectedLanguage;
        if (sourceLanguage && sourceLanguage !== "de") {
          const translator = await window.Translator.create({ sourceLanguage, targetLanguage: "de" });
          translated = await translator.translate(text);
          note = "Die Übersetzung wurde lokal mit der Browser-KI erstellt.";
        } else if (sourceLanguage === "de") note = "Der ausgewählte Text ist bereits Deutsch.";
      }
    } catch (_) {}
    sheet("Übersetzen und speichern", `<p class="muted small">${esc(note)}</p><form data-form="translation-card"><div class="field"><label>Original</label><textarea name="front" required>${esc(text)}</textarea></div><div class="field"><label>Deutsche Übersetzung</label><textarea name="back" required>${esc(translated)}</textarea></div><div class="row-actions"><button class="btn" type="button" data-action="external-translate" data-text="${attr(text)}">In Google Übersetzer öffnen</button></div><div class="sheet-foot"><button class="btn" type="button" data-action="close-overlay">Schliessen</button><button class="btn primary" type="submit">Als Karteikarte speichern</button></div></form>`);
  }

  async function handlePolarisCommand(command) {
    const value = String(command || "").trim();
    const noteMatch = value.match(/^(?:neue\s+)?notiz\s*:\s*(.+)$/i);
    if (noteMatch) { closeOverlay(); openShortnote(noteMatch[1].trim()); return; }
    const patterns = [
      { re:/^(?:neue\s+)?aufgabe\s*:\s*(.+)$/i, collection:"tasks", label:"Aufgabe" },
      { re:/^(?:neues\s+)?projekt\s*:\s*(.+)$/i, collection:"projects", label:"Projekt" },
      { re:/^(?:neues\s+)?konzept\s*:\s*(.+)$/i, collection:"concepts", label:"Konzept" }
    ];
    for (const item of patterns) {
      const match = value.match(item.re);
      if (match) {
        const id = Core.makeId(item.collection.slice(0,-1));
        await executeOperation(makeOperation("entity","create",item.collection,id,{ title:match[1].trim(), description:"", status:"open", source:"polaris-tablet" }));
        closeOverlay();
        toast(`${item.label} erstellt`, match[1].trim(), "ok");
        return;
      }
    }
    openPolarisSheet(value);
    toast("Befehl nicht lokal erkannt", "Nutze den vollständigen Polaris-Sprachmodus für freie Anfragen.");
  }

  async function handleSubmit(form) {
    const data = new FormData(form);
    const type = form.dataset.form;
    // Formulare der Tablet-Module (Mail verfassen, FlowerTech-Dokumente) zuerst.
    for (const mod of tabletModules()) {
      if (typeof mod.onSubmit !== "function") continue;
      let handled = false;
      try { handled = await mod.onSubmit(type, form, data); }
      catch (error) { console.warn("[Tablet-Modul submit]", mod.key, error); }
      if (handled) return;
    }
    if (type === "note") {
      const existingId = form.dataset.id || "";
      const noteClass = String(data.get("noteClass") || "general");
      const source = {
        app: form.dataset.sourceApp || "noteflow",
        entityType: form.dataset.sourceType || null,
        entityId: form.dataset.sourceId || null,
        label: form.dataset.sourceLabel || "Noteflow",
        route: form.dataset.sourceRoute || "#/notes"
      };
      const tags = Notes.normalizeTags(data.get("tags"), noteTags());
      try {
        const id = await saveCanonicalNote({
          noteClass,
          title: String(data.get("title") || "").trim(),
          content: String(data.get("content") || "").trim(),
          description: String(data.get("content") || "").trim(),
          tags,
          notebookId: String(data.get("notebookId") || "") || null,
          source,
          readingKind: noteClass === "reading" ? String(data.get("readingKind") || "note") : undefined,
          learningKind: noteClass === "learning" ? String(data.get("learningKind") || "merksatz") : undefined
        }, existingId);
        closeOverlay(); noteSavedToast(id, existingId ? "Notiz aktualisiert" : "In Noteflow gespeichert");
      } catch (error) { toast("Notiz nicht gespeichert", error.message, "error"); }
    } else if (type === "idea") {
      const category = String(data.get("category") || "").trim();
      const content = String(data.get("idea") || "").trim();
      if (!category || !content) { toast("Kategorie und Idee fehlen", "Beide Angaben sind erforderlich.", "error"); return; }
      const id = Core.makeId("idea");
      try {
        await saveCanonicalNote({
          id,
          noteClass: "idea",
          content,
          tags: [category],
          notebookId: null,
          source: { app: "ideas", entityType: "idea", entityId: id, label: category, route: "#/ideas" },
          dedupeKey: `ideas:${id}`
        });
        closeOverlay(); noteSavedToast(id, "Idee in der Inbox gespeichert");
      } catch (error) { toast("Idee nicht gespeichert", error.message, "error"); }
    } else if (type === "book") {
      const existingId = form.dataset.id || "";
      const title = String(data.get("title") || "").trim();
      if (!title) { toast("Titel fehlt", "Ein Buchtitel ist die einzige Pflichtangabe.", "error"); return; }
      const id = existingId || Core.makeId("book");
      const existing = existingId ? asMap(state.payload.entities.books)[existingId] : null;
      const changedFields = {
        title,
        author: String(data.get("author") || "").trim(),
        status: Notes.normalizeBookStatus(data.get("status")),
        isbn: String(data.get("isbn") || "").trim(),
        totalPages: Number(data.get("totalPages")) || null,
        fileUrl: String(data.get("fileUrl") || "").trim(),
        updatedAt: new Date().toISOString()
      };
      /* Beim Ergänzen von Metadaten nur diese Felder patchen. Annotationen,
         Leseposition und Notiz-Verknüpfungen eines parallel schreibenden
         Readers dürfen nie von einem älteren Komplettobjekt überschrieben
         werden. */
      const patch = existing ? changedFields : Notes.normalizeBook({ id, ...changedFields, createdAt:new Date().toISOString() }, id);
      closeOverlay();
      await executeOperation(makeOperation("entity", existing ? "update" : "create", "books", id, patch));
      state.selectedBookId = id; state.selectedDocId = null; render();
      toast(existing ? "Buch ergänzt" : "Buch registriert", title, "ok");
    } else if (type === "shortnote") {
      const shortType = String(data.get("shortType") || "note");
      const content = String(data.get("content") || "").trim();
      if (!content) { toast("Text fehlt", "Bitte gib einen Inhalt ein.", "error"); return; }
      if (shortType === "message") {
        const localValue = String(data.get("deliverAt") || "");
        const date = new Date(localValue);
        if (!localValue || Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) { toast("Zustellzeitpunkt ungültig", "Wähle einen Zeitpunkt in der Zukunft.", "error"); return; }
        const id = Core.makeId("message");
        closeOverlay();
        await executeOperation(makeOperation("entity", "create", "scheduledMessages", id, {
          title: Notes.titleFromContent(content, "Mitteilung"), content, deliverAt: date.toISOString(),
          priority: "normal", isDelivered: false, isRead: false, isPinned: false,
          recurrence: "none", sourceType: "tablet-shortnote"
        }));
        toast("Mitteilung geplant", `Zustellung ${formatDate(date, { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}`, "ok");
      } else {
        const tags = Notes.normalizeTags(data.get("tags"), noteTags());
        if (!tags.length) { toast("Schlagwort fehlt", "Wähle oder erstelle eine Kategorie.", "error"); return; }
        try {
          const id = await saveCanonicalNote({ noteClass:"short", content, tags, notebookId:null,
            source:{ app:"shortnote", entityType:"capture", entityId:null, label:"Shortnote", route:"#/notes" } });
          closeOverlay(); noteSavedToast(id, "Kurze Notiz gespeichert");
        } catch (error) { toast("Notiz nicht gespeichert", error.message, "error"); }
      }
    } else if (type === "entity") {
      const name = form.dataset.collection;
      const existingId = form.dataset.id;
      const id = existingId || Core.makeId(name.slice(0,-1));
      const patch = { title:String(data.get("title")||"").trim(), description:String(data.get("description")||"").trim(), status:String(data.get("status")||"open") };
      const date = String(data.get("date")||"");
      if (name === "meetings") { patch.date=date; patch.time=String(data.get("time")||""); patch.location=String(data.get("location")||""); }
      else patch.dueDate = date;
      if (!existingId) { delete state.drafts[name]; saveJson(LOCAL_KEYS.drafts, state.drafts); }
      closeOverlay();
      await executeOperation(makeOperation("entity",existingId?"update":"create",name,id,patch));
    } else if (type === "quick-add") {
      const name = form.dataset.collection;
      const title = String(data.get("title")||"").trim();
      if (!name || !title || !COLLECTION_CONFIG[name]) return;
      if (name === "notes") { openNoteForm({ content: title }); return; }
      if (name === "ideas") { openIdeaForm(); return; }
      const input = form.querySelector("[data-quickadd]");
      if (input) input.value = "";
      await executeOperation(makeOperation("entity","create",name,Core.makeId(name.slice(0,-1)),{ title, description:"", status:"open", source:"tablet-quick-add" }),{silent:true});
      toast(`${COLLECTION_CONFIG[name].label} erstellt`, title, "ok");
      requestAnimationFrame(() => { const next=document.querySelector("[data-quickadd]"); if (next) next.focus(); });
    } else if (type === "budget-tx") {
      const roh = Math.abs(Number(data.get("amount")) || 0);
      if (!roh) { toast("Betrag fehlt", "Bitte einen Betrag eingeben", "warn"); return; }
      const typ = String(data.get("typ") || "expense");
      const patch = {
        // Vorzeichen im Betrag — dasselbe Format wie Desktop und Handy.
        amount: typ === "income" ? roh : -roh,
        type: typ,
        category: String(data.get("category") || "Sonstiges"),
        description: String(data.get("description") || "").trim(),
        date: String(data.get("date") || localDateKey()),
        accountId: String(data.get("accountId") || "") || null,
        source: "tablet"
      };
      await executeOperation(makeOperation("entity", "create", "transactions", Core.makeId("txn"), patch));
      form.reset();
      const typFeld = form.querySelector('[name="typ"]');
      if (typFeld) typFeld.value = "expense";
      toast("Buchung erfasst", money(patch.amount), "ok");
    } else if (type === "db-goal") {
      const titel = String(data.get("title") || "").trim();
      if (!titel) return;
      await executeOperation(makeOperation("briefing","goal-add",null,Core.makeId("dg"),
        { date: state.dbTag || localDateKey(), title: titel }));
      form.reset();
    } else if (type === "db-thought") {
      const text = String(data.get("text") || "").trim();
      if (!text) return;
      await executeOperation(makeOperation("briefing","thought-add",null,Core.makeId("tp"), { text: text }));
      form.reset();
    } else if (type === "db-note") {
      await executeOperation(makeOperation("briefing","note",null,Core.makeId("note"),
        { date: state.dbTag || localDateKey(), notes: String(data.get("notes") || "") }));
    } else if (type === "habit") {
      const id = Core.makeId("habit");
      closeOverlay();
      await executeOperation(makeOperation("habit","create",null,id,{ name:String(data.get("name")||"").trim(), icon:String(data.get("icon")||"◌"), aktiv:true, completedDates:[] }));
    } else if (type === "flashcard" || type === "translation-card") {
      const existingId = form.dataset.id;
      const id = existingId || Core.makeId("card");
      const patch = { front:String(data.get("front")||"").trim(), back:String(data.get("back")||"").trim(), deckId:String(data.get("deckId")||"deck_general"), source:String(data.get("source")||"Quantus Tablet"), reversible:true, cardType:"basic", srs:null };
      closeOverlay();
      await executeOperation(makeOperation("flashcard",existingId?"update":"create",null,id,patch));
    } else if (type === "settings") {
      state.settings.aiSyncUrl = String(data.get("aiSyncUrl")||DEFAULT_AI_SYNC_URL).replace(/\/+$/,"");
      state.settings.theme = String(data.get("theme")||"dark");
      state.settings.startRoute = String(data.get("startRoute")||"home");
      saveJson(LOCAL_KEYS.settings,state.settings);
      applyTheme(state.settings.theme);
      toast("Einstellungen gespeichert", "Die Tablet-App wurde aktualisiert.", "ok");
      render();
    } else if (type === "polaris") {
      await handlePolarisCommand(data.get("command"));
    }
  }

  function applyTheme(mode) {
    const light = mode === "light" || (mode === "auto" && matchMedia("(prefers-color-scheme: light)").matches);
    document.documentElement.className = light ? "theme-light" : "theme-dark";
    try { localStorage.setItem("quantus-tablet-theme",mode); } catch (_) {}
  }

  async function handleClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) {
      if (!event.target.closest("[data-tag-editor]")) document.querySelectorAll("[data-tag-suggestions]").forEach((menu) => { menu.hidden = true; });
      return;
    }
    const action = button.dataset.action;
    // Tablet-Module duerfen eigene Aktionen zuerst behandeln.
    for (const mod of tabletModules()) {
      if (typeof mod.onAction !== "function") continue;
      let handled = false;
      try { handled = await mod.onAction(action, button, event); }
      catch (error) { console.warn("[Tablet-Modul action]", mod.key, error); }
      if (handled) return;
    }
    if (action === "close-overlay") {
      if (button.classList.contains("overlay") && event.target !== button) return;
      closeOverlay();
      return;
    }
    if (action === "go") { go(button.dataset.route); return; }
    if (action === "apps") { openAppsSheet(); return; }
    if (action === "polaris") { openPolarisSheet(); return; }
    if (action === "search") { openSearch(); return; }
    if (action === "account") { openAccountSheet(); return; }
    if (action === "show-sync") { openSyncSheet(); return; }
    if (action === "sign-in") { await signIn(); return; }
    if (action === "sign-out") { await signOut(); return; }
    if (action === "flush-sync") { closeOverlay(); await flushPending(); return; }
    if (action === "theme") {
      const next = document.documentElement.classList.contains("theme-light") ? "dark" : "light";
      state.settings.theme = next; saveJson(LOCAL_KEYS.settings,state.settings); applyTheme(next); return;
    }
    if (action === "workspace") { window.QuantusTabletWorkspace?.open?.(); return; }
    if (action === "open-shortnote") { openShortnote(); return; }
    if (action === "new-note") { openNoteForm(); return; }
    if (action === "new-idea") { openIdeaForm(); return; }
    if (action === "edit-note") { openNoteForm({ id: button.dataset.id }); return; }
    if (action === "open-saved-note") { state.noteFilter = { mode:"all", value:"" }; closeOverlay(); go("notes"); setTimeout(() => openNoteForm({ id:button.dataset.id }), 80); return; }
    if (action === "register-book") { openBookForm(); return; }
    if (action === "edit-book") { openBookForm(button.dataset.id); return; }
    if (action === "open-book") { state.selectedBookId = button.dataset.id; state.selectedDocId = null; if (state.route !== "reading") go("reading"); else render(); return; }
    if (action === "reading-note") {
      const book = collection("books").find((item) => item.id === button.dataset.id); if (!book) return;
      openNoteForm({ noteClass:"reading", lockClass:true, tags:[book.title], source:{ app:"readinghub", entityType:"book", entityId:book.id, label:book.title, route:"#/reading" } }); return;
    }
    if (action === "reading-document-note") {
      const doc = asMap(state.driveDocs)[button.dataset.id]; if (!doc) return;
      const title = doc.titel_final || doc.dateiname || "Dokument";
      openNoteForm({ noteClass:"reading", lockClass:true, tags:[title], source:{ app:"readinghub", entityType:"document", entityId:button.dataset.id, label:title, route:"#/reading" } }); return;
    }
    if (action === "calendar-note") {
      const eventItem = collection("calendarEvents").find((item) => item.id === button.dataset.id)
        || collection("meetings").find((item) => item.id === button.dataset.id);
      if (!eventItem) return;
      const label = itemTitle(eventItem, "Termin");
      openNoteForm({ noteClass:"research", lockClass:true, content:eventItem.description || "", tags:[label],
        source:{ app:"calendar", entityType:"event", entityId:eventItem.id, label, route:"#/calendar" } }); return;
    }
    if (action === "habit-note") {
      const habit = activeHabits().find((item) => item.id === button.dataset.id); if (!habit) return;
      const label = habit.name || habit.title || "Gewohnheit";
      openNoteForm({ noteClass:"learning", lockClass:true, learningKind:"erklaerung", tags:[label],
        source:{ app:"habits", entityType:"habit", entityId:habit.id, label, route:"#/habits" } }); return;
    }
    if (action === "report-note") {
      const day = localDateKey();
      openNoteForm({ noteClass:"research", lockClass:true, tags:["Reports"],
        source:{ app:"reports", entityType:"snapshot", entityId:day, label:`Bericht ${formatDate(day)}`, route:"#/reports" } }); return;
    }
    if (action === "context-note") { openContextNote(button.dataset.collection, button.dataset.id, button.dataset.noteClass); return; }
    if (action === "note-filter") { state.noteFilter = { mode:button.dataset.mode || "all", value:button.dataset.value || "" }; render(); return; }
    if (action === "note-source") {
      const note = collection("notes").find((item) => item.id === button.dataset.id); if (!note) return;
      if (!noteSourceExists(note)) { toast("Quelle nicht mehr verfügbar", "Die Notiz bleibt in Noteflow erhalten.", "error"); return; }
      const source = sourceOf(note);
      if (source.app === "readinghub") { state.selectedBookId = source.entityType === "book" ? source.entityId : null; state.selectedDocId = source.entityType === "document" ? source.entityId : null; go("reading"); return; }
      if (source.app === "ideas") { go("ideas"); return; }
      if (source.app === "articles") { go("knowledge"); return; }
      const route = String(source.route || `#/${source.app}`).replace(/^#\/?/, "").split(/[/?]/)[0];
      if (ROUTE_TITLES[route]) go(route); else toast("Quelle", source.label || source.app, "ok");
      return;
    }
    if (action === "add-tag-suggestion") { addEditorTag(button.closest("[data-tag-editor]"), button.dataset.tag); return; }
    if (action === "remove-tag") {
      const editor = button.closest("[data-tag-editor]");
      updateTagEditor(editor, tagEditorValues(editor).filter((tag) => tag.toLocaleLowerCase("de-CH") !== String(button.dataset.tag || "").toLocaleLowerCase("de-CH")));
      return;
    }
    if (action === "shortnote-type") {
      const form = button.closest("form"), type = button.value;
      form && form.querySelectorAll("[data-shortnote-section]").forEach((section) => { section.hidden = section.dataset.shortnoteSection !== type; });
      return;
    }
    if (action === "new-entity") {
      if (button.dataset.collection === "notes") { openNoteForm(); return; }
      if (button.dataset.collection === "ideas") { openIdeaForm(); return; }
      openEntityForm(button.dataset.collection); return;
    }
    if (action === "edit-entity") {
      if (button.dataset.collection === "notes") { openNoteForm({ id:button.dataset.id }); return; }
      if (button.dataset.collection === "ideas") {
        const idea = asMap(state.payload.entities.ideas)[button.dataset.id];
        if (idea && idea.noteId) { openNoteForm({ id:idea.noteId }); return; }
      }
      openEntityForm(button.dataset.collection,button.dataset.id); return;
    }
    if (action === "delete-entity") {
      if (!confirm("Diesen Eintrag ausblenden? Er wird als gelöscht markiert und kann nicht versehentlich andere Quantus-Daten entfernen.")) return;
      const deletedCollection = button.dataset.collection, deletedId = button.dataset.id;
      const aggregate = ideaAggregate(deletedCollection, deletedId);
      const targets = aggregate.length ? aggregate : [{ collection:deletedCollection, id:deletedId, item:asMap(state.payload.entities[deletedCollection])[deletedId] }];
      const undoToken = Core.makeId("undo");
      deleteUndo.set(undoToken, targets.map((target) => ({ collection:target.collection, id:target.id, patch:restorePatch(target.item) })));
      const operations = targets.map((target) => ({ collection:target.collection, id:target.id, action:"delete", patch:{} }));
      await executeOperation(operations.length > 1 ? makeEntityBatch(operations) : makeOperation("entity","delete",deletedCollection,deletedId,{}),{silent:true});
      undoToast(deletedCollection, deletedId, undoToken);
      return;
    }
    if (action === "undo-delete") {
      const toastNode = button.closest(".toast");
      if (toastNode) toastNode.remove();
      const undo = deleteUndo.get(button.dataset.undoToken) || [{ collection:button.dataset.collection, id:button.dataset.id, patch:{ deleted:false, archived:false, status:"open", deletedAt:null } }];
      deleteUndo.delete(button.dataset.undoToken);
      const operations = undo.map((target) => ({ collection:target.collection, id:target.id, action:"update", patch:target.patch }));
      await executeOperation(operations.length > 1 ? makeEntityBatch(operations) : makeOperation("entity","update",operations[0].collection,operations[0].id,operations[0].patch),{silent:true});
      toast("Wiederhergestellt", "Der Eintrag ist zurück.", "ok");
      return;
    }
    if (action === "pin-entity") {
      const id = button.dataset.id;
      const index = state.pins.indexOf(id);
      if (index >= 0) state.pins.splice(index,1); else state.pins.unshift(id);
      saveJson(LOCAL_KEYS.pins, state.pins);
      render();
      return;
    }
    if (action === "duplicate-entity") {
      const name = button.dataset.collection;
      const source = collection(name).find((item) => item.id === button.dataset.id);
      if (!source || !COLLECTION_CONFIG[name]) return;
      const patch = { ...source };
      ["id","createdAt","updatedAt","deletedAt","completedAt","dedupeKey"].forEach((key) => delete patch[key]);
      patch.title = `${itemTitle(source, COLLECTION_CONFIG[name].label)} (Kopie)`;
      if (isDone(source)) patch.status = "open";
      await executeOperation(makeOperation("entity","create",name,Core.makeId(name.slice(0,-1)),patch),{silent:true});
      toast("Dupliziert", patch.title, "ok");
      return;
    }
    if (action === "export-backup") { exportBackup(); return; }
    if (action === "import-backup") { const input=document.getElementById("backupFileInput"); if (input) input.click(); return; }
    if (action === "clear-cache") { clearLocalCache(); return; }
    if (action === "status-filter") { state.statusFilter = button.dataset.status || "all"; render(); return; }
    if (action === "toggle-task") {
      const task = collection("tasks").find((item) => item.id === button.dataset.id); if (!task) return;
      await executeOperation(makeOperation("entity","update","tasks",task.id,{ status:isDone(task)?"open":"done", completedAt:isDone(task)?null:new Date().toISOString() }),{silent:true}); return;
    }
    if (action === "new-habit") { openHabitForm(); return; }
    /*
     * BEFUND: hier wurde completedDates/lastCompleted geschrieben — Felder,
     * die die Hauptapp gar nicht liest. Sie fuehrt completions[{date,value}]
     * und, bei Routinen mit Schritten, subCompletions[]. Ein Haken auf dem
     * Tablet kam auf dem Desktop und dem Handy also nie an.
     *
     * Jetzt wird beides geschrieben: das Format der Hauptapp und, damit
     * bestehende Tabletdaten nicht verloren gehen, weiterhin completedDates.
     */
    if (action === "toggle-habit") {
      const habit = activeHabits().find((item) => item.id === button.dataset.id); if (!habit) return;
      const tag = state.dbTag || localDateKey();
      const subs = habitSubUnits(habit);
      const patch = {};

      if (subs.length) {
        // Mit Schritten: alle in die Richtung schalten, die noch fehlt.
        const alleFertig = subs.every((u) => habitSubDone(habit, u.name, tag));
        const rest = asArray(habit.subCompletions).filter((c) => !(c && c.date === tag));
        patch.subCompletions = alleFertig ? rest : rest.concat(subs.map((u) => ({
          id: "sc_" + Math.random().toString(36).slice(2, 8),
          date: tag, subUnitName: u.name, completedAt: new Date().toISOString()
        })));
        const ohneAuto = asArray(habit.completions).filter((c) => !(c && c.date === tag && c.autoFromSubUnits));
        patch.completions = alleFertig ? ohneAuto : ohneAuto.concat([{
          id: "hc_" + Math.random().toString(36).slice(2, 8), date: tag, value: habit.target || 1, autoFromSubUnits: true
        }]);
      } else {
        const vorhanden = asArray(habit.completions).some((c) => c && c.date === tag);
        patch.completions = vorhanden
          ? asArray(habit.completions).filter((c) => !(c && c.date === tag))
          : asArray(habit.completions).concat([{ date: tag, value: habit.target || 1 }]);
        const dates = asArray(habit.completedDates || habit.dates).slice();
        const i = dates.indexOf(tag);
        if (i >= 0) dates.splice(i, 1); else dates.push(tag);
        patch.completedDates = dates;
        patch.lastCompleted = vorhanden ? null : tag;
      }
      await executeOperation(makeOperation("habit","update",null,habit.id,patch),{silent:true}); return;
    }

    // ── Budget ──
    if (action === "budget-monat") {
      const heuteYm = localDateKey().slice(0, 7);
      const n = Number(button.dataset.n || 0);
      state.budgetMonat = n === 0 ? null : budgetMonatVerschieben(state.budgetMonat || heuteYm, n);
      render(); return;
    }
    if (action === "budget-typ") {
      // Nur die Sichtbarkeit umschalten — der Wert reist im versteckten Feld
      // mit, damit das Formular beim Absenden nicht raten muss.
      const form = button.closest("form");
      if (!form) return;
      form.querySelectorAll('[data-action="budget-typ"]').forEach((b) => {
        b.classList.toggle("on", b === button);
      });
      const feld = form.querySelector('[name="typ"]');
      if (feld) feld.value = button.dataset.typ || "expense";
      return;
    }
    if (action === "budget-loeschen") {
      const id = button.dataset.id;
      const tx = collection("transactions").find((t) => t && t.id === id);
      if (!tx) return;
      // Rueckfrage: der Papierkorb liegt einen Daumen neben dem Betrag.
      if (!window.confirm(`Buchung löschen?\n\n${itemTitle(tx, tx.category || "Buchung")} · ${money(tx.amount)}`)) return;
      await executeOperation(makeOperation("entity", "delete", "transactions", id, {}));
      toast("Buchung gelöscht", itemTitle(tx, tx.category || ""), "ok");
      return;
    }

    // ── Daily Briefing ──
    if (action === "db-day") {
      const heute = localDateKey();
      if (button.dataset.tag === "heute") state.dbTag = heute;
      else if (button.dataset.tag) state.dbTag = button.dataset.tag;
      else {
        const d = new Date((state.dbTag || heute) + "T12:00:00");
        d.setDate(d.getDate() + Number(button.dataset.tage || 0));
        state.dbTag = localDateKey(d);
      }
      render(); return;
    }
    if (action === "briefing-note") {
      const day = button.dataset.tag || state.dbTag || localDateKey();
      openNoteForm({ noteClass:"learning", lockClass:true, tags:["Daily Briefing"], source:{ app:"briefings", entityType:"day", entityId:day, label:`Daily Briefing ${formatDate(day)}`, route:"#/daily" } }); return;
    }
    if (action === "db-toggle-goal") {
      await executeOperation(makeOperation("briefing","goal-toggle",null,button.dataset.id,
        { date: state.dbTag || localDateKey() }),{silent:true}); return;
    }
    if (action === "new-flashcard") { openFlashcardForm(); return; }
    if (action === "edit-flashcard") { openFlashcardForm(button.dataset.id); return; }
    if (action === "learning-card-note") {
      const card = asArray(state.payload.recallLabData.cards).find((item) => item && item.id === button.dataset.id); if (!card) return;
      const label = card.deckId || "Recall Lab";
      openNoteForm({ noteClass:"learning", lockClass:true, content:[card.front, card.back].filter(Boolean).join("\n\n"), tags:[label], source:{ app:"recalllab", entityType:"card", entityId:card.id, label, route:"#/learning" } }); return;
    }
    if (action === "open-doc") { state.selectedDocId=button.dataset.id; state.selectedBookId=null; if (state.route !== "reading") go("reading"); else render(); return; }
    if (action === "external") { openExternal(button.dataset.path); return; }
    if (action === "apps-view") { state.appsView = button.dataset.view === "list" ? "list" : "grid"; render(); return; }
    if (action === "apps-arrange") { go("home"); window.QuantusTabletSpringboard?.startArrange?.(); return; }
    // Lesen: mehr Flaeche fuer das Dokument. Beides sind reine Ansichtsschalter
    // — kein Datenzugriff, keine Navigation.
    if (action === "reader-wide") {
      document.querySelector(".reading-layout")?.classList.toggle("library-hidden");
      return;
    }
    if (action === "reader-full") {
      const panel = document.querySelector(".reader-panel");
      if (!panel) return;
      if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
      (panel.requestFullscreen || panel.webkitRequestFullscreen)?.call(panel);
      return;
    }
    if (action === "external-url") { openExternalUrl(button.dataset.url); return; }
    if (action === "external-translate") { openExternalUrl(`https://translate.google.com/?sl=auto&tl=de&text=${encodeURIComponent(button.dataset.text || "")}`); return; }
    if (action === "translate-selection") { await translateSelection(button.dataset.text || ""); return; }
    if (action === "reading-selection") {
      const text = button.dataset.text || "";
      const book = state.selectedBookId && collection("books").find((item) => item.id === state.selectedBookId);
      const doc = state.selectedDocId && asMap(state.driveDocs)[state.selectedDocId];
      const label = book && book.title || doc && (doc.titel_final || doc.dateiname) || "Leseauswahl";
      openNoteForm({ noteClass:"reading", lockClass:true, content:text, tags:[label], source:{ app:"readinghub", entityType:book ? "book" : "document", entityId:book && book.id || state.selectedDocId || null, label, route:"#/reading" } }); return;
    }
    if (action === "flashcard-selection") { openFlashcardForm(null,{front:button.dataset.text||"",back:"",source:"Markierung aus Quantus Drive"}); return; }
    if (action === "polaris-selection") { openPolarisSheet(`Erkläre mir diesen Text: ${button.dataset.text||""}`); return; }
    if (action === "polaris-quick") { const input=overlayRoot.querySelector('[name="command"]')||document.querySelector('[name="command"]'); if(input){input.value=button.dataset.command||"";input.focus();} return; }
    if (action === "search-result") { closeOverlay(); go(COLLECTION_CONFIG[button.dataset.collection].route); setTimeout(()=>button.dataset.collection === "notes" ? openNoteForm({ id:button.dataset.id }) : openEntityForm(button.dataset.collection,button.dataset.id),120); return; }
    if (action === "split-with") { state.splitLeft=button.dataset.route||state.route; state.splitRight=state.splitLeft==="notes"?"reading":"notes"; go("split"); return; }
  }

  document.addEventListener("click", handleClick);
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("form[data-form]");
    if (!form) return;
    event.preventDefault();
    // Doppeltipps und erneut ausgelöste Offline-Submits verwenden denselben
    // laufenden Vorgang, statt zwei Notiz-IDs zu erzeugen.
    if (form.dataset.submitting === "true") return;
    form.dataset.submitting = "true";
    const submitters = Array.from(form.querySelectorAll('button[type="submit"],input[type="submit"]'));
    submitters.forEach((button) => { button.disabled = true; });
    Promise.resolve(handleSubmit(form)).catch((error) => {
      toast("Nicht gespeichert", error && error.message || String(error), "error");
    }).finally(() => {
      if (!form.isConnected) return;
      delete form.dataset.submitting;
      submitters.forEach((button) => { button.disabled = false; });
    });
  });
  let searchDebounce = null;
  let draftDebounce = null;
  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-tag-autocomplete]")) {
      const input = event.target, editor = input.closest("[data-tag-editor]"), menu = editor && editor.querySelector("[data-tag-suggestions]");
      if (!menu) return;
      const query = input.value.trim();
      const suggestions = Notes.filterTagSuggestions(noteTags(), query, tagEditorValues(editor), 8);
      menu.innerHTML = suggestions.map((tag) => `<button type="button" data-action="add-tag-suggestion" data-tag="${attr(tag)}" role="option">#${esc(tag)}</button>`).join("") + (query && !suggestions.some((tag) => tag.toLocaleLowerCase("de-CH") === query.toLocaleLowerCase("de-CH")) ? `<button type="button" data-action="add-tag-suggestion" data-tag="${attr(query)}" role="option">＋ #${esc(query)} neu</button>` : "");
      menu.hidden = !query && !suggestions.length;
      input.setAttribute("aria-expanded", menu.hidden ? "false" : "true");
    }
    if (event.target.matches('[data-action="filter-collection"]')) {
      const value=event.target.value;
      state.search=value;
      // Debounce: erst nach kurzer Tipppause neu rendern statt bei jedem Zeichen.
      if (searchDebounce) clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        searchDebounce = null;
        render();
        requestAnimationFrame(()=>{const input=document.querySelector('[data-action="filter-collection"]');if(input){input.focus();input.setSelectionRange(state.search.length,state.search.length);}});
      }, 140);
    }
    if (event.target.matches('[data-action="apps-search"]')) {
      state.appsSearch = event.target.value;
      if (searchDebounce) clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        searchDebounce = null;
        render();
        requestAnimationFrame(() => {
          const input = document.querySelector('[data-action="apps-search"]');
          if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
        });
      }, 140);
    }
    if (event.target.matches('[data-action="global-search"]')) { const target=document.getElementById("searchResults"); if(target)target.innerHTML=searchResults(event.target.value); }
    const entityForm = event.target.closest('form[data-form="entity"]');
    if (entityForm && !entityForm.dataset.id) {
      const data = new FormData(entityForm);
      state.drafts[entityForm.dataset.collection] = {
        title: String(data.get("title")||""),
        description: String(data.get("description")||""),
        savedAt: new Date().toISOString()
      };
      if (draftDebounce) clearTimeout(draftDebounce);
      draftDebounce = setTimeout(() => { draftDebounce = null; saveJson(LOCAL_KEYS.drafts, state.drafts); }, 400);
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target.id === "backupFileInput") {
      importBackupFile(event.target.files && event.target.files[0]);
      event.target.value = "";
      return;
    }
    const noteFilterSelect = event.target.closest('[data-action="note-filter-select"]');
    if (noteFilterSelect) { state.noteFilter = noteFilterSelect.value ? { mode:noteFilterSelect.dataset.mode, value:noteFilterSelect.value } : { mode:"all", value:"" }; render(); return; }
    const classSelect = event.target.closest('[data-action="note-class-select"]');
    if (classSelect) {
      const form = classSelect.closest("form");
      form && form.querySelectorAll("[data-note-subtype]").forEach((section) => { section.hidden = section.dataset.noteSubtype !== classSelect.value; });
      return;
    }
    const sortSelect=event.target.closest('[data-action="sort-collection"]');
    if (sortSelect) { state.sort=sortSelect.value; render(); return; }
    const select=event.target.closest('[data-action="split-select"]'); if(!select)return;
    if(select.dataset.side==="left")state.splitLeft=select.value; else state.splitRight=select.value; render();
  });
  document.addEventListener("mouseup", () => {
    const selection=window.getSelection();
    const text=selection&&selection.toString().trim();
    const anchor=selection&&selection.anchorNode&&selection.anchorNode.parentElement;
    if(anchor&&anchor.closest("[data-reader]"))showSelectionTools(text); else if(!anchor||!anchor.closest(".selection-tools"))document.querySelectorAll(".selection-tools").forEach((node)=>node.remove());
  });
  const SHORTCUT_ROUTES = ["home","daily","tasks","projects","notes","calendar","learning","habits","workspace"];
  document.addEventListener("keydown", (event) => {
    const suggestion = event.target.closest && event.target.closest('[data-action="add-tag-suggestion"]');
    if (suggestion) {
      const editor = suggestion.closest("[data-tag-editor]"), menu = suggestion.closest("[data-tag-suggestions]");
      const buttons = menu ? Array.from(menu.querySelectorAll("button")) : [];
      const index = buttons.indexOf(suggestion);
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        if (menu) menu.hidden = true;
        const input = editor && editor.querySelector("[data-tag-autocomplete]");
        if (input) { input.setAttribute("aria-expanded", "false"); input.focus(); }
        return;
      }
      if (event.key === "ArrowDown" && buttons[index + 1]) { event.preventDefault(); buttons[index + 1].focus(); return; }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (buttons[index - 1]) buttons[index - 1].focus();
        else editor && editor.querySelector("[data-tag-autocomplete]")?.focus();
        return;
      }
    }
    if (event.target.matches && event.target.matches("[data-tag-autocomplete]")) {
      const input = event.target, editor = input.closest("[data-tag-editor]"), menu = editor && editor.querySelector("[data-tag-suggestions]");
      if (event.key === "Enter" && input.value.trim()) { event.preventDefault(); addEditorTag(editor, input.value); return; }
      if (event.key === "ArrowDown" && menu && !menu.hidden) { const first = menu.querySelector("button"); if (first) { event.preventDefault(); first.focus(); } return; }
      if (event.key === "Escape" && menu && !menu.hidden) { event.preventDefault(); event.stopPropagation(); menu.hidden = true; input.setAttribute("aria-expanded", "false"); return; }
    }
    if(event.key==="Escape")closeOverlay();
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){event.preventDefault();openSearch();}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="p"){event.preventDefault();openPolarisSheet();}
    // Ctrl/Cmd+S: Snapshot sichern und Warteschlange abgleichen statt Browser-Dialog.
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="s"){event.preventDefault();saveSnapshot();flushPending();toast("Gesichert","Snapshot gespeichert, Warteschlange wird abgeglichen.","ok");}
    /*
     * BEFUND-KLASSE (CLAUDE.md, Fallstrick 3): hier wurde nur auf
     * INPUT/TEXTAREA/SELECT geprueft. Eine Schreibflaeche mit
     * contenteditable ist aber ein DIV — im Journal-Editor haetten Alt+N
     * und Alt+1..9 mitten im Schreiben die Ansicht gewechselt.
     * activeElement statt event.target, weil ein Tastendruck in einer
     * verschachtelten Flaeche auf einem Kindknoten landen kann.
     */
    const fokus = document.activeElement;
    const typing = /^(input|textarea|select)$/i.test(event.target && event.target.tagName || "") ||
      /^(input|textarea|select)$/i.test(fokus && fokus.tagName || "") ||
      Boolean(fokus && fokus.isContentEditable);
    // Alt+N: neuer Eintrag passend zur aktuellen Ansicht.
    if(event.altKey && !typing && event.key.toLowerCase()==="n"){
      event.preventDefault();
      if (state.route === "notes") openNoteForm();
      else if (state.route === "ideas") openIdeaForm();
      else openEntityForm(COLLECTION_CONFIG[state.route]?state.route:"tasks");
    }
    // Alt+1..9: direkt zwischen den Hauptansichten wechseln.
    if(event.altKey && !typing && /^[1-9]$/.test(event.key)){const route=SHORTCUT_ROUTES[Number(event.key)-1];if(route){event.preventDefault();go(route);}}
  });
  window.addEventListener("hashchange", () => { state.search=""; state.statusFilter="all"; render(); main.focus(); });
  // Beim Verlassen der Seite den letzten Stand ohne Verzoegerung sichern.
  window.addEventListener("pagehide", () => { if (snapshotTimer) { clearTimeout(snapshotTimer); snapshotTimer = null; } saveSnapshot(); if (draftDebounce) { clearTimeout(draftDebounce); draftDebounce = null; saveJson(LOCAL_KEYS.drafts, state.drafts); } });
  window.addEventListener("online", () => { setSync("syncing","Verbindung wiederhergestellt"); flushPending(); });
  window.addEventListener("offline", () => setSync("offline","Keine Internetverbindung"));
  document.addEventListener("visibilitychange", () => { if(!document.hidden)flushPending(); });

  function boot() {
    applyTheme(state.settings.theme || "dark");
    updateClock(); clockTimer=setInterval(updateClock,30000);
    // Erst der lokale Snapshot (sofortige Inhalte, auch offline), dann Firebase.
    hydrateFromSnapshot();
    if (!navigator.onLine) setSync("offline", "Keine Internetverbindung – lokaler Datenstand aktiv");
    /*
     * Womit die App aufstartet.
     *
     * BEFUND (Nutzer: "das morning briefing wird nicht am anfang
     * angezeigt"): sie begann immer auf dem Homebildschirm. Wer morgens als
     * Erstes seinen Tag sehen will, musste ihn jedes Mal selbst suchen.
     * Gesetzt wird das nur, wenn KEINE Adresse mitgegeben ist — ein Link auf
     * eine bestimmte Ansicht darf davon nie ueberschrieben werden.
     */
    const startRoute = state.settings.startRoute;
    if (startRoute && startRoute !== "home" && !location.hash && ROUTE_TITLES[startRoute]) {
      location.hash = "#/" + startRoute;
    }
    state.route=getRoute(); render(); initFirebase();
    // Zurueckgestellte Aenderungen regelmaessig nachschieben, falls ein einzelner
    // Versuch (z. B. direkt nach dem Aufwachen) fehlgeschlagen ist.
    setInterval(() => { if (state.pending.length) flushPending(); }, 20000);
    if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});
  }

  window.__quantusTablet = {
    state, executeOperation, makeOperation, collection, go, toast, Core, Notes, saveCanonicalNote, openNoteForm, openContextNote, openShortnote, APP_STORE_PATH, RTDB_URL,
    getStorage: () => storage,
    getDatabase: () => db,
    // Bausteine fuer die Tablet-Module (Homebildschirm, Mail, FlowerTech)
    render, scheduleRender, sheet, closeOverlay, appBaseUrl, viewHeader, emptyState, emptyMini,
    // Die nativen Modulansichten (native-modules.js) bauen auf denselben
    // Bausteinen auf wie app.js — der Anmeldehinweis und das Oeffnen einer
    // externen Adresse gehoeren dazu.
    loginBanner, openExternalUrl, asArray, asMap, values, isDeleted,
    esc, attr, formatDate, formatTime, relativeTime, money, itemTitle, itemText, isDone,
    localDateKey, todayTasks, dueCards, activeHabits, APP_DEFS, COLLECTION_CONFIG,
    // Der Homebildschirm ist ein eigenes Modul (springboard.js) und ueberschreibt
    // renderHome(). Ohne diese Bausteine kann er das Morgenbriefing nicht zeigen —
    // genau deshalb fehlte es dort, obwohl app.js einen Hero dafuer hat.
    briefingModell, isHabitDoneOn, habitSubUnits, habitSubDone, todayEvents, todayMeetings
  };
  boot();
})();
