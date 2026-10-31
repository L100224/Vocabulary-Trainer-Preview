# **Vocabulary Trainer Preview**

[English](#english) | [Deutsch](#deutsch)

<br>

<a id="english"></a>

# English

A minimalist, distraction-free vocabulary trainer featuring spaced repetition and offline functionality.


👉 **[Click here to try the preview version in your browser](https://l100224.github.io/Vocabulary-Trainer-Preview/)**

<br>

<div align="center">
<img src="assets/screenshot-4.png" width="18%" alt="Screenshot 4" />
<img src="assets/screenshot-5.png" width="18%" alt="Screenshot 5" />
<img src="assets/screenshot-1.png" width="18%" alt="Screenshot 1" />
<img src="assets/screenshot-2.png" width="18%" alt="Screenshot 2" />
<img src="assets/screenshot-3.png" width="18%" alt="Screenshot 3" />
<br><br>
</div>

> ⚠️ **Preview Version:**
> This is a development-only version; features are subject to frequent change and may contain bugs. Data loss is possible. The final, stable version will be released later in the `Vocabulary-Trainer` repository.

<br>

## 💡 Why this project?

Modern language-learning apps are often overloaded with features that distract from the actual learning process:

- Endless, annoying animations and loading bars
- Artificial wait times or manufactured time pressure
- Unnecessary point, diamond, or XP systems
- Intrusive advertising or expensive subscriptions

This vocabulary trainer is designed to help you learn vocabulary in a relaxed and effective way—completely free from distracting extras or artificial pressure.


## ✨ Key Features

- 🔒 **100% local & no account needed:** There is no need to register anywhere. All data is stored in your browser's local database (`IndexedDB`). Your data belongs to you.
- 📶 **Offline & PWA:** Once opened, the app works entirely offline thanks to service workers (e.g., in airplane mode or while on the go).
- 🌍 **Multiple Languages Supported:** Add as many languages as you like (e.g., English, Spanish, French). Each language has its own independent database and tracks its own progress.
- 🔥 **Daily Streak:** A streak counter for each language keeps you motivated to complete at least a quick session every day (including a streak recovery feature in case you miss a day).
- 🔊 **Text-to-Speech:** You can choose whether the foreign language term is read aloud automatically when it appears or only when you click the speaker icon.
  - **Offline Text-to-Speech:** Can be enabled in the settings. Requirement: The corresponding language pack must be installed on your device's operating system. Since voice quality varies significantly between devices, it is recommended to test this for your specific language.
- 🌐 **Base Language & App Translations:** Currently, the user interface is in **German**, which serves as the fixed base language from which you learn other languages. Full multilingual support (including other app interface languages and different base languages) is already in development and will be added in a future update.


## 🚀 Getting Started: Adding Vocabulary

When you first launch the app, it will be completely empty. You can add vocabulary in two ways:

### Method 1: Adding Vocabulary Manually (Simple & Flexible)

Essentially, all you need to do is enter the word and its translation—everything else is entirely optional. The app also offers some clever additional features:

- **Articles in square brackets `[...]`:**
If you place an article in square brackets (e.g., `[die] Katze` or `[the] cat`), the app automatically identifies it as an article. 
*A major advantage for learning:* When providing an answer, you can choose whether or not to include the article (e.g., typing either `Katze` or `die Katze`)—both will be marked as correct!
- **Distinguishing meanings with `(...)`:**
Parentheses are optional and are used to differentiate between words that are spelled the same (e.g., `Bank (Finanzen)` vs. `Bank (Park)`).
- **Multiple translations / synonyms:**
If there are several translations or synonyms, simply separate them with a semicolon `;` (e.g., `Geldinstitut; Bank`).

### Method 2: Importing Entire Vocabulary Lists via JSON

You can easily convert existing vocabulary lists or online resources into the required format—for instance, by using an AI.

#### 📋 The import format:

```json
[
{
"german": "[die] Katze",
"foreign": "[the] cat",
"group": "Tiere"
},
{
"german": "[die] Bank (Finanzen); [das] Geldinstitut",
"foreign": "[the] bank",
"group": "Test am Montag"
},
{
"german": "Hund",
"foreign": "dog"
}
]
```

> **Note on groups:**
> The `"group"` field is optional. However, it is extremely useful when importing larger lists, grouping items by topic (e.g., `"Haus"`, `"Reise"`), or creating a specific category, such as `"Test am Montag"`. Using the **“Targeted Practice”** mode, you can review such groups separately.

Save the completed list as a `.json` file, then import it into the manager via **⬇️ Import**.


## 🧠 How Learning Works: The Spaced Repetition System (SRS)

The app is based on the well-established **Spaced Repetition System (SRS)**, inspired by Sebastian Leitner's classic flashcard box method.

1. **Moving Up and Down Levels:**
   - If you get a vocabulary item correct, it moves up one level.
   - If you make a mistake, it moves back down.
2. **Dynamic Intervals:**
   - Words at level 1 are reviewed frequently (e.g., after 1 day).
   - Words at higher levels are reviewed at increasingly longer intervals (after weeks or months).
3. **Balanced Review Schedule:**
   - Review schedules are calculated to ensure you aren’t overwhelmed by a mountain of tasks on any given day, keeping your daily workload balanced.


## 🛠️ Feedback

If you spot any errors or have ideas for improvements, please feel free to open an issue in the repository!

*Once the testing phase is complete, the polished, final version will be made available in the `Vocabulary-Trainer` repository.*

<br>
<br>

<a id="deutsch"></a>

# Deutsch

Ein minimalistischer, ablenkungsfreier Vokabeltrainer mit Spaced Repetition und Offline-Funktion.


👉 **[Hier klicken, um die Testversion im Browser auszuprobieren](https://l100224.github.io/Vocabulary-Trainer-Preview/)**

<br>

<div align="center">
  <img src="assets/screenshot-4.png" width="18%" alt="Screenshot 4" />
  <img src="assets/screenshot-5.png" width="18%" alt="Screenshot 5" />
  <img src="assets/screenshot-1.png" width="18%" alt="Screenshot 1" />
  <img src="assets/screenshot-2.png" width="18%" alt="Screenshot 2" />
  <img src="assets/screenshot-3.png" width="18%" alt="Screenshot 3" />
  <br><br>
</div>

> ⚠️ **Testversion:**  
> Dies ist eine reine Entwicklungsversion; Features ändern sich laufend und können fehlerhaft sein. Daten können verloren gehen. Die finale, stabile Version erscheint später im Repository `Vocabulary-Trainer`.

<br>

## 💡 Warum dieses Projekt?

Moderne Sprachlern-Apps sind häufig mit Funktionen überladen, die vom eigentlichen Lernen ablenken:

- Endlose, nervige Animationen und Ladebalken
- Künstliche Wartezeiten oder künstlicher Zeitdruck
- Unnötige Punkte-, Diamanten- oder XP-Systeme
- Aufdringliche Werbung oder teure Abonnements

Dieser Vokabeltrainer soll dir dabei helfen, Vokabeln entspannt und effektiv zu lernen – ganz ohne störende Extras oder künstlichen Druck.


## ✨ Weitere Highlights

- 🔒 **100 % lokal & kein Konto:** Du musst dich nirgendwo registrieren. Alle Daten liegen in der internen Datenbank deines Browsers (`IndexedDB`). Deine Daten gehören dir.
- 📶 **Offline & PWA:** Einmal aufgerufen, funktioniert die App dank Service Worker komplett offline (z. B. im Flugmodus oder unterwegs).
- 🌍 **Mehrere Sprachen parallel:** Lege beliebig viele Sprachen an (z. B. Englisch, Spanisch, Französisch). Jede Sprache hat eine komplett eigenständige Datenbank und ihren eigenen Fortschritt.
- 🔥 **Täglicher Streak:** Ein Streakzähler pro Sprache motiviert dich, jeden Tag zumindest eine kurze Runde zu absolvieren (inklusive Rettungsmodus, falls du mal einen Tag verpasst hast).
- 🔊 **Sprachausgabe (Text-to-Speech):**
  - Du kannst einstellen, ob die Fremdsprache beim Erscheinen automatisch vorgelesen wird oder nur per Klick auf das Lautsprecher-Symbol.
  - **Offline-Sprachausgabe:** Kann in den Einstellungen aktiviert werden. Voraussetzung: Im Betriebssystem deines Geräts muss ein entsprechendes Sprachpaket installiert sein. Da die Qualität der Stimmen je nach Gerät stark variiert, solltest du das für deine Sprache erst ausprobieren.
- 🌐 **Sprachbasis & App-Übersetzungen:** Aktuell ist die Benutzeroberfläche auf **Deutsch** und dient als feste Ausgangssprache, aus der du in andere Sprachen lernst. Eine vollständige Mehrsprachigkeit (andere App-Sprachen und andere Ausgangssprachen) ist bereits in Vorbereitung und wird zu einem späteren Zeitpunkt ergänzt.



## 🚀 Erste Schritte: Vokabeln anlegen

Beim ersten Start ist die App komplett leer. Du kannst Vokabeln auf zwei Wegen hinzufügen:

### Weg 1: Einzeln eingeben (einfach & flexibel)

Im Grunde musst du einfach nur das Wort und dessen Übersetzung eingeben – alles andere ist rein optional. Die App bietet dir aber clevere Zusatzfunktionen:

- **Artikel in eckige Klammern `[...]`:**  
  Schreibst du den Artikel in eckige Klammern (z. B. `[die] Katze` oder `[the] cat`), erkennt die App ihn automatisch als Artikel.  
  *Der große Vorteil beim Lernen:* Du kannst die Antwort später **mit oder ohne Artikel** eintippen (also `Katze` oder `die Katze`) – beides wird als richtig gewertet!
- **Bedeutungen unterscheiden mit `(...)`:**  
  Runde Klammern sind optional und dienen dazu, gleich geschriebene Wörter zu unterscheiden (z. B. `Bank (Finanzen)` vs. `Bank (Park)`).
- **Mehrere Übersetzungen / Synonyme:**  
  Gibt es mehrere Übersetzungen oder Synonyme, trennst du sie einfach mit einem Semikolon `;` (z. B. `Geldinstitut; Bank`).

### Weg 2: Ganze Listen per JSON importieren

Du kannst bestehende Vokabellisten oder Quellen aus dem Internet zum Beispiel ganz einfach von einer KI in das passende Format bringen lassen.

#### 📋 Das Import-Format:

```json
[
  {
    "german": "[die] Katze",
    "foreign": "[the] cat",
    "group": "Tiere"
  },
  {
    "german": "[die] Bank (Finanzen); [das] Geldinstitut",
    "foreign": "[the] bank",
    "group": "Test am Montag"
  },
  {
    "german": "Hund",
    "foreign": "dog"
  }
]
```

> **Hinweis zu Gruppen:**  
> Das Feld `"group"` ist optional. Es ist aber extrem praktisch, wenn du größere Listen importierst oder Themen bündeln möchtest (z. B. `"Haus"`, `"Reise"`) oder dir gezielt eine Gruppe wie `"Test am Montag"` anlegst. Über den Modus **„Gezielt üben“** kannst du solche Gruppen separat wiederholen.

Speichere die fertige Liste als `.json`-Datei und importiere sie anschließend im Manager über **⬇️ Import**.


## 🧠 Wie gelernt wird: Das Spaced Repetition System (SRS)

Die App basiert auf dem wissenschaftlich bewährten **Spaced Repetition System** (angelehnt an das klassische Karteikasten-Prinzip von Sebastian Leitner):

1. **Auf- und Abstieg:**
   - Weißt du eine Vokabel richtig, steigt sie eine Stufe auf.
   - Machst du einen Fehler, fällt sie wieder zurück.
2. **Dynamische Intervalle:**
   - Wörter auf Stufe 1 werden schnell wiederholt (z. B. nach 1 Tag).
   - Wörter auf höheren Stufen werden in immer größeren Abständen abgefragt (nach Wochen oder Monaten).
3. **Smarte Lastverteilung:**
   - Die Fälligkeiten werden so berechnet, dass du an keinem Tag von Bergen an Wiederholungen erschlagen wirst, sondern dein tägliches Pensum ausgeglichen bleibt.


## 🛠️ Feedback

Falls dir Fehler auffallen oder du Ideen hast, erstelle gerne ein Issue im Repository!

*Sobald die Testphase beendet ist, wird die saubere, finale Version im Repository `Vocabulary-Trainer` bereitgestellt.*
