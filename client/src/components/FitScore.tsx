import type { AnalysisResult } from '../lib/types';

/**
 * The fit score is a single ratio against a limit, so it is drawn as a meter
 * with a hero figure — not a ring or gauge, which read as decoration and make
 * the value harder to compare.
 *
 * The fill carries severity and the unfilled track is a lighter step of the
 * same hue, so the state reads across the whole bar. Colour never carries the
 * meaning alone: the band is always spelled out in words beside it.
 */

interface Band {
  label: string;
  description: string;
  fill: string;
  track: string;
  text: string;
}

function bandFor(score: number): Band {
  if (score >= 75) {
    return {
      label: 'Strong match',
      description: 'You cover most of what this posting asks for.',
      fill: 'bg-emerald-600',
      track: 'bg-emerald-100',
      text: 'text-emerald-700',
    };
  }
  if (score >= 45) {
    return {
      label: 'Partial match',
      description: 'Worth applying, but address the gaps below first.',
      fill: 'bg-amber-500',
      track: 'bg-amber-100',
      text: 'text-amber-700',
    };
  }
  return {
    label: 'Weak match',
    description: 'This posting asks for a lot you have not evidenced.',
    fill: 'bg-red-600',
    track: 'bg-red-100',
    text: 'text-red-700',
  };
}

export function FitScore({ result }: { result: AnalysisResult }) {
  const band = bandFor(result.fitScore);
  const { earnedWeight, totalWeight } = result.scoreBreakdown;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-end gap-4">
        {/* Hero figure: proportional figures, not tabular — at display sizes
            tabular-nums makes a number like 121 look loose. */}
        <p className="text-6xl leading-none font-semibold text-slate-900">{result.fitScore}</p>
        <div className="pb-1">
          <p className="text-sm text-slate-500">out of 100</p>
          <p className={`text-sm font-medium ${band.text}`}>{band.label}</p>
        </div>
      </div>

      <div
        className={`mt-5 h-2 w-full overflow-hidden rounded-full ${band.track}`}
        role="meter"
        aria-valuenow={result.fitScore}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Fit score: ${String(result.fitScore)} out of 100, ${band.label}`}
      >
        <div
          className={`h-full rounded-full ${band.fill}`}
          style={{ width: `${String(result.fitScore)}%` }}
        />
      </div>

      <p className="mt-3 text-sm text-slate-600">{band.description}</p>

      {/* The arithmetic, so the number never looks like it came from nowhere. */}
      <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
        Weighted skill coverage: {earnedWeight} of {totalWeight} points. Critical skills
        count 3, important 2, nice-to-have 1.
      </p>
    </section>
  );
}
