/**
 * How a fit score is described and coloured.
 *
 * Shared by the result view and the history list so the same number can never
 * be labelled two different ways. Colour is always paired with the label —
 * `band.label` is rendered wherever the colour is, never colour alone.
 */
export interface ScoreBand {
  label: string;
  description: string;
  /** Meter fill. */
  fill: string;
  /** Meter track: a lighter step of the same hue. */
  track: string;
  text: string;
  /** Compact badge for list rows. */
  chip: string;
}

export function scoreBand(score: number): ScoreBand {
  if (score >= 75) {
    return {
      label: 'Strong match',
      description: 'You cover most of what this posting asks for.',
      fill: 'bg-emerald-600',
      track: 'bg-emerald-100',
      text: 'text-emerald-700',
      chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    };
  }
  if (score >= 45) {
    return {
      label: 'Partial match',
      description: 'Worth applying, but address the gaps below first.',
      fill: 'bg-amber-500',
      track: 'bg-amber-100',
      text: 'text-amber-700',
      chip: 'bg-amber-50 text-amber-700 ring-amber-200',
    };
  }
  return {
    label: 'Weak match',
    description: 'This posting asks for a lot you have not evidenced.',
    fill: 'bg-red-600',
    track: 'bg-red-100',
    text: 'text-red-700',
    chip: 'bg-red-50 text-red-700 ring-red-200',
  };
}
