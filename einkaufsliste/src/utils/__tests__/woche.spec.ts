import { describe, expect, it } from 'vitest'
import type { Haltbarkeit } from '@/utils/haltbarkeit'
import { wocheNachHaltbarkeit } from '@/utils/woche'

const eintrag = (name: string, h: Haltbarkeit, addedAt: string) => ({ name, h, addedAt })

describe('wocheNachHaltbarkeit', () => {
  it('stellt Frisches vor den Vorrat und Unbestimmtes ans Ende', () => {
    const woche = [
      eintrag('Linsencurry', 'vorrat', '2026-11-10'),
      eintrag('Pinsa', '', '2026-11-09'),
      eintrag('Halloumi Burger', 'frisch', '2026-11-12'),
    ]
    const abschnitte = wocheNachHaltbarkeit(woche, (e) => e.h)
    expect(abschnitte.map((a) => a.id)).toEqual(['frisch', 'vorrat', ''])
  })

  it('zeigt innerhalb eines Abschnitts das am längsten Eingeplante zuerst', () => {
    const woche = [
      eintrag('Caesar Salad', 'frisch', '2026-11-14'),
      eintrag('Flammkuchen', 'frisch', '2026-11-09'),
      eintrag('Shakshuka', 'frisch', '2026-11-12'),
    ]
    const [frisch] = wocheNachHaltbarkeit(woche, (e) => e.h)
    expect(frisch!.eintraege.map((e) => e.name)).toEqual([
      'Flammkuchen',
      'Shakshuka',
      'Caesar Salad',
    ])
  })

  it('kennt mehr als sieben Gerichte und dasselbe Gericht zweimal', () => {
    const woche = Array.from({ length: 9 }, (_, i) =>
      eintrag('Pasta', 'vorrat', `2026-11-0${i + 1}`),
    )
    const abschnitte = wocheNachHaltbarkeit(woche, (e) => e.h)
    expect(abschnitte).toHaveLength(1)
    expect(abschnitte[0]!.eintraege).toHaveLength(9)
  })

  it('lässt leere Abschnitte weg', () => {
    expect(wocheNachHaltbarkeit([], () => 'frisch')).toEqual([])
  })
})
