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

AI-Sync-Werkzeuge ohne eigene Tablet-Ansicht (etwa Statistiken, Berichte,
Quantus Drive, DocStudio oder No-Braine) oeffnen als native Modul-Uebersicht.
Von dort startet die Vollversion auf Wunsch ausdruecklich in einem separaten
Fenster – sie uebernimmt nicht mehr die gesamte Tablet-Oberflaeche.

## Tablet-Funktionen

- iPad-artiger Homescreen mit Dashboard, Widgets, App-Raster und Dock
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
- vollstaendiger AI-Sync-App-Katalog mit mehr als 40 Modulen
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

Zusätzlich werden kompatible Entitätsänderungen unter
`polaris/inbox/<type>/<id>` gespiegelt. Die bestehende AI-Sync-App verarbeitet
diese Inbox bereits. Dieses doppelte Netz verhindert, dass eine ältere
Desktop-Speicherung eine Tablet-Änderung dauerhaft verdrängt.

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
