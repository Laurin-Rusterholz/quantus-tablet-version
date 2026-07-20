(function () {
  "use strict";

  const COLLECTIONS = {
    projects: { label: "Projekte", singular: "Projekt", kind: "project", link: "linkedProjects", icon: "▧" },
    tasks: { label: "Aufgaben", singular: "Aufgabe", kind: "task", link: "linkedTasks", icon: "✓" },
    notes: { label: "Notizen", singular: "Notiz", kind: "note", link: "linkedNotes", icon: "✎" },
    meetings: { label: "Meetings", singular: "Meeting", kind: "meeting", link: "linkedMeetings", icon: "◉" },
    concepts: { label: "Konzepte", singular: "Konzept", kind: "concept", link: "linkedConcepts", icon: "◆" },
    strategies: { label: "Strategien", singular: "Strategie", kind: "strategy", link: "linkedStrategies", icon: "◇" },
    goals: { label: "Ziele", singular: "Ziel", kind: "goal", link: "linkedGoals", icon: "◎" },
    programs: { label: "Programme", singular: "Programm", kind: "program", link: "linkedPrograms", icon: "▦" },
    organizations: { label: "Organisationen", singular: "Organisation", kind: "organization", link: "linkedOrganizations", icon: "▥" },
    persons: { label: "Personen", singular: "Person", kind: "person", link: "linkedPersons", icon: "♙" },
    ideas: { label: "Ideen", singular: "Idee", kind: "idea", link: "linkedIdeas", icon: "✦" },
    decisions: { label: "Entscheidungen", singular: "Entscheidung", kind: "decision", link: "linkedDecisions", icon: "⚖" },
    calendarEvents: { label: "Termine", singular: "Termin", kind: "event", link: "linkedCalendarEvents", icon: "31" },
    articles: { label: "Artikel", singular: "Artikel", kind: "article", link: "linkedArticles", icon: "▤" },
    protocols: { label: "Protokolle", singular: "Protokoll", kind: "protocol", link: "linkedProtocols", icon: "¶" },
    workflows: { label: "Workflows", singular: "Workflow", kind: "workflow", link: "linkedWorkflows", icon: "↻" },
    theses: { label: "Thesen", singular: "These", kind: "thesis", link: "linkedTheses", icon: "T" }
  };

  const ROUTE_COLLECTION = {
    projects: "projects", tasks: "tasks", notes: "notes", meetings: "meetings",
    concepts: "concepts", strategies: "strategies", goals: "goals", programs: "programs",
    organizations: "organizations", persons: "persons", ideas: "ideas", decisions: "decisions",
    calendar: "calendarEvents", googlecalendar: "calendarEvents", reading: "articles",
    knowledge: "articles", protocols: "protocols", workflows: "workflows", thesis: "theses"
  };

  const TABS = [
    { key: "ink", label: "Handschrift", icon: "✎" },
    { key: "board", label: "Sticky Board", icon: "▦" },
    { key: "links", label: "Links", icon: "↗" },
    { key: "relations", label: "Verknüpfungen", icon: "⌁" },
    { key: "files", label: "Dateien", icon: "▰" }
  ];

  const POSTIT_COLORS = ["#ffe082", "#ffab91", "#a5d6a7", "#90caf9", "#ce93d8", "#f5f5f5"];
  // Schnellzugriff-Stiftfarben und Markerfarben fuer die Handschrift.
  const INK_COLORS = ["#243c34", "#111417", "#1f6feb", "#d64545", "#2ea27b", "#b8860b"];
  const MARKER_COLORS = ["#ffe14d", "#7ee7c7", "#8bc6ff", "#ffa8a8", "#d7a8ff"];
  const ui = {
    open: false,
    tab: "ink",
    collection: "projects",
    entityId: "",
    inkColor: "#243c34",
    inkWidth: 4,
    eraser: false,
    highlighter: false,
    markerColor: MARKER_COLORS[0],
    boardColor: POSTIT_COLORS[0],
    connectFrom: null,
    boardDraw: false,
    boardZoom: 1
  };

  let root = null;
  let activeStroke = null;
  let activePointerId = null;
  let lastPenAt = 0;
  const saveTimers = new Map();
  let drag = null;

  function api() { return window.__quantusTablet || null; }
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function attr(value) { return esc(value); }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asMap(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function makeId(prefix) { return api() ? api().Core.makeId(prefix) : `${prefix}_${Date.now().toString(36)}`; }
  function titleOf(item) { return item && (item.title || item.name || item.subject || item.titel) || "Ohne Titel"; }
  function currentMap(name) { return asMap(api()?.state?.payload?.entities?.[name]); }
  function items(name) {
    return Object.values(currentMap(name)).filter((item) => item && item.status !== "deleted" && !item.deletedAt)
      .sort((a, b) => titleOf(a).localeCompare(titleOf(b), "de"));
  }
  function currentEntity() { return currentMap(ui.collection)[ui.entityId] || null; }

  function ensureTarget() {
    const list = items(ui.collection);
    if (!list.some((item) => item.id === ui.entityId)) ui.entityId = list[0]?.id || "";
  }

  function ensureRoot() {
    if (root && root.isConnected) return root;
    root = document.getElementById("tabletWorkspaceRoot");
    if (!root) {
      root = document.createElement("div");
      root.id = "tabletWorkspaceRoot";
      document.body.appendChild(root);
    }
    return root;
  }

  function targetBar() {
    const collectionOptions = Object.entries(COLLECTIONS).map(([key, config]) =>
      `<option value="${attr(key)}" ${key === ui.collection ? "selected" : ""}>${esc(config.icon)} ${esc(config.label)}</option>`).join("");
    const entityOptions = items(ui.collection).map((item) =>
      `<option value="${attr(item.id)}" ${item.id === ui.entityId ? "selected" : ""}>${esc(titleOf(item))}</option>`).join("");
    return `<div class="tw-targetbar">
      <label><span>Bereich</span><select data-tw-change="collection">${collectionOptions}</select></label>
      <label class="tw-target-entity"><span>Element</span><select data-tw-change="entity">${entityOptions || '<option value="">Noch keine Einträge</option>'}</select></label>
      <button class="tw-btn" data-tw-action="new-context-note">＋ Tablet-Notiz</button>
    </div>`;
  }

  function tabs() {
    return `<nav class="tw-tabs" aria-label="Tablet-Werkzeuge">${TABS.map((tab) =>
      `<button class="${ui.tab === tab.key ? "on" : ""}" data-tw-action="tab" data-tab="${tab.key}"><span>${tab.icon}</span>${esc(tab.label)}</button>`).join("")}</nav>`;
  }

  function emptyTarget() {
    return `<div class="tw-empty"><span>✎</span><h2>Wähle ein Element</h2><p>Handschrift, Sticky Boards, Verknüpfungen und Dateien werden direkt am ausgewählten Quantus-Element gespeichert.</p><button class="tw-btn primary" data-tw-action="new-context-note">＋ Neue Tablet-Notiz</button></div>`;
  }

  function inkPanel(entity) {
    const count = asArray(entity.handwriting?.strokes).length;
    const activeColor = ui.highlighter ? ui.markerColor : ui.inkColor;
    const swatches = (ui.highlighter ? MARKER_COLORS : INK_COLORS)
      .map((color) => `<button style="--swatch:${color}" class="${color.toLowerCase() === activeColor.toLowerCase() ? "on" : ""}" data-tw-action="ink-preset" data-color="${attr(color)}" aria-label="Farbe"></button>`).join("");
    return `<section class="tw-panel tw-ink-panel">
      <div class="tw-toolrow">
        <button class="tw-btn ${ui.highlighter ? "" : "active"}" data-tw-action="pen-mode">✎ Stift</button>
        <button class="tw-btn ${ui.highlighter ? "active" : ""}" data-tw-action="marker-mode">▔ Marker</button>
        <div class="tw-swatches tw-ink-presets">${swatches}</div>
        <label class="tw-color"><span>Farbe</span><input type="color" value="${attr(activeColor)}" data-tw-change="ink-color"></label>
        <label class="tw-range"><span>Dicke</span><input type="range" min="1" max="24" value="${ui.inkWidth}" data-tw-change="ink-width"></label>
        <button class="tw-btn ${ui.eraser ? "active" : ""}" data-tw-action="eraser">⌫ Radierer</button>
        <button class="tw-btn" data-tw-action="ink-undo" ${count ? "" : "disabled"}>↶ Rückgängig</button>
        <button class="tw-btn danger" data-tw-action="ink-clear" ${count ? "" : "disabled"}>Leeren</button>
        <button class="tw-btn" data-tw-action="ink-copy-note" ${count ? "" : "disabled"}>Als Notiz kopieren</button>
        <span class="tw-save-state">${count} Striche · automatisch synchronisiert</span>
      </div>
      <div class="tw-paper"><canvas id="twInkCanvas" aria-label="Handschriftliche Notizfläche"></canvas><div class="tw-paper-hint">${ui.highlighter ? "Marker – breit und halbtransparent zum Hervorheben" : "Mit Apple Pencil, Stift, Finger oder Maus schreiben"}</div></div>
    </section>`;
  }

  function boardPanel(entity) {
    const board = normalBoard(entity.stickyBoard);
    const notes = board.notes;
    const lines = board.connections.map((connection) => {
      const from = notes.find((note) => note.id === connection.from);
      const to = notes.find((note) => note.id === connection.to);
      if (!from || !to) return "";
      const x1 = from.x + from.w / 2, y1 = from.y + from.h / 2, x2 = to.x + to.w / 2, y2 = to.y + to.h / 2;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${attr(connection.color || "#6a8179")}" stroke-width="${connection.width || 3}" marker-end="url(#twArrow)" />`;
    }).join("");
    return `<section class="tw-panel tw-board-panel">
      <div class="tw-toolrow">
        <div class="tw-quick-add"><input id="twStickyText" placeholder="Gedanke eingeben …"><button class="tw-btn primary" data-tw-action="add-sticky">＋ Post-it</button></div>
        <div class="tw-swatches">${POSTIT_COLORS.map((color) => `<button style="--swatch:${color}" class="${color === ui.boardColor ? "on" : ""}" data-tw-action="board-color" data-color="${color}" aria-label="Post-it-Farbe"></button>`).join("")}</div>
        <button class="tw-btn ${ui.boardDraw ? "active" : ""}" data-tw-action="board-draw">✎ Zeichnen</button>
        <button class="tw-btn" data-tw-action="board-fit">Alles einpassen</button>
        <span class="tw-save-state">${notes.length} Post-its · ${board.connections.length} Verbindungen</span>
      </div>
      ${ui.connectFrom ? `<div class="tw-connect-hint">Wähle das Ziel für die Verbindung. <button data-tw-action="cancel-connect">Abbrechen</button></div>` : ""}
      <div class="tw-board-scroll" id="twBoardScroll"><div class="tw-board-world" id="twBoardWorld" style="transform:scale(${ui.boardZoom});transform-origin:top left">
        <svg class="tw-connections" viewBox="0 0 1600 1000" preserveAspectRatio="none"><defs><marker id="twArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#6a8179" /></marker></defs>${lines}</svg>
        <canvas id="twBoardInk" class="tw-board-ink ${ui.boardDraw ? "active" : ""}" width="1600" height="1000"></canvas>
        ${notes.map((note) => `<article class="tw-sticky" data-note-id="${attr(note.id)}" style="left:${note.x}px;top:${note.y}px;width:${note.w}px;height:${note.h}px;background:${attr(note.color)};color:${attr(note.textColor || "#25312d")};z-index:${note.z || 1}">
          <div class="tw-sticky-grip" data-tw-drag="sticky"><span>${esc(note.tags?.[0] || "Post-it")}</span><div><button data-tw-action="connect-sticky" data-id="${attr(note.id)}" title="Verbinden">⌁</button><button data-tw-action="delete-sticky" data-id="${attr(note.id)}" title="Löschen">×</button></div></div>
          <textarea data-tw-change="sticky-text" data-id="${attr(note.id)}">${esc(note.text)}</textarea>
        </article>`).join("")}
      </div></div>
    </section>`;
  }

  function linksPanel(entity) {
    const links = asArray(entity.externalLinks);
    return `<section class="tw-panel"><div class="tw-add-grid"><input id="twLinkLabel" placeholder="Bezeichnung"><input id="twLinkUrl" type="url" placeholder="https://…"><button class="tw-btn primary" data-tw-action="add-link">＋ Link</button></div>
      <div class="tw-resource-list">${links.map((link) => `<div class="tw-resource"><span class="tw-resource-icon">↗</span><div><strong>${esc(link.label || link.url)}</strong><a href="${attr(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.url)}</a></div><button data-tw-action="remove-link" data-id="${attr(link.id)}">×</button></div>`).join("") || '<p class="tw-muted">Noch keine externen Links.</p>'}</div></section>`;
  }

  function relationRows(entity) {
    const rows = [];
    Object.entries(COLLECTIONS).forEach(([collection, config]) => {
      asArray(entity[config.link]).forEach((id) => {
        const linked = currentMap(collection)[id];
        if (linked) rows.push({ collection, config, linked });
      });
    });
    return rows;
  }

  function relationsPanel(entity) {
    const rows = relationRows(entity);
    const targetCollection = ui.relationCollection || "tasks";
    const targetItems = items(targetCollection).filter((item) => !(targetCollection === ui.collection && item.id === ui.entityId));
    return `<section class="tw-panel"><div class="tw-add-grid relations"><select data-tw-change="relation-collection">${Object.entries(COLLECTIONS).map(([key, config]) => `<option value="${key}" ${key === targetCollection ? "selected" : ""}>${esc(config.icon)} ${esc(config.label)}</option>`).join("")}</select><select id="twRelationEntity">${targetItems.map((item) => `<option value="${attr(item.id)}">${esc(titleOf(item))}</option>`).join("") || '<option value="">Keine Elemente</option>'}</select><button class="tw-btn primary" data-tw-action="add-relation">＋ Verknüpfen</button></div>
      <div class="tw-resource-list">${rows.map(({ collection, config, linked }) => `<div class="tw-resource"><span class="tw-resource-icon">${config.icon}</span><div><strong>${esc(titleOf(linked))}</strong><small>${esc(config.singular)}</small></div><button data-tw-action="remove-relation" data-collection="${collection}" data-id="${attr(linked.id)}">×</button></div>`).join("") || '<p class="tw-muted">Noch keine Verknüpfungen.</p>'}</div></section>`;
  }

  function fileIcon(name) {
    const ext = String(name || "").split(".").pop().toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "▧";
    if (ext === "pdf") return "PDF";
    if (["doc", "docx"].includes(ext)) return "W";
    return "▰";
  }

  function filesPanel(entity) {
    const files = asArray(entity.files);
    const driveDocs = Object.entries(asMap(api()?.state?.driveDocs)).filter(([, doc]) => doc && doc.status !== "papierkorb");
    return `<section class="tw-panel"><div class="tw-file-actions"><label class="tw-upload"><input type="file" multiple data-tw-change="upload-files"><span>＋ Dateien hochladen</span></label><select id="twDriveDoc"><option value="">Aus Quantus Drive wählen …</option>${driveDocs.map(([id, doc]) => `<option value="${attr(id)}">${esc(doc.titel_final || doc.dateiname || "Dokument")}</option>`).join("")}</select><button class="tw-btn" data-tw-action="attach-drive">Aus Drive anhängen</button></div><div id="twUploadProgress" class="tw-upload-progress"><i></i></div>
      <div class="tw-resource-list">${files.map((file) => `<div class="tw-resource"><span class="tw-resource-icon file">${fileIcon(file.name)}</span><div><strong>${esc(file.name || "Datei")}</strong><small>${formatBytes(file.size)}${file.fromDrive ? " · Quantus Drive" : ""}</small></div>${file.url ? `<a class="tw-btn" href="${attr(file.url)}" target="_blank" rel="noopener noreferrer">Öffnen</a>` : ""}<button data-tw-action="remove-file" data-id="${attr(file.id)}">×</button></div>`).join("") || '<p class="tw-muted">Noch keine Dateien angehängt.</p>'}</div></section>`;
  }

  function panel() {
    const entity = currentEntity();
    if (!entity) return emptyTarget();
    if (ui.tab === "ink") return inkPanel(entity);
    if (ui.tab === "board") return boardPanel(entity);
    if (ui.tab === "links") return linksPanel(entity);
    if (ui.tab === "relations") return relationsPanel(entity);
    return filesPanel(entity);
  }

  function renderOverlay() {
    if (!ui.open) { ensureRoot().innerHTML = ""; document.body.classList.remove("tw-open"); return; }
    ensureTarget();
    document.body.classList.add("tw-open");
    ensureRoot().innerHTML = `<div class="tw-overlay"><header class="tw-header"><div><span class="tw-kicker">Quantus Tablet Canvas</span><h1>${esc(TABS.find((tab) => tab.key === ui.tab)?.label || "Werkzeuge")}</h1></div><button class="tw-close" data-tw-action="close" aria-label="Schliessen">×</button></header>${targetBar()}${tabs()}<main class="tw-content">${panel()}</main></div>`;
    requestAnimationFrame(mountActivePanel);
  }

  function normalBoard(input) {
    const board = input && typeof input === "object" ? JSON.parse(JSON.stringify(input)) : {};
    const numberOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    board.notes = asArray(board.notes).map((note) => ({
      id: note.id || makeId("sticky"), x: numberOr(note.x, 80), y: numberOr(note.y, 80),
      w: numberOr(note.w, 220), h: numberOr(note.h, 160), text: note.text || "",
      color: note.color || POSTIT_COLORS[0], textColor: note.textColor || "#25312d",
      shape: note.shape || "square", fontSize: note.fontSize || 18, z: note.z || 1,
      tags: asArray(note.tags), votes: Number(note.votes) || 0, locked: Boolean(note.locked),
      createdAt: note.createdAt || new Date().toISOString(), updatedAt: note.updatedAt || new Date().toISOString()
    }));
    board.connections = asArray(board.connections);
    board.drawings = asArray(board.drawings);
    board.view = board.view || { x: 0, y: 0, zoom: 1 };
    return board;
  }

  async function savePatch(patch, silent) {
    const q = api(), entity = currentEntity();
    if (!q || !entity) return false;
    return q.executeOperation(q.makeOperation("entity", "update", ui.collection, entity.id, patch), { silent: silent !== false });
  }

  function queuePatch(patch, delay) {
    const q = api(), entity = currentEntity(), collection = ui.collection;
    if (!q || !entity) return;
    const key = `${collection}:${entity.id}`;
    clearTimeout(saveTimers.get(key));
    saveTimers.set(key, setTimeout(() => {
      saveTimers.delete(key);
      q.executeOperation(q.makeOperation("entity", "update", collection, entity.id, patch), { silent: true });
    }, delay || 260));
  }

  function mountActivePanel() {
    if (ui.tab === "ink") mountDrawingCanvas("twInkCanvas", "handwriting");
    if (ui.tab === "board") mountDrawingCanvas("twBoardInk", "board");
  }

  function mountDrawingCanvas(id, mode) {
    const canvas = document.getElementById(id), entity = currentEntity();
    if (!canvas || !entity) return;
    const parent = canvas.parentElement;
    if (mode === "handwriting") {
      const rect = parent.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`;
      canvas.dataset.ratio = String(ratio);
    }
    drawCanvas(canvas, mode === "handwriting" ? asArray(entity.handwriting?.strokes) : normalBoard(entity.stickyBoard).drawings, mode);
    canvas.onpointerdown = (event) => startStroke(event, canvas, mode);
    canvas.onpointermove = (event) => moveStroke(event, canvas, mode);
    canvas.onpointerup = canvas.onpointercancel = (event) => endStroke(event, canvas, mode);
  }

  function canvasPoint(event, canvas, mode) {
    const rect = canvas.getBoundingClientRect();
    if (mode === "handwriting") return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height, p: event.pressure || .5 };
    return { x: (event.clientX - rect.left) * (1600 / rect.width), y: (event.clientY - rect.top) * (1000 / rect.height), p: event.pressure || .5 };
  }

  function startStroke(event, canvas, mode) {
    if (mode === "board" && !ui.boardDraw) return;
    if (event.pointerType === "pen") lastPenAt = Date.now();
    if (event.pointerType === "touch" && Date.now() - lastPenAt < 800) return;
    if (activePointerId !== null) return;
    event.preventDefault(); canvas.setPointerCapture?.(event.pointerId);
    const entity = currentEntity(); if (!entity) return;
    const strokes = mode === "handwriting" ? asArray(entity.handwriting?.strokes).slice() : normalBoard(entity.stickyBoard).drawings;
    const point = canvasPoint(event, canvas, mode);
    if (ui.eraser || (event.pointerType === "pen" && (event.button === 5 || event.buttons === 32))) {
      const threshold = mode === "handwriting" ? .025 : 28;
      const next = strokes.filter((stroke) => !asArray(stroke.points).some((p) => Math.hypot(p.x - point.x, p.y - point.y) < threshold));
      saveDrawings(mode, next); drawCanvas(canvas, next, mode); return;
    }
    activePointerId = event.pointerId;
    const highlighter = mode === "handwriting" && ui.highlighter;
    const color = highlighter ? ui.markerColor : ui.inkColor;
    const width = highlighter ? Math.max(16, Number(ui.inkWidth) * 3) : Number(ui.inkWidth);
    activeStroke = { id: makeId("stroke"), color, width, points: [point] };
    if (highlighter) activeStroke.highlighter = true;
    strokes.push(activeStroke); canvas.dataset.strokes = JSON.stringify(strokes);
  }

  function moveStroke(event, canvas, mode) {
    if (!activeStroke || event.pointerId !== activePointerId) return;
    event.preventDefault(); activeStroke.points.push(canvasPoint(event, canvas, mode));
    const strokes = JSON.parse(canvas.dataset.strokes || "[]");
    strokes[strokes.length - 1] = activeStroke;
    canvas.dataset.strokes = JSON.stringify(strokes); drawCanvas(canvas, strokes, mode);
  }

  function endStroke(event, canvas, mode) {
    if (!activeStroke || event.pointerId !== activePointerId) return;
    event.preventDefault();
    const strokes = JSON.parse(canvas.dataset.strokes || "[]"); activeStroke = null; activePointerId = null; saveDrawings(mode, strokes);
  }

  function drawCanvas(canvas, strokes, mode) {
    const context = canvas.getContext("2d"); if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const sx = mode === "handwriting" ? canvas.width : canvas.width / 1600;
    const sy = mode === "handwriting" ? canvas.height : canvas.height / 1000;
    asArray(strokes).forEach((stroke) => {
      const points = asArray(stroke.points); if (points.length < 1) return;
      context.save();
      context.beginPath(); context.lineJoin = "round";
      context.strokeStyle = stroke.color || "#243c34";
      if (stroke.highlighter) {
        context.lineCap = "butt";
        context.globalAlpha = .34;
        context.globalCompositeOperation = "multiply";
      } else {
        context.lineCap = "round";
      }
      const averagePressure = points.reduce((sum, point) => sum + (Number(point.p) || .5), 0) / points.length;
      const pressureFactor = stroke.highlighter ? 1 : (.72 + averagePressure * .56);
      context.lineWidth = (Number(stroke.width) || 4) * pressureFactor * (mode === "handwriting" ? Math.min(canvas.width, canvas.height) / 700 : sx);
      context.moveTo(points[0].x * sx, points[0].y * sy);
      for (let index = 1; index < points.length - 1; index += 1) {
        const point = points[index], next = points[index + 1];
        context.quadraticCurveTo(point.x * sx, point.y * sy, (point.x + next.x) / 2 * sx, (point.y + next.y) / 2 * sy);
      }
      if (points.length > 1) context.lineTo(points[points.length - 1].x * sx, points[points.length - 1].y * sy);
      context.stroke();
      context.restore();
    });
  }

  function saveDrawings(mode, strokes) {
    const entity = currentEntity(); if (!entity) return;
    if (mode === "handwriting") {
      const handwriting = { version: 1, strokes, updatedAt: new Date().toISOString() };
      entity.handwriting = handwriting; queuePatch({ handwriting });
    } else {
      const board = normalBoard(entity.stickyBoard); board.drawings = strokes; entity.stickyBoard = board; queuePatch({ stickyBoard: board });
    }
  }

  async function createContextNote() {
    const q = api(); if (!q) return;
    const id = makeId("note"), route = q.state.route || "Tablet";
    await q.executeOperation(q.makeOperation("entity", "create", "notes", id, {
      title: `Tablet-Notiz · ${route}`,
      content: "Handschrift, Sticky Board, Verknüpfungen und Dateien",
      tags: ["tablet"], externalLinks: [], files: [], fileFolders: [], linkedTasks: [], linkedProjects: [], linkedOrganizations: [], linkedMeetings: []
    }));
    ui.collection = "notes"; ui.entityId = id; renderOverlay();
  }

  async function addSticky() {
    const input = document.getElementById("twStickyText"), text = input?.value.trim(); if (!text) { input?.focus(); return; }
    const entity = currentEntity(), board = normalBoard(entity?.stickyBoard); if (!entity) return;
    const index = board.notes.length;
    board.notes.push({ id: makeId("sticky"), x: 70 + (index % 5) * 250, y: 70 + Math.floor(index / 5) * 190, w: 220, h: 160, text, color: ui.boardColor, textColor: "#25312d", shape: "square", fontSize: 18, z: index + 1, tags: [], votes: 0, locked: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    entity.stickyBoard = board; await savePatch({ stickyBoard: board }); renderOverlay();
  }

  async function addLink() {
    const label = document.getElementById("twLinkLabel")?.value.trim() || "";
    let url = document.getElementById("twLinkUrl")?.value.trim() || ""; if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const entity = currentEntity(), externalLinks = asArray(entity?.externalLinks).slice(); if (!entity) return;
    externalLinks.push({ id: makeId("link"), label: label || url.replace(/^https?:\/\//, "").slice(0, 40), url, createdAt: new Date().toISOString() });
    entity.externalLinks = externalLinks; await savePatch({ externalLinks }); renderOverlay();
  }

  async function updateRelation(targetCollection, targetId, remove) {
    const q = api(), source = currentEntity(), target = currentMap(targetCollection)[targetId];
    if (!q || !source || !target) return;
    const targetConfig = COLLECTIONS[targetCollection], sourceConfig = COLLECTIONS[ui.collection];
    const sourceIds = asArray(source[targetConfig.link]).filter((id) => id !== targetId);
    if (!remove) sourceIds.push(targetId);
    source[targetConfig.link] = [...new Set(sourceIds)];
    await savePatch({ [targetConfig.link]: source[targetConfig.link] });
    const reverseIds = asArray(target[sourceConfig.link]).filter((id) => id !== source.id);
    if (!remove) reverseIds.push(source.id);
    target[sourceConfig.link] = [...new Set(reverseIds)];
    await q.executeOperation(q.makeOperation("entity", "update", targetCollection, target.id, { [sourceConfig.link]: target[sourceConfig.link] }), { silent: true });
    renderOverlay();
  }

  async function attachDrive() {
    const id = document.getElementById("twDriveDoc")?.value, doc = api()?.state?.driveDocs?.[id], entity = currentEntity();
    if (!id || !doc || !entity) return;
    const files = asArray(entity.files).slice();
    if (doc.storagePath && files.some((file) => file.storagePath === doc.storagePath)) return api()?.toast("Schon angehängt", doc.dateiname || "Dokument");
    files.push({ id: makeId("f"), name: doc.titel_final || doc.dateiname || "Dokument", originalName: doc.dateiname || "", size: doc.groesse || 0, type: doc.mimeType || "application/octet-stream", storagePath: doc.storagePath || "", url: doc.downloadUrl || "", uploadedAt: new Date().toISOString(), fromDrive: true, driveDocId: id });
    entity.files = files; await savePatch({ files }); renderOverlay();
  }

  async function uploadFiles(fileList) {
    const q = api(), entity = currentEntity(), storage = q?.getStorage?.(); if (!q || !entity || !storage) return q?.toast("Upload nicht verfügbar", "Firebase Storage konnte nicht geladen werden", "error");
    const collection = ui.collection, entityId = entity.id, config = COLLECTIONS[collection], files = asArray(entity.files).slice();
    for (const file of Array.from(fileList || [])) {
      if (file.size > 50 * 1024 * 1024) { q.toast("Datei zu gross", `${file.name} überschreitet 50 MB`, "error"); continue; }
      try {
        const fileId = makeId("f"), safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
        const storagePath = `attachments/${config.kind}/${entityId}/${fileId}_${safeName}`;
        const task = storage.ref(storagePath).put(file);
        await new Promise((resolve, reject) => task.on("state_changed", (snapshot) => {
          const percent = snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes * 100 : 0;
          const bar = document.querySelector("#twUploadProgress i"); if (bar) bar.style.width = `${percent}%`;
        }, reject, resolve));
        const url = await task.snapshot.ref.getDownloadURL();
        files.push({ id: fileId, name: file.name, originalName: file.name, size: file.size, type: file.type, storagePath, url, uploadedAt: new Date().toISOString() });
      } catch (error) {
        q.toast("Upload fehlgeschlagen", `${file.name}: ${error.message || "Unbekannter Fehler"}`, "error");
      }
    }
    entity.files = files; await savePatch({ files }); renderOverlay();
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0; if (!value) return "0 B";
    const units = ["B", "KB", "MB", "GB"], index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), 3);
    return `${(value / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
  }

  function renderRoute() {
    const totalInk = Object.keys(COLLECTIONS).reduce((sum, key) => sum + items(key).filter((entity) => asArray(entity.handwriting?.strokes).length).length, 0);
    const totalBoards = Object.keys(COLLECTIONS).reduce((sum, key) => sum + items(key).filter((entity) => asArray(entity.stickyBoard?.notes).length).length, 0);
    return `<div class="view tw-route"><div class="view-head"><div><h1>Tablet Canvas</h1><p>Handschrift, Sticky Boards, Dateien und Verknüpfungen für alle Quantus-Elemente.</p></div><button class="btn primary" data-tw-action="open">Arbeitsfläche öffnen</button></div><div class="dashboard-grid"><section class="widget span-6 hero-widget"><div class="widget-head"><span class="widget-icon">✎</span><h2>Handschrift überall</h2></div><p class="muted">Schreibe mit Apple Pencil oder Finger direkt zu Projekten, Aufgaben, Meetings, Notizen und allen weiteren Bereichen.</p><strong class="tw-route-number">${totalInk}</strong><small class="muted">Elemente mit Handschrift</small></section><section class="widget span-6"><div class="widget-head"><span class="widget-icon">▦</span><h2>Sticky Boards</h2></div><p class="muted">Post-its und Verbindungen verwenden dasselbe Datenmodell wie AI Sync.</p><strong class="tw-route-number">${totalBoards}</strong><small class="muted">aktive Boards</small></section><section class="widget span-12"><div class="apps-grid">${TABS.map((tab) => `<button class="app-tile" data-tw-action="open-tab" data-tab="${tab.key}"><span class="app-icon green">${tab.icon}</span><strong>${esc(tab.label)}</strong><small>Tablet Canvas</small></button>`).join("")}</div></section></div></div>`;
  }

  function mountRoute() {}

  function open(tab) {
    if (tab) ui.tab = tab;
    if (!ui.open) {
      const routeCollection = ROUTE_COLLECTION[api()?.state?.route];
      if (routeCollection) { ui.collection = routeCollection; ui.entityId = ""; }
    }
    ui.open = true;
    renderOverlay();
  }
  function close() { ui.open = false; renderOverlay(); }

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-tw-action]"); if (!button) return;
    const action = button.dataset.twAction;
    if (action === "open") return open();
    if (action === "open-tab") return open(button.dataset.tab);
    if (action === "close") return close();
    if (action === "tab") { ui.tab = button.dataset.tab; return renderOverlay(); }
    if (action === "new-context-note") return createContextNote();
    if (action === "eraser") { ui.eraser = !ui.eraser; return renderOverlay(); }
    if (action === "pen-mode") { ui.highlighter = false; ui.eraser = false; return renderOverlay(); }
    if (action === "marker-mode") { ui.highlighter = true; ui.eraser = false; return renderOverlay(); }
    if (action === "ink-preset") {
      const color = button.dataset.color; ui.eraser = false;
      if (ui.highlighter) ui.markerColor = color; else ui.inkColor = color;
      return renderOverlay();
    }
    if (action === "ink-undo" || action === "ink-clear") {
      const entity = currentEntity(); if (!entity) return;
      let strokes = asArray(entity.handwriting?.strokes).slice();
      if (action === "ink-clear" && !confirm("Handschrift wirklich leeren?")) return;
      strokes = action === "ink-undo" ? strokes.slice(0, -1) : [];
      return saveDrawings("handwriting", strokes), renderOverlay();
    }
    if (action === "ink-copy-note") {
      const source = currentEntity(), q = api(); if (!source || !q) return;
      const id = makeId("note");
      await q.executeOperation(q.makeOperation("entity", "create", "notes", id, { title: `Handschrift · ${titleOf(source)}`, content: "Handschriftliche Tablet-Notiz", handwriting: source.handwriting, tags: ["handschrift", "tablet"], [COLLECTIONS[ui.collection].link]: [source.id] }));
      return q.toast("Notiz erstellt", "Die Handschrift wurde als verknüpfte Notiz gespeichert", "ok");
    }
    if (action === "add-sticky") return addSticky();
    if (action === "board-color") { ui.boardColor = button.dataset.color; return renderOverlay(); }
    if (action === "board-draw") { ui.boardDraw = !ui.boardDraw; return renderOverlay(); }
    if (action === "board-fit") { ui.boardZoom = ui.boardZoom === .72 ? 1 : .72; return renderOverlay(); }
    if (action === "cancel-connect") { ui.connectFrom = null; return renderOverlay(); }
    if (action === "connect-sticky") {
      const id = button.dataset.id, entity = currentEntity(), board = normalBoard(entity?.stickyBoard); if (!entity) return;
      if (!ui.connectFrom) { ui.connectFrom = id; return renderOverlay(); }
      if (ui.connectFrom !== id && !board.connections.some((line) => line.from === ui.connectFrom && line.to === id)) board.connections.push({ id: makeId("line"), from: ui.connectFrom, to: id, style: "straight", color: "#6a8179", width: 3, arrow: true, label: "" });
      ui.connectFrom = null; entity.stickyBoard = board; await savePatch({ stickyBoard: board }); return renderOverlay();
    }
    if (action === "delete-sticky") {
      const entity = currentEntity(), board = normalBoard(entity?.stickyBoard); if (!entity) return;
      board.notes = board.notes.filter((note) => note.id !== button.dataset.id); board.connections = board.connections.filter((line) => line.from !== button.dataset.id && line.to !== button.dataset.id);
      entity.stickyBoard = board; await savePatch({ stickyBoard: board }); return renderOverlay();
    }
    if (action === "add-link") return addLink();
    if (action === "remove-link") {
      const entity = currentEntity(), externalLinks = asArray(entity?.externalLinks).filter((link) => link.id !== button.dataset.id); if (!entity) return;
      entity.externalLinks = externalLinks; await savePatch({ externalLinks }); return renderOverlay();
    }
    if (action === "add-relation") { const target = document.getElementById("twRelationEntity")?.value; if (target) return updateRelation(ui.relationCollection || "tasks", target, false); }
    if (action === "remove-relation") return updateRelation(button.dataset.collection, button.dataset.id, true);
    if (action === "attach-drive") return attachDrive();
    if (action === "remove-file") {
      const entity = currentEntity(), files = asArray(entity?.files).filter((file) => file.id !== button.dataset.id); if (!entity) return;
      entity.files = files; await savePatch({ files }); return renderOverlay();
    }
  });

  document.addEventListener("change", async (event) => {
    const control = event.target.closest("[data-tw-change]"); if (!control) return;
    const change = control.dataset.twChange;
    if (change === "collection") { ui.collection = control.value; ui.entityId = ""; return renderOverlay(); }
    if (change === "entity") { ui.entityId = control.value; return renderOverlay(); }
    if (change === "ink-color") { if (ui.highlighter) ui.markerColor = control.value; else ui.inkColor = control.value; return; }
    if (change === "ink-width") { ui.inkWidth = Number(control.value); return; }
    if (change === "relation-collection") { ui.relationCollection = control.value; return renderOverlay(); }
    if (change === "sticky-text") {
      const entity = currentEntity(), board = normalBoard(entity?.stickyBoard), note = board.notes.find((item) => item.id === control.dataset.id); if (!entity || !note) return;
      note.text = control.value; note.updatedAt = new Date().toISOString(); entity.stickyBoard = board; return queuePatch({ stickyBoard: board }, 400);
    }
    if (change === "upload-files") return uploadFiles(control.files);
  });

  document.addEventListener("pointerdown", (event) => {
    const grip = event.target.closest("[data-tw-drag='sticky']"); if (!grip || event.target.closest("button")) return;
    const card = grip.closest(".tw-sticky"), world = document.getElementById("twBoardWorld"), noteId = card?.dataset.noteId; if (!card || !world || !noteId) return;
    event.preventDefault(); card.setPointerCapture?.(event.pointerId);
    drag = { noteId, startX: event.clientX, startY: event.clientY, left: parseFloat(card.style.left), top: parseFloat(card.style.top), card };
  });
  document.addEventListener("pointermove", (event) => {
    if (!drag) return; event.preventDefault();
    drag.card.style.left = `${Math.max(0, drag.left + (event.clientX - drag.startX) / ui.boardZoom)}px`;
    drag.card.style.top = `${Math.max(0, drag.top + (event.clientY - drag.startY) / ui.boardZoom)}px`;
  });
  document.addEventListener("pointerup", async () => {
    if (!drag) return;
    const entity = currentEntity(), board = normalBoard(entity?.stickyBoard), note = board.notes.find((item) => item.id === drag.noteId);
    if (entity && note) { note.x = parseFloat(drag.card.style.left); note.y = parseFloat(drag.card.style.top); note.updatedAt = new Date().toISOString(); entity.stickyBoard = board; await savePatch({ stickyBoard: board }); }
    drag = null; renderOverlay();
  });

  window.QuantusTabletWorkspace = { open, close, renderRoute, mountRoute, refresh: renderOverlay };
})();
