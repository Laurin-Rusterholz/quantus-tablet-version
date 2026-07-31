(function () {
  "use strict";

  // ==========================================================================
  //  FlowerTech — Tablet-Arbeitsbereich
  //  --------------------------------------------------------------------
  //  Gleiche Daten wie in Quantus/AI Sync: Projekte mit projectType
  //  "flowertech" sowie payload.flowertech mit Offerten, Rechnungen,
  //  Finanzen und Anfragen. Projekte werden hier vollstaendig angezeigt
  //  (Aufgaben, Offerten, Rechnungen), Dokumente lassen sich mit Positionen
  //  erfassen und bearbeiten. Der QR-Einzahlungsschein wird in Quantus
  //  hochgeladen und hier nur dargestellt.
  // ==========================================================================

  var VAT_DEFAULT = 8.1;

  var STAGES = [
    ["lead", "Lead"], ["discovery", "Abklaerung"], ["proposal", "Offerte"],
    ["build", "Umsetzung"], ["won", "Gewonnen"], ["lost", "Verloren"]
  ];
  var OFFER_STATUS = [
    ["draft", "Entwurf"], ["sent", "Versendet"], ["accepted", "Angenommen"],
    ["declined", "Abgelehnt"], ["expired", "Abgelaufen"]
  ];
  var INVOICE_STATUS = [
    ["draft", "Entwurf"], ["sent", "Versendet"], ["paid", "Bezahlt"],
    ["overdue", "Ueberfaellig"], ["cancelled", "Storniert"]
  ];

  var ui = { tab: "dashboard", projectId: null, docKind: "offer", draft: null };

  function api() { return window.__quantusTablet || null; }
  function esc(value) {
    var a = api();
    return a ? a.esc(value) : String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function rerender() { var a = api(); if (a) a.render(); }
  function notify(title, message, ton) { var a = api(); if (a) a.toast(title, message, ton); }
  function num(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : (fallback || 0);
  }
  function today() { var a = api(); return a ? a.localDateKey() : new Date().toISOString().slice(0, 10); }
  function makeId(prefix) { var a = api(); return a ? a.Core.makeId(prefix) : prefix + "_" + Date.now().toString(36); }

  function payload() { var a = api(); return (a && a.state.payload) || {}; }

  function ft() {
    var root = payload();
    var data = root.flowertech && typeof root.flowertech === "object" ? root.flowertech : {};
    return {
      offers: Array.isArray(data.offers) ? data.offers : [],
      invoices: Array.isArray(data.invoices) ? data.invoices : [],
      finances: Array.isArray(data.finances) ? data.finances : [],
      notes: Array.isArray(data.notes) ? data.notes : [],
      inquiries: (data.inquiries && typeof data.inquiries === "object") ? data.inquiries : {},
      company: (data.company && typeof data.company === "object") ? data.company : {},
      counters: (data.counters && typeof data.counters === "object") ? data.counters : {}
    };
  }

  function projects() {
    var a = api();
    if (!a) return [];
    return a.collection("projects").filter(function (project) { return project.projectType === "flowertech"; });
  }

  function tasksOf(projectId) {
    var a = api();
    if (!a) return [];
    return a.collection("tasks").filter(function (task) { return task.projectId === projectId; });
  }

  function docs(kind) { return kind === "invoice" ? ft().invoices : ft().offers; }
  function docById(kind, id) {
    return docs(kind).find(function (doc) { return doc.id === id; }) || null;
  }

  function totals(doc) {
    var items = Array.isArray(doc && doc.items) ? doc.items : [];
    var subtotal = items.reduce(function (sum, item) { return sum + num(item.qty) * num(item.price); }, 0);
    var discount = subtotal * (num(doc && doc.discountPercent) / 100);
    var net = subtotal - discount;
    var vat = net * (num(doc && doc.vatRate) / 100);
    return { subtotal: subtotal, discount: discount, net: net, vat: vat, rounded: Math.round((net + vat) * 20) / 20 };
  }

  function money(value) {
    return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(num(value));
  }

  function labelOf(list, value) {
    var hit = list.find(function (entry) { return entry[0] === value; });
    return hit ? hit[1] : (value || "—");
  }

  function addDays(ymd, days) {
    var date = new Date((ymd || today()) + "T12:00:00");
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function nextNumber(kind) {
    var year = new Date().getFullYear();
    var used = docs(kind).map(function (doc) {
      var match = /-(\d{4})-(\d+)$/.exec(String(doc.number || ""));
      return match && Number(match[1]) === year ? Number(match[2]) : 0;
    });
    var highest = used.length ? Math.max.apply(null, used) : 0;
    var counter = num(ft().counters[kind + "_" + year]);
    var next = Math.max(highest, counter) + 1;
    return {
      number: (kind === "invoice" ? "RE-" : "OF-") + year + "-" + String(next).padStart(4, "0"),
      counterKey: kind + "_" + year,
      counterValue: next
    };
  }

  // ── Speichern ueber die bestehende Sync-Transaktion ─────────────────────
  // FlowerTech-Dokumente liegen ausserhalb von entities; sie werden ueber eine
  // Bereichs-Operation (kind "flowertech") in denselben Firebase-Datensatz
  // geschrieben wie alle anderen Tablet-Aenderungen.
  async function saveDoc(kind, doc, numbering) {
    var a = api();
    if (!a) return;
    var operation = a.makeOperation("flowertech", "update", kind === "invoice" ? "invoices" : "offers", doc.id, {
      doc: doc,
      counterKey: numbering ? numbering.counterKey : null,
      counterValue: numbering ? numbering.counterValue : null
    });
    await a.executeOperation(operation);
  }

  async function deleteDoc(kind, id) {
    var a = api();
    if (!a) return;
    await a.executeOperation(a.makeOperation("flowertech", "delete", kind === "invoice" ? "invoices" : "offers", id, {}));
  }

  function blankDoc(kind, projectId) {
    var company = ft().company;
    var project = projectId ? projects().find(function (item) { return item.id === projectId; }) : null;
    var numbering = nextNumber(kind);
    var doc = {
      id: makeId(kind === "invoice" ? "ftinv" : "ftoff"),
      kind: kind,
      number: numbering.number,
      status: "draft",
      projectId: projectId || null,
      client: (project && project.client) || { company: "", name: "", email: "" },
      title: project ? (project.title || "Projekt") : (kind === "invoice" ? "Rechnung" : "Offerte"),
      intro: kind === "invoice"
        ? "Wir erlauben uns, folgende Leistungen in Rechnung zu stellen:"
        : "Gerne unterbreiten wir Ihnen folgende Offerte:",
      outro: kind === "invoice" ? "Zahlbar innert 30 Tagen." : "Wir freuen uns auf die Zusammenarbeit.",
      items: [{ id: makeId("pos"), description: "", qty: 1, unit: "Pauschal", price: 0 }],
      vatRate: num(company.vatRate, VAT_DEFAULT),
      discountPercent: 0,
      currency: "CHF",
      issueDate: today(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: "tablet"
    };
    if (kind === "invoice") {
      doc.dueDate = addDays(today(), num(company.paymentDays, 30));
      doc.qr = null;
      doc.paidAt = null;
    } else {
      doc.validUntil = addDays(today(), 30);
    }
    return { doc: doc, numbering: numbering };
  }

  // ── Formular ────────────────────────────────────────────────────────────
  function itemRows(doc) {
    return (doc.items || []).map(function (item, index) {
      return '<div class="ft-item" data-ft-index="' + index + '">' +
        '<input class="ft-item-desc" data-ft-field="description" value="' + esc(item.description || "") + '" placeholder="Leistung">' +
        '<input type="number" step="0.25" data-ft-field="qty" value="' + esc(String(num(item.qty))) + '" placeholder="Menge">' +
        '<input data-ft-field="unit" value="' + esc(item.unit || "") + '" placeholder="Einheit">' +
        '<input type="number" step="0.05" data-ft-field="price" value="' + esc(String(num(item.price))) + '" placeholder="Ansatz">' +
        '<button class="icon-action" type="button" data-action="ft-item-remove" data-index="' + index + '" aria-label="Position entfernen">×</button>' +
        "</div>";
    }).join("");
  }

  function docSheet(kind, doc, numbering) {
    var a = api();
    if (!a) return;
    ui.draft = JSON.parse(JSON.stringify(doc));
    ui.draft.kind = kind;
    ui.draftNumbering = numbering || null;
    var isInvoice = kind === "invoice";
    var statuses = isInvoice ? INVOICE_STATUS : OFFER_STATUS;
    var client = ui.draft.client || {};
    var sums = totals(ui.draft);

    a.sheet((isInvoice ? "Rechnung " : "Offerte ") + (doc.number || ""),
      '<form data-form="flowertech-doc" data-kind="' + kind + '" data-id="' + esc(doc.id) + '">' +
      '<div class="form-grid">' +
      '<div class="field full"><label>Titel</label><input name="title" value="' + esc(doc.title || "") + '"></div>' +
      '<div class="field"><label>Firma</label><input name="company" value="' + esc(client.company || "") + '"></div>' +
      '<div class="field"><label>Name</label><input name="name" value="' + esc(client.name || "") + '"></div>' +
      '<div class="field"><label>E-Mail</label><input name="email" type="email" value="' + esc(client.email || "") + '"></div>' +
      '<div class="field"><label>Projekt</label><select name="projectId"><option value="">Ohne Projekt</option>' +
        projects().map(function (project) {
          return '<option value="' + esc(project.id) + '"' + (doc.projectId === project.id ? " selected" : "") +
            ">" + esc(project.title || "Projekt") + "</option>";
        }).join("") + "</select></div>" +
      '<div class="field"><label>Status</label><select name="status">' +
        statuses.map(function (entry) {
          return '<option value="' + entry[0] + '"' + (doc.status === entry[0] ? " selected" : "") + ">" + esc(entry[1]) + "</option>";
        }).join("") + "</select></div>" +
      '<div class="field"><label>Datum</label><input name="issueDate" type="date" value="' + esc(doc.issueDate || "") + '"></div>' +
      '<div class="field"><label>' + (isInvoice ? "Faellig am" : "Gueltig bis") + '</label>' +
        '<input name="dueDate" type="date" value="' + esc((isInvoice ? doc.dueDate : doc.validUntil) || "") + '"></div>' +
      '<div class="field"><label>MwSt %</label><input name="vatRate" type="number" step="0.1" value="' + esc(String(num(doc.vatRate, VAT_DEFAULT))) + '"></div>' +
      '<div class="field"><label>Rabatt %</label><input name="discountPercent" type="number" step="1" value="' + esc(String(num(doc.discountPercent))) + '"></div>' +
      '<div class="field full"><label>Einleitung</label><textarea name="intro" rows="2">' + esc(doc.intro || "") + "</textarea></div>" +
      '<div class="field full"><label>Schlusstext</label><textarea name="outro" rows="2">' + esc(doc.outro || "") + "</textarea></div>" +
      "</div>" +
      '<h3 class="ft-sub">Positionen</h3><div id="ftItems">' + itemRows(ui.draft) + "</div>" +
      '<button class="btn small-btn" type="button" data-action="ft-item-add">＋ Position</button>' +
      '<div class="ft-totals" id="ftTotals"><div><span>Zwischentotal</span><strong>' + money(sums.subtotal) + "</strong></div>" +
        "<div><span>MwSt</span><strong>" + money(sums.vat) + "</strong></div>" +
        '<div class="sum"><span>Total</span><strong>' + money(sums.rounded) + "</strong></div></div>" +
      (isInvoice
        ? '<div class="ft-qr">' + (doc.qr && doc.qr.url
            ? '<img src="' + esc(doc.qr.url) + '" alt="QR-Einzahlungsschein"><span class="muted small">QR-Code hinterlegt</span>'
            : '<span class="muted small">Kein QR-Code hinterlegt — der Einzahlungsschein wird in Quantus hochgeladen.</span>') + "</div>"
        : "") +
      '<div class="sheet-foot">' +
      '<button class="btn" type="button" data-action="close-overlay">Abbrechen</button>' +
      (kind === "offer" ? '<button class="btn" type="button" data-action="ft-to-invoice">In Rechnung umwandeln</button>' : "") +
      '<button class="btn danger" type="button" data-action="ft-doc-delete" data-kind="' + kind + '" data-id="' + esc(doc.id) + '">Loeschen</button>' +
      '<button class="btn primary" type="submit">Speichern</button></div></form>', "wide");
  }

  function readDraftItems() {
    if (!ui.draft) return;
    document.querySelectorAll("#ftItems .ft-item").forEach(function (row, index) {
      var item = ui.draft.items[index];
      if (!item) return;
      row.querySelectorAll("[data-ft-field]").forEach(function (input) {
        var field = input.dataset.ftField;
        item[field] = (field === "qty" || field === "price") ? num(input.value) : input.value;
      });
    });
  }

  // ── Ansichten ───────────────────────────────────────────────────────────
  function docRow(kind, doc) {
    var labels = kind === "invoice" ? INVOICE_STATUS : OFFER_STATUS;
    var overdue = kind === "invoice" && doc.status === "sent" && doc.dueDate && doc.dueDate < today();
    var client = [(doc.client || {}).company, (doc.client || {}).name].filter(Boolean).join(" · ") || "Ohne Kunde";
    return '<div class="list-item" data-action="ft-open-doc" data-kind="' + kind + '" data-id="' + esc(doc.id) + '">' +
      '<span class="badge ' + (overdue ? "coral" : "accent") + '">' + esc(overdue ? "Ueberfaellig" : labelOf(labels, doc.status)) + "</span>" +
      '<div class="item-main"><div class="item-title">' + esc(doc.number || "—") + " · " + esc(doc.title || "Ohne Titel") + "</div>" +
      '<div class="item-meta">' + esc(client) + "</div></div><strong>" + money(totals(doc).rounded) + "</strong></div>";
  }

  function projectCard(project) {
    var list = tasksOf(project.id);
    var open = list.filter(function (task) { return task.status !== "done"; }).length;
    var invoiced = docs("invoice").filter(function (doc) { return doc.projectId === project.id; })
      .reduce(function (sum, doc) { return sum + totals(doc).rounded; }, 0);
    return '<article class="entity-card" data-action="ft-open-project" data-id="' + esc(project.id) + '">' +
      '<div class="row-actions"><span class="badge accent">' + esc(labelOf(STAGES, project.pipelineStage || "lead")) + "</span></div>" +
      "<h3>" + esc(project.title || "Projekt") + "</h3><p>" + esc(String(project.description || "Keine Beschreibung").slice(0, 160)) + "</p>" +
      '<div class="card-foot"><span class="muted small">' + open + " / " + list.length + " offen</span>" +
      '<span class="spacer"></span><strong>' + money(invoiced) + "</strong></div></article>";
  }

  function dashboard() {
    var a = api();
    var data = ft();
    var openInvoices = data.invoices.filter(function (invoice) {
      return invoice.status !== "paid" && invoice.status !== "cancelled";
    });
    var openSum = openInvoices.reduce(function (sum, invoice) { return sum + totals(invoice).rounded; }, 0);
    var income = data.finances.filter(function (entry) { return entry.type === "income"; })
      .reduce(function (sum, entry) { return sum + num(entry.amount); }, 0);
    var expense = data.finances.filter(function (entry) { return entry.type === "expense"; })
      .reduce(function (sum, entry) { return sum + num(entry.amount); }, 0);
    var newInquiries = Object.keys(data.inquiries).filter(function (key) {
      var inquiry = data.inquiries[key] || {};
      return !inquiry.status || inquiry.status === "new";
    }).length;

    return '<div class="dashboard-grid">' +
      '<section class="widget span-3"><div class="widget-head"><span class="widget-icon">▧</span><h2>Projekte</h2></div>' +
        '<div class="metric"><strong>' + projects().filter(function (project) {
          return project.status !== "done" && project.status !== "archived";
        }).length + "</strong><small>aktiv</small></div></section>" +
      '<section class="widget span-3"><div class="widget-head"><span class="widget-icon">₣</span><h2>Offen</h2></div>' +
        '<div class="metric"><strong>' + money(openSum) + "</strong><small>Rechnungen</small></div></section>" +
      '<section class="widget span-3"><div class="widget-head"><span class="widget-icon">↔</span><h2>Netto</h2></div>' +
        '<div class="metric"><strong>' + money(income - expense) + "</strong><small>Finanzen</small></div></section>" +
      '<section class="widget span-3"><div class="widget-head"><span class="widget-icon">✉</span><h2>Anfragen</h2></div>' +
        '<div class="metric"><strong>' + newInquiries + "</strong><small>neu</small></div></section>" +
      '<section class="widget span-6"><div class="widget-head"><span class="widget-icon">▧</span><h2>Projekte</h2>' +
        '<button data-action="ft-tab" data-tab="projects">Alle</button></div><div class="item-list">' +
        (projects().slice(0, 6).map(function (project) {
          var open = tasksOf(project.id).filter(function (task) { return task.status !== "done"; }).length;
          return '<div class="list-item" data-action="ft-open-project" data-id="' + esc(project.id) + '">' +
            '<span class="badge accent">' + esc(labelOf(STAGES, project.pipelineStage || "lead")) + "</span>" +
            '<div class="item-main"><div class="item-title">' + esc(project.title || "Projekt") + "</div>" +
            '<div class="item-meta">' + open + " offene Aufgaben</div></div></div>";
        }).join("") || (a ? a.emptyMini("Noch keine FlowerTech-Projekte") : "")) + "</div></section>" +
      '<section class="widget span-6"><div class="widget-head"><span class="widget-icon">₣</span><h2>Letzte Rechnungen</h2>' +
        '<button data-action="ft-tab" data-tab="invoices">Alle</button></div><div class="item-list">' +
        (data.invoices.slice(0, 6).map(function (doc) { return docRow("invoice", doc); }).join("") ||
          (a ? a.emptyMini("Noch keine Rechnungen") : "")) + "</div></section>" +
      "</div>";
  }

  function projectDetail(project) {
    var a = api();
    var list = tasksOf(project.id);
    var offers = docs("offer").filter(function (doc) { return doc.projectId === project.id; });
    var invoices = docs("invoice").filter(function (doc) { return doc.projectId === project.id; });
    return '<div class="row-actions" style="margin-bottom:14px">' +
      '<button class="btn" data-action="ft-close-project">‹ Alle Projekte</button>' +
      STAGES.map(function (stage) {
        return '<button class="chip' + ((project.pipelineStage || "lead") === stage[0] ? " on" : "") +
          '" data-action="ft-set-stage" data-id="' + esc(project.id) + '" data-stage="' + stage[0] + '">' + esc(stage[1]) + "</button>";
      }).join("") + "</div>" +
      (a ? a.viewHeader(project.title || "Projekt", project.description || "FlowerTech-Projekt",
        '<button class="btn" data-action="ft-new-doc" data-kind="offer" data-project="' + esc(project.id) + '">＋ Offerte</button>' +
        '<button class="btn primary" data-action="ft-new-doc" data-kind="invoice" data-project="' + esc(project.id) + '">＋ Rechnung</button>') : "") +
      '<div class="dashboard-grid">' +
      '<section class="widget span-6"><div class="widget-head"><span class="widget-icon">✓</span><h2>Aufgaben</h2>' +
        '<button data-action="new-entity" data-collection="tasks">＋</button></div><div class="item-list">' +
        (list.map(function (task) {
          return '<div class="list-item" data-action="edit-entity" data-collection="tasks" data-id="' + esc(task.id) + '">' +
            '<span class="check">' + (task.status === "done" ? "✓" : "") + "</span>" +
            '<div class="item-main"><div class="item-title">' + esc(task.title || "Aufgabe") + "</div></div></div>";
        }).join("") || (a ? a.emptyMini("Noch keine Aufgaben") : "")) + "</div></section>" +
      '<section class="widget span-6"><div class="widget-head"><span class="widget-icon">◆</span><h2>Offerten</h2></div>' +
        '<div class="item-list">' + (offers.map(function (doc) { return docRow("offer", doc); }).join("") ||
          (a ? a.emptyMini("Noch keine Offerten") : "")) + "</div></section>" +
      '<section class="widget span-12"><div class="widget-head"><span class="widget-icon">₣</span><h2>Rechnungen</h2></div>' +
        '<div class="item-list">' + (invoices.map(function (doc) { return docRow("invoice", doc); }).join("") ||
          (a ? a.emptyMini("Noch keine Rechnungen") : "")) + "</div></section>" +
      "</div>";
  }

  function render() {
    var a = api();
    if (!a) return "";
    var data = ft();
    var tabs = [
      ["dashboard", "Start"], ["projects", "Projekte"], ["offers", "Offerten"],
      ["invoices", "Rechnungen"], ["finances", "Finanzen"], ["inquiries", "Anfragen"]
    ];
    var body = "";

    if (ui.tab === "projects" && ui.projectId) {
      var project = projects().find(function (item) { return item.id === ui.projectId; });
      body = project ? projectDetail(project) : "";
    } else if (ui.tab === "projects") {
      body = '<div class="row-actions" style="margin-bottom:12px">' +
        '<button class="btn primary" data-action="new-entity" data-collection="projects">＋ Projekt</button></div>' +
        '<div class="content-grid">' + (projects().map(projectCard).join("") ||
          a.emptyState("▧", "Noch keine Projekte", "Lege dein erstes FlowerTech-Projekt an.")) + "</div>";
    } else if (ui.tab === "offers" || ui.tab === "invoices") {
      var kind = ui.tab === "invoices" ? "invoice" : "offer";
      var list = docs(kind).slice().sort(function (x, y) {
        return String(y.issueDate || "").localeCompare(String(x.issueDate || ""));
      });
      body = '<div class="row-actions" style="margin-bottom:12px">' +
        '<button class="btn primary" data-action="ft-new-doc" data-kind="' + kind + '">＋ Neu</button></div>' +
        '<section class="widget"><div class="item-list">' + (list.map(function (doc) { return docRow(kind, doc); }).join("") ||
          a.emptyMini("Noch keine Dokumente")) + "</div></section>";
    } else if (ui.tab === "finances") {
      var income = data.finances.filter(function (entry) { return entry.type === "income"; })
        .reduce(function (sum, entry) { return sum + num(entry.amount); }, 0);
      var expense = data.finances.filter(function (entry) { return entry.type === "expense"; })
        .reduce(function (sum, entry) { return sum + num(entry.amount); }, 0);
      body = '<div class="budget-metrics">' +
        '<div class="budget-metric"><small>Einnahmen</small><strong>' + money(income) + "</strong></div>" +
        '<div class="budget-metric"><small>Ausgaben</small><strong>' + money(expense) + "</strong></div>" +
        '<div class="budget-metric"><small>Netto</small><strong>' + money(income - expense) + "</strong></div></div>" +
        '<section class="widget"><div class="item-list">' + (data.finances.map(function (entry) {
          return '<div class="list-item"><span class="badge ' + (entry.type === "income" ? "accent" : "coral") + '">' +
            (entry.type === "income" ? "+" : "−") + '</span><div class="item-main"><div class="item-title">' +
            esc(entry.title || "Buchung") + '</div><div class="item-meta">' + esc(entry.date || "") + "</div></div>" +
            "<strong>" + money(entry.amount) + "</strong></div>";
        }).join("") || a.emptyMini("Noch keine Buchungen")) + "</div></section>";
    } else if (ui.tab === "inquiries") {
      var inquiries = Object.keys(data.inquiries).map(function (key) {
        return Object.assign({ id: key }, data.inquiries[key] || {});
      }).sort(function (x, y) { return String(y.createdAt || "").localeCompare(String(x.createdAt || "")); });
      body = '<section class="widget"><div class="item-list">' + (inquiries.map(function (inquiry) {
        return '<div class="list-item"><span class="badge">' + esc(inquiry.status || "neu") + "</span>" +
          '<div class="item-main"><div class="item-title">' + esc(inquiry.name || inquiry.email || "Anfrage") + "</div>" +
          '<div class="item-meta">' + esc(inquiry.company || "") + " · " +
          esc(String(inquiry.message || "").slice(0, 120)) + "</div></div></div>";
      }).join("") || a.emptyMini("Noch keine Anfragen")) + "</div></section>";
    } else {
      body = dashboard();
    }

    return '<div class="view flowertech-view">' +
      a.viewHeader("FlowerTech", data.company.tagline || "Web-Apps und KI fuer Schweizer KMU",
        '<button class="btn" data-action="ft-new-doc" data-kind="offer">＋ Offerte</button>' +
        '<button class="btn primary" data-action="ft-new-doc" data-kind="invoice">＋ Rechnung</button>') +
      '<div class="chip-row ft-tabs">' + tabs.map(function (tab) {
        return '<button class="chip' + (ui.tab === tab[0] ? " on" : "") + '" data-action="ft-tab" data-tab="' +
          tab[0] + '">' + esc(tab[1]) + "</button>";
      }).join("") + "</div>" + body + "</div>";
  }

  // ── Aktionen ────────────────────────────────────────────────────────────
  async function onAction(action, button) {
    if (action === "ft-tab") { ui.tab = button.dataset.tab; ui.projectId = null; rerender(); return true; }
    if (action === "ft-open-project") { ui.tab = "projects"; ui.projectId = button.dataset.id; rerender(); return true; }
    if (action === "ft-close-project") { ui.projectId = null; rerender(); return true; }

    if (action === "ft-set-stage") {
      var a1 = api();
      await a1.executeOperation(a1.makeOperation("entity", "update", "projects", button.dataset.id, {
        pipelineStage: button.dataset.stage
      }), { silent: true });
      return true;
    }

    if (action === "ft-new-doc") {
      var created = blankDoc(button.dataset.kind, button.dataset.project || null);
      docSheet(button.dataset.kind, created.doc, created.numbering);
      return true;
    }

    if (action === "ft-open-doc") {
      var doc = docById(button.dataset.kind, button.dataset.id);
      if (doc) docSheet(button.dataset.kind, doc, null);
      return true;
    }

    if (action === "ft-item-add") {
      readDraftItems();
      ui.draft.items.push({ id: makeId("pos"), description: "", qty: 1, unit: "Std.", price: 0 });
      var host = document.getElementById("ftItems");
      if (host) host.innerHTML = itemRows(ui.draft);
      return true;
    }

    if (action === "ft-item-remove") {
      readDraftItems();
      ui.draft.items.splice(Number(button.dataset.index), 1);
      var host2 = document.getElementById("ftItems");
      if (host2) host2.innerHTML = itemRows(ui.draft);
      return true;
    }

    if (action === "ft-doc-delete") {
      if (!confirm("Dieses Dokument wirklich loeschen?")) return true;
      await deleteDoc(button.dataset.kind, button.dataset.id);
      var a2 = api();
      if (a2) a2.closeOverlay();
      notify("Geloescht", "Das Dokument wurde entfernt.", "ok");
      return true;
    }

    if (action === "ft-to-invoice") {
      var form = button.closest("form");
      if (!form || !ui.draft) return true;
      readDraftItems();
      var offer = ui.draft;
      var numbering = nextNumber("invoice");
      var invoice = JSON.parse(JSON.stringify(offer));
      invoice.id = makeId("ftinv");
      invoice.kind = "invoice";
      invoice.number = numbering.number;
      invoice.status = "draft";
      invoice.issueDate = today();
      invoice.dueDate = addDays(today(), num(ft().company.paymentDays, 30));
      invoice.validUntil = null;
      invoice.qr = null;
      invoice.paidAt = null;
      invoice.fromOfferId = offer.id;
      invoice.updatedAt = new Date().toISOString();
      await saveDoc("invoice", invoice, numbering);
      offer.invoiceId = invoice.id;
      if (offer.status === "draft" || offer.status === "sent") offer.status = "accepted";
      offer.updatedAt = new Date().toISOString();
      await saveDoc("offer", offer, null);
      var a3 = api();
      if (a3) a3.closeOverlay();
      ui.tab = "invoices";
      notify("Rechnung erstellt", invoice.number, "ok");
      rerender();
      return true;
    }
    return false;
  }

  async function onSubmit(type, form, data) {
    if (type !== "flowertech-doc") return false;
    var kind = form.dataset.kind;
    readDraftItems();
    var doc = ui.draft;
    doc.title = String(data.get("title") || "");
    doc.client = {
      company: String(data.get("company") || ""),
      name: String(data.get("name") || ""),
      email: String(data.get("email") || "")
    };
    doc.projectId = String(data.get("projectId") || "") || null;
    doc.status = String(data.get("status") || doc.status);
    doc.issueDate = String(data.get("issueDate") || doc.issueDate);
    if (kind === "invoice") doc.dueDate = String(data.get("dueDate") || doc.dueDate);
    else doc.validUntil = String(data.get("dueDate") || doc.validUntil);
    doc.vatRate = num(data.get("vatRate"), VAT_DEFAULT);
    doc.discountPercent = num(data.get("discountPercent"));
    doc.intro = String(data.get("intro") || "");
    doc.outro = String(data.get("outro") || "");
    doc.updatedAt = new Date().toISOString();
    await saveDoc(kind, doc, ui.draftNumbering);
    ui.draftNumbering = null;
    var a = api();
    if (a) a.closeOverlay();
    notify("Gespeichert", doc.number || "", "ok");
    rerender();
    return true;
  }

  (window.__quantusTabletModules = window.__quantusTabletModules || []).push({
    key: "flowertech",
    routes: ["flowertech"],
    render: render,
    onAction: onAction,
    onSubmit: onSubmit
  });
})();
