import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import { FitScore } from '../components/FitScore';
import { IMPORTANCE_LABEL, type Analysis, type SkillAssessment } from '../lib/types';

const importanceChipClass: Record<SkillAssessment['importance'], string> = {
  critical: 'bg-slate-900 text-white',
  important: 'bg-slate-200 text-slate-700',
  nice_to_have: 'bg-slate-100 text-slate-500',
};

/** One skill row. The importance is written out, never colour alone. */
function SkillRow({ skill }: { skill: SkillAssessment }) {
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">{skill.skill}</span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${importanceChipClass[skill.importance]}`}
        >
          {IMPORTANCE_LABEL[skill.importance]}
        </span>
      </div>
      {skill.evidence !== undefined && (
        <p className="mt-1 text-sm text-slate-500">{skill.evidence}</p>
      )}
    </li>
  );
}

function SkillList({
  title,
  caption,
  skills,
  emptyText,
}: {
  title: string;
  caption: string;
  skills: SkillAssessment[];
  emptyText: string;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-medium text-slate-900">
        {title} <span className="text-slate-400">({skills.length})</span>
      </h2>
      <p className="mt-0.5 text-sm text-slate-500">{caption}</p>

      {skills.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {skills.map((skill) => (
            <SkillRow key={`${skill.skill}-${skill.importance}`} skill={skill} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Cover letter panel with a copy button, since copying is the whole point. */
function CoverLetter({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked; the text is selectable regardless.
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-medium text-slate-900">Cover letter draft</h2>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-3 text-sm whitespace-pre-wrap text-slate-700">{text}</p>
    </section>
  );
}

export function AnalysisPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['analysis', Number(id)],
    queryFn: async () => {
      const { analysis } = await apiRequest<{ analysis: Analysis }>(
        'GET',
        `/api/analyses/${String(id)}`,
      );
      return analysis;
    },
    enabled: id !== undefined,
  });

  if (isPending) {
    return <p className="text-slate-500">Loading analysis…</p>;
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-slate-900">This analysis could not be loaded.</p>
        <p className="mt-1 text-sm text-slate-500">{error.message}</p>
        <Link to="/" className="mt-4 inline-block text-sm font-medium text-slate-900 underline">
          Start a new analysis
        </Link>
      </div>
    );
  }

  const { result } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Analysis</h1>
          <p className="mt-1 text-sm text-slate-500">
            {new Date(data.createdAt).toLocaleString()}
          </p>
        </div>
        <Link to="/" className="text-sm font-medium text-slate-900 underline">
          New analysis
        </Link>
      </div>

      <FitScore result={result} />

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-medium text-slate-900">Summary</h2>
        <p className="mt-2 text-sm text-slate-700">{result.summary}</p>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <SkillList
          title="Matched"
          caption="Backed by something in your resume."
          skills={result.matchedSkills}
          emptyText="Nothing in your resume matched this posting."
        />
        <SkillList
          title="Missing"
          caption="Asked for, but not evidenced."
          skills={result.missingSkills}
          emptyText="You cover everything the posting asks for."
        />
      </div>

      {result.bulletSuggestions.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-medium text-slate-900">Suggested resume bullets</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Rewritten to target this posting. Check each one against what you actually did.
          </p>
          <ul className="mt-3 space-y-4">
            {result.bulletSuggestions.map((bullet, index) => (
              <li key={index} className="border-l-2 border-slate-200 pl-4">
                <p className="text-sm text-slate-900">{bullet.suggested}</p>
                <p className="mt-1 text-sm text-slate-500">{bullet.rationale}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CoverLetter text={result.coverLetter} />
    </div>
  );
}
