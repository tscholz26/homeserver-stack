#!/bin/sh
# Schreibt den aktuellen Katalog- und Rezeptstand als Commit fest.
#
# Der Server legt export/katalog.json und export/rezepte.json bei jeder
# Änderung neu an – ins git kommen sie damit aber noch nicht. Dieses Skript
# macht genau das, und nur das: kein push (das Repo ist öffentlich), kein
# Anfassen von Code oder Listen.
#
# Von Hand:   einkaufsliste/scripts/katalog-sichern.sh
# Per cron:   0 3 * * * /home/tristans/homeserver-stack/einkaufsliste/scripts/katalog-sichern.sh
set -eu

cd "$(dirname "$0")/.."

git add export/katalog.json export/rezepte.json

if git diff --cached --quiet -- export; then
  echo "Katalog und Rezepte unverändert – nichts zu sichern."
  exit 0
fi

git commit -q -m "Update the catalog and the recipe book"
echo "Gesichert: $(git log -1 --format='%h %s')"
