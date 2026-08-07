# Backup-Sync in die Nextcloud

Lädt die Backup-Dateien der Apps (Kofferpacken, Donnerskat) täglich per WebDAV
in die Nextcloud. Der Desktop-Client holt sie von dort auf den Windows-Rechner,
sodass die Daten nicht mehr nur auf der Serverplatte liegen.

## Warum nur die Backups und nicht der ganze Stack-Ordner

Der Ordner `homeserver-stack` ist 499 MB groß – davon sind rund 495 MB
`node_modules` mit über 22.000 Dateien, die bei jedem Build neu entstehen und
jeden Sync-Client quälen. Der Code selbst liegt bereits im git. Übrig bleiben
als wirklich schützenswert die Backups: zusammen etwa 2,6 MB.

Die `.env`-Dateien (`nextcloud/db.env`, `nextcloud/.env`,
`website-weather-api/.env`) bewusst **nicht** mitzunehmen, ist eine
Sicherheitsentscheidung: Sie enthalten Datenbank-Passwörter, liegen aktuell nur
auf dem Server, und ein Sync würde sie auf jedes verbundene Gerät kopieren. Sie
ändern sich praktisch nie – einmal ins Passwortmanager-Archiv legen ist der
bessere Weg als sie dauerhaft zu synchronisieren.

## Einrichtung

1. In Nextcloud ein **App-Passwort** erzeugen: Einstellungen → Sicherheit →
   „Neues App-Passwort erstellen". Es lässt sich einzeln widerrufen.

2. Zugangsdaten hinterlegen:

   ```sh
   sudo cp backup-sync.env.example /etc/backup-sync.env
   sudo nano /etc/backup-sync.env      # NC_USER und NC_PASS eintragen
   sudo chown root:root /etc/backup-sync.env
   sudo chmod 600 /etc/backup-sync.env
   ```

3. Erst einmal trocken testen – das zeigt, was hochgeladen würde, ohne
   Zugangsdaten zu brauchen:

   ```sh
   sudo DRY_RUN=1 BACKUP_SYNC_ENV=/etc/backup-sync.env ./backup-sync.sh
   ```

4. Installieren und starten:

   ```sh
   sudo install -m 755 backup-sync.sh /usr/local/bin/backup-sync.sh
   sudo install -m 644 backup-sync.service backup-sync.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo /usr/local/bin/backup-sync.sh          # echter Erstlauf
   sudo systemctl enable --now backup-sync.timer
   ```

Der Erstlauf überträgt alles Vorhandene (aktuell rund 2,6 MB), danach kommt
pro Tag und App eine Datei von wenigen Kilobyte dazu.

## Kontrolle

```sh
systemctl list-timers backup-sync.timer
journalctl -u backup-sync.service -n 20
```

In der Nextcloud liegen die Dateien anschließend unter
`Programmierung/homeserver-backups/<app>/`, auf dem Windows-Rechner also in
`E:\NextcloudData\Programmierung\homeserver-backups\`.

## Verhalten

Hochgeladen wird nur, was in der Nextcloud fehlt – der Lauf ist damit beliebig
wiederholbar und schließt auch Lücken, wenn er ein paar Tage nicht lief.
Gelöscht wird in der Nextcloud nie: Die Apps behalten lokal die letzten 30
Backups, in der Nextcloud sammelt sich die vollständige Historie an. Wenn dir
das zu viel wird, kannst du dort gefahrlos alte Dateien von Hand löschen.
