#!/bin/sh
# Lädt die lokalen Backup-Dateien per WebDAV in die Nextcloud, damit sie nicht
# nur auf der Serverplatte liegen. Von dort holt der Desktop-Client sie auf den
# Windows-Rechner – dadurch existieren die Listen auf mehreren Geräten.
#
# Hochgeladen wird nur, was drüben fehlt: der Lauf ist damit wiederholbar und
# holt auch Lücken nach, wenn er mal ein paar Tage nicht lief.
set -eu

CONF="${BACKUP_SYNC_ENV:-/etc/backup-sync.env}"
if [ -r "$CONF" ]; then
  . "$CONF"
fi

: "${NC_BASE_URL:?NC_BASE_URL fehlt (siehe backup-sync.env.example)}"
: "${NC_USER:?NC_USER fehlt (siehe backup-sync.env.example)}"
: "${NC_PASS:?NC_PASS fehlt (siehe backup-sync.env.example)}"
# Alle Apps mit Backups sind Vorgabe, damit eine knappe Konfiguration nicht
# versehentlich eine davon auslässt; in der env-Datei lässt sich das
# überschreiben.
STACK_DIR="${STACK_DIR:-/home/tristans/homeserver-stack}"
BACKUP_DIRS="${BACKUP_DIRS:-$STACK_DIR/kofferpacken/backups $STACK_DIR/donnerskat/backups $STACK_DIR/fahrradtracker/backups}"
REMOTE_DIR="${NC_REMOTE_DIR:-Programmierung/homeserver-backups}"
DRY_RUN="${DRY_RUN:-0}"

DAV="${NC_BASE_URL%/}/remote.php/dav/files/${NC_USER}"

# Zugangsdaten kommen über eine curl-Config von stdin, damit das App-Passwort
# nicht in der Prozessliste steht.
nc_curl() {
  printf 'user = "%s:%s"\n' "$NC_USER" "$NC_PASS" | curl -sS -K - "$@"
}

# Legt einen Ordner an; 405 heißt, es gibt ihn schon.
mkcol() {
  status=$(nc_curl -o /dev/null -w '%{http_code}' -X MKCOL "$1")
  case "$status" in
  201 | 405) return 0 ;;
  *)
    echo "Ordner anlegen fehlgeschlagen: $1 → HTTP $status" >&2
    return 1
    ;;
  esac
}

# Verschachtelte Zielordner Stück für Stück anlegen
path=""
for segment in $(echo "$REMOTE_DIR" | tr '/' ' '); do
  path="${path:+$path/}$segment"
  [ "$DRY_RUN" = "1" ] || mkcol "$DAV/$path"
done

uploaded=0
skipped=0

for dir in $BACKUP_DIRS; do
  if [ ! -d "$dir" ]; then
    echo "Übersprungen, kein Ordner: $dir" >&2
    continue
  fi

  # Der Name der App steckt im übergeordneten Ordner (…/kofferpacken/backups)
  app=$(basename "$(dirname "$dir")")
  [ "$DRY_RUN" = "1" ] || mkcol "$DAV/$REMOTE_DIR/$app"

  for file in "$dir"/*.json; do
    [ -e "$file" ] || continue
    target="$DAV/$REMOTE_DIR/$app/$(basename "$file")"

    if [ "$DRY_RUN" = "1" ]; then
      echo "  [dry-run] $file → $REMOTE_DIR/$app/$(basename "$file")"
      uploaded=$((uploaded + 1))
      continue
    fi

    status=$(nc_curl -o /dev/null -w '%{http_code}' -I "$target")
    if [ "$status" = "200" ]; then
      skipped=$((skipped + 1))
      continue
    fi

    status=$(nc_curl -o /dev/null -w '%{http_code}' -T "$file" "$target")
    case "$status" in
    201 | 204)
      uploaded=$((uploaded + 1))
      ;;
    *)
      echo "Upload fehlgeschlagen: $file → HTTP $status" >&2
      ;;
    esac
  done
done

echo "Backup-Sync fertig: $uploaded hochgeladen, $skipped bereits vorhanden."
