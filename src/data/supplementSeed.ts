import type { SupplementTiming } from '../models/types'

export interface SupplementSeed {
  name: string
  defaultDose: string
  defaultTiming: SupplementTiming
  notes?: string
}

// Startbestand gängiger Supplements, vom Nutzer erweiterbar.
export const SUPPLEMENT_SEED: SupplementSeed[] = [
  { name: 'Kreatin Monohydrat', defaultDose: '5 g', defaultTiming: 'Morgens', notes: 'Täglich gleichbleibend, Timing egal' },
  { name: 'Whey Protein', defaultDose: '30 g', defaultTiming: 'Nach dem Training', notes: 'Schnell verfügbares Protein' },
  { name: 'Casein Protein', defaultDose: '30 g', defaultTiming: 'Vor dem Schlafen', notes: 'Langsam verdauliches Protein' },
  { name: 'Omega-3 Fischöl', defaultDose: '2 Kapseln', defaultTiming: 'Morgens', notes: 'Mit einer Mahlzeit einnehmen' },
  { name: 'Vitamin D3', defaultDose: '2000 I.E.', defaultTiming: 'Morgens', notes: 'Mit fetthaltiger Mahlzeit' },
  { name: 'Vitamin D3 + K2', defaultDose: '1 Kapsel', defaultTiming: 'Morgens' },
  { name: 'Magnesium', defaultDose: '400 mg', defaultTiming: 'Vor dem Schlafen', notes: 'Unterstützt Regeneration/Schlaf' },
  { name: 'Zink', defaultDose: '15 mg', defaultTiming: 'Abends' },
  { name: 'Multivitamin', defaultDose: '1 Tablette', defaultTiming: 'Morgens' },
  { name: 'ZMA', defaultDose: '3 Kapseln', defaultTiming: 'Vor dem Schlafen', notes: 'Nicht mit Milchprodukten kombinieren' },
  { name: 'Beta-Alanin', defaultDose: '3 g', defaultTiming: 'Vor dem Training', notes: 'Kribbeln auf der Haut möglich' },
  { name: 'Citrullin Malat', defaultDose: '6 g', defaultTiming: 'Vor dem Training' },
  { name: 'Koffein', defaultDose: '200 mg', defaultTiming: 'Vor dem Training' },
  { name: 'L-Carnitin', defaultDose: '2 g', defaultTiming: 'Vor dem Training' },
  { name: 'EAA (Essenzielle Aminosäuren)', defaultDose: '10 g', defaultTiming: 'Vor dem Training' },
  { name: 'BCAA', defaultDose: '5 g', defaultTiming: 'Vor dem Training' },
  { name: 'Kollagen', defaultDose: '10 g', defaultTiming: 'Morgens', notes: 'Für Gelenke/Haut' },
  { name: 'Elektrolyte', defaultDose: '1 Portion', defaultTiming: 'Vor dem Training' },
  { name: 'Vitamin B-Komplex', defaultDose: '1 Kapsel', defaultTiming: 'Morgens' },
  { name: 'Eisen', defaultDose: '14 mg', defaultTiming: 'Morgens', notes: 'Nicht mit Kaffee/Tee einnehmen' },
  { name: 'Ashwagandha', defaultDose: '600 mg', defaultTiming: 'Abends', notes: 'Kann Stresslevel senken' },
  { name: 'Probiotika', defaultDose: '1 Kapsel', defaultTiming: 'Morgens' },
  { name: 'Glutamin', defaultDose: '5 g', defaultTiming: 'Nach dem Training' },
  { name: 'Taurin', defaultDose: '1 g', defaultTiming: 'Vor dem Training' },
  { name: 'Grünteeextrakt', defaultDose: '500 mg', defaultTiming: 'Morgens' },
  { name: 'Vitamin C', defaultDose: '500 mg', defaultTiming: 'Morgens' },
  { name: 'Omega-3 Algenöl (vegan)', defaultDose: '2 Kapseln', defaultTiming: 'Morgens' },
]
