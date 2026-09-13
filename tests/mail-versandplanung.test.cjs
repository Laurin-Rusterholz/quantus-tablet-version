/*
 * Ausgehende Mails gehen erst in drei Stunden raus — auch vom Tablet.
 *
 * AUFTRAG (13.09.2026): Was Quantus verschickt, soll standardmaessig drei
 * Stunden liegen bleiben: sichtbar, abbrechbar, notfalls sofort sendbar. Die
 * Tablet-App hatte genau eine Stelle, die unmittelbar verschickte —
 *     public/mail-app.js → POST /users/me/messages/send
 * Ein Timer im Tablet taugt dafuer nicht: das Geraet liegt im Standby, der
 * Tab wird entladen. Geplant, gehalten und gesendet wird serverseitig
 * (/.netlify/functions/mail-queue); hier wird nur geplant, angezeigt,
 * abgebrochen oder ausdruecklich sofort gesendet.
 *
 * GEGENPROBE: Dieselben Pruefungen laufen gegen den Stand vor der Aenderung.
 * Dort muessen sie fehlschlagen — sonst prueft dieser Test nichts.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const wurzel = path.dirname(__dirname);
const BASIS = process.env.MAIL_BASIS_COMMIT || "6309704";
let checks = 0;
const luecken = [];
const ok = (b, t) => { checks++; if (!b) luecken.push(t); };

const PRUEFUNGEN = {
  "die App sendet nicht mehr selbst": (s) => !s.includes('"/users/me/messages/send"'),
  "geplant wird ueber die Server-Warteschlange": (s) =>
    s.includes("/.netlify/functions/mail-queue") && s.includes('queueRpc("plane"'),
  "es gibt einen Ausgang": (s) => s.includes('key: "outbox"') && s.includes("ausgangHtml"),
  "abbrechen und sofort senden sind moeglich": (s) =>
    s.includes("mail-outbox-cancel") && s.includes("mail-outbox-now") &&
    s.includes('"sofort"') && s.includes('"abbrechen"'),
  "die Zeit steht in Europe/Zurich": (s) =>
    s.includes('timeZone: VERSANDZONE') && s.includes('"Europe/Zurich"'),
  "der Knopf sagt, dass er plant": (s) => s.includes("Senden (in 3 h)"),
  "Gmails Geplant-Ansicht wird nicht vorgetaeuscht": (s) => !s.includes("SCHEDULED"),
  "kein Geraetetimer verschickt nebenher": (s) => !/setInterval\([^)]*send/i.test(s),
  /* Ein Versand, dessen Ausgang ungeklaert ist, wird NIE automatisch
     wiederholt — er wird gezeigt und nur von einem Menschen geklaert. */
  "ein ungeklaerter Versand wird gezeigt": (s) => s.includes('"unklar"') && s.includes("Ungeklaert"),
  "geklaert wird nur ausdruecklich": (s) =>
    s.includes('"geklaert-gesendet"') && s.includes('"geklaert-nicht-gesendet"') && s.includes("confirm("),
  /* Der Ausgang ist fail-closed. Ohne Zugangsschluessel gibt der Server nichts
     heraus — das Geraet muss ihn mitschicken und das Fehlen erklaeren. */
  /* Der Ausgang hat einen EIGENEN Schluessel: der gemeinsame SYNC_AUTH_TOKEN
     wuerde auch den Gmail-Proxy und den Kalender verlangen, an die diese App
     keine Kopfzeile schickt. */
  "der Ausgangs-Schluessel wird mitgeschickt": (s) =>
    s.includes("queueAuthHeaders") && !/token\s*[:=]\s*["'][A-Za-z0-9]{6,}/.test(s),
  "der Gmail-Proxy bleibt unangetastet": (s) =>
    !/function rpc\([\s\S]{0,400}?queueAuthHeaders/.test(s),
  "ein fehlender Ausgangs-Schluessel wird erklaert": (s) =>
    s.includes("Ausgang gesperrt") && s.includes("Einstellungen") && s.includes("MAIL_QUEUE_AUTH_TOKEN"),
  "wiederholtes Planen legt keinen zweiten Eintrag an": (s) =>
    s.includes("anfrageSchluessel"),
  /* Der Schluessel gehoert zum Formular, nicht zum Modul. */
  "der Schluessel wird beim Oeffnen des Formulars neu vergeben": (s) =>
    /function composeSheet\(options\)\s*\{[\s\S]{0,200}?ui\.sendeSchluessel = anfrageSchluessel\(\)/.test(s),
};

const jetzt = fs.readFileSync(path.join(wurzel, "public/mail-app.js"), "utf8");
for (const [name, fn] of Object.entries(PRUEFUNGEN)) {
  let r = false; try { r = !!fn(jetzt); } catch (e) { r = false; }
  ok(r, name);
}

let alt = null;
try {
  alt = execFileSync("git", ["show", BASIS + ":public/mail-app.js"], { cwd: wurzel }).toString("utf8");
} catch (e) { console.log("  (Gegenprobe uebersprungen — " + BASIS + " nicht lesbar)"); }
if (alt) {
  const durch = Object.entries(PRUEFUNGEN).filter(([, fn]) => { try { return !fn(alt); } catch (e) { return true; } });
  console.log(`  Gegenprobe ${BASIS}: ${durch.length} von ${Object.keys(PRUEFUNGEN).length} Pruefungen fallen dort durch`);
  durch.forEach(([n]) => console.log("    x " + n));
  const namen = durch.map(([n]) => n);
  ok(namen.includes("die App sendet nicht mehr selbst"), "Gegenprobe: der alte Stand sendet sofort");
  ok(namen.includes("es gibt einen Ausgang"), "Gegenprobe: der alte Stand hat keinen Ausgang");
}

if (luecken.length) {
  console.error("mail versandplanung (Tablet): FEHLER");
  luecken.forEach((l) => console.error("  x " + l));
  process.exit(1);
}
console.log(`mail versandplanung (Tablet): ok (${checks} Pruefungen)`);
