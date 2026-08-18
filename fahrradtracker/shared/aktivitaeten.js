/**
 * Was eine Fahrt mit einem Rad zu tun hat – und wie daraus Kilometer werden.
 *
 * Absichtlich ohne Bezug zum Anbieter: eine Aktivität ist hier
 * `{ userId, date, km, workoutTypeId }`, egal woher sie kam. Wechselt die
 * Quelle noch einmal (Strava → Wahoo → was auch immer), bleibt die
 * Verschleißrechnung unberührt; nur das Einsammeln in server.js ändert sich.
 */

/**
 * Zählt eine Fahrt für dieses Rad? Wahoo kennt kein „Gear“ wie Strava, also
 * entscheidet die Sportart: Jedes Rad bekommt in der Verwaltung die
 * Wahoo-Workout-Typen zugeteilt, die zu ihm gehören (Rennrad → Road Biking,
 * MTB → Mountain Biking, Rolle → Indoor). Ein Typ gehört immer nur zu einem
 * Rad je Profil – sonst zählte dieselbe Fahrt doppelt.
 */
export function passtZumRad(bike, activity) {
  if (!bike || !activity) return false
  if (activity.userId !== bike.ownerId) return false
  const typen = bike.workoutTypeIds
  if (!Array.isArray(typen) || !typen.length) return false
  return typen.includes(activity.workoutTypeId)
}

/**
 * Kilometer eines Rades in einem Zeitraum. Beide Randtage zählen mit: wird an
 * einem Tag gewechselt, zählt die Fahrt dieses Tages für das alte *und* das
 * neue Teil – die Variante, die nie Kilometer verschluckt.
 */
export function kmImZeitraum(bike, activities, von, bis) {
  let summe = 0
  for (const a of activities) {
    if (!passtZumRad(bike, a)) continue
    if (a.date < von || a.date > bis) continue
    summe += Number(a.km) || 0
  }
  return Math.round(summe * 10) / 10
}

/** Alle Typen, die an den Rädern eines Profils hängen. */
export function zugeteilteTypen(bikes, ownerId) {
  return new Set(bikes.filter((b) => b.ownerId === ownerId).flatMap((b) => b.workoutTypeIds ?? []))
}
