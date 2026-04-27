# Disclaimer — loxberry-api-abfall-io

**Language:** [Deutsch](#deutsch) · [English](#english)

---

## Deutsch

Dieses Repository enthält ein **LoxBerry-Plugin** zur Anzeige von Abholterminen. Es handelt sich um ein **unabhängiges** Community-Projekt: **keine** offizielle Anwendung der Betreiber von **api.abfall.io**, **AbfallPlus** oder verbundener Unternehmen. Diese nehmen **weder** Stellung zu diesem Projekt **noch** prüfen, vertreiben, befürworten oder unterstützen es.
 
### Kein Support

- Es gibt **keinen** Anspruch auf technischen Support durch die Anbieter der API, durch AbfallPlus o. Ä.
- Die **Maintainer dieses Repos** bieten **keinen** verbindlichen Support für Endanwender an (best effort / Open-Source nach Verfügbarkeit).
- **Du** bist für die Nutzung in deiner Installation **selbst verantwortlich**.

### Entstehung

Die Implementierung basiert auf **öffentlich zugänglichen** Informationen (z. B. öffentliche HTTP-Endpunkte und gängige Nutzung ähnlich zu Kalender-Exporten im Browser). Es werden **keine** Zugangsdaten geheim gehalten, die nicht auch in Web- oder App-Klienten vorkommen könnten.

### Fair use / Belastung der Server

Das Plugin ist so konzipiert, dass Abfragen **nicht** im Sekundentakt erfolgen:

- **Mindestabstand** zwischen automatisierten Abrufen: **6 Stunden** (konfigurierbar nach oben; nach oben begrenzt).
- Zusätzlich ein **Streufaktor** (Zufallsverschiebung), damit viele Geräte nicht dieselbe Minute treffen.

Bitte das Intervall **nicht** künstlich umgehen oder extern so pollen, dass Server unverhältnismäßig belastet werden.

### Verfügbarkeit

Die Dienste können **Inhalte, Formate oder Erreichbarkeit jederzeit ändern, einschränken oder beenden**. Es gibt **keine** Garantie auf dauerhafte Funktion. Die Nutzung erfolgt auf **eigenes Risiko**.

### Marken

Genannte Marken und Produktnamen (z. B. LoxBerry, Loxone, abfall.io) gehören den jeweiligen Rechteinhabern.

---

## English

This repository provides a **LoxBerry plugin** for waste-collection schedules. It is an **independent** community project, **not** an official app from the operators of **api.abfall.io**, **AbfallPlus**, or related companies. Those parties do **not** review, distribute, endorse, or support this project.

### No support

- There is **no** entitlement to technical support from the API operators or AbfallPlus.
- **Repository maintainers** do **not** guarantee end-user support (best effort / open source as time allows).
- **You** are responsible for how you use the plugin on your system.

### Origin

The implementation relies on **publicly accessible** HTTP usage comparable to a browser or calendar export. It does not rely on private credentials that are not also used by public clients.

### Fair use / server load

The plugin is designed so requests are **not** made every few seconds:

- **Minimum** interval between scheduled fetches: **6 hours** (user-configurable upward, capped at a high bound).
- A **fuzz** (random offset) reduces synchronized load.

Do not bypass the interval in ways that would disproportionately load upstream servers.

### Availability

Services may **change or discontinue** content, formats, or availability **at any time**. There is **no** warranty of continued operation. Use is **at your own risk**.

### Trademarks

Named brands (e.g. LoxBerry, Loxone, abfall.io) belong to their respective owners.
