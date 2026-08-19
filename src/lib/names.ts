// Namen sind der geräteübergreifende Schlüssel dieser App: IDs werden je Browser-Profil
// zufällig vergeben, ein Lebensmittel aus dem Vault oder aus einer Plan-Vorlage lässt sich
// also nur über den Namen wiederfinden. Damit dabei nicht bei jeder abweichenden Schreibweise
// ein zweiter Eintrag entsteht, läuft *jeder* Vergleich über denselben Schlüssel.

/** Vergleichsschlüssel für Lebensmittel, Übungen und Supplemente. */
export function nameKey(name: string): string {
  return name.trim().toLowerCase()
}

/** Nachschlagewerk über den Namen - so werden Referenzen geräteübergreifend aufgelöst. */
export function byName<T extends { name: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [nameKey(item.name), item]))
}

/**
 * Sucht in bereits geladenen Zeilen über den Namensschlüssel. Bewusst nicht über Dexies
 * `equalsIgnoreCase`: Der Index fände einen Bestandseintrag mit Leerzeichen am Rand nicht, und
 * genau solche Abweichungen sollen hier zusammenfallen.
 *
 * In Schleifen stattdessen einmal `byName()` aufbauen und die Karte mitführen.
 */
export function findByName<T extends { name: string }>(rows: T[], name: string): T | undefined {
  const key = nameKey(name)
  return rows.find((row) => nameKey(row.name) === key)
}
