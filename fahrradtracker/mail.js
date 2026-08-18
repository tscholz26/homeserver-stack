/**
 * Benachrichtigungen per E-Mail.
 *
 * Verschickt wird nur, was neu ist: Jede Meldung wird am Teil vermerkt, damit
 * aus „die Kette ist überfällig“ nicht jede Stunde eine Mail wird. Der Vermerk
 * hängt am laufenden Einbau – wird ein Teil neu aufgezogen, fängt alles von
 * vorn an.
 */
import { createTransport } from 'nodemailer'

const HOST = process.env.SMTP_HOST || ''
const PORT = Number(process.env.SMTP_PORT) || 587
const USER = process.env.SMTP_USER || ''
const PASS = process.env.SMTP_PASS || ''
const FROM = process.env.SMTP_FROM || USER
const APP_URL = (process.env.PUBLIC_URL || 'https://tshomeserv.duckdns.org/fahrrad').replace(
  /\/+$/,
  '',
)

export const MAIL_CONFIGURED = Boolean(HOST && FROM)

let transport
function verbindung() {
  if (!transport) {
    transport = createTransport({
      host: HOST,
      port: PORT,
      // 465 spricht TLS von Anfang an, 587 handelt es über STARTTLS aus
      secure: PORT === 465,
      auth: USER ? { user: USER, pass: PASS } : undefined,
    })
  }
  return transport
}

const FARBEN = {
  wachsen: { farbe: '#0891b2', wort: 'Wechseln fällig' },
  gelb: { farbe: '#c2740a', wort: 'Bald fällig' },
  rot: { farbe: '#b91c1c', wort: 'Überfällig' },
}

function zeile(m) {
  const { farbe, wort } = FARBEN[m.art] ?? FARBEN.gelb
  return `
    <tr>
      <td style="padding:14px 16px;border:1px solid #e6e2da;border-radius:14px;background:#ffffff">
        <div style="font:700 11px/1.4 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:${farbe}">
          ${wort}
        </div>
        <div style="font:600 17px/1.4 system-ui,sans-serif;color:#1a1c22;margin-top:4px">
          ${m.teil}
        </div>
        <div style="font:400 14px/1.5 system-ui,sans-serif;color:#5a6472;margin-top:2px">
          ${m.rad} · ${m.text}
        </div>
      </td>
    </tr>
    <tr><td style="height:10px"></td></tr>`
}

/** Die Mail selbst – schlichte Tabellen, damit sie überall gleich aussieht. */
function vorlage(name, meldungen) {
  const titel =
    meldungen.length === 1 ? meldungen[0].kurz : `${meldungen.length} Teile brauchen Aufmerksamkeit`
  return `<!doctype html>
<html lang="de">
  <body style="margin:0;padding:24px 12px;background:#fbf9f5">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto">
      <tr>
        <td style="padding-bottom:18px">
          <div style="font:700 11px/1.4 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#7c3aed">
            Fahrradtracker
          </div>
          <div style="font:700 24px/1.3 system-ui,sans-serif;color:#1a1c22;margin-top:4px">
            ${titel}
          </div>
          <div style="font:400 15px/1.55 system-ui,sans-serif;color:#5a6472;margin-top:8px">
            Hallo ${name}, hier ist, was am Rad gerade ansteht.
          </div>
        </td>
      </tr>
      ${meldungen.map(zeile).join('')}
      <tr>
        <td style="padding-top:6px">
          <a href="${APP_URL}/"
             style="display:inline-block;padding:12px 22px;border-radius:999px;background:#7c3aed;color:#ffffff;font:600 15px/1 system-ui,sans-serif;text-decoration:none">
            Im Tracker ansehen →
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding-top:18px;font:400 12px/1.5 system-ui,sans-serif;color:#8a93a2">
          Diese Nachricht kommt von deinem Homeserver. Empfänger ändern oder abschalten:
          Fahrradtracker → Verwaltung → Einstellungen.
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function alsText(name, meldungen) {
  const zeilen = meldungen.map((m) => `- ${FARBEN[m.art]?.wort}: ${m.teil} (${m.rad}) – ${m.text}`)
  return `Hallo ${name},\n\nhier ist, was am Rad gerade ansteht:\n\n${zeilen.join('\n')}\n\n${APP_URL}/\n`
}

/** Schickt eine Sammelmail; gibt zurück, ob sie rausging. */
export async function schickeMeldungen(empfaenger, name, meldungen) {
  if (!MAIL_CONFIGURED || !empfaenger || !meldungen.length) return false
  const betreff =
    meldungen.length === 1
      ? `Fahrradtracker: ${meldungen[0].kurz}`
      : `Fahrradtracker: ${meldungen.length} Teile brauchen Aufmerksamkeit`
  await verbindung().sendMail({
    from: FROM,
    to: empfaenger,
    subject: betreff,
    text: alsText(name, meldungen),
    html: vorlage(name, meldungen),
  })
  return true
}

/** Eine Probemail, damit sich die Einrichtung prüfen lässt. */
export function schickeProbe(empfaenger, name) {
  return schickeMeldungen(empfaenger, name, [
    {
      art: 'wachsen',
      kurz: 'Probenachricht',
      teil: 'Kette 1',
      rad: 'Beispielrad',
      text: 'So sieht eine Benachrichtigung aus. Wenn du das liest, stimmt die Einrichtung.',
    },
  ])
}
