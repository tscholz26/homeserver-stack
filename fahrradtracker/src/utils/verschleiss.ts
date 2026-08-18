/**
 * Alles, was aus Kilometern eine Aussage macht: die Ampel und die Texte
 * darunter. Die Schwellen kommen aus den Einstellungen und stehen bewusst
 * nirgends fest im Code – in der Verwaltung sind sie einstellbar.
 */
export type Ampel = 'gruen' | 'gelb' | 'rot'

export interface Thresholds {
  yellow: number
  red: number
}

export function ampel(percent: number, thresholds: Thresholds): Ampel {
  if (percent >= thresholds.red) return 'rot'
  if (percent >= thresholds.yellow) return 'gelb'
  return 'gruen'
}

const AMPEL_FARBE: Record<Ampel, string> = {
  gruen: 'var(--green)',
  gelb: 'var(--amber)',
  rot: 'var(--red)',
}

export function ampelFarbe(stufe: Ampel): string {
  return AMPEL_FARBE[stufe]
}

const AMPEL_WORT: Record<Ampel, string> = {
  gruen: 'alles gut',
  gelb: 'bald fällig',
  rot: 'überfällig',
}

export function ampelWort(stufe: Ampel): string {
  return AMPEL_WORT[stufe]
}

/** Kilometer, wie man sie hinschreibt: „1.234 km“, unter 100 mit einer Stelle. */
export function kmText(km: number): string {
  const wert = Number(km) || 0
  return `${wert.toLocaleString('de-DE', {
    maximumFractionDigits: wert < 100 ? 1 : 0,
  })} km`
}

/** ISO-Datum → 04.04.2026; leere oder kaputte Werte bleiben leer. */
export function datumText(iso: string | null | undefined): string {
  if (!iso) return ''
  const [jahr, monat, tag] = iso.slice(0, 10).split('-')
  if (!jahr || !monat || !tag) return ''
  return `${tag}.${monat}.${jahr}`
}

/** Ein Nutzungszeitraum als Zeile: „04.04.2026 – 18.08.2026“, offen „seit …“. */
export function zeitraumText(von: string, bis: string | null): string {
  return bis ? `${datumText(von)} – ${datumText(bis)}` : `seit ${datumText(von)}`
}

/** Wie weit der Ring gefüllt ist – über 100 % bleibt er voll. */
export function ringAnteil(percent: number): number {
  return Math.max(0, Math.min(100, Number(percent) || 0))
}

/** Heute als ISO-Datum, für die Datumsfelder. */
export function heute(): string {
  const jetzt = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${jetzt.getFullYear()}-${pad(jetzt.getMonth() + 1)}-${pad(jetzt.getDate())}`
}
