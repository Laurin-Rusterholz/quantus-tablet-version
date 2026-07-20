# Quantus Tablet

Quantus Tablet ist die touchoptimierte, installierbare Tablet-Oberfläche für
AI Sync. Die App verwendet dieselben Quantus-Daten wie die bestehende
Desktop-App und ist als statische PWA für Netlify gebaut.

## Vollstaendiger Funktionsumfang

Die Tablet-App bindet alle produktiven AI-Sync-Module direkt in eine
touchoptimierte Tablet-Huelle ein. Dadurch verwenden Projekte, Aufgaben,
Noteflow, Meetings, Konzeptor, Ziele, Strategien, Programme, Organisationen,
Statistiken, Berichte, Polaris und die weiteren Apps exakt den Funktionsumfang
der Hauptanwendung. Neue Funktionen in AI Sync stehen ohne eine zweite,
abweichende Implementierung auch auf dem Tablet zur Verfuegung.

Der lokale Tablet-Homescreen bleibt als schnelle Tageszentrale bestehen. Von
dort und aus dem App-Katalog oeffnen die vollstaendigen Module innerhalb der
Tablet-App. Jedes Modul kann bei Bedarf auch separat in AI Sync geoeffnet
werden.

## Tablet-Funktionen

- iPad-artiger Homescreen mit Dashboard, Widgets, App-Raster und Dock
- Daily Briefing mit Aufgaben, Terminen und Gewohnheiten
- vollstaendiger AI-Sync-App-Katalog mit mehr als 40 Modulen
- Projekte, Aufgaben, Meetings, Noteflow und Konzeptor in der AI-Sync-Vollversion
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
