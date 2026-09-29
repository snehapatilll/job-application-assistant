import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest, apiUpload } from '../lib/api';
import type { Analysis, ResumeSummary } from '../lib/types';

/** Mirrors the server's minimum; the API rejects anything shorter. */
const MIN_JOB_DESCRIPTION_CHARS = 100;

const RESUMES_KEY = ['resumes'] as const;

export function NewAnalysisPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedResumeId, setSelectedResumeId] = useState<number | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [error, setError] = useState('');

  const resumesQuery = useQuery({
    queryKey: RESUMES_KEY,
    queryFn: async () => {
      const { resumes } = await apiRequest<{ resumes: ResumeSummary[] }>('GET', '/api/resumes');
      return resumes;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      apiUpload<{ resume: ResumeSummary }>('/api/resumes', 'resume', file),
    onSuccess: async ({ resume }) => {
      await queryClient.invalidateQueries({ queryKey: RESUMES_KEY });
      // Select what was just uploaded — almost always what they want next.
      setSelectedResumeId(resume.id);
    },
  });

  const analyseMutation = useMutation({
    mutationFn: (input: { resumeId: number; jobDescription: string }) =>
      apiRequest<{ analysis: Analysis }>('POST', '/api/analyses', input),
    onSuccess: ({ analysis }) => {
      // Seed the cache so the result page renders without a second request.
      queryClient.setQueryData(['analysis', analysis.id], analysis);
      void navigate(`/analyses/${String(analysis.id)}`);
    },
  });

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file === undefined) return;

    setError('');
    uploadMutation.mutate(file, {
      onError: (err) => {
        setError(err instanceof ApiError ? err.message : 'That file could not be uploaded.');
      },
      // Clear the input either way, so re-picking the same file still fires.
      onSettled: () => {
        if (fileInputRef.current !== null) fileInputRef.current.value = '';
      },
    });
  };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    setError('');

    if (selectedResumeId === null) {
      setError('Choose a resume first.');
      return;
    }

    analyseMutation.mutate(
      { resumeId: selectedResumeId, jobDescription },
      {
        onError: (err) => {
          if (err instanceof ApiError) {
            setError(err.details.jobDescription ?? err.message);
          } else {
            setError('Could not reach the server. Please try again.');
          }
        },
      },
    );
  };

  const resumes = resumesQuery.data ?? [];
  const jobDescriptionLength = jobDescription.trim().length;
  const isTooShort = jobDescriptionLength < MIN_JOB_DESCRIPTION_CHARS;
  const isAnalysing = analyseMutation.isPending;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">New analysis</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick a resume and paste the job description you are applying for.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-medium text-slate-900">1. Resume</h2>

          {resumesQuery.isPending && <p className="mt-3 text-sm text-slate-500">Loading…</p>}

          {resumesQuery.isError && (
            <p className="mt-3 text-sm text-red-600">Could not load your resumes.</p>
          )}

          {!resumesQuery.isPending && resumes.length === 0 && (
            <p className="mt-3 text-sm text-slate-500">
              No resumes yet — upload a PDF or DOCX to get started.
            </p>
          )}

          {resumes.length > 0 && (
            <ul className="mt-3 space-y-2">
              {resumes.map((resume) => (
                <li key={resume.id}>
                  <label
                    className={[
                      'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition',
                      selectedResumeId === resume.id
                        ? 'border-slate-900 bg-slate-50'
                        : 'border-slate-200 hover:border-slate-300',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="resume"
                      value={resume.id}
                      checked={selectedResumeId === resume.id}
                      onChange={() => setSelectedResumeId(resume.id)}
                      className="accent-slate-900"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {resume.originalFilename}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {new Date(resume.createdAt).toLocaleDateString()} ·{' '}
                        {resume.characterCount.toLocaleString()} characters
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4">
            <label
              htmlFor="resume-file"
              className="inline-block cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {uploadMutation.isPending ? 'Uploading…' : 'Upload a resume'}
            </label>
            <input
              id="resume-file"
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              onChange={handleFileChange}
              disabled={uploadMutation.isPending}
              className="sr-only"
            />
            <span className="ml-3 text-xs text-slate-500">PDF or DOCX, up to 5MB</span>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-medium text-slate-900">2. Job description</h2>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            rows={12}
            placeholder="Paste the full posting — requirements included."
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />
          <p className="mt-1 text-xs text-slate-500">
            {jobDescriptionLength.toLocaleString()} characters
            {isTooShort && ` — at least ${String(MIN_JOB_DESCRIPTION_CHARS)} needed`}
          </p>
        </section>

        {error !== '' && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={isAnalysing || selectedResumeId === null || isTooShort}
            className="rounded-lg bg-slate-900 px-5 py-2.5 font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {isAnalysing ? 'Analysing…' : 'Analyse'}
          </button>
          {isAnalysing && (
            <span className="text-sm text-slate-500">
              This takes a few seconds — the model is reading both documents.
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
