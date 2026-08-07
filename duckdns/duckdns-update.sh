#!/bin/sh
# Meldet die eigenen Adressen dieses Servers an DuckDNS.
#
# Wichtig ist dabei der AAAA-Eintrag: IPv6 kennt kein NAT, ein AAAA auf die
# FritzBox würde Besucher also auf deren Weboberfläche statt auf diesen Server
# führen. Deshalb muss die Adresse dieses Hosts im DNS stehen – und nicht die
# des Routers, wie es die DynDNS-Funktion der FritzBox einträgt.
set -eu

CONF="${DUCKDNS_ENV:-/etc/duckdns.env}"
if [ -r "$CONF" ]; then
  . "$CONF"
fi

: "${DUCKDNS_DOMAIN:?DUCKDNS_DOMAIN fehlt (siehe duckdns.env.example)}"
: "${DUCKDNS_TOKEN:?DUCKDNS_TOKEN fehlt (siehe duckdns.env.example)}"
IFACE="${DUCKDNS_IFACE:-enp1s0}"

# Nur die stabile SLAAC-Adresse taugt für einen DNS-Eintrag: temporäre
# Privacy-Adressen wechseln mehrmals täglich und "deprecated" markierte nehmen
# keine neuen Verbindungen mehr an. [23] filtert zusätzlich die private
# ULA-Adresse (fd00::/8) heraus, die von außen nicht erreichbar ist.
ipv6=$(ip -6 addr show dev "$IFACE" scope global -temporary -deprecated |
  awk '/inet6 [23]/ { print $2 }' | cut -d/ -f1 | head -n1)

if [ -z "$ipv6" ]; then
  echo "Keine globale IPv6-Adresse auf $IFACE gefunden." >&2
  exit 1
fi

# Der Aufruf geht bewusst über IPv4 (-4): DuckDNS übernimmt den A-Eintrag dann
# aus der Absenderadresse, und das ist die WAN-IPv4 der FritzBox, die per
# Portfreigabe hierher zeigt. Die URL kommt über eine curl-Config von stdin,
# damit das Token nicht in der Prozessliste sichtbar wird.
response=$(
  printf 'url = "https://www.duckdns.org/update?domains=%s&token=%s&ipv6=%s&verbose=true"\n' \
    "$DUCKDNS_DOMAIN" "$DUCKDNS_TOKEN" "$ipv6" |
    curl -4 -fsS --max-time 20 -K -
)

case "$response" in
OK*)
  echo "DuckDNS aktualisiert (IPv6 $ipv6): $(echo "$response" | tr '\n' ' ')"
  ;;
*)
  echo "DuckDNS-Update fehlgeschlagen: $response" >&2
  exit 1
  ;;
esac
