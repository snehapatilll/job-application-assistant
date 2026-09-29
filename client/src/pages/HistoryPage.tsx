import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import { scoreBand } from '../lib/scoreBand';
import type { AnalysisPage, AnalysisSummary } from '../lib/types';

const PAGE_SIZE = 20;

function HistoryRow({ analysis }: { analysis: AnalysisSummary }) {
  const band = scoreBand(analysis.fitScore);

  return (
    <li>
      <Link
        to={`/analyses/${String(analysis.id)}`}
        className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50"
      >
        {/* Score and band label travel together, so the colour is never the
            only thing carrying the meaning. */}
        <span
          className={`flex w-16 shrink-0 flex-col items-center rounded-lg px-2 py-1.5 ring-1 ${band.chip}`}
        >
          <span className="text-lg leading-none font-semibold">{analysis.fitScore}</span>
          <span className="mt-0.5 text-[10px] leading-tight">{band.label.split(' ')[0]}</span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-slate-900">{analysis.jobTitle}</span>
          <span className="block truncate text-sm text-slate-500">
            {analysis.resumeFilename} · {new Date(analysis.createdAt).toLocaleDateString()}
          </span>
        </span>

        <span aria-hidden className="shrink-0 text-slate-400">
          →
        </span>
      </Link>
    </li>
  );
}

export function HistoryPage() {
  const { data, isPending, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['analyses', 'history'],
      initialPageParam: 0,
      queryFn: ({ pageParam }) =>
        apiRequest<AnalysisPage>(
          'GET',
          `/api/analyses?limit=${String(PAGE_SIZE)}&offset=${String(pageParam)}`,
        ),
      // The API answers "is there more?" directly, so the next offset is just
      // how many rows have been loaded so far.
      getNextPageParam: (lastPage, allPages) =>
        lastPage.hasMore ? allPages.length * PAGE_SIZE : undefined,
    });

  const analyses = data?.pages.flatMap((page) => page.analyses) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">History</h1>
        <p className="mt-1 text-sm text-slate-500">Every analysis you have run, newest first.</p>
      </div>

      {isPending && <p className="text-slate-500">Loading…</p>}

      {isError && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</p>
      )}

      {!isPending && !isError && analyses.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-slate-900">No analyses yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            Run one and it will show up here so you can reopen it later.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            New analysis
          </Link>
        </div>
      )}

      {analyses.length > 0 && (
        <ul className="space-y-3">
          {analyses.map((analysis) => (
            <HistoryRow key={analysis.id} analysis={analysis} />
          ))}
        </ul>
      )}

      {hasNextPage && (
        <button
          type="button"
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
          className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
