# DuckDNS-Updater

Hält `tshomeserv.duckdns.org` aktuell – **und zwar mit den Adressen dieses
Servers**, nicht mit denen der FritzBox.

## Warum

Die DynDNS-Funktion der FritzBox trägt ihre eigenen WAN-Adressen ein. Bei IPv4
ist das egal, weil die Portfreigabe den Verkehr per NAT hierher weiterreicht.
IPv6 kennt aber kein NAT: Der AAAA-Eintrag zeigte deshalb direkt auf die
FritzBox, und Geräte im Heimnetz landeten auf deren Weboberfläche statt auf
den Apps (aus fremden Netzen fiel es nicht auf, weil dort die IPv6-Firewall
der FritzBox greift und der Browser auf IPv4 zurückfällt).

Dieser Updater meldet stattdessen die stabile globale IPv6 dieses Hosts.
Zusammen mit einer IPv6-Portfreigabe in der FritzBox ist der Server damit
auch über IPv6 direkt erreichbar.

## Einrichtung

1. Zugangsdaten hinterlegen:

   ```sh
   sudo cp duckdns.env.example /etc/duckdns.env
   sudo nano /etc/duckdns.env      # Token von duckdns.org eintragen
   sudo chown root:root /etc/duckdns.env
   sudo chmod 600 /etc/duckdns.env
   ```

2. Skript und Timer installieren:

   ```sh
   sudo install -m 755 duckdns-update.sh /usr/local/bin/duckdns-update.sh
   sudo install -m 644 duckdns.service duckdns.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now duckdns.timer
   ```

3. Einmal von Hand testen:

   ```sh
   sudo /usr/local/bin/duckdns-update.sh     # erwartet: "DuckDNS aktualisiert (IPv6 …): OK …"
   systemctl list-timers duckdns.timer
   journalctl -u duckdns.service -n 20
   ```

## Schritte in der FritzBox (Weboberfläche)

1. **DynDNS auf IPv4 beschränken** – „Internet → Freigaben → DynDNS": in der
   Update-URL den Teil `&ipv6=<ip6addr>` löschen, den Rest stehen lassen. Die
   URL sieht danach so aus:

   ```
   https://www.duckdns.org/update?domains=<domain>&token=<pass>&ip=<ipaddr>
   ```

   DynDNS **nicht** komplett abschalten: Die FritzBox merkt eine neue WAN-IPv4
   im Moment der Neuverbindung und meldet sie sofort – deutlich schneller und
   unabhängiger als jeder Updater auf diesem Server. Der A-Eintrag bleibt so an
   der zuverlässigsten Stelle, und dieses Skript kümmert sich nur noch um die
   IPv6, die die FritzBox nicht richtig setzen kann. (Das Skript meldet die
   IPv4 nebenbei mit und ist damit zusätzlich Reserve, falls die FritzBox
   einmal ausfällt.)

2. **IPv6-Portfreigabe für diesen Server** – „Internet → Freigaben →
   Portfreigaben → Gerät für Freigaben hinzufügen": den Server auswählen und
   Freigaben für **HTTPS (443)** und **HTTP (80)** anlegen, jeweils mit
   IPv6 aktiviert. Port 80 braucht Caddy für die Zertifikatsverlängerung.

   Falls die FritzBox nach der **Interface-ID** fragt, ist es diese hier:

   ```
   ::f64d:30ff:fea6:4be3
   ```

   Sie bleibt konstant, auch wenn die Telekom täglich das Präfix wechselt –
   die Freigabe muss also nur einmal angelegt werden.

## Kontrolle

Nach der Einrichtung sollten beide Einträge auf diesen Server zeigen:

```sh
dig +short A    tshomeserv.duckdns.org @1.1.1.1     # WAN-IPv4 der FritzBox
dig +short AAAA tshomeserv.duckdns.org @1.1.1.1     # 2a02:…:f64d:30ff:fea6:4be3
```

Ein Test von außen (z. B. Handy im Mobilfunknetz) darf keine
Zertifikatswarnung mehr zeigen: Warnung = FritzBox, kein Zertifikatsfehler =
dieser Server.

## Was passiert, wenn dieser Updater ausfällt

Nichts Dramatisches: Ein veralteter oder fehlender AAAA-Eintrag ist kein
Ausfall. Browser probieren dann kurz IPv6, laufen in einen Fehler und nehmen
innerhalb von Sekundenbruchteilen IPv4 – genau das passiert heute schon von
unterwegs. Der A-Eintrag, an dem die Erreichbarkeit wirklich hängt, kommt
weiterhin von der FritzBox.

Nach einem Präfixwechsel der Telekom ist der AAAA-Eintrag bis zu 5 Minuten
veraltet; auch in diesem Fenster trägt IPv4. Die IPv6-Portfreigabe muss nicht
angefasst werden, weil die Interface-ID dieses Servers aus der MAC-Adresse
gebildet wird (`addrgenmode eui`) und sich beim Präfixwechsel nicht ändert.
