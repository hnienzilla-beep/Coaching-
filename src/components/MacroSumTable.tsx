import { CAL_TOLERANCE, MACRO_TOLERANCE, diffToneClass, type MacroTarget, type Sums } from '../lib/macros'

/**
 * Ist/Ziel/Differenz in Zahlen - die genaue Ansicht für Coaches. Im Ernährungslog liegt
 * sie hinter "Details", im Ernährungsplan steht sie unter der Mahlzeitenliste.
 */
export default function MacroSumTable({ sums, target }: { sums: Sums; target: MacroTarget }) {
  const diffKcal = sums.kcal - target.targetCalories
  const diffProtein = sums.protein - target.proteinG
  const diffCarbs = sums.carbs - target.carbsG
  const diffFat = sums.fat - target.fatG

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-muted">
          <th></th>
          <th>Kcal</th>
          <th>Protein</th>
          <th>Carbs</th>
          <th>Fett</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="text-muted">Summe (Ist)</td>
          <td>{sums.kcal.toFixed(0)}</td>
          <td>{sums.protein.toFixed(0)}</td>
          <td>{sums.carbs.toFixed(0)}</td>
          <td>{sums.fat.toFixed(0)}</td>
        </tr>
        <tr>
          <td className="text-muted">Ziel</td>
          <td>{target.targetCalories}</td>
          <td>{target.proteinG}</td>
          <td>{target.carbsG}</td>
          <td>{target.fatG}</td>
        </tr>
        <tr className="font-medium">
          <td className="text-muted">Differenz</td>
          <td className={diffToneClass(diffKcal, CAL_TOLERANCE)}>{diffKcal.toFixed(0)}</td>
          <td className={diffToneClass(diffProtein, MACRO_TOLERANCE)}>{diffProtein.toFixed(0)}</td>
          <td className={diffToneClass(diffCarbs, MACRO_TOLERANCE)}>{diffCarbs.toFixed(0)}</td>
          <td className={diffToneClass(diffFat, MACRO_TOLERANCE)}>{diffFat.toFixed(0)}</td>
        </tr>
      </tbody>
    </table>
  )
}
