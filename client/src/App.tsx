import { useQuery } from '@tanstack/react-query';

interface HealthResponse {
  status: string;
  message: string;
  timestamp: string;
}

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) {
    throw new Error(`Backend responded with ${res.status}`);
  }
  return (await res.json()) as HealthResponse;
}

function App() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
  });

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 p-8">
        <h1 className="text-2xl font-semibold text-slate-900">
          Job Application Assistant
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Phase 1 — frontend &amp; backend connectivity check
        </p>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Backend status
          </div>

          {isLoading && (
            <p className="mt-2 text-slate-600">Checking backend…</p>
          )}

          {isError && (
            <p className="mt-2 text-red-600">
              Could not reach backend:{' '}
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          )}

          {data && (
            <div className="mt-2 space-y-1">
              <p className="flex items-center gap-2 text-emerald-600 font-medium">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                {data.status.toUpperCase()}
              </p>
              <p className="text-slate-700">{data.message}</p>
              <p className="text-xs text-slate-400">
                as of {new Date(data.timestamp).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default App;
