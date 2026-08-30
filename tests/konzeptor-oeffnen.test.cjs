// Produktionsbefund (Nutzer, mit Bildschirmfoto): "auf dem tablet kann ich
// die konzepte nicht mal richtig oeffnen, es wird mir nur 1/100 angezeigt".
//
// Ursache, per Playwright nachgestellt (iPad-Ansicht, ein Konzept mit
// vierzehn Absaetzen Artikeltext): .concept-note hatte weder eine
// Textklammer noch eine Hoechsthoehe — anders als .entity-card, das jede
// andere Sammlung benutzt (feste Zeilenklammer, normaler Grid-Fluss). Auf
// dem absolut positionierten Board wuchs eine lange Karte ueber ihre
// 175px-Zeilenhoehe hinaus und ueberlagerte die Karte in der Zeile darunter.
// Getippt wurde dann zufaellig auf das, was gerade obenauf lag. Ausserdem
// gab es ueberhaupt keine Stelle, die den VOLLEN Titel und Inhalt zeigte —
// nur "Bearbeiten" (aendern) und "＋✎ Notiz" (etwas Neues dazu schreiben),
// kein blosses Lesen.
//
// Gemessen (Playwright, iPad-Breite, ein 14-Absatz-Konzept direkt unter drei
// kurzen Konzepten): vor dem Fix waren alle Karten ungeklammert hoch genug,
// um sich zu ueberlappen; nach dem Fix bleibt jede Karte bei maximal 170px
// (< 175px Zeilenabstand), und ein Tipp auf die Karte oeffnet ein Blatt mit
// dem vollstaendigen, ungekuerzten Text.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

let checks = 0;
const ok = (value, message) => { checks++; assert.ok(value, message); };

const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8");

function regel(css, selektor) {
  const rein = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = new RegExp("(?:^|[,}])\\s*" + selektor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}", "m");
  const m = re.exec(rein);
  return m ? m[1] : null;
}
function eig(css, selektor, name) {
  const r = regel(css, selektor);
  if (r == null) return null;
  const m = new RegExp("(?:^|;)\\s*" + name + "\\s*:\\s*([^;]+)", "i").exec(r);
  return m ? m[1].trim() : null;
}
function px(value) { return value == null ? NaN : Number(String(value).replace("px", "").trim()); }

// ── Karten koennen sich nicht mehr ueberlagern ────────────────────────────
{
  const maxHeight = px(eig(styles, ".concept-note", "max-height"));
  ok(maxHeight > 0 && maxHeight < 175, `.concept-note max-height ist ${maxHeight} — muss unter den 175px Zeilenabstand passen`);
  const clamp = eig(styles, ".concept-note p", "-webkit-line-clamp");
  ok(clamp != null && Number(clamp) > 0, "DER BEFUND: .concept-note p klammert den Text nicht — eine lange Karte waechst ueber ihre Zeile hinaus");
  ok(eig(styles, ".concept-note p", "overflow") === "hidden", "die Klammer wirkt ohne overflow:hidden nicht");
  ok(!/touch-action:\s*none/.test(regel(styles, ".concept-note") || ""),
    "touch-action:none blockiert das Scrollen des Boards — es gibt keinen Drag-Handler, der es braeuchte");
}

// ── Eine Karte oeffnet jetzt den vollen Inhalt, nicht nur Bearbeiten/Notiz ─
{
  ok(/data-action="open-concept"/.test(app), "DER BEFUND: die Konzeptkarte hat keine Aktion zum Oeffnen — nur die kleinen Symbole (Notiz, Bearbeiten)");
  ok(/if \(action === "open-concept"\) \{ openConceptDetail\(button\.dataset\.id\); return; \}/.test(app),
    "open-concept ist nicht an openConceptDetail angebunden");
  ok(/function openConceptDetail\(id\)/.test(app), "openConceptDetail existiert nicht");
  const rumpf = app.slice(app.indexOf("function openConceptDetail"), app.indexOf("function openContextNote"));
  ok(/itemText\(item\)/.test(rumpf), "das Detailblatt zeigt nicht den vollstaendigen Inhalt (itemText)");
  ok(!/\.slice\(/.test(rumpf), "DER BEFUND waere sonst nur verschoben: das Detailblatt kuerzt den Text selbst");
}

console.log(`Konzeptor: Karte oeffnet vollstaendig, ueberlagert nicht mehr: ok (${checks} Pruefungen)`);
