====== Abfall IO / Abfallabholung (api.abfall.io) ======

++++ Version History |
{{VERSION_HISTORY}}

Ältere Releases, Änderungsnotizen sowie die **ZIP‑Pakete** findest du bei **[[https://github.com/spid3r/loxberry-api-abfall-io/releases|GitHub Releases]]**. Der **Quelltext** liegt im **[[https://github.com/spid3r/loxberry-api-abfall-io|Repository]]**.

++++


===== Überblick =====

Das Plugin liefert **Abfuhrtermine** über die öffentliche Schnittstelle **[[https://api.abfall.io/|api.abfall.io]]** — dieselbe öffentliche Quelle wie viele kommunale Abfuhr‑Angebote im Web. Du konfigurierst im Plugin zuerst **Gebiet** bzw. **Service‑Schlüssel**, speicherst, danach **Straße und Hausnr.** und speicherst erneut. Wenn die Konfiguration passt, zeigt der Tab **Status** nach einem Abruf die nächsten Termine.

**Drei gängige Integrationswege** (einer reicht je nach Zielumgebung):

  * **MQTT:** Auf **LoxBerry 3** oft praktisch, weil der **eingebaute MQTT‑Broker** häufig **automatisch** mit passenden Zugangsdaten genutzt werden kann. Die Werte liegen nach jedem erfolgreichen Abruf unter festen **Topics**; mehrere Abonnenten (Visualisierung, Automation, Skripte) können parallel lesen, **ohne** dass der Miniserver eine URL zyklisch abfragt.

  * **HTTP‑Klartext für Loxone** über ''loxone.php'': **Virtueller HTTP‑Eingang**, Rückgabe **lesbarer Text** pro Abfallkategorie (parametrierbar, siehe unten).

  * **JSON** über den Zusatz ''?format=json'' an der dokumentierten Plugin‑URL — für Tests oder eigene Auswertungen; Details im Repository und in der Kurzhilfe im Plugin.

**Abrufintervall:** Mindestens **6 Stunden** zwischen Abrufen ist voreingestellt und nach oben verlängerbar; zusätzlich wirkt eine **Zufallsverschiebung** der Ausführungsminute, um gleichzeitige Lastspitzen zu reduzieren.

**Disclaimer:** Das Projekt ist **öffentlich/community‑geführt**, **nicht** offiziell durch die Betreiber von api.abfall.io. Der öffentliche Dienst kann sein Angebot ändern; die Nutzung durch dieses Plugin kann dadurch eingeschränkt werden oder ausfallen. Volltext: **[[https://github.com/spid3r/loxberry-api-abfall-io/blob/main/DISCLAIMER.md|DISCLAIMER auf GitHub]]**.


===== Download =====

[[https://github.com/spid3r/loxberry-api-abfall-io/releases|ZIP der aktuellen Version (GitHub Releases)]] — Versionsnummer und Änderungen siehst du auf der gleichen Seite.


===== Installation =====

Voraussetzung: **LoxBerry ab Version 3.x**. ZIP unter **System → Plugins** installieren, Plugin öffnen.

**Empfohlene Reihenfolge**

  * Tab **Standort**: Region auswählen oder **Service‑Schlüssel** eintragen (32‑Zeichen‑Hex‑Schlüssel der jeweiligen Entsorgung, falls die automatische Regionsliste ihn nicht enthält).

  * **Speichern** — sonst sind Straßensuche und Abruf häufig blockiert oder unvollständig.

  * Straße und Hausnr. wählen, **erneut speichern**.

  * Tab **Status**: **Jetzt abrufen** ausführen und prüfen, ob Termine erscheinen.

Bei Problemen zuerst den Tab **Log** auswerten (Fehlermeldungen des Plugins, Netzwerk, fehlende Speicherung, Gemeinde nicht auf api.abfall.io verfügbar).


===== Konfiguration (Auszug) =====

  * **Abrufintervall:** nicht kürzer als **6 Stunden**; längere Intervalle sind möglich.

  * **Kategorienfilter:** nur relevante Abfallarten einbeziehen.

  * **MQTT:** Ein/Aus; unter LoxBerry 3 typisch **„LoxBerry‑internen MQTT‑Broker verwenden"** mit **Retain**, wenn Abonnenten nur gelegentlich lesen.

  * **Topic‑Präfix:** Standard ''loxberry/abfallio'', sofern kein Konflikt mit anderen Topics entsteht.

  * **Sprache** der Oberfläche: Deutsch oder Englisch.

**Regionsliste:** Optional **online aktualisieren**. Fehlt die Gemeinde danach weiterhin, liegt das oft daran, dass **nicht jede Kommune** über api.abfall.io angebunden ist; dann den **Service‑Schlüssel** manuell setzen (siehe Hilfe im Plugin).


===== Unterstützte Regionen (aus Service-Map) =====

Aktueller Stand: **{{SUPPORTED_REGION_COUNT}} Regionen** (Quelle: ''data/abfallio-service-map.json'').

{{SUPPORTED_REGIONS_LIST}}

===== Screenshots (deutsche Oberfläche) =====

{{SCREENSHOT_GALLERY}}


===== Integration über MQTT =====

**(1)** **Einstellungen** → **MQTT‑Veröffentlichung aktivieren** → **Speichern**.

**(2)** Nach jedem **erfolgreichen** Abruf werden unter dem **Topic‑Präfix** (Standard %%loxberry/abfallio%%) u. a. folgende Pfade befüllt:

  * %%loxberry/abfallio/state%% — Gesamtdatensatz (JSON)

  * %%loxberry/abfallio/last_fetch%% — Zeitpunkt des letzten Abrufs

  * %%loxberry/abfallio/location%% — gespeicherter Standorttext

  * %%loxberry/abfallio/categories_count%% — Anzahl der Kategorien

  * Pro Abfallart: unter %%loxberry/abfallio/categories/<Kurzname>/…%% die Felder **days**, **date**, **weekday**, **weekday_num**, **category**. Der **Kurzname** wird aus dem Anzeigenamen abgeleitet (ASCII‑sichere Darstellung für Topic‑Segmente).

**(3)** Test‑Abonnement aller Untertopics eines Präfixes (MQTT‑Client):

%%loxberry/abfallio/#%%

**(4)** **Anbindung an den Loxone‑Miniserver** hängt von der **Firmware** und der gewählten Architektur ab (direktes MQTT am Miniserver oder z. B. **[[plugins:mqtt_gateway:start|MQTT Gateway]]** — dort die ausführliche Anbindungsdokumentation).


===== Integration über HTTP (ohne MQTT) =====

Virtuellen **HTTP‑Eingang** in der Loxone Config anlegen. **LOXBERRY** in den folgenden Zeilen durch **IP‑Adresse** oder **Hostname** des LoxBerry ersetzen (Beispiele: ''192.168.1.47'', ''loxberry.home''); **ohne** spitze Klammern.

Die Adressen stehen in **%%…%%**, damit DokuWiki die Zeilen nicht wie normalen Fließtext parst (Webadressen würden sonst oft zerrissen) und du sie **unverändert kopieren** kannst:

%%http://LOXBERRY/plugins/abfallio/loxone.php%%

%%http://LOXBERRY/plugins/abfallio/loxone.php?cat=RESTABFALL%%

Parameter **cat:** exakt der **Kategoriename** wie im Plugin unter **Status** angezeigt; ''RESTABFALL'' ist nur ein **Beispiel**.

%%http://LOXBERRY/plugins/abfallio/loxone.php?format=list%%

Die URLs sind sinnvoll nutzbar, wenn **Standort** gespeichert ist und unter **Status** bereits Daten eines erfolgreichen Abrufs sichtbar sind.


===== Weiterentwicklung =====

Geplante Änderungen richten sich nach **Issues/Feedback** und an der Entwicklung von **api.abfall.io**. Es gibt **keine verbindliche öffentliche Roadmap**.


===== Fragen und Fehler melden =====

**[[https://github.com/spid3r/loxberry-api-abfall-io/issues|GitHub Issues]]**

Für die Bearbeitung hilfreich:

  * **LoxBerry‑Version** und **Plugin‑Version**

  * Kurz: **Schritte**, **erwartetes Verhalten**, **tatsächliches Verhalten**

  * Optional: Ausschnitt aus dem **Log‑Tab** des Plugins (ohne Passwörter und ohne unnötig private Daten)
