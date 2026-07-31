(function () {
  "use strict";

  const Core = window.QuantusSyncCore;
  if (!Core) throw new Error("QuantusSyncCore fehlt");

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
    { key: "dailybriefing", label: "Daily Briefing", icon: "◫", tone: "sand", fullRoute: "dailybriefing", group: "Übersicht" },
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
    dashboard: "Dashboard", mail: "Mail", flowertech: "FlowerTech",
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
    "split", "settings", "apps",
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
    lastSync: null,
    driveDocs: {},
    smarterDocs: {},
    selectedDocId: null,
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
    splitRight: "notes"
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
  function isDeleted(item) { return item && (item.status === "deleted" || item.deletedAt); }
  function isDone(item) { return item && ["done", "completed", "erledigt", "closed"].includes(item.status); }
  function itemTitle(item, fallback) { return item && (item.title || item.name || item.subject || item.titel) || fallback || "Ohne Titel"; }
  function itemText(item) { return item && (item.description || item.content || item.text || item.notes || item.notiz || "") || ""; }

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
  function undoToast(collectionName, id) {
    const node = document.createElement("div");
    node.className = "toast";
    node.innerHTML = `<strong>Eintrag ausgeblendet</strong><span>Aus Versehen? Einfach zurückholen.</span><button class="btn small-btn" data-action="undo-delete" data-collection="${attr(collectionName)}" data-id="${attr(id)}">Rückgängig</button>`;
    document.getElementById("toasts").appendChild(node);
    setTimeout(() => node.remove(), 8000);
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

  async function signIn() {
    if (!auth) return toast("Anmeldung nicht verfügbar", "Firebase wurde nicht geladen.", "error");
    try {
      const provider = new window.firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await auth.signInWithPopup(provider);
      closeOverlay();
      toast("Angemeldet", "Die gemeinsamen Quantus-Daten werden geladen.", "ok");
    } catch (error) {
      if (error.code === "auth/unauthorized-domain") {
        toast("Domain noch nicht autorisiert", "Füge die Tablet-Domain in Firebase Authentication unter Autorisierte Domains ein.", "error");
      } else toast("Anmeldung fehlgeschlagen", error.message, "error");
    }
  }

  async function signOut() {
    if (!auth) return;
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
      await mirrorOperation(operation);
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

  async function mirrorOperation(operation) {
    const inbox = Core.toInboxRecord(operation);
    if (!inbox) return;
    await db.ref(`polaris/inbox/${inbox.type}/${operation.id}`).set(inbox.record);
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
        await mirrorOperation(operation);
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
    return `<section class="widget span-12" style="min-height:auto;border-color:var(--accent)">
      <div class="widget-head"><span class="widget-icon">↪</span><h2>Mit AI Sync verbinden</h2></div>
      <p class="muted">Melde dich einmal mit demselben Google-Konto wie in Quantus an. Danach verwendet die Tablet-App dieselben Daten wie AI Sync.</p>
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
          <div class="metric-row">
            <div class="metric"><strong>${tasks.length}</strong><small>offene Aufgaben</small></div>
            <div class="metric"><strong>${tasks.filter(isOverdue).length}</strong><small>überfällig</small></div>
            <div class="metric"><strong>${events.length}</strong><small>Termine</small></div>
            <div class="metric"><strong>${cards.length}</strong><small>Karteikarten</small></div>
          </div>
          <div class="row-actions" style="margin-top:18px"><button class="btn primary" data-action="go" data-route="daily">Daily Briefing öffnen</button><button class="btn" data-action="polaris">Polaris fragen</button></div>
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

  function renderDaily() {
    const tasks = todayTasks();
    const meetings = [...todayEvents(), ...todayMeetings()];
    const habits = activeHabits();
    const beliefs = asArray(state.payload.dailyBriefing && state.payload.dailyBriefing.beliefs);
    return `<div class="view">
      ${viewHeader("Daily Briefing", "Deine Termine, Prioritäten, Routinen und Lernaufgaben für heute.", `<button class="btn" data-action="polaris">Mit Polaris besprechen</button><button class="btn primary" data-action="new-entity" data-collection="tasks">＋ Aufgabe</button>`)}
      ${loginBanner()}
      <div class="dashboard-grid">
        <section class="widget span-7 tall"><div class="widget-head"><span class="widget-icon">✓</span><h2>Prioritäten</h2></div><div class="item-list">${tasks.map(taskItem).join("") || emptyMini("Alles erledigt – es gibt keine überfälligen Aufgaben.")}</div></section>
        <section class="widget span-5 tall"><div class="widget-head"><span class="widget-icon">◉</span><h2>Agenda</h2></div><div class="item-list">${meetings.map((item) => `<div class="list-item"><span class="badge accent">${esc(formatTime(item.start || item.startAt || item.time) || "Heute")}</span><div class="item-main"><div class="item-title">${esc(itemTitle(item,"Termin"))}</div><div class="item-meta">${esc(item.location || item.description || "")}</div></div></div>`).join("") || emptyMini("Keine Termine für heute")}</div></section>
        <section class="widget span-6"><div class="widget-head"><span class="widget-icon">◌</span><h2>Routinen</h2><button data-action="go" data-route="habits">Bearbeiten</button></div><div class="item-list">${habits.map(habitItem).join("") || emptyMini("Füge deine erste Routine hinzu")}</div></section>
        <section class="widget span-6"><div class="widget-head"><span class="widget-icon">✦</span><h2>Leitgedanken</h2></div>${beliefs.length ? beliefs.slice(0,5).map((item) => `<blockquote style="margin:8px 0;color:var(--text2)">“${esc(item.text || item.title || item)}”</blockquote>`).join("") : emptyMini("Noch keine Leitgedanken im Daily Briefing")}</section>
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
    return `<article class="entity-card ${pinned ? "pinned" : ""}">
      <div class="row-actions"><span class="badge accent">${esc(config.label)}</span>${item.status ? `<span class="badge">${esc(item.status)}</span>` : ""}${isOverdue(item) ? `<span class="badge coral">Überfällig</span>` : ""}${pinned ? `<span class="badge sand">Angepinnt</span>` : ""}</div>
      <h3>${esc(itemTitle(item,config.label))}</h3><p>${esc(itemText(item) || "Keine Beschreibung")}</p>
      <div class="card-foot"><span class="muted small">${meta ? esc(formatDate(meta)) : ""}</span><span class="spacer"></span>
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

  function renderReading() {
    const docs = values(state.driveDocs).map((doc) => ({ ...doc, id: doc.id || findMapKey(state.driveDocs,doc) })).filter((doc) => doc.status !== "papierkorb").sort((a,b) => Date.parse(b.aktualisiert || b.erstellt || 0) - Date.parse(a.aktualisiert || a.erstellt || 0));
    if (!state.selectedDocId && docs.length) state.selectedDocId = docs[0].id;
    const selected = docs.find((doc) => doc.id === state.selectedDocId);
    return `<div class="view">
      ${viewHeader("Lesen", "Dokumente aus Quantus Drive lesen, markieren und in Wissen umwandeln.", `<button class="btn" data-action="split-with" data-route="reading">◫ Split-Screen</button><button class="btn primary" data-action="external" data-path="drive.html">Quantus Drive öffnen</button>`)}
      ${loginBanner()}
      <div class="reading-layout">
        <aside class="library-panel"><div class="panel-head"><strong>Bibliothek</strong><span class="badge">${docs.length}</span></div><div class="library-list">${docs.map((doc) => `<div class="doc-row ${doc.id === state.selectedDocId ? "on" : ""}" data-action="open-doc" data-id="${attr(doc.id)}"><strong class="truncate" style="display:block">${esc(doc.titel_final || doc.dateiname || "Dokument")}</strong><small class="muted">${esc(doc.bereich || doc.mimeType || "Drive")}</small></div>`).join("") || emptyMini("Noch keine Dokumente in Quantus Drive")}</div></aside>
        <section class="reader-panel">${renderReaderDocument(selected)}</section>
      </div>
    </div>`;
  }

  function renderReaderDocument(doc) {
    if (!doc) return `<div class="reader-empty"><div><span style="font-size:48px">▤</span><h2>Dokument auswählen</h2><p>Öffne ein Dokument aus Quantus Drive.</p></div></div>`;
    const name = doc.titel_final || doc.dateiname || "Dokument";
    const url = doc.downloadUrl || doc.fileUrl || "";
    const isPdf = /pdf/i.test(doc.mimeType || doc.dateiname || "");
    const text = doc.textauszug || doc.text || "";
    return `<div class="panel-head"><button class="icon-action" data-action="external-url" data-url="${attr(url)}" ${url ? "" : "disabled"}>↗</button><strong class="truncate">${esc(name)}</strong><button class="btn small-btn" data-action="polaris-selection" data-text="${attr(name)}">Polaris</button></div>
      <div class="reader-content" data-reader="true">${isPdf && url ? `<iframe title="${attr(name)}" src="${attr(url)}#toolbar=0&navpanes=0"></iframe>` : `<article><h1>${esc(name)}</h1><p>${text ? esc(text) : "Für dieses Dokument ist noch kein Textauszug vorhanden. Öffne das Original über den Pfeil oben."}</p></article>`}</div>`;
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
        <section class="widget span-8"><div class="widget-head"><span class="widget-icon">▤</span><h2>Smarter – letzter Lernstoff</h2></div>${docEntries.slice(0,3).map(([date,doc]) => `<div class="list-item"><span class="badge accent">${esc(formatDate(date))}</span><div class="item-main"><div class="item-title">${esc(doc.title || doc.titel || "Tageslektion")}</div><div class="item-meta">${asArray(doc.questions).length} Fragen</div></div><button class="icon-action" data-action="external" data-path="index.html#/smarter">↗</button></div>`).join("") || emptyMini("Noch kein Smarter-Dokument geladen")}</section>
        <section class="widget span-12"><div class="widget-head"><span class="widget-icon">▣</span><h2>Fällige Karten</h2></div><div class="content-grid">${due.slice(0,12).map((card) => `<article class="entity-card"><span class="badge sand">${esc(card.deckId || "Allgemein")}</span><h3>${esc(card.front || "Vorderseite")}</h3><p>${esc(card.back || "Rückseite")}</p><div class="card-foot"><span class="spacer"></span><button class="btn small-btn" data-action="edit-flashcard" data-id="${attr(card.id)}">Bearbeiten</button></div></article>`).join("") || emptyState("✓","Alles wiederholt","Heute sind keine Karteikarten fällig.")}</div></section>
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
        return `<article class="concept-note" style="left:${x}px;top:${y}px" data-action="edit-entity" data-collection="concepts" data-id="${attr(item.id)}"><span class="badge accent">${esc(item.category || "Konzept")}</span><h3>${esc(itemTitle(item,"Idee"))}</h3><p>${esc(itemText(item) || "Tippen, um den Gedanken auszuarbeiten.")}</p></article>`;
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

  function budgetData() {
    const accounts = collection("accounts");
    const tx = collection("transactions").filter((item) => !item.isFuture);
    const ym = localDateKey().slice(0,7);
    const month = tx.filter((item) => String(item.date || "").startsWith(ym));
    const income = month.filter((item) => item.type === "income").reduce((sum,item) => sum + (Number(item.amount)||0),0);
    const expense = month.filter((item) => item.type === "expense").reduce((sum,item) => sum + (Number(item.amount)||0),0);
    const balance = accounts.reduce((sum,item) => sum + (Number(item.balance)||0),0);
    return { accounts, tx, month, income, expense, balance, currency: accounts[0] && accounts[0].currency || "CHF" };
  }

  function renderBudget() {
    const data = budgetData();
    const latest = data.tx.sort((a,b) => String(b.date||"").localeCompare(String(a.date||""))).slice(0,12);
    return `<div class="view">
      ${viewHeader("Budget", "Eine sichere Leseansicht deiner bestehenden Quantus-Finanzdaten.", `<span class="badge sand">Nur lesen</span>`)}
      ${loginBanner()}
      <div class="budget-metrics"><div class="budget-metric"><small>Kontostand</small><strong>${money(data.balance,data.currency)}</strong></div><div class="budget-metric"><small>Einnahmen im Monat</small><strong style="color:var(--accent)">${money(data.income,data.currency)}</strong></div><div class="budget-metric"><small>Ausgaben im Monat</small><strong style="color:var(--coral)">${money(data.expense,data.currency)}</strong></div><div class="budget-metric"><small>Monatssaldo</small><strong>${money(data.income-data.expense,data.currency)}</strong></div></div>
      <section class="widget"><div class="widget-head"><span class="widget-icon">₣</span><h2>Letzte Buchungen</h2></div><div class="item-list">${latest.map((item) => `<div class="list-item"><span class="badge ${item.type === "income" ? "accent" : "coral"}">${item.type === "income" ? "+" : "−"}</span><div class="item-main"><div class="item-title">${esc(item.description || item.category || "Buchung")}</div><div class="item-meta">${esc(formatDate(item.date))} · ${esc(item.category || "")}</div></div><strong>${money(item.amount,data.currency)}</strong></div>`).join("") || emptyMini("Keine Budgetdaten vorhanden")}</div></section>
    </div>`;
  }

  function appTile(app) {
    const action = `data-action="go" data-route="${attr(app.key)}"`;
    const native = app.local || NATIVE_ROUTES.has(app.key);
    const scope = `<small>${native ? "Tablet" : "Separat"}</small>`;
    return `<button class="app-tile" ${action}><span class="app-icon ${attr(app.tone || "")}">${esc(app.icon)}</span><strong>${esc(app.label)}</strong>${scope}</button>`;
  }

  function renderApps() {
    const groups = [...new Set(APP_DEFS.map((app) => app.group || "Weitere"))];
    return `<div class="view apps-catalog">${viewHeader("Alle Apps", "Der vollständige AI-Sync-Funktionsumfang in der tabletoptimierten Quantus-Hülle.", "")}${groups.map((group) => `<section class="app-group"><div class="app-group-head"><h2>${esc(group)}</h2><span class="badge">${APP_DEFS.filter((app) => (app.group || "Weitere") === group).length}</span></div><div class="apps-grid">${APP_DEFS.filter((app) => (app.group || "Weitere") === group).map(appTile).join("")}</div></section>`).join("")}</div>`;
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
      <div class="dashboard-grid">${days.map((day) => `<section class="widget span-6"><div class="widget-head"><span class="widget-icon">◉</span><h2>${esc(formatDate(day, { weekday: "long", day: "2-digit", month: "long" }))}${day === today ? " · Heute" : ""}</h2></div><div class="item-list">${grouped[day].map((event) => `<div class="list-item"><span class="badge accent">${esc(formatTime(event.start || event.startAt || event.time) || "Ganztags")}</span><div class="item-main"><div class="item-title">${esc(itemTitle(event, "Termin"))}</div><div class="item-meta">${esc(event.location || event.place || event.description || "")}</div></div></div>`).join("")}</div></section>`).join("") || emptyState("◉", "Keine kommenden Termine", "Erstelle einen Termin auf dem Tablet oder in AI Sync.")}</div>
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
      ${viewHeader("Statistiken", "Kennzahlen aus deinem gesamten Quantus-Datenstand – tabletnativ berechnet.", `<button class="btn primary" data-action="external" data-path="index.html#/statistics">↗ Vollversion</button>`)}
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
      ${viewHeader("Berichte", "Aktueller Bestand und die juengsten Aktualisierungen über alle Quantus-Bereiche.", `<button class="btn primary" data-action="external" data-path="index.html#/reports">↗ Vollversion</button>`)}
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
    return `<div class="view">${viewHeader("Polaris", "Die zentrale KI-Schicht zwischen deinen Quantus-Apps.", `<button class="btn primary" data-action="external" data-path="index.html#/polaris">Vollständigen Sprachmodus öffnen</button>`)}
      <section class="widget hero-widget" style="max-width:900px;margin:0 auto"><div class="polaris-hero"><div class="polaris-orb"></div><h2>Womit soll ich dir helfen?</h2><p class="muted">Schnellbefehle werden direkt auf dem Tablet ausgeführt und mit AI Sync synchronisiert.</p></div>${polarisCommandBox()}</section></div>`;
  }

  function polarisCommandBox() {
    return `<form data-form="polaris"><div class="field"><input name="command" placeholder="Zum Beispiel: Neue Aufgabe: Sitzungsunterlagen lesen" autocomplete="off" required></div><div class="quick-grid"><button type="button" data-action="polaris-quick" data-command="Neue Aufgabe: ">✓ Neue Aufgabe</button><button type="button" data-action="polaris-quick" data-command="Neue Notiz: ">✎ Neue Notiz</button><button type="button" data-action="polaris-quick" data-command="Neues Projekt: ">▧ Neues Projekt</button><button type="button" data-action="external" data-path="index.html#/polaris">✦ Mit Polaris sprechen</button></div><button class="btn primary" type="submit" style="width:100%">Ausführen</button></form>`;
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
      <section class="widget span-6"><div class="widget-head"><span class="widget-icon">⚙</span><h2>AI-Sync-Verknüpfung</h2></div><form data-form="settings"><div class="field"><label>Adresse der AI-Sync-Hauptapp</label><input name="aiSyncUrl" type="url" value="${attr(state.settings.aiSyncUrl || DEFAULT_AI_SYNC_URL)}" required></div><div class="field"><label>Darstellung</label><select name="theme"><option value="dark" ${state.settings.theme==="dark"?"selected":""}>Dunkel – Schiefer</option><option value="light" ${state.settings.theme==="light"?"selected":""}>Hell – Leinen</option><option value="auto" ${state.settings.theme==="auto"?"selected":""}>Automatisch</option></select></div><button class="btn primary" type="submit">Speichern</button></form></section>
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

  function render() {
    state.route = getRoute();
    viewTitle.textContent = ROUTE_TITLES[state.route] || "Quantus";
    document.querySelectorAll("[data-dock]").forEach((button) => button.classList.toggle("on", button.dataset.dock === state.route));
    main.innerHTML = renderRoute(state.route);
    updateAccountButton();
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
    // Eigenstaendige Tablet-Programme zuerst (Homebildschirm, Mail, FlowerTech).
    const mod = moduleFor(route);
    if (mod && typeof mod.render === "function") {
      try { return mod.render(route); }
      catch (error) { console.warn("[Tablet-Modul]", mod.key, error); }
    }
    if (route === "home") return renderHome();
    if (route === "apps") return renderApps();
    if (route === "split") return renderSplit();
    if (route === "settings") return renderSettings();
    if (route === "daily" || route === "dailybriefing") return renderDaily();
    if (route === "reading") return renderReading();
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

  function openExternal(path) {
    const clean = String(path || "").replace(/^\/+/, "");
    window.open(`${appBaseUrl()}/${clean}`, "_blank", "noopener,noreferrer");
  }

  function openExternalUrl(url) {
    if (!/^https?:\/\//i.test(url || "")) return;
    window.open(url, "_blank", "noopener,noreferrer");
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

  function openEntityForm(name, id) {
    const config = COLLECTION_CONFIG[name];
    if (!config) return;
    const existing = id ? collection(name).find((item) => item.id === id) : null;
    // Unfertige Eingaben ueberleben ein versehentliches Schliessen oder einen
    // Absturz: Beim naechsten Oeffnen steht der Entwurf wieder im Formular.
    const draft = !existing ? state.drafts[name] : null;
    const draftTitle = draft && draft.title || "";
    const draftText = draft && draft.description || "";
    const body = `<form data-form="entity" data-collection="${attr(name)}" data-id="${attr(id || "")}">${draft ? `<p class="muted small" style="margin:0 0 10px">Entwurf von ${esc(relativeTime(draft.savedAt))} wiederhergestellt.</p>` : ""}<div class="form-grid"><div class="field full"><label>Titel</label><input name="title" value="${attr(existing ? itemTitle(existing,"") : draftTitle)}" required></div><div class="field full"><label>Beschreibung / Inhalt</label><textarea name="description">${esc(existing ? itemText(existing) : draftText)}</textarea></div><div class="field"><label>Status</label><select name="status"><option value="open" ${!existing||existing.status==="open"?"selected":""}>Offen</option><option value="in_progress" ${existing&&existing.status==="in_progress"?"selected":""}>In Arbeit</option><option value="done" ${existing&&isDone(existing)?"selected":""}>Erledigt</option></select></div><div class="field"><label>${name === "meetings" ? "Datum" : "Fällig am"}</label><input name="date" type="date" value="${attr(existing && String(existing.date || existing.dueDate || "").slice(0,10))}"></div>${name === "meetings" ? `<div class="field"><label>Zeit</label><input name="time" type="time" value="${attr(existing && (existing.time || ""))}"></div><div class="field"><label>Ort</label><input name="location" value="${attr(existing && existing.location)}"></div>` : ""}</div><div class="sheet-foot"><button class="btn" type="button" data-action="close-overlay">Abbrechen</button><button class="btn primary" type="submit">Mit AI Sync speichern</button></div></form>`;
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
    sheet("Synchronisation", `<div class="sync-details"><div class="detail-block"><small>Status</small><strong>${esc(state.syncMessage)}</strong></div><div class="detail-block"><small>Firebase-Pfad</small><strong>${esc(APP_STORE_PATH)}</strong></div><div class="detail-block"><small>Letzter Abgleich</small><strong>${esc(relativeTime(state.lastSync))}</strong></div><div class="detail-block"><small>Vorgemerkt</small><strong>${state.pending.length} Änderung(en)</strong></div></div><p class="muted small">Tablet-Änderungen werden atomar in den aktuellen AI-Sync-Datenstand eingefügt und zusätzlich über die Polaris-Inbox gespiegelt. Dadurch bleiben parallele Änderungen erhalten.</p><div class="sheet-foot"><button class="btn primary" data-action="flush-sync">Jetzt abgleichen</button></div>`);
  }

  function openAppsSheet() {
    sheet("Alle Quantus Apps", `<div class="apps-grid">${APP_DEFS.map(appTile).join("")}</div>`, "wide");
  }

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
    tools.innerHTML = `<button data-action="translate-selection" data-text="${attr(text)}">Übersetzen</button><button data-action="flashcard-selection" data-text="${attr(text)}">Karteikarte</button><button data-action="polaris-selection" data-text="${attr(text)}">Polaris</button>`;
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
    const patterns = [
      { re:/^(?:neue\s+)?aufgabe\s*:\s*(.+)$/i, collection:"tasks", label:"Aufgabe" },
      { re:/^(?:neue\s+)?notiz\s*:\s*(.+)$/i, collection:"notes", label:"Notiz" },
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
    if (type === "entity") {
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
      const input = form.querySelector("[data-quickadd]");
      if (input) input.value = "";
      await executeOperation(makeOperation("entity","create",name,Core.makeId(name.slice(0,-1)),{ title, description:"", status:"open", source:"tablet-quick-add" }),{silent:true});
      toast(`${COLLECTION_CONFIG[name].label} erstellt`, title, "ok");
      requestAnimationFrame(() => { const next=document.querySelector("[data-quickadd]"); if (next) next.focus(); });
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
    if (!button) return;
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
    if (action === "new-entity") { openEntityForm(button.dataset.collection); return; }
    if (action === "edit-entity") { openEntityForm(button.dataset.collection,button.dataset.id); return; }
    if (action === "delete-entity") {
      if (!confirm("Diesen Eintrag ausblenden? Er wird als gelöscht markiert und kann nicht versehentlich andere Quantus-Daten entfernen.")) return;
      const deletedCollection = button.dataset.collection, deletedId = button.dataset.id;
      await executeOperation(makeOperation("entity","delete",deletedCollection,deletedId,{}),{silent:true});
      undoToast(deletedCollection, deletedId);
      return;
    }
    if (action === "undo-delete") {
      const toastNode = button.closest(".toast");
      if (toastNode) toastNode.remove();
      await executeOperation(makeOperation("entity","update",button.dataset.collection,button.dataset.id,{ status:"open", deletedAt:null }),{silent:true});
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
      ["id","createdAt","updatedAt","deletedAt","completedAt"].forEach((key) => delete patch[key]);
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
    if (action === "toggle-habit") {
      const habit = activeHabits().find((item) => item.id === button.dataset.id); if (!habit) return;
      const today = localDateKey(); const dates = asArray(habit.completedDates || habit.dates).slice(); const index = dates.indexOf(today);
      if (index >= 0) dates.splice(index,1); else dates.push(today);
      await executeOperation(makeOperation("habit","update",null,habit.id,{ completedDates:dates,lastCompleted:index>=0?null:today }),{silent:true}); return;
    }
    if (action === "new-flashcard") { openFlashcardForm(); return; }
    if (action === "edit-flashcard") { openFlashcardForm(button.dataset.id); return; }
    if (action === "open-doc") { state.selectedDocId=button.dataset.id; if (state.route !== "reading") go("reading"); else render(); return; }
    if (action === "external") { openExternal(button.dataset.path); return; }
    if (action === "external-url") { openExternalUrl(button.dataset.url); return; }
    if (action === "external-translate") { openExternalUrl(`https://translate.google.com/?sl=auto&tl=de&text=${encodeURIComponent(button.dataset.text || "")}`); return; }
    if (action === "translate-selection") { await translateSelection(button.dataset.text || ""); return; }
    if (action === "flashcard-selection") { openFlashcardForm(null,{front:button.dataset.text||"",back:"",source:"Markierung aus Quantus Drive"}); return; }
    if (action === "polaris-selection") { openPolarisSheet(`Erkläre mir diesen Text: ${button.dataset.text||""}`); return; }
    if (action === "polaris-quick") { const input=overlayRoot.querySelector('[name="command"]')||document.querySelector('[name="command"]'); if(input){input.value=button.dataset.command||"";input.focus();} return; }
    if (action === "search-result") { closeOverlay(); go(COLLECTION_CONFIG[button.dataset.collection].route); setTimeout(()=>openEntityForm(button.dataset.collection,button.dataset.id),120); return; }
    if (action === "split-with") { state.splitLeft=button.dataset.route||state.route; state.splitRight=state.splitLeft==="notes"?"reading":"notes"; go("split"); return; }
  }

  document.addEventListener("click", handleClick);
  document.addEventListener("submit", (event) => { const form=event.target.closest("form[data-form]"); if(!form)return; event.preventDefault(); handleSubmit(form); });
  let searchDebounce = null;
  let draftDebounce = null;
  document.addEventListener("input", (event) => {
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
    if(event.key==="Escape")closeOverlay();
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){event.preventDefault();openSearch();}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="p"){event.preventDefault();openPolarisSheet();}
    // Ctrl/Cmd+S: Snapshot sichern und Warteschlange abgleichen statt Browser-Dialog.
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="s"){event.preventDefault();saveSnapshot();flushPending();toast("Gesichert","Snapshot gespeichert, Warteschlange wird abgeglichen.","ok");}
    const typing = /^(input|textarea|select)$/i.test(event.target && event.target.tagName || "");
    // Alt+N: neuer Eintrag passend zur aktuellen Ansicht.
    if(event.altKey && !typing && event.key.toLowerCase()==="n"){event.preventDefault();openEntityForm(COLLECTION_CONFIG[state.route]?state.route:"tasks");}
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
    state.route=getRoute(); render(); initFirebase();
    // Zurueckgestellte Aenderungen regelmaessig nachschieben, falls ein einzelner
    // Versuch (z. B. direkt nach dem Aufwachen) fehlgeschlagen ist.
    setInterval(() => { if (state.pending.length) flushPending(); }, 20000);
    if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});
  }

  window.__quantusTablet = {
    state, executeOperation, makeOperation, collection, go, toast, Core, APP_STORE_PATH, RTDB_URL,
    getStorage: () => storage,
    getDatabase: () => db,
    // Bausteine fuer die Tablet-Module (Homebildschirm, Mail, FlowerTech)
    render, scheduleRender, sheet, closeOverlay, appBaseUrl, viewHeader, emptyState, emptyMini,
    esc, attr, formatDate, formatTime, relativeTime, money, itemTitle, itemText, isDone,
    localDateKey, todayTasks, dueCards, activeHabits, APP_DEFS, COLLECTION_CONFIG
  };
  boot();
})();
