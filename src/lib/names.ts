/**
 * Vergleichsschlüssel für Namen (Lebensmittel, Übungen, Supplemente, Athleten, Plan-Phasen).
 *
 * Namen sind in dieser App der einzige geräteübergreifend gültige Bezug: IDs werden pro
 * Browser-Profil zufällig vergeben, dieselbe Übung heißt auf zwei Geräten also gleich, hat aber
 * verschiedene IDs. Damit "Whey ", "whey" und "Whey" als derselbe Eintrag gelten, wird für jeden
 * Vergleich dieser Schlüssel benutzt - und zwar überall gleich (Import, Seeds, Bereinigung),
 * sonst legt die eine Stelle an, was die andere für vorhanden hält.
 */
export function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Nachschlagewerk über den Namen - so werden Referenzen geräteübergreifend aufgelöst. */
export function byName<T extends { name: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [nameKey(item.name), item]))
}
