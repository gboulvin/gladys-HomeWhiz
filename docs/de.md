# HomeWhiz

Steuern und überwachen Sie in Gladys die Haushaltsgeräte der **HomeWhiz**-App:
Waschmaschinen, Trockner, Waschtrockner, Geschirrspüler, Backöfen,
Kochfelder, Kühlschränke, Klimaanlagen…

## Unterstützte Marken

HomeWhiz ist die App der Arçelik-Gruppe. Jedes Gerät, das sie verwaltet,
funktioniert mit dieser Integration, egal welche Marke auf der Front steht:

**Beko**, **Grundig**, **Arçelik**, **Blomberg**, **Bauknecht**,
**Elektrabregenz**, **Altus**, **Arctic**, **Defy**, **Leisure**, **Flavel**,
**Lamona**, **Dawlance**, **Voltas Beko** sowie die HomeWhiz-Modelle von
Whirlpool, Smeg, Teka, Viking, Cylinda und V-Zug.

Wenn das Gerät in Ihrer HomeWhiz-App erscheint, erscheint es auch in Gladys.

## Voraussetzungen

- Gladys Assistant **5.1 oder neuer**.
- Ein **HomeWhiz-Konto** (E-Mail + Passwort), in dem Ihre Geräte angelegt
  sind.
- Per **WLAN** verbundene Geräte. Reine Bluetooth-Geräte sind für Gladys
  nicht erreichbar (die Integration läuft in einem Container ohne
  Bluetooth-Funk): Die Schaltfläche **Verbindung testen** listet sie auf,
  sie werden aber nicht angelegt.
- Eine Internetverbindung: Die Geräte werden über die HomeWhiz-Cloud
  erreicht (**Cloud**-Integration).

## Konfiguration

1. Öffnen Sie den Reiter **Konfiguration** der Integration.
2. Geben Sie **E-Mail** und **Passwort** Ihres HomeWhiz-Kontos ein. Mit
   Google registriert? Legen Sie zuerst ein Passwort fest: in der
   HomeWhiz-App _Mein Konto_ → _Passwort ändern_ → _Passwort vergessen_.
3. Wählen Sie die **Sprache** der Funktionsnamen und Programmlisten
   (Englisch, Französisch, Deutsch oder Spanisch).
4. Speichern Sie und klicken Sie auf **Verbindung testen**: Die Meldung
   listet Ihre WLAN-Geräte und die reinen Bluetooth-Geräte auf.
5. Öffnen Sie den Reiter **Erkennung** und fügen Sie Ihre Geräte hinzu.

Um ein Gerät aus Gladys zu **steuern** (Start, Pause, Programmwahl),
aktivieren Sie die **Fernsteuerung** am Gerät selbst (oft ein langer Druck
auf die WLAN-/Fernsteuerungstaste). Ohne sie meldet das Gerät nur seinen
Zustand.

## Was Sie erhalten

Jedes Gerät wird zu einem Gladys-Gerät, dessen Funktionen vom Modell
abhängen:

- **Zustand** (ein, aus, läuft, pausiert, Startverzögerung) und ein
  **Ein/Aus**-Schalter;
- **Programm** und seine Optionen (Temperatur, Schleudern, Trocknungsgrad,
  Vorwäsche, Eco, Kurzprogramm…), als änderbare Listen oder Schalter;
- **Phase** des Zyklus (Waschen, Spülen, Schleudern, Trocknen…);
- **Restzeit**, **Dauer** und **Startverzögerung** in Minuten;
- **Warnungen** (Tür offen, kein Wasser, kein Salz, Klarspüler, Filter…),
  je ein Schalter plus ein zusammenfassender Text;
- Temperaturen von Kühl- und Gefrierfach, Backofentemperatur,
  Kochfeldzonen…;
- für eine **Klimaanlage**: Ein/Aus, Modus, Solltemperatur,
  Lüftergeschwindigkeit, Schwenkung und Raumtemperatur in der
  Standard-Klimakarte von Gladys.

Jedes Gerät wird jede Minute aktualisiert und meldet Änderungen in
Echtzeit.

## Szenen

Die Integration fügt dem Szenen-Editor eigene Karten hinzu (Kategorie
**Integrationen**):

- **Gerätezyklus gestartet** (Auslöser) — ein Programm startet. Der
  Programmname steht als `{{triggerEvent.data.program}}` zur Verfügung.
- **Gerätezyklus beendet** (Auslöser) — z. B. „Benachrichtige mich, wenn
  die Wäsche fertig ist“. Gleiche Variable `program`.
- **Gerätewarnung** (Auslöser) — Tür offen, kein Wasser, kein Salz… Die
  Warnung steht als `{{triggerEvent.data.warning_label}}` zur Verfügung.
- **Geräteprogramm starten** (Aktion) — wählen Sie optional ein Programm
  (sein Name wie in Gladys angezeigt, z. B. `Eco 40-60`) und eine
  Startverzögerung in Minuten, dann Start. Die Ausgabe `success` sagt, ob es
  geklappt hat, `reason` warum nicht (`remote_control_disabled`,
  `unknown_program`…).
- **Gerät steuern** (Aktion) — starten, pausieren, fortsetzen, ein- oder
  ausschalten.

Beispiel: den Geschirrspüler nachts zum günstigen Stromtarif starten und
am Ende des Zyklus eine Nachricht aufs Handy erhalten.

## Dashboard

- Widget **Haushaltsgeräte** — alle Geräte auf einen Blick: Zustand,
  Programm, Phase, Restzeit und Warnungen.
- Widget **Gerätezyklus** — ein Gerät (in den Widget-Einstellungen gewählt):
  Restzeit, Fortschrittsanzeige, Details und Tasten **Starten / Pause /
  Fortsetzen / Ausschalten**.

## Aktionen

- **Verbindung testen** — meldet sich neu an und listet Ihre Geräte auf.
- **Geräte neu laden** — lädt die Gerätekonfigurationen erneut herunter
  (nach dem Hinzufügen eines Geräts in der HomeWhiz-App oder einem
  Sprachwechsel). Aktualisieren Sie die Geräte danach im Reiter
  **Erkennung**.

## Fehlerbehebung

- **Anmeldung abgelehnt**: Prüfen Sie E-Mail und Passwort in der
  HomeWhiz-App; mit Google angelegte Konten brauchen ein Passwort (siehe
  oben).
- **Ein Gerät fehlt**: Es ist vielleicht ein reines Bluetooth-Gerät (siehe
  **Verbindung testen**) oder noch nicht in Ihrem HomeWhiz-Konto.
- **Befehle wirken nicht**: Aktivieren Sie die Fernsteuerung am Gerät.
- **Protokolle**: Öffnen Sie die Integration in Gladys, Reiter
  **Protokolle**. Passwort und Tokens werden nie protokolliert.
