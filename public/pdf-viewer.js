/*
 * PDF-BETRACHTER.
 *
 * BEFUND (Nutzer: "pdf reader noch sehr eingeschraenkt"): der Betrachter war
 * ein blosses <iframe src="…#view=FitH">. Das hat drei Folgen, und alle drei
 * treffen genau das Geraet, um das es hier geht:
 *
 *   1. Auf iPadOS rendert Safari ein PDF im iframe nur als VORSCHAU — man
 *      sieht die erste Seite und kommt nicht weiter. #view, #page und #zoom
 *      werden dort ignoriert.
 *   2. Es gab keinerlei Bedienung: keine Seitenzahl, kein Blaettern, kein
 *      Zoom, keine Suche, kein Drehen.
 *   3. Der Betrachter des Browsers laesst sich nicht ins Aussehen der App
 *      einfuegen — auf dem dunklen Tablet klaffte ein weisser Kasten.
 *
 * Dieser Betrachter rendert die Seiten selbst mit PDF.js auf Canvas. Damit
 * gehoert die Bedienung uns: fortlaufende Seiten, Sprung zu einer Seite,
 * Zoom mit Einpassen auf Breite und Seite, Volltextsuche, Drehen, Vollbild.
 *
 * RUECKFALL, und der ist wichtig: PDF.js holt die Datei per fetch. Die
 * Dokumente liegen in Firebase Storage, also auf einer FREMDEN Herkunft —
 * ohne dort gesetzte CORS-Regel scheitert dieser Abruf, waehrend ein iframe
 * dasselbe Dokument anstandslos anzeigt. Auch offline ist PDF.js nicht da
 * (es kommt vom CDN und liegt nicht im Service-Worker-Cache). In beiden
 * Faellen faellt der Betrachter auf das iframe zurueck und SAGT, warum —
 * ein stummer leerer Kasten waere das Schlimmste.
 */
(function () {
  "use strict";

  // Feste Fassung: eine bewegliche waere ein Update, das man nicht kommen
  // sieht. 3.11.174 ist die letzte Fassung mit klassischem UMD-Bundle, das
  // ohne Modul-Lader auskommt.
  var PDFJS_VERSION = "3.11.174";
  /*
   * Woher PDF.js kommt. Vorgabe ist das CDN; wer es selbst ausliefern will
   * oder in einem Netz sitzt, das fremde CDNs blockt, setzt vor dem Laden
   * dieser Datei window.QUANTUS_PDFJS_BASE auf ein eigenes Verzeichnis
   * (mit pdf.min.js und pdf.worker.min.js darin).
   */
  var PDFJS_BASE = window.QUANTUS_PDFJS_BASE ||
    ("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/" + PDFJS_VERSION + "/");

  var ladeVersprechen = null;

  function ladePdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (ladeVersprechen) return ladeVersprechen;
    ladeVersprechen = new Promise(function (fertig, fehler) {
      var skript = document.createElement("script");
      skript.src = PDFJS_BASE + "pdf.min.js";
      skript.onload = function () {
        if (!window.pdfjsLib) { fehler(new Error("PDF.js hat sich nicht angemeldet")); return; }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + "pdf.worker.min.js";
        fertig(window.pdfjsLib);
      };
      skript.onerror = function () { fehler(new Error("PDF.js liess sich nicht laden")); };
      document.head.appendChild(skript);
    });
    ladeVersprechen = ladeVersprechen.catch(function (fehler) {
      ladeVersprechen = null;   // ein spaeterer Versuch darf es nochmals probieren
      throw fehler;
    });
    return ladeVersprechen;
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // ── Zustand eines geoeffneten Dokuments ──────────────────────────────────
  var aktiv = null;
  /*
   * BEFUND (gemessen, Chromium): Blaettern, Zoom, Drehen und Suche taten
   * nichts — obwohl die Seiten sichtbar waren und der Klick ankam.
   *
   * Ursache war ein Wettlauf. Jedes render() ersetzt das Innere von #main,
   * der Behaelter ist damit ein NEUER Knoten, und der Betrachter wird erneut
   * geoeffnet. Laedt der zweite Lauf schneller als der erste, setzt danach
   * der erste seinen Zustand als `aktiv` — mit Verweisen in einen Baum, den
   * niemand mehr sieht. Sichtbar war Lauf zwei, bedient wurde Lauf eins:
   * scrollIntoView und jede Aenderung liefen ins Abseits.
   *
   * Deshalb traegt jeder Lauf eine Nummer. Nach dem Laden gilt er nur noch,
   * wenn er der juengste ist UND sein Behaelter noch im Dokument haengt.
   */
  var laufNummer = 0;

  function aufraeumen() {
    if (!aktiv) return;
    if (aktiv.beobachter) aktiv.beobachter.disconnect();
    if (aktiv.dokument && aktiv.dokument.destroy) {
      try { aktiv.dokument.destroy(); } catch (_) {}
    }
    aktiv = null;
  }

  function huelle(name, url, inhalt, hinweis) {
    return '<div class="pdfv">' +
      '<div class="pdfv-leiste">' +
        '<div class="pdfv-gruppe">' +
          '<button class="pdfv-knopf" data-pdfv="prev" aria-label="Vorherige Seite">‹</button>' +
          '<span class="pdfv-seite"><input class="pdfv-seitenfeld" data-pdfv="seitenfeld" value="1" ' +
            'inputmode="numeric" aria-label="Seite"><span data-pdfv="seitenzahl">/ ?</span></span>' +
          '<button class="pdfv-knopf" data-pdfv="next" aria-label="Nächste Seite">›</button>' +
        "</div>" +
        '<div class="pdfv-gruppe">' +
          '<button class="pdfv-knopf" data-pdfv="zoom-aus" aria-label="Kleiner">−</button>' +
          '<span class="pdfv-zoomwert" data-pdfv="zoomwert">100%</span>' +
          '<button class="pdfv-knopf" data-pdfv="zoom-ein" aria-label="Grösser">＋</button>' +
          '<button class="pdfv-knopf" data-pdfv="fit-breite" title="Auf Breite einpassen">↔</button>' +
          '<button class="pdfv-knopf" data-pdfv="fit-seite" title="Ganze Seite">▭</button>' +
          '<button class="pdfv-knopf" data-pdfv="drehen" title="Drehen">↻</button>' +
        "</div>" +
        '<div class="pdfv-gruppe pdfv-suche">' +
          '<input class="pdfv-suchfeld" data-pdfv="suchfeld" placeholder="Im Dokument suchen" aria-label="Im Dokument suchen">' +
          '<span class="pdfv-treffer" data-pdfv="treffer"></span>' +
          '<button class="pdfv-knopf" data-pdfv="suche-zurueck" aria-label="Vorheriger Treffer">‹</button>' +
          '<button class="pdfv-knopf" data-pdfv="suche-vor" aria-label="Nächster Treffer">›</button>' +
        "</div>" +
        '<div class="pdfv-gruppe pdfv-rechts">' +
          '<button class="pdfv-knopf" data-pdfv="vollbild" title="Vollbild">⛶</button>' +
          (url ? '<button class="pdfv-knopf" data-action="external-url" data-url="' + esc(url) +
            '" title="Original öffnen">↗</button>' : "") +
        "</div>" +
      "</div>" +
      (hinweis ? '<div class="pdfv-hinweis">' + hinweis + "</div>" : "") +
      '<div class="pdfv-seiten" data-pdfv="seiten">' + inhalt + "</div></div>";
  }

  // Der Rueckfall. Er sagt, WARUM er da ist — sonst haelt man den fehlenden
  // Betrachter fuer einen Fehler der App.
  function rueckfall(behaelter, name, url, grund) {
    behaelter.innerHTML =
      '<div class="pdfv pdfv-fallback">' +
        '<div class="pdfv-leiste">' +
          '<strong class="pdfv-titel">' + esc(name) + "</strong>" +
          '<div class="pdfv-gruppe pdfv-rechts">' +
            '<button class="pdfv-knopf" data-pdfv="vollbild" title="Vollbild">⛶</button>' +
            (url ? '<button class="pdfv-knopf" data-action="external-url" data-url="' + esc(url) +
              '" title="Original öffnen">↗</button>' : "") +
          "</div></div>" +
        '<div class="pdfv-hinweis">' + esc(grund) +
          " Das Dokument wird deshalb im Betrachter des Browsers gezeigt — dort gibt es keine Suche und keine Seitenwahl." +
        "</div>" +
        '<div class="pdfv-iframe-huelle"><iframe title="' + esc(name) + '" src="' + esc(url) +
          '" allowfullscreen></iframe></div>' +
      "</div>";
  }

  // ── Rendern ──────────────────────────────────────────────────────────────
  function seitenBreite(behaelter) {
    var flaeche = behaelter.querySelector('[data-pdfv="seiten"]');
    return Math.max(240, (flaeche ? flaeche.clientWidth : behaelter.clientWidth) - 32);
  }

  function skalierungFuer(zustand, seite) {
    var basis = seite.getViewport({ scale: 1, rotation: zustand.drehung });
    if (zustand.modus === "breite") return seitenBreite(zustand.behaelter) / basis.width;
    if (zustand.modus === "seite") {
      var flaeche = zustand.behaelter.querySelector('[data-pdfv="seiten"]');
      var hoehe = Math.max(240, (flaeche ? flaeche.clientHeight : 600) - 32);
      return Math.min(seitenBreite(zustand.behaelter) / basis.width, hoehe / basis.height);
    }
    return zustand.zoom;
  }

  function zeichneSeite(zustand, nummer) {
    var eintrag = zustand.seiten[nummer - 1];
    if (!eintrag || eintrag.laeuft) return;
    eintrag.laeuft = true;
    zustand.dokument.getPage(nummer).then(function (seite) {
      var skala = skalierungFuer(zustand, seite);
      // Den tatsaechlich gezeichneten Massstab merken. Ohne ihn beginnt der
      // Zoom beim Wechsel aus dem Einpassen wieder bei 100 % der
      // Originalgroesse — die Seite springt dann kleiner, statt groesser zu
      // werden, obwohl man auf ＋ getippt hat.
      zustand.effektiveSkala = skala;
      var ansicht = seite.getViewport({ scale: skala, rotation: zustand.drehung });
      // Auf einem Tablet mit doppelter Punktdichte waere eine Seite in
      // einfacher Aufloesung sichtbar unscharf.
      var dichte = Math.min(window.devicePixelRatio || 1, 2);
      var leinwand = eintrag.knoten.querySelector("canvas");
      leinwand.width = Math.floor(ansicht.width * dichte);
      leinwand.height = Math.floor(ansicht.height * dichte);
      leinwand.style.width = Math.floor(ansicht.width) + "px";
      leinwand.style.height = Math.floor(ansicht.height) + "px";
      eintrag.knoten.style.width = Math.floor(ansicht.width) + "px";
      eintrag.knoten.style.height = Math.floor(ansicht.height) + "px";
      var kontext = leinwand.getContext("2d");
      kontext.setTransform(dichte, 0, 0, dichte, 0, 0);
      return seite.render({ canvasContext: kontext, viewport: ansicht }).promise.then(function () {
        eintrag.gezeichnet = true;
        eintrag.laeuft = false;
      });
    }).catch(function () { eintrag.laeuft = false; });
  }

  // Nur zeichnen, was in die Naehe des Blickfelds kommt. Ein Dokument mit
  // 300 Seiten auf einmal zu rendern legt das Tablet lahm.
  function beobachte(zustand) {
    if (zustand.beobachter) zustand.beobachter.disconnect();
    var flaeche = zustand.behaelter.querySelector('[data-pdfv="seiten"]');
    zustand.beobachter = new IntersectionObserver(function (eintraege) {
      eintraege.forEach(function (eintrag) {
        if (!eintrag.isIntersecting) return;
        var nummer = Number(eintrag.target.dataset.pdfvSeite);
        if (!zustand.seiten[nummer - 1].gezeichnet) zeichneSeite(zustand, nummer);
      });
    }, { root: flaeche, rootMargin: "600px 0px" });
    zustand.seiten.forEach(function (eintrag) { zustand.beobachter.observe(eintrag.knoten); });
  }

  /*
   * Geschaetzte Groesse einer noch nicht gezeichneten Seite.
   *
   * Gezeichnet wird nur, was ins Blickfeld kommt — sonst legt ein Dokument
   * mit dreihundert Seiten das Tablet lahm. Nach einer Aenderung von Zoom
   * oder Drehung behielten die uebrigen Seiten aber ihre ALTE Groesse: die
   * Rollhoehe war dann eine Mischung aus zwei Massstaeben, und beim Scrollen
   * sprang der Inhalt, sobald eine Seite nachgezeichnet wurde.
   *
   * Alle Blaetter bekommen deshalb sofort die geschaetzte Groesse — aus dem
   * Mass der ersten Seite, das fuer nahezu jedes Dokument fuer alle gilt.
   * Beim Zeichnen wird sie durch das echte Mass ersetzt.
   */
  function schaetzeBlattgroesse(zustand) {
    var basis = zustand.basis;
    if (!basis) return null;
    var quer = zustand.drehung === 90 || zustand.drehung === 270;
    var breite = quer ? basis.height : basis.width;
    var hoehe = quer ? basis.width : basis.height;
    var skala;
    if (zustand.modus === "breite") skala = seitenBreite(zustand.behaelter) / breite;
    else if (zustand.modus === "seite") {
      var flaeche = zustand.behaelter.querySelector('[data-pdfv="seiten"]');
      var platz = Math.max(240, (flaeche ? flaeche.clientHeight : 600) - 32);
      skala = Math.min(seitenBreite(zustand.behaelter) / breite, platz / hoehe);
    } else skala = zustand.zoom;
    return { width: Math.floor(breite * skala), height: Math.floor(hoehe * skala) };
  }

  function neuZeichnen(zustand) {
    var mass = schaetzeBlattgroesse(zustand);
    zustand.seiten.forEach(function (eintrag) {
      eintrag.gezeichnet = false;
      eintrag.laeuft = false;
      if (mass) {
        eintrag.knoten.style.width = mass.width + "px";
        eintrag.knoten.style.height = mass.height + "px";
      }
    });
    beobachte(zustand);
    // Die gerade sichtbare Seite sofort, der Rest kommt beim Scrollen.
    zeichneSeite(zustand, zustand.seite);
    zoomAnzeigen(zustand);
  }

  function zoomAnzeigen(zustand) {
    var feld = zustand.behaelter.querySelector('[data-pdfv="zoomwert"]');
    if (!feld) return;
    if (zustand.modus === "breite") { feld.textContent = "Breite"; return; }
    if (zustand.modus === "seite") { feld.textContent = "Seite"; return; }
    feld.textContent = Math.round(zustand.zoom * 100) + "%";
  }

  function zeigeSeite(zustand, nummer) {
    var ziel = Math.max(1, Math.min(zustand.seiten.length, Number(nummer) || 1));
    zustand.seite = ziel;
    var eintrag = zustand.seiten[ziel - 1];
    if (eintrag) {
      /*
       * Ein Sprung auf eine Seite ist SOFORT, nicht weich. Weiches Rollen
       * laeuft ueber mehrere hundert Millisekunden — und waehrenddessen
       * bekommen Seiten, die neu ins Blickfeld kommen, ihre echte Groesse.
       * Das verschiebt das Ziel unter dem laufenden Rollen weg, und man
       * landet eine Seite daneben.
       */
      var flaeche = zustand.behaelter.querySelector('[data-pdfv="seiten"]');
      if (flaeche) flaeche.scrollTop = eintrag.knoten.offsetTop;
      else eintrag.knoten.scrollIntoView({ block: "start" });
    }
    var feld = zustand.behaelter.querySelector('[data-pdfv="seitenfeld"]');
    if (feld && document.activeElement !== feld) feld.value = String(ziel);
    if (eintrag && !eintrag.gezeichnet) zeichneSeite(zustand, ziel);
  }

  // ── Suche ────────────────────────────────────────────────────────────────
  // Gesucht wird im Text der Seiten. Angezeigt wird, auf welchen Seiten etwas
  // steht — nicht die genaue Stelle. Das ist ehrlicher als eine Markierung,
  // die bei umbrochenen Woertern doch danebenliegt.
  function suche(zustand, begriff) {
    var text = String(begriff || "").trim().toLowerCase();
    var anzeige = zustand.behaelter.querySelector('[data-pdfv="treffer"]');
    if (!text) {
      zustand.treffer = [];
      zustand.trefferIndex = 0;
      if (anzeige) anzeige.textContent = "";
      return Promise.resolve();
    }
    if (anzeige) anzeige.textContent = "sucht …";
    var seitenText = zustand.seitenText
      ? Promise.resolve(zustand.seitenText)
      : Promise.all(zustand.seiten.map(function (_, index) {
          return zustand.dokument.getPage(index + 1)
            .then(function (seite) { return seite.getTextContent(); })
            .then(function (inhalt) {
              return inhalt.items.map(function (posten) { return posten.str; }).join(" ").toLowerCase();
            })
            .catch(function () { return ""; });
        })).then(function (liste) { zustand.seitenText = liste; return liste; });

    return seitenText.then(function (liste) {
      zustand.treffer = [];
      liste.forEach(function (inhalt, index) {
        if (inhalt.indexOf(text) >= 0) zustand.treffer.push(index + 1);
      });
      zustand.trefferIndex = 0;
      if (anzeige) {
        anzeige.textContent = zustand.treffer.length
          ? "1/" + zustand.treffer.length + " Seiten"
          : "nichts gefunden";
      }
      if (zustand.treffer.length) zeigeSeite(zustand, zustand.treffer[0]);
    });
  }

  function trefferWechseln(zustand, schritt) {
    if (!zustand.treffer || !zustand.treffer.length) return;
    zustand.trefferIndex = (zustand.trefferIndex + schritt + zustand.treffer.length) % zustand.treffer.length;
    var anzeige = zustand.behaelter.querySelector('[data-pdfv="treffer"]');
    if (anzeige) anzeige.textContent = (zustand.trefferIndex + 1) + "/" + zustand.treffer.length + " Seiten";
    zeigeSeite(zustand, zustand.treffer[zustand.trefferIndex]);
  }

  // ── Oeffnen ──────────────────────────────────────────────────────────────
  function oeffne(behaelter, doku) {
    if (!behaelter) return;
    aufraeumen();
    var name = doku.name || "Dokument";
    var url = doku.url || "";
    if (!url) {
      behaelter.innerHTML = '<div class="pdfv-leer">Für dieses Dokument ist keine Datei hinterlegt.</div>';
      return;
    }

    behaelter.innerHTML = huelle(name, url, '<div class="pdfv-laedt">Dokument wird geladen …</div>', "");

    laufNummer += 1;
    var meinLauf = laufNummer;
    var nochGueltig = function () {
      return meinLauf === laufNummer && behaelter.isConnected !== false;
    };

    ladePdfJs()
      .then(function (pdfjsLib) {
        return pdfjsLib.getDocument({ url: url, withCredentials: false }).promise;
      })
      .then(function (dokument) {
        if (!nochGueltig()) {
          // Ein neuerer Lauf hat uebernommen — dieses Dokument samt Arbeiter
          // sofort freigeben, sonst bleibt es im Speicher stehen.
          if (dokument && dokument.destroy) { try { dokument.destroy(); } catch (_) {} }
          return;
        }
        var flaeche = behaelter.querySelector('[data-pdfv="seiten"]');
        var zustand = {
          behaelter: behaelter, dokument: dokument, seiten: [], seite: 1,
          zoom: 1, modus: "breite", drehung: 0, treffer: [], trefferIndex: 0,
          seitenText: null, beobachter: null
        };
        aktiv = zustand;

        var teile = [];
        for (var i = 1; i <= dokument.numPages; i += 1) {
          teile.push('<div class="pdfv-seiteblatt" data-pdfv-seite="' + i + '"><canvas></canvas>' +
            '<span class="pdfv-seiteblatt-nr">' + i + "</span></div>");
        }
        flaeche.innerHTML = teile.join("");
        zustand.seiten = Array.prototype.map.call(flaeche.querySelectorAll(".pdfv-seiteblatt"), function (knoten) {
          return { knoten: knoten, gezeichnet: false, laeuft: false };
        });

        var zahl = behaelter.querySelector('[data-pdfv="seitenzahl"]');
        if (zahl) zahl.textContent = "/ " + dokument.numPages;

        // Das Mass der ersten Seite als Schaetzung fuer alle. Jede Seite
        // einzeln zu messen waere bei dreihundert Seiten dreihundert
        // Anfragen, bevor ueberhaupt etwas zu sehen ist.
        dokument.getPage(1).then(function (erste) {
          if (!nochGueltig()) return;
          var basis = erste.getViewport({ scale: 1, rotation: 0 });
          zustand.basis = { width: basis.width, height: basis.height };
          neuZeichnen(zustand);
        }).catch(function () { neuZeichnen(zustand); });

        // Beim Scrollen die Seitenzahl mitfuehren.
        flaeche.addEventListener("scroll", function () {
          clearTimeout(zustand.scrollTimer);
          zustand.scrollTimer = setTimeout(function () {
            var mitte = flaeche.scrollTop + flaeche.clientHeight / 3;
            var gefunden = 1;
            zustand.seiten.forEach(function (eintrag, index) {
              if (eintrag.knoten.offsetTop <= mitte) gefunden = index + 1;
            });
            zustand.seite = gefunden;
            var feld = behaelter.querySelector('[data-pdfv="seitenfeld"]');
            if (feld && document.activeElement !== feld) feld.value = String(gefunden);
          }, 90);
        }, { passive: true });
      })
      .catch(function (fehler) {
        if (!nochGueltig()) return;
        /*
         * Zwei Gruende, und sie brauchen verschiedene Worte: ohne Netz fehlt
         * PDF.js selbst; steht es, scheitert oft der Abruf der Datei, weil
         * Firebase Storage keine CORS-Regel fuer diese Herkunft hat.
         */
        var grund = /liess sich nicht laden|angemeldet/.test(fehler.message)
          ? "Der Betrachter ist offline nicht verfügbar."
          : "Das Dokument liess sich nicht direkt lesen (die Ablage erlaubt den Zugriff von dieser Adresse nicht).";
        rueckfall(behaelter, name, url, grund);
      });
  }

  // ── Bedienung ────────────────────────────────────────────────────────────
  document.addEventListener("click", function (event) {
    var knopf = event.target.closest ? event.target.closest("[data-pdfv]") : null;
    if (!knopf) return;
    var was = knopf.dataset.pdfv;

    if (was === "vollbild") {
      var rahmen = knopf.closest(".pdfv");
      if (!rahmen) return;
      if (document.fullscreenElement) { document.exitFullscreen(); return; }
      (rahmen.requestFullscreen || rahmen.webkitRequestFullscreen || function () {}).call(rahmen);
      return;
    }
    if (!aktiv) return;
    if (was === "prev") { zeigeSeite(aktiv, aktiv.seite - 1); return; }
    if (was === "next") { zeigeSeite(aktiv, aktiv.seite + 1); return; }
    if (was === "zoom-ein" || was === "zoom-aus") {
      if (aktiv.modus !== "frei") {
        // Vom Einpassen ins freie Zoomen: beim zuletzt GEZEICHNETEN Massstab
        // beginnen, damit die Seite beim ersten Tipp nicht springt.
        aktiv.zoom = Number(aktiv.effektiveSkala) > 0 ? aktiv.effektiveSkala : 1;
        aktiv.modus = "frei";
      }
      aktiv.zoom = Math.max(0.3, Math.min(4, aktiv.zoom + (was === "zoom-ein" ? 0.2 : -0.2)));
      neuZeichnen(aktiv);
      return;
    }
    if (was === "fit-breite") { aktiv.modus = "breite"; neuZeichnen(aktiv); return; }
    if (was === "fit-seite") { aktiv.modus = "seite"; neuZeichnen(aktiv); return; }
    if (was === "drehen") { aktiv.drehung = (aktiv.drehung + 90) % 360; neuZeichnen(aktiv); return; }
    if (was === "suche-vor") { trefferWechseln(aktiv, 1); return; }
    if (was === "suche-zurueck") { trefferWechseln(aktiv, -1); return; }
  });

  var sucheTimer = null;
  document.addEventListener("input", function (event) {
    var feld = event.target.closest ? event.target.closest('[data-pdfv="suchfeld"]') : null;
    if (feld && aktiv) {
      clearTimeout(sucheTimer);
      var wert = feld.value;
      sucheTimer = setTimeout(function () { suche(aktiv, wert); }, 320);
      return;
    }
    var seitenfeld = event.target.closest ? event.target.closest('[data-pdfv="seitenfeld"]') : null;
    if (seitenfeld && aktiv) {
      var nummer = Number(seitenfeld.value);
      if (nummer >= 1 && nummer <= aktiv.seiten.length) zeigeSeite(aktiv, nummer);
    }
  });

  // Beim Drehen des Tablets oder beim Wechsel in den Vollbildmodus aendert
  // sich die Breite — im Einpass-Modus muss die Seite dann neu gezeichnet
  // werden, sonst steht sie zu klein oder ragt hinaus.
  var groesseTimer = null;
  window.addEventListener("resize", function () {
    if (!aktiv || aktiv.modus === "frei") return;
    clearTimeout(groesseTimer);
    groesseTimer = setTimeout(function () { if (aktiv) neuZeichnen(aktiv); }, 180);
  });

  window.QuantusPdfViewer = {
    /* Bindet den Betrachter in einen Behaelter. { url, name } */
    open: oeffne,
    close: aufraeumen,
    /* Die Huelle als Zeichenkette — fuer Ansichten, die ihr HTML selbst bauen
       und den Betrachter danach einhaengen. */
    placeholder: function (name) {
      return '<div class="pdfv-platz" data-pdfv-platz="1">' +
        '<div class="pdfv-laedt">' + esc(name || "Dokument") + " wird geöffnet …</div></div>";
    },
    version: PDFJS_VERSION
  };
})();
