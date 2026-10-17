# Sägemeister

Kostenloses Praxis-Werkzeug für Blockbandsägen: Sägeausbeute, Schnittfugenverlust, Höhenausgleich
und ein abhakbarer Einschnitt-Ablaufplan mit zur Laufzeit erzeugten SVG-Grafiken – optimiert für
das hochkant gehaltene Smartphone an der Säge (Live-Sägemodus, Wake Lock, Autospeichern, Link teilen, PDF).

Reine statische Seite (kein Build): `index.html`, `calc.js` (Logik), `svg.js` (Grafiken), `app.js` (UI).
Tests: `node test/calc.test.js`. Deployment: GitHub Pages über `.github/workflows/pages.yml`.
