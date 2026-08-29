# Quantus Tablet

Quantus Tablet ist die touchoptimierte, installierbare Tablet-Oberfläche für
AI Sync. Die App verwendet dieselben Quantus-Daten wie die bestehende
Desktop-App und ist als statische PWA für Netlify gebaut.

## Eigenstaendige Tablet-Oberflaeche

Die Tablet-App ist bewusst als eigenstaendige, touchoptimierte Oberflaeche
aufgebaut und bettet die AI-Sync-App nicht mehr in einem iframe ein. Jede App
rendert ihre eigene native Tablet-Ansicht. Dadurch faellt das fremde Tab- und
Hash-System der Hauptanwendung weg: Sobald eine App geoeffnet ist, laesst sich
jederzeit frei zu jeder anderen App wechseln.

Projekte, Aufgaben, Noteflow, Meetings, Kalender, Konzeptor, Ziele, Strategien,
Programme, Organisationen, Personen, Ideen und Entscheidungen sind native
Tablet-Bereiche mit Liste, Suche und Formular. Sie schreiben ueber dieselbe
Firebase-Transaktion wie AI Sync, verwenden also denselben Datenstand.

**Jede App hat eine eigene Tablet-Ansicht.** Es gibt keine Kachel mehr, die
einen in ein anderes Fenster schickt. Was frueher als blosse Modul-Uebersicht
endete, ist heute eine eigenstaendige, bedienbare Ansicht (`native-modules.js`):

| App | Was sie auf dem Tablet kann |
| --- | --- |
| Zeiterfassung | Messung starten und stoppen, Zeit von Hand buchen, Tages- und Wochenbilanz, Zeit je Projekt |
| Auslastung | Last je Tag der Woche aus Faelligkeiten und Terminen, Last je Projekt, Ueberfaelliges |
| Wochenplanung / No-Braine | Sieben-Tage-Tafel, Aufgaben auf einen anderen Tag schieben, direkt in einen Tag eintragen |
| Google Kalender | Agenda der synchronisierten Termine nach Tag |
| Wissensbasis | Notizen, Artikel und Konzepte gemeinsam durchsuchen, als Karteikarte lernen |
| Thesis Studio | Thesen mit Kernfrage, Stand und Text — schreibbar |
| Journal | Eintraege, Briefe an dich selbst (verschlossen bis zum Zustelltag), Gedanken, Handy-Eingang |
| Reflecta | Taeglicher Rueckblick mit fuenf Fragen, fuenf Werten und Gelerntem; Serie und Archiv |
| Nachrichten | `scheduledMessages` — Botschaften an dich selbst planen, lesen, loeschen |
| Updates | Kurzmeldungen anlegen, nach Kategorie sehen, abhaken |
| Massnahmen | Was aus jedem Entscheid folgt; Massnahmen direkt am Entscheid anlegen und abhaken |
| Quantus Drive | Dokumente nach Bereich, Suche, Lesen, Original oeffnen |
| PDF | Alle PDFs aus dem Drive mit voller Betrachter-Bedienung |
| DocStudio | Dokumente aus Vorlagen (Brief, Einladung, Protokoll, Offerte), schreiben und drucken |
| Browser | Startseite mit Adresszeile, Lesezeichen aus der Leseliste, Drive-Dokumente |
| Briefings | Archiv aller Tage: Tagesziele, Notiz, Reflexion — ein Tipp oeffnet den Tag |
| Quantus Projekt | Offene Arbeiten, Ideen und Logbuch der Weiterentwicklung |
| Smarter | Tageslektionen mit Frage, Selbstantwort und Aufdecken |

Die Vollversion von AI Sync bleibt ueber „↗" erreichbar, ist aber nirgends
mehr noetig, um eine App zu benutzen.

## Lernen auf dem Tablet

Vier Lern-Apps waren zwar da, liessen sich aber nicht benutzen — sie zeigten
die Verpackung, nicht den Inhalt. Das ist behoben:

* **BM Vorbereitung** ist eine eigene App (`bm-app.js`) mit sechs Bereichen:
  Uebersicht mit Pruefungs-Countdown und Tagesthemen, Tageslektion mit Theorie
  und Fragen, Themen aus dem Kompendium (6 Faecher, 158 Themen, 1046 Aufgaben),
  Wiederholen als Leitner-Quiz, Merksaetze und Fortschritt. Gelesen wird aus
  `bmpruefung/` und `theorie/kompendium.json`, geschrieben nach
  `bmpruefung/aufg/<key>` — **mit demselben Leitner-Verfahren wie `bm.html`**
  (`LEITNER = [1,2,4,7,14,30]`, `MASTER = 0.6`) und derselben
  Schluesselnormierung. Ein eigener Lernstand waere ein zweiter, den niemand
  mehr zusammenfuehrt.
* **Smarter** zeigt den Lernstoff. Er steht in `documentHtml` (abgeschottet im
  Rahmen, weil das Dokument eigene Stile mitbringt) oder `theoryHtml`. Die
  Fragen lassen sich selbst beantworten — die Antwort geht nach
  `smarter/documents/<tag>/answers/<qid>` —, die Musterantwort deckt man
  danach auf.
* **Leseplan** oeffnet die Leseeinheit wirklich: die Abschnitte aus
  `sektionen[]` in der Reihenfolge von `plan[i].sektionIds`, mit
  Blaettern, Abhaken und der KI-Aufbereitung, falls vorhanden.
* **Journal** stellt Absaetze als Absaetze dar. Der Inhalt ist HTML aus dem
  contenteditable des Journal Booklet; er wird als HTML gelesen und
  bearbeitet, nicht als Text mit sichtbaren Tags.

Das Kompendium (rund 1,8 MB) wird erst geladen, wenn die BM-App offen ist.

## PDF lesen

Der Betrachter war ein blosses `<iframe>`. Auf iPadOS zeigt Safari ein PDF im
iframe nur als **Vorschau**: erste Seite, kein Blaettern, und `#view` wird
ignoriert. Bedienung gab es keine.

Die Seiten werden jetzt selbst gezeichnet (`pdf-viewer.js`, PDF.js auf
Canvas). Damit gehoert die Bedienung der App:

- fortlaufende Seiten, Blaettern und Sprung zu einer Seitenzahl
- Zoom, Einpassen auf die Breite und auf die ganze Seite, Drehen
- Volltextsuche mit Sprung zu den Seiten mit Treffern
- Vollbild, und das Original weiterhin einen Tipp entfernt

Gezeichnet wird nur, was ins Blickfeld kommt — ein Dokument mit dreihundert
Seiten legt das Tablet sonst lahm. Alle Blaetter bekommen aber sofort ihre
geschaetzte Groesse, damit die Rollhoehe stimmt.

**Rueckfall.** PDF.js holt die Datei per `fetch`. Die Dokumente liegen in
Firebase Storage, also auf fremder Herkunft — ohne dort gesetzte CORS-Regel
scheitert das, waehrend ein iframe dasselbe Dokument anstandslos zeigt. Auch
offline fehlt PDF.js (es kommt vom CDN). In beiden Faellen faellt der
Betrachter auf das iframe zurueck **und sagt, warum**. Wer PDF.js selbst
ausliefern will, setzt vor `pdf-viewer.js` ein
`window.QUANTUS_PDFJS_BASE = "/mein/verzeichnis/"`.

## Morgenbriefing

Das Briefing hatte kein Symbol auf dem Homebildschirm: die Route stand in
keiner Seite des Springboards, und `normaliseLayout` haengt unbekannte Apps
hinten an die **letzte** Seite an — es lag also auf Seite vier, hinter allem.
Und es war nur ein zweiter Name fuer „Heute".

Jetzt ist es eine eigene App (`briefing-app.js`) an **erster Stelle** der
ersten Seite: der Tag in einer Zeile, der naechste Termin, die Tagesziele zum
Schreiben, Ueberfaelliges vor Faelligem, Routinen zum Abhaken, ein
Leitgedanke, Gedanken und die Tagesnotiz. Kurz und in der Reihenfolge, in der
man morgens hinsieht.

Gerechnet wird mit `briefingModell()` — demselben Modell wie „Heute" und wie
der Kasten auf dem Homebildschirm. Die vollstaendige Fassung mit allen
siebzehn Abschnitten bleibt unveraendert unter „Heute" und ist von hier einen
Tipp entfernt.

Unter Einstellungen laesst sich waehlen, **womit die App aufstartet**:
Homebildschirm, Morgenbriefing oder Heute. Eine mitgegebene Adresse wird davon
nie ueberschrieben.

## Sticky Boards

Boards haengen in Quantus an einem Element — an einer Aufgabe, einem Projekt,
einer Strategie oder einem Konzept. Auf dem Tablet kam man deshalb nur ueber
dieses Element daran. Jetzt gibt es eine eigene App: **erst alle Boards mit
einer Vorschau aus den echten Notiz-Positionen, dann eines im Vollbild.**

Im Board: Notizen anlegen, am Griff verschieben, direkt beschriften, Farbe
wechseln, loeschen; die Flaeche laesst sich schieben und zoomen. Verbindungen
werden gezeichnet, aber hier nicht bearbeitet — beim Sichern wird immer das
ganze Board geschrieben, damit Verbindungen und Zeichnungen erhalten bleiben.

Jede Notiz hat eine **Griffleiste**. Ohne sie bedeckt das Textfeld die ganze
Notiz, und ein Zug markiert nur Text, statt zu verschieben.

## Homebildschirm anordnen

Der Homebildschirm laesst sich frei einrichten: Der Schalter ▤ oben rechts
(oder „Homescreen anordnen" auf dem App-Bildschirm) schaltet den sichtbaren
Anordnen-Modus ein. Darin gilt:

- **Ziehen** — ein Symbol an seinen neuen Platz ziehen, auch ins Dock.
- **Aufheben und ablegen** — ein Tipp hebt auf, der naechste legt ab. Das
  funktioniert mit Finger, Stift und Maus gleichermassen und braucht keine
  ruhige Hand. Seitlich wischen wechselt dazwischen die Seite.
- **Dock** — bis zu sechs Symbole; das Minuszeichen nimmt eines heraus.
- **Zuruecksetzen** stellt die Voreinstellung wieder her.

Die Anordnung liegt lokal (`quantus-tablet-springboard-v2`). Ein Symbol liegt
immer an genau einem Ort, und eine neu dazugekommene App wird beim Laden
automatisch angehaengt — sie kann nie unsichtbar bleiben.

**Ausserhalb des Anordnen-Modus oeffnet ein Tipp immer die App.** Es gibt
keinen langen Druck und keinen Zeiger-Handler auf den Symbolen; die
Zeiger-Handler fuers Ziehen haengen ausschliesslich waehrend des Modus am
Dokument und werden beim Verlassen — auch beim Wechsel in eine andere
Ansicht — wieder abgemeldet.

## Der App-Bildschirm

„Alle Apps" ist durchsuchbar, zeigt die zuletzt benutzten Apps zuoberst,
gruppiert den Rest und laesst sich zwischen Raster und Liste umschalten. Jede
Kachel traegt ihre lebende Zahl (faellige Aufgaben, faellige Karten, ungelesene
Mails, offene Updates). Der Bildschirm prueft selbst, ob eine App eine native
Ansicht hat, und sagt es, falls einmal eine fehlt.

## Tablet-Funktionen

- iPad-artiger Homescreen mit Dashboard, Widgets, App-Raster und Dock
- frei anzuordnender Homescreen: Ziehen, Aufheben-und-Ablegen, Dock, Zuruecksetzen
- durchsuchbarer App-Bildschirm mit Zuletzt-benutzt, Gruppen und Raster/Liste
- Sticky Boards als eigene App: alle Boards auf einen Blick, eines im Vollbild
- BM Vorbereitung mit Kompendium, Leitner-Wiederholungen und Fortschritt
- eigener PDF-Betrachter mit Blaettern, Zoom, Suche, Drehen und Vollbild
- Morgenbriefing als eigene App; der Startbildschirm ist waehlbar
- globales Tablet Canvas in jeder App und über die Hauptnavigation
- handschriftliche Notizen mit Apple Pencil, Stift, Finger oder Maus
- Stift- und Marker-Modus mit Farb-Schnellwahl und variabler Strichstärke
- native Statistiken und Berichte, direkt aus dem Quantus-Datenstand berechnet
- AI-Sync-kompatible Sticky Boards direkt an Projekten, Aufgaben, Strategien,
  Konzepten und weiteren Elementen
- bidirektionale Verknüpfungen zwischen Quantus-Elementen
- externe Links sowie Dateien aus Quantus Drive
- direkter Firebase-Storage-Upload bis 50 MB mit dem bestehenden
  AI-Sync-Anhangsschema
- Daily Briefing mit Aufgaben, Terminen und Gewohnheiten
- vollstaendiger AI-Sync-App-Katalog mit mehr als 50 Modulen — jedes mit
  eigener Tablet-Ansicht, keines mehr nur als Verweis nach aussen
- Zeiterfassung, Auslastung, Wochenplan, Journal, Reflecta, Nachrichten,
  Updates, Massnahmen, DocStudio, Briefings und Smarter als native Ansichten
- Projekte, Aufgaben, Meetings, Kalender, Noteflow und Konzeptor als native
  Tablet-Bereiche mit gemeinsamer AI-Sync-Datenbasis
- Quantus-Drive-Leseansicht inklusive PDF-/Dokumentvorschau
- Textauswahl mit Übersetzung, Polaris-Übergabe und Karteikarten-Erstellung
- Flashcards und Smarter-Lernstoff
- sichere Budget-Leseansicht
- Split-Screen für zwei Quantus-Bereiche
- Polaris-Schnellbefehle und Übergang zum vollständigen Sprachmodus
- Dark Mode „Schiefer“ und Light Mode „Leinen“
- Offline-Warteschlange und installierbare PWA

## Nahtlose Synchronisation mit AI Sync

Die App verbindet sich mit demselben Firebase-Projekt `jupidu-36804` und liest
den bestehenden Wrapper unter:

```text
appStore/app-data_json
```

Der Knoten enthält das gesamte Quantus-Payload als JSON-String im Feld `data`.
Tablet-Änderungen werden nicht auf Basis einer alten lokalen Kopie
zurückgeschrieben. Jede Änderung läuft als Firebase-Transaktion gegen den
aktuellsten Serverstand. Dabei gilt pro Objekt eine
Last-Write-Wins-Prüfung über `updatedAt`.

Dieser Knoten ist der einzige Schreibweg des Tablets. Es gibt keinen zweiten
Kanal mehr: früher wurde jede Änderung zusätzlich nach
`polaris/inbox/<type>/<id>` gespiegelt — als doppeltes Netz gegen eine ältere
Desktop-Speicherung. Seit der Desktop beim Anmelden nicht mehr blind pusht und
`mergeData` fremde Bereiche erhält, ist dieses Netz überflüssig und war zuletzt
selbst das Risiko: die AI-Sync-App liest `polaris/inbox` als eigenständige
Quelle und legte aus einem Spiegelsatz eine zweite Notiz an.

`polaris/inbox` ist ausschliesslich der Eingang für n8n und den Sprachmodus.
Das Tablet schreibt dort nicht.

Die nativen Modulansichten schreiben ueber dieselbe Transaktion. Fuer Bereiche
ausserhalb von `entities` — `journal.documents`, `journal.selfLetters`,
`journal.topics`, `reflections`, `reviews`, `readingList`, `quickTodos`,
`backgroundDocs` — gibt es dafuer die Operationsart `list`, fuer die laufende
Zeitmessung die Art `timer`. Beide schreiben ausschliesslich in eine weisse
Liste bekannter Pfade; ein freier Pfad aus einer Operation waere ein
Schreibrecht auf den ganzen Datenstand.

Offline ausgeführte Änderungen bleiben lokal in einer Warteschlange und werden
nach Wiederherstellung der Verbindung in derselben Reihenfolge abgeglichen.
Löschungen sind Soft-Deletes und entfernen keine fremden Quantus-Daten.

## Firebase-Anmeldung

`appStore` ist durch Firebase Authentication geschützt. Auf jeder neuen
Deployment-Domain ist deshalb einmalig eine Anmeldung mit demselben
Google-Konto wie in AI Sync nötig.

Nach dem ersten Netlify-Deploy muss die neue Domain in Firebase ergänzt werden:

1. Firebase Console öffnen.
2. Authentication → Settings → Autorisierte Domains.
3. Die Netlify-Domain der Tablet-App hinzufügen.

Danach bleibt die Sitzung im Browser gespeichert.

## Lokale Prüfung

```bash
npm test
python3 -m http.server 8080 --directory public
```

Anschliessend `http://localhost:8080` öffnen. `localhost` ist in Firebase
standardmässig als Auth-Domain zugelassen.

## Deployment

Die Datei `netlify.toml` setzt `public/` als Publish-Verzeichnis. Das Repository
kann deshalb direkt mit Netlify verbunden werden. Es gibt keinen Build-Schritt
und keine Runtime-Abhängigkeiten.

## Sicherheitsgrenzen

- Budgetbuchungen lassen sich auf dem Tablet erfassen und aendern; sie laufen
  ueber dieselbe Entitaets-Operation wie jede andere Sammlung. Konten selbst
  bleiben nur lesbar.
- Passwörter, Tokens und Zahlungsdaten werden nicht über Polaris geändert.
- Externe AI-Sync-Module öffnen sich auf der konfigurierbaren AI-Sync-Adresse.
- Der vollständige App-Blob wird nur innerhalb einer atomaren Firebase-
  Transaktion verändert.
