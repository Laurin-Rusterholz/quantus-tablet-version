# 100 Verbesserungen fuer Produktivitaet und Speicherung

Teil 1 von 3: **quantus-tablet-version** — Verbesserungen 1–50.
(51–80 in `journal-mobile`, 81–100 in `ai-sync`.)

## Sync-Core (public/sync-core.js)

1. `clone()` nutzt `structuredClone`, wenn verfuegbar — schnelleres Kopieren grosser Datenstaende.
2. Neue Validierung `isValidOperation()` — kaputte Operationen koennen die Warteschlange nicht mehr blockieren.
3. Neue Warteschlangen-Verdichtung `compactQueue()` — mehrere Aenderungen am selben Element schrumpfen zu einer einzigen Operation.
4. `compactQueue()`: ein Delete ersetzt alle vorherigen Schritte desselben Elements — weniger Firebase-Transaktionen.
5. `compactQueue()`: ungueltige Eintraege werden automatisch aussortiert.
6. Neuer Backup-Merge `mergePayloads()` — feldweiser Zusammenzug zweier Datenstaende, pro Element gewinnt die neuere Version.
7. Routinen, Karteikarten und Decks werden beim Merge per ID zusammengefuehrt statt ueberschrieben.
8. Review-Logs werden beim Merge dedupliziert — keine doppelten Lernprotokolle.
9. Neue Groessenschaetzung `estimateSize()` (UTF-8-genau) fuer Speicher-Limits und Anzeigen.
10. Neue Kennzahlen `payloadStats()` — aktive Elemente pro Sammlung, Kartenzahl, Datenstand-Groesse.

## Speicherung (public/app.js)

11. Lokaler Daten-Snapshot: der letzte bekannte Datenstand wird in localStorage abgelegt.
12. Sofortstart: beim Boot wird der Snapshot geladen, bevor Firebase antwortet — echte Inhalte auch offline.
13. Snapshot-Speicherung ist gebuendelt (1,5 s Debounce) — kein Schreiben bei jedem Sync-Tick.
14. Snapshot-Groessenlimit (3,5 MB) schuetzt den localStorage vor Ueberlauf.
15. `saveJson()` mit Quota-Notfallpfad: bei vollem Speicher wird der Snapshot geopfert, damit Warteschlange und Einstellungen sicher bleiben.
16. Offline-Warteschlange wird beim Start kompaktiert und bereinigt.
17. Warteschlange wird bei jedem neuen Eintrag verdichtet — sie waechst nicht mehr linear mit jedem Tipp.
18. Obergrenze von 500 vorgemerkten Aenderungen mit Warnhinweis statt stillem Ueberlauf.
19. Kompaktierung unmittelbar vor jedem Sync-Flush — minimale Anzahl Transaktionen.
20. Periodischer Flush-Timer (alle 20 s): haengengebliebene Aenderungen werden automatisch nachgeschoben.
21. Snapshot- und Entwurfs-Sicherung bei `pagehide` — beim Verlassen der Seite geht nichts verloren.
22. Entwurfs-Autosave: unfertige Formulareingaben werden laufend lokal gespeichert.
23. Entwurfs-Wiederherstellung: nach Absturz oder versehentlichem Schliessen steht der Entwurf wieder im Formular.
24. Entwuerfe werden nach erfolgreichem Speichern automatisch geraeumt.
25. Backup-Export: kompletter Datenstand inkl. Offline-Warteschlange als JSON-Download.
26. Backup-Import: Datei einspielen mit feldweisem Merge — nichts wird ueberschrieben, die neuere Version gewinnt.
27. Import uebernimmt auch vorgemerkte Operationen aus dem Backup und synchronisiert sie nach.
28. Speicher-Anzeige in den Einstellungen: aktive Elemente, Datenstand-Groesse, Snapshot-Alter, Karten/Routinen.
29. „Lokalen Cache leeren“: Snapshot und Entwuerfe zuruecksetzen, ohne Warteschlange oder Einstellungen zu verlieren.
30. Offline-Erkennung beim Start: klare Meldung „lokaler Datenstand aktiv“ statt endlosem Laden.

## Produktivitaet (public/app.js)

31. Quick-Add-Zeile in jeder Sammlung: Titel eintippen, Enter — Eintrag erstellt, ohne Formular.
32. Status-Filterchips (Alle / Offen / In Arbeit / Erledigt) mit Live-Zaehlern in jeder Sammlung.
33. Sortierung pro Sammlung: Neueste zuerst, A–Z oder nach Faelligkeit.
34. Eintraege anpinnen: Favoriten stehen immer zuoberst (lokal gespeichert).
35. Eintraege duplizieren mit einem Klick („… (Kopie)“).
36. Undo fuer Loeschen: 8-Sekunden-Toast mit Ein-Klick-Wiederherstellung.
37. Ueberfaellig-Badge auf Aufgaben-Listen und Karten.
38. Ueberfaellig-Metrik im Home-Dashboard.
39. „Zuletzt bearbeitet“-Widget auf Home — direkt weiterarbeiten, wo man aufgehoert hat.
40. Suche mit Debounce — fluessiges Tippen auch bei grossen Sammlungen.
41. Tastatur: Alt+N erstellt einen neuen Eintrag passend zur aktuellen Ansicht.
42. Tastatur: Alt+1 bis Alt+9 wechselt direkt zwischen den Hauptansichten.
43. Tastatur: Ctrl/Cmd+S sichert den Snapshot und gleicht die Warteschlange ab.
44. Shortcut-Uebersicht in den Einstellungen.

## PWA und Infrastruktur

45. Service Worker v4: Navigationen laufen network-first mit 3,5-s-Timeout — bei langsamer Verbindung startet die App sofort aus dem Cache.
46. Statische Dateien per stale-while-revalidate: sofortige Antwort aus dem Cache, Aktualisierung im Hintergrund.
47. Nur erfolgreiche Antworten werden gecacht — keine haengenden Fehlerseiten mehr im Cache.
48. Manifest-Shortcuts erweitert (Notizen, Tablet Canvas) fuer den App-Launcher.
49. Fuenf neue Sync-Core-Testbloecke (Validierung, Verdichtung, Merge, Kennzahlen).
50. Struktur-Tests sichern alle neuen Speicher- und Produktivitaetsfunktionen dauerhaft ab.
