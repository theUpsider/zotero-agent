# Zotero-9-Extension bauen: kompakte Entwickleranleitung

**Stand:** 2026-07-08  
**Ziel:** Eine lauffähige Zotero-Desktop-Extension für **Zotero 9** bauen, testen, paketieren und veröffentlichen.  
**Scope:** Zotero-Desktop-Plugin, nicht Zotero Connector Browser Extension, nicht reine Web-API-Anwendung.

> Kurzfassung: Für Zotero 9 sollte eine Extension als **bootstrapped plugin** mit `manifest.json` und `bootstrap.js` gebaut werden. Für produktive Entwicklung ist ein TypeScript-Template wie `windingwind/zotero-plugin-template` der pragmatische Weg. Für maximale Kontrolle kann man mit dem offiziellen Beispiel `make-it-red` und einer Minimalstruktur starten.

---

## 1. Was ist bei Zotero 9 wichtig?

Zotero 9 ist die aktuelle Hauptversion und baut auf der modernen Plugin-Architektur auf, die mit Zotero 7 eingeführt und mit Zotero 8/9 weitergeführt wurde.

Wichtige technische Konsequenzen:

- **Keine alten XUL-Overlay-Plugins** als Primäransatz.
- **Kein `install.rdf`** mehr für neue Plugins. Stattdessen `manifest.json`.
- **Kein `update.rdf`** mehr für neue Update-Metadaten. Stattdessen `updates.json`.
- **Bootstrapped Plugin** mit Lifecycle-Hooks:
  - `install()`
  - `startup()`
  - `shutdown()`
  - `uninstall()`
  - optional: `onMainWindowLoad()`
  - optional: `onMainWindowUnload()`
- Plugin-Code läuft mit tiefem Zugriff auf Zotero-Interna. Das ist mächtig, aber auch fragil.
- Für Zotero 9 sollten Manifest-Kompatibilitätsgrenzen explizit auf Zotero 9 gesetzt und real getestet werden.

Empfohlene Manifest-Kompatibilität für dieses Projekt:

```json
{
  "strict_min_version": "9.0",
  "strict_max_version": "9.0.*"
}
```

Warum so eng? Zotero empfiehlt, `strict_max_version` auf die neueste getestete Minor-Version zu setzen. Wenn später Zotero 9.1 oder Zotero 10 erscheint, sollte man erst testen und dann die Kompatibilität bewusst erweitern.

---

## 2. Empfohlener Weg: TypeScript-Template verwenden

Für eine echte Extension ist der schnellste Weg ein vorhandenes Template:

- Template: <https://github.com/windingwind/zotero-plugin-template>
- Scaffold/Build-Tool: <https://github.com/windingwind/zotero-plugin-scaffold>
- Toolkit: <https://github.com/windingwind/zotero-plugin-toolkit>
- Typdefinitionen: <https://github.com/windingwind/zotero-types>
- Community-Hub: <https://github.com/zotero-plugin-dev>

### 2.1 Voraussetzungen

Installieren:

- Zotero 9
- Node.js LTS
- Git
- Editor: VS Code oder vergleichbar
- Separates Zotero-Testprofil empfohlen

### 2.2 Projekt aus Template erzeugen

Variante A: GitHub UI

1. Repository öffnen: <https://github.com/windingwind/zotero-plugin-template>
2. **Use this template** wählen.
3. Neues Repository erstellen.
4. Lokal klonen.

Variante B: lokal klonen

```bash
git clone https://github.com/<dein-user>/<dein-plugin-repo>.git
cd <dein-plugin-repo>
```

### 2.3 Plugin-Metadaten anpassen

Im Template wird die zentrale Konfiguration typischerweise in `package.json` bzw. Template-Konfigurationsfeldern gepflegt. Relevante Felder:

```json
{
  "config": {
    "addonName": "My Zotero 9 Plugin",
    "addonID": "my-zotero9-plugin@example.org",
    "addonRef": "myZotero9Plugin",
    "addonInstance": "MyZotero9Plugin",
    "prefsPrefix": "extensions.my-zotero9-plugin.",
    "github": {
      "owner": "dein-user",
      "repo": "dein-plugin-repo"
    }
  }
}
```

Für Zotero 9 muss im generierten `manifest.json` oder in der Template-Konfiguration die Zielversion entsprechend gesetzt werden:

```json
{
  "applications": {
    "zotero": {
      "id": "my-zotero9-plugin@example.org",
      "strict_min_version": "9.0",
      "strict_max_version": "9.0.*"
    }
  }
}
```

### 2.4 Entwicklungsumgebung starten

```bash
cp .env.example .env
npm install
npm start
```

Typischer Ablauf:

- `npm start` baut das Plugin vor.
- Zotero wird mit geladenem Plugin gestartet.
- Änderungen im Plugin-Code werden beobachtet.
- Das Plugin wird bei Änderungen neu geladen.

Falls `npm install` wegen Peer-Dependency-Konflikten scheitert:

```bash
npm install -f
```

### 2.5 Produktionsbuild erzeugen

```bash
npm run build
```

Erwartetes Ergebnis:

- Build-Verzeichnis, je nach Template z. B. `.scaffold/build/`
- `.xpi`-Datei für Installation in Zotero
- Update-Manifest, typischerweise `updates.json`

Für GitHub-Releases:

```bash
npm run release
```

Das Template kann Release-Artefakte und Update-Metadaten erzeugen. Prüfe vor einem echten Release Lizenz, Update-URL, Signierung/Hash und GitHub-Actions-Konfiguration.

---

## 3. Minimaler manueller Zotero-9-Plugin-Aufbau

Dieser Abschnitt zeigt eine kleine Extension ohne Template. Das ist nützlich, um die Mechanik zu verstehen oder einen sehr kleinen Prototyp zu bauen.

### 3.1 Projektstruktur

```text
my-zotero9-plugin/
  manifest.json
  bootstrap.js
  main.js
  prefs.js
  style.css
```

Optional später:

```text
my-zotero9-plugin/
  chrome/
  locale/
  content/
  icons/
  preferences.xhtml
  preferences.js
  updates.json
```

### 3.2 `manifest.json`

```json
{
  "manifest_version": 2,
  "name": "My Zotero 9 Plugin",
  "version": "0.1.0",
  "description": "Minimal Zotero 9 plugin example.",
  "author": "Your Name",
  "homepage_url": "https://example.org/my-zotero9-plugin",
  "applications": {
    "zotero": {
      "id": "my-zotero9-plugin@example.org",
      "strict_min_version": "9.0",
      "strict_max_version": "9.0.*",
      "update_url": "https://example.org/my-zotero9-plugin/updates.json"
    }
  }
}
```

Hinweise:

- `applications.zotero.id` ist die eindeutige Plugin-ID.
- Die ID muss stabil bleiben, sonst erkennt Zotero Updates nicht sauber.
- `strict_max_version` bewusst eng halten und nach Tests erhöhen.
- **Korrektur (verifiziert an Zotero-Quellcode, `app/scripts/fetch_xulrunner`):** `applications.zotero.update_url` und `strict_max_version` sind in Release-Builds von Zotero **Pflichtfelder**. Fehlt eines davon, schlägt die Installation mit der generischen Meldung „could not be installed … may be incompatible" fehl. Die URL muss beim Installieren nicht erreichbar sein. Beta-/Dev-Builds überspringen den `strict_max_version`-Check (`strictCompatibility = false`).

### 3.3 `bootstrap.js`

`bootstrap.js` enthält die Lifecycle-Funktionen. Zotero ruft diese beim Installieren, Starten, Stoppen und Entfernen des Plugins auf.

```javascript
/* bootstrap.js */

var MyZotero9Plugin;

function log(message) {
  Zotero.debug("My Zotero 9 Plugin: " + message);
}

function install(data, reason) {
  log("Installed");
}

async function startup({ id, version, rootURI }, reason) {
  log(`Starting ${id} ${version}`);

  // Lädt main.js in den Plugin-Kontext.
  Services.scriptloader.loadSubScript(rootURI + "main.js");

  MyZotero9Plugin.init({ id, version, rootURI });
  MyZotero9Plugin.addToAllWindows();
}

function onMainWindowLoad({ window }) {
  MyZotero9Plugin?.addToWindow(window);
}

function onMainWindowUnload({ window }) {
  MyZotero9Plugin?.removeFromWindow(window);
}

function shutdown(data, reason) {
  log("Shutting down");

  if (MyZotero9Plugin) {
    MyZotero9Plugin.removeFromAllWindows();
    MyZotero9Plugin = undefined;
  }
}

function uninstall(data, reason) {
  log("Uninstalled");
}
```

### 3.4 `main.js`

Dieses Beispiel fügt einen Menüeintrag hinzu und liest die aktuell ausgewählten Zotero-Items.

```javascript
/* main.js */

var MyZotero9Plugin = {
  id: null,
  version: null,
  rootURI: null,
  addedElementIDs: [],

  init({ id, version, rootURI }) {
    this.id = id;
    this.version = version;
    this.rootURI = rootURI;
  },

  addToWindow(window) {
    const doc = window.document;

    // Zotero verwendet XUL-Elemente. menu_ToolsPopup ist je nach Version/Ort nicht immer
    // der beste Zielpunkt; menu_viewPopup ist ein robuster Fallback für ein Minimalbeispiel.
    const menu =
      doc.getElementById("menu_ToolsPopup") ||
      doc.getElementById("menu_viewPopup");

    if (!menu) {
      Zotero.debug("My Zotero 9 Plugin: no target menu found");
      return;
    }

    const menuItem = doc.createXULElement("menuitem");
    menuItem.id = "my-zotero9-plugin-menuitem";
    menuItem.setAttribute("label", "My Zotero 9 Plugin: Count selected items");

    menuItem.addEventListener("command", () => {
      const pane = window.ZoteroPane;
      const items = pane.getSelectedItems();
      window.alert(`Selected Zotero items: ${items.length}`);
    });

    menu.appendChild(menuItem);
    this.addedElementIDs.push(menuItem.id);

    // Optional: Stylesheet in das Fenster laden.
    const stylesheetID = "my-zotero9-plugin-stylesheet";
    const pi = doc.createProcessingInstruction(
      "xml-stylesheet",
      `href="${this.rootURI}style.css" type="text/css"`
    );
    pi.id = stylesheetID;
    doc.insertBefore(pi, doc.documentElement);
    this.addedElementIDs.push(stylesheetID);
  },

  addToAllWindows() {
    const windows = Zotero.getMainWindows();
    for (const win of windows) {
      if (!win.ZoteroPane) continue;
      this.addToWindow(win);
    }
  },

  removeFromWindow(window) {
    const doc = window.document;
    for (const id of this.addedElementIDs) {
      const elem = doc.getElementById(id);
      if (elem) elem.remove();
    }
  },

  removeFromAllWindows() {
    const windows = Zotero.getMainWindows();
    for (const win of windows) {
      if (!win.ZoteroPane) continue;
      this.removeFromWindow(win);
    }
    this.addedElementIDs = [];
  }
};
```

### 3.5 `prefs.js`

Default Preferences werden in Zotero 7+ über eine `prefs.js` im Plugin-Root gesetzt.

```javascript
/* prefs.js */

pref("extensions.my-zotero9-plugin.enabled", true);
pref("extensions.my-zotero9-plugin.exampleString", "Hello Zotero 9");
```

Lesen im Plugin:

```javascript
const enabled = Zotero.Prefs.get("extensions.my-zotero9-plugin.enabled", true);
```

### 3.6 `style.css`

```css
#my-zotero9-plugin-menuitem {
  font-weight: bold;
}
```

### 3.7 Als `.xpi` paketieren

Eine Zotero-Extension ist im Kern ein ZIP-Archiv mit `.xpi`-Endung. Wichtig: Die Dateien müssen direkt im Root des Archivs liegen, nicht in einem zusätzlichen Oberordner.

```bash
cd my-zotero9-plugin
zip -r ../my-zotero9-plugin-0.1.0.xpi \
  manifest.json \
  bootstrap.js \
  main.js \
  prefs.js \
  style.css
```

Installation in Zotero:

1. Zotero öffnen.
2. **Tools → Plugins** öffnen.
3. Zahnrad/Optionsmenü.
4. **Install Plugin From File…** bzw. vergleichbarer Eintrag.
5. `.xpi` auswählen.
6. Zotero neu starten, falls verlangt.

---

## 4. Entwicklung direkt aus dem Quellverzeichnis laden

Für Debugging ohne ständiges `.xpi`-Bauen kann Zotero ein Plugin direkt aus einem lokalen Quellordner laden.

Vorgehen:

1. Zotero schließen.
2. Zotero-Profilordner öffnen.
3. Im Profilordner den Ordner `extensions` öffnen oder erstellen.
4. Eine Datei mit exakt der Plugin-ID als Dateiname erstellen, z. B.:

```text
my-zotero9-plugin@example.org
```

5. In diese Datei nur den absoluten Pfad zum Plugin-Root schreiben, z. B.:

```text
/home/david/dev/my-zotero9-plugin
```

oder unter Windows:

```text
C:\Users\David\dev\my-zotero9-plugin
```

6. In `prefs.js` des Zotero-Profils diese Zeilen entfernen, falls vorhanden:

```text
extensions.lastAppBuildId
extensions.lastAppVersion
```

7. Zotero starten.

Wenn Caches stören:

```bash
zotero -purgecaches
```

oder mit vollem Pfad:

```bash
/path/to/zotero -purgecaches
```

---

## 5. Debugging

### 5.1 Debug-Ausgabe aktivieren

```bash
/path/to/zotero -ZoteroDebugText
```

Mit JavaScript-Konsole:

```bash
/path/to/zotero -ZoteroDebugText -jsconsole
```

Mit Browser Toolbox:

```bash
/path/to/zotero -jsdebugger
```

### 5.2 Logs im Code

```javascript
Zotero.debug("My Zotero 9 Plugin: reached import step");
```

### 5.3 JavaScript direkt in Zotero ausführen

In Zotero:

```text
Tools → Developer → Run JavaScript
```

Beispiel:

```javascript
const items = Zotero.getActiveZoteroPane().getSelectedItems();
return items.map(item => item.getField("title")).join("\n");
```

Zotero unterstützt in diesem Runner auch `await`:

```javascript
const items = Zotero.getActiveZoteroPane().getSelectedItems();
await Zotero.Promise.delay(100);
return items.length;
```

---

## 6. Häufige API-Aufgaben

### 6.1 Aktuell ausgewählte Items lesen

```javascript
const pane = Zotero.getActiveZoteroPane();
const items = pane.getSelectedItems();

for (const item of items) {
  Zotero.debug(item.getField("title"));
}
```

### 6.2 Item-Metadaten lesen

```javascript
const item = Zotero.getActiveZoteroPane().getSelectedItems()[0];

const title = item.getField("title");
const year = item.getField("date");
const creators = item.getCreators();

Zotero.debug(JSON.stringify({ title, year, creators }));
```

### 6.3 Tags lesen

```javascript
const item = Zotero.getActiveZoteroPane().getSelectedItems()[0];
const tags = item.getTags().map(t => t.tag);

Zotero.debug(tags.join(", "));
```

### 6.4 Annotationen lesen

Je nach Zotero-Version und Item-Typ sind Annotationen eigene Items. Ein robuster erster Zugriff ist, Child-Items zu prüfen:

```javascript
const item = Zotero.getActiveZoteroPane().getSelectedItems()[0];
const children = await item.getChildren();

for (const child of children) {
  if (child.isAnnotation && child.isAnnotation()) {
    Zotero.debug(child.annotationText || "");
    Zotero.debug(child.annotationComment || "");
    Zotero.debug(child.annotationColor || "");
  }
}
```

### 6.5 Preferences lesen und schreiben

```javascript
const key = "extensions.my-zotero9-plugin.enabled";

const enabled = Zotero.Prefs.get(key, true);
Zotero.Prefs.set(key, !enabled);
```

### 6.6 Preferences Pane registrieren

In `startup()` oder nach Plugin-Initialisierung:

```javascript
Zotero.PreferencePanes.register({
  pluginID: "my-zotero9-plugin@example.org",
  src: rootURI + "preferences.xhtml",
  scripts: [rootURI + "preferences.js"],
  stylesheets: [rootURI + "preferences.css"]
});
```

Einfaches `preferences.xhtml`:

```xml
<vbox xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul">
  <checkbox
    preference="extensions.my-zotero9-plugin.enabled"
    label="Enable plugin" />
</vbox>
```

In Zotero 7+ können Preferences direkt an Schlüssel gebunden werden. Für komplexere UI lohnt sich ein Blick in das `make-it-red`-Beispiel.

---

## 7. Updates veröffentlichen

Für automatische Updates braucht das Plugin ein Update-Manifest im JSON-Format.

### 7.1 `updates.json`

```json
{
  "addons": {
    "my-zotero9-plugin@example.org": {
      "updates": [
        {
          "version": "0.1.0",
          "update_link": "https://example.org/my-zotero9-plugin/releases/my-zotero9-plugin-0.1.0.xpi",
          "update_hash": "sha256:PUT_SHA256_HASH_HERE",
          "applications": {
            "zotero": {
              "strict_min_version": "9.0",
              "strict_max_version": "9.0.*"
            }
          }
        }
      ]
    }
  }
}
```

### 7.2 SHA-256 erzeugen

Linux/macOS:

```bash
sha256sum my-zotero9-plugin-0.1.0.xpi
```

macOS alternativ:

```bash
shasum -a 256 my-zotero9-plugin-0.1.0.xpi
```

Windows PowerShell:

```powershell
Get-FileHash .\my-zotero9-plugin-0.1.0.xpi -Algorithm SHA256
```

Dann in `updates.json` eintragen:

```text
sha256:<hash>
```

---

## 8. Zotero 9 und Mozilla-Plattform

Zotero basiert auf Mozilla-Technologie. Bei Zotero 8 wurde die Mozilla-Plattform stark aktualisiert; Zotero 9 führt diese modernisierte Basis fort. Für Extension-Code bedeutet das:

- Alte Mozilla-spezifische Modulformen wie JSM sind problematisch.
- Für neue Imports nach Möglichkeit moderne JavaScript-Module bzw. den aktuellen Zotero-Weg verwenden.
- DOM/XUL-Manipulationen funktionieren, sollten aber sauber in `onMainWindowLoad` aufgebaut und in `onMainWindowUnload`/`shutdown` entfernt werden.
- Nach jeder Zotero-Minor-Version testen, bevor die Kompatibilität im Manifest erweitert wird.

---

## 9. Datenzugriff: JS API, Web API oder SQLite?

### 9.1 Empfohlen: Zotero JavaScript API

Für Desktop-Plugins ist die lokale JavaScript API der normale Weg:

```javascript
const items = Zotero.getActiveZoteroPane().getSelectedItems();
```

Vorteile:

- Läuft im Zotero-Kontext.
- Nutzt Zotero-Objektmodell.
- Vermeidet direkte Datenbankkorruption.

Nachteile:

- API-Dokumentation ist nicht vollständig.
- Man muss bei komplexen Aufgaben häufig in Zotero-Quellcode oder Beispiele schauen.

### 9.2 Alternative: Zotero Web API

Gut für externe Tools, Sync-Integrationen oder Server-Anwendungen:

- <https://www.zotero.org/support/dev/web_api/v3/start>

Für eine echte Desktop-Extension ist die Web API aber oft nicht ausreichend, weil UI-Integration und lokale Reader-Interaktion fehlen.

### 9.3 Direkter SQLite-Zugriff nur read-only

Zotero speichert lokale Daten in `zotero.sqlite`. Direkter Zugriff sollte nur read-only erfolgen. Schreibzugriffe an Zotero vorbei können die Datenbank beschädigen, Validierungen umgehen oder bei Schemaänderungen brechen.

---

## 10. Praktische Build-Checkliste für Zotero 9

Vor dem ersten Commit:

- [ ] Plugin-ID festgelegt und stabil.
- [ ] `manifest.json` enthält `applications.zotero`.
- [ ] `strict_min_version` ist `9.0`.
- [ ] `strict_max_version` ist `9.0.*`.
- [ ] Kein `install.rdf`.
- [ ] Kein `update.rdf`.
- [ ] `bootstrap.js` vorhanden.
- [ ] `startup()` lädt Hauptcode.
- [ ] `shutdown()` entfernt alle UI-Elemente, Listener, Stylesheets und Timer.
- [ ] `onMainWindowLoad()` behandelt neu geöffnete Zotero-Fenster.
- [ ] `onMainWindowUnload()` räumt pro Fenster auf.
- [ ] Preferences liegen in `prefs.js`.
- [ ] Entwicklung läuft aus Source-Ordner oder per Template-Hot-Reload.
- [ ] `.xpi` enthält Dateien direkt im Root.
- [ ] Installation in frischem Testprofil geprüft.
- [ ] Debug-Ausgabe geprüft.
- [ ] Update-Manifest mit SHA-256 vorbereitet, falls Releases geplant sind.
- [ ] Lizenz des Templates und eigener Code geprüft.

Vor Release:

- [ ] Mit aktueller Zotero-9-Version getestet.
- [ ] Mit leerer Bibliothek getestet.
- [ ] Mit großer Bibliothek getestet.
- [ ] Mit mehreren Fenstern getestet.
- [ ] Plugin deaktivieren/aktivieren getestet.
- [ ] Zotero-Neustart getestet.
- [ ] Deinstallation getestet.
- [ ] Keine persistenten UI-Reste nach Deaktivierung.
- [ ] Keine globalen Variablen außer bewusst genutztem Plugin-Namespace.
- [ ] Keine ungeprüften Remote-Skripte.
- [ ] Keine direkten SQLite-Schreibzugriffe.
- [ ] Keine personenbezogenen Daten in Logs.

---

## 11. Typische Fehler

### Fehler: Plugin installiert nicht

Prüfen:

- Ist `manifest.json` im Root der `.xpi`?
- Stimmt `manifest_version`?
- Existiert `applications.zotero`?
- Passt `strict_min_version`/`strict_max_version` zu Zotero 9?
- Ist die Plugin-ID gültig und stabil?

### Fehler: Menüeintrag erscheint nicht

Prüfen:

- Wird `startup()` ausgeführt?
- Wird `main.js` geladen?
- Wird `addToAllWindows()` aufgerufen?
- Existiert das Zielmenü im aktuellen Fenster?
- Wird das Element in einem falschen Fensterkontext erzeugt?

### Fehler: Nach Deaktivierung bleibt UI sichtbar

Prüfen:

- Entfernt `shutdown()` alle Elemente?
- Entfernt `onMainWindowUnload()` pro Fenster alles?
- Werden IDs sauber gespeichert?
- Wurden Listener, Timer und Stylesheets entfernt?

### Fehler: Änderungen werden nicht geladen

Prüfen:

- Läuft Zotero aus dem Source-Proxy oder aus installierter `.xpi`?
- Wurde `-purgecaches` benutzt?
- Wurden `extensions.lastAppBuildId` und `extensions.lastAppVersion` im Profil gelöscht?
- Nutzt das Template Hot-Reload oder muss Zotero neu gestartet werden?

---

## 12. Empfohlener Entwicklungsworkflow

Für ein reales Projekt:

1. **Template verwenden**
   - `windingwind/zotero-plugin-template`
   - TypeScript, Build, Reload, Release-Automation.

2. **Minimalfunktion bauen**
   - Menüeintrag
   - Zugriff auf selektierte Items
   - Debug-Ausgabe

3. **Domain-Funktion kapseln**
   - Zotero-UI-Code getrennt von Fachlogik.
   - Fachlogik testbar halten.

4. **Zotero-spezifische Adapter schreiben**
   - `ZoteroItemAdapter`
   - `ZoteroAnnotationAdapter`
   - `ZoteroPreferenceAdapter`

5. **Preferences früh einführen**
   - Feature Flags
   - Debug-Level
   - Modell-/API-Konfiguration, falls relevant

6. **Release-Pipeline erst später**
   - Lokale `.xpi` reicht anfangs.
   - `updates.json` und GitHub Release erst nach stabiler Alpha.

7. **Kompatibilität streng halten**
   - Erst `9.0.*`.
   - Nach jedem Zotero-Update testen.
   - Dann Manifest/Update-Metadaten erweitern.

---

## 13. Minimaler Projektplan für einen Entwickler

### Tag 1: Setup und Hello World

- Zotero 9 installieren.
- Template klonen.
- `npm install`.
- `npm start`.
- Plugin-ID und Name setzen.
- Menüeintrag anzeigen.
- Ausgewählte Items zählen.

### Tag 2: Zotero-Daten lesen

- Titel, Autoren, Jahr lesen.
- Tags lesen.
- Child-Items lesen.
- Annotationen prüfen.
- Debug-Logging strukturieren.

### Tag 3: UI und Preferences

- Preferences Pane erstellen.
- Feature Flags speichern.
- Menüeintrag abhängig von Preference aktivieren.
- Fenster-Load/Unload sauber behandeln.

### Tag 4: Build und Paket

- Produktionsbuild erzeugen.
- `.xpi` installieren.
- Frisches Profil testen.
- Deaktivierung und Deinstallation testen.

### Tag 5: Release-Setup

- GitHub Release vorbereiten.
- `updates.json` erzeugen.
- SHA-256 prüfen.
- README mit Installationsanleitung schreiben.
- Kompatibilitätsmatrix dokumentieren.

---

## 14. Referenzen

### Offizielle Zotero-Dokumentation

- Zotero 9 announcement: <https://www.zotero.org/blog/zotero-9/>
- Zotero changelog: <https://www.zotero.org/support/changelog>
- Zotero Plugin Development: <https://www.zotero.org/support/dev/client_coding/plugin_development>
- Zotero 7 for Developers: <https://www.zotero.org/support/dev/zotero_7_for_developers>
- Zotero 8 for Developers: <https://www.zotero.org/support/dev/zotero_8_for_developers>
- Zotero JavaScript API: <https://www.zotero.org/support/dev/client_coding/javascript_api>
- Developer Tools: <https://www.zotero.org/support/dev/client_coding/developer_tools>
- Building Zotero: <https://www.zotero.org/support/dev/client_coding/building_the_standalone_client>
- Direct SQLite Database Access: <https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access>
- Zotero Web API v3: <https://www.zotero.org/support/dev/web_api/v3/start>
- Zotero Translators repository: <https://github.com/zotero/translators>
- Zotero source code: <https://github.com/zotero/zotero>

### Beispiel-Plugins und Templates

- Official sample plugin `make-it-red`: <https://github.com/zotero/make-it-red>
- Zotero Plugin Template: <https://github.com/windingwind/zotero-plugin-template>
- Zotero Plugin Scaffold: <https://github.com/windingwind/zotero-plugin-scaffold>
- Zotero Plugin Toolkit: <https://github.com/windingwind/zotero-plugin-toolkit>
- Zotero Types: <https://github.com/windingwind/zotero-types>
- Zotero Plugin Dev Community: <https://github.com/zotero-plugin-dev>

### Nützliche Suchbegriffe

- `Zotero 9 plugin manifest.json bootstrap.js`
- `Zotero 7 for Developers bootstrap.js`
- `Zotero make-it-red plugin`
- `windingwind zotero plugin template`
- `zotero-types TypeScript`
- `Zotero PreferencePanes.register`
- `Zotero getSelectedItems plugin`

---

## 15. Startpunkt für dieses Projekt

Wenn nur ein Ergebnis zählen soll, nimm diesen Weg:

```bash
# 1. Neues Repo aus Template erzeugen oder eigenes Repo klonen
git clone https://github.com/<dein-user>/<dein-plugin-repo>.git
cd <dein-plugin-repo>

# 2. Environment vorbereiten
cp .env.example .env
npm install

# 3. Zotero-9-Kompatibilität setzen
# In manifest/template config:
# strict_min_version = 9.0
# strict_max_version = 9.0.*

# 4. Entwickeln
npm start

# 5. Minimalfunktion bauen:
# - Menüeintrag
# - selected items lesen
# - Debug-Ausgabe

# 6. Paket bauen
npm run build
```

Danach `.xpi` in Zotero 9 installieren und mit einem separaten Testprofil prüfen.
