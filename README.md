# QBasis – Agile Schulentwicklung kollaborativ

Diese Version ist für den Einsatz in QBasis mit 10–30 Schulleitungen optimiert.

## Didaktische Grundidee

Nicht alle spielen in einem großen Raum. Stattdessen arbeiten 4–6 Personen in einem Gruppenraum.

Empfehlung:

- 10 Personen: 2 Gruppenräume
- 15 Personen: 3 Gruppenräume
- 20 Personen: 4 Gruppenräume
- 30 Personen: 5–6 Gruppenräume

## Vereinfachter Ablauf

1. Gruppenraum erstellen
2. Teilnehmende treten bei
3. Moderation startet Dilemma
4. Moderation wählt mit der Gruppe einen Entscheidungsweg
5. Jede Person wählt genau ein Entwicklungsvorhaben
6. Woche 1: Karte ziehen, anwenden, würfeln
7. Woche 2: Karte ziehen, anwenden, würfeln
8. Review
9. Retrospektive mit Reflexionsfragen
10. Export der Ergebnisse

## Rollenrechte

Teilnehmende dürfen:

- Raum betreten
- ein Vorhaben wählen
- Karten ziehen
- eigene Vorhaben bearbeiten
- Interventionen einsetzen
- Reflexionen speichern

Moderation darf zusätzlich:

- Raum erstellen
- Phasen weiterschalten
- Raum zurücksetzen
- Ergebnisse exportieren
- Dilemmaentscheidung festlegen

## Moderations-PIN

Beim Erstellen wird eine PIN gesetzt. Wenn keine PIN eingegeben wird, gilt testweise `1234`.

## Firebase für echte Gleichzeitigkeit

GitHub Pages allein kann keinen gemeinsamen Spielstand speichern. Für echte Zusammenarbeit ist Firebase Realtime Database vorgesehen.

1. Firebase-Projekt erstellen
2. Realtime Database aktivieren
3. Web-App anlegen
4. Konfiguration in `js/firebase-config.js` eintragen

Beispiel:

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...firebaseapp.com",
  databaseURL: "https://...-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "...",
  storageBucket: "...appspot.com",
  messagingSenderId: "...",
  appId: "..."
};
```

Für einen geschützten bzw. dienstlichen Einsatz sollten die Firebase-Regeln nicht dauerhaft offen bleiben.

## GitHub Pages

Diese Dateien hochladen:

```text
index.html
css/styles.css
js/data.js
js/app.js
js/firebase-config.js
assets/images/
.nojekyll
README.md
```

Dann GitHub → Settings → Pages → Deploy from branch → `main` / root.
