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

- Budget- und Kontodaten sind in der Tablet-Version nur lesbar.
- Passwörter, Tokens und Zahlungsdaten werden nicht über Polaris geändert.
- Externe AI-Sync-Module öffnen sich auf der konfigurierbaren AI-Sync-Adresse.
- Der vollständige App-Blob wird nur innerhalb einer atomaren Firebase-
  Transaktion verändert.
