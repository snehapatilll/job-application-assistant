import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, type TestServer } from '../helpers/testServer.js';
import { ApiClient, makeRunId, registerClient } from '../helpers/apiClient.js';
import { closeTestPool, deleteTestUsers, fixture } from '../helpers/db.js';
import { JOB_DESCRIPTION } from '../helpers/jobDescription.js';

/**
 * The live analysis round-trip. Run with `npm run test:live`.
 *
 * Kept out of `npm test` on purpose: it makes a real Gemini call, so it costs
 * quota, takes seconds, and fails when the API is rate-limited — none of which
 * should break an ordinary test run. A failure here means the LLM path is
 * broken OR the account is out of quota; the error message distinguishes them.
 */

interface Importance {
  critical: number;
  important: number;
  nice_to_have: number;
}

interface Skill {
  skill: string;
  importance: keyof Importance;
  evidence?: string;
}

interface AnalysisBody {
  analysis: {
    id: number;
    fitScore: number;
    result: {
      fitScore: number;
      summary: string;
      matchedSkills: Skill[];
      missingSkills: Skill[];
      bulletSuggestions: { suggested: string; rationale: string }[];
      coverLetter: string;
      scoreBreakdown: { earnedWeight: number; totalWeight: number; weights: Importance };
    };
  };
}

const runId = makeRunId();
let server: TestServer;
let alice: ApiClient;
let analysis: AnalysisBody['analysis'];

before(async () => {
  server = await startTestServer();
  alice = (await registerClient(server.baseUrl, runId, 'alice')).client;

  const uploaded = await alice.upload<{ resume: { id: number } }>(
    await fixture('resume.pdf'),
    'resume.pdf',
  );

  const res = await alice.request<AnalysisBody>('POST', '/api/analyses', {
    resumeId: uploaded.body.resume.id,
    jobDescription: JOB_DESCRIPTION,
  });

  if (res.status === 502) {
    throw new Error(
      `Gemini was unavailable: ${JSON.stringify(res.body)}. ` +
        'This usually means the free-tier quota is exhausted rather than a code fault.',
    );
  }
  assert.equal(res.status, 201, `expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);

  analysis = res.body.analysis;
});

after(async () => {
  server.stop();
  await deleteTestUsers(runId);
  await closeTestPool();
});

describe('a real analysis', () => {
  test('returns a score in range, stored consistently in both places', () => {
    assert.ok(analysis.result.fitScore >= 0 && analysis.result.fitScore <= 100);
    // The fit_score column and the JSONB result must agree, since history
    // lists read the column while the detail view reads the JSON.
    assert.equal(analysis.fitScore, analysis.result.fitScore);
  });

  test('produces all four outputs', () => {
    assert.ok(analysis.result.summary.length > 20);
    assert.ok(analysis.result.matchedSkills.length > 0);
    assert.ok(analysis.result.missingSkills.length > 0);
    assert.ok(analysis.result.bulletSuggestions.length > 0);
    assert.ok(analysis.result.coverLetter.length > 200);
  });

  test('the score reconciles with the skills shown beside it', () => {
    const { weights, earnedWeight, totalWeight } = analysis.result.scoreBreakdown;
    const { matchedSkills, missingSkills } = analysis.result;

    const recomputedEarned = matchedSkills.reduce((sum, s) => sum + weights[s.importance], 0);
    const recomputedTotal = [...matchedSkills, ...missingSkills].reduce(
      (sum, s) => sum + weights[s.importance],
      0,
    );

    assert.equal(recomputedEarned, earnedWeight);
    assert.equal(recomputedTotal, totalWeight);
    assert.equal(analysis.result.fitScore, Math.round((100 * recomputedEarned) / recomputedTotal));
  });

  test('matched skills cite evidence and missing ones do not', () => {
    assert.ok(
      analysis.result.matchedSkills.some((s) => (s.evidence ?? '') !== ''),
      'expected at least one matched skill to quote the resume',
    );
    assert.ok(analysis.result.missingSkills.every((s) => s.evidence === undefined));
  });

  test('lists the most important skills first', () => {
    const { weights } = analysis.result.scoreBreakdown;
    for (const list of [analysis.result.matchedSkills, analysis.result.missingSkills]) {
      for (let i = 1; i < list.length; i += 1) {
        assert.ok(
          weights[list[i - 1]!.importance] >= weights[list[i]!.importance],
          'skills should be ordered by importance',
        );
      }
    }
  });

  test('judges this specific resume/posting pair correctly', () => {
    const matched = analysis.result.matchedSkills.map((s) => s.skill.toLowerCase()).join(' | ');
    const all = [...analysis.result.matchedSkills, ...analysis.result.missingSkills]
      .map((s) => s.skill.toLowerCase())
      .join(' | ');

    assert.match(all, /postgres/, 'PostgreSQL is a stated requirement');
    assert.match(matched, /postgres/, 'the resume evidences PostgreSQL');
    assert.match(matched, /typescript|node/, 'the resume evidences TypeScript and Node');
    // The resume never mentions Kubernetes, so crediting it would mean the
    // model is inventing experience.
    assert.doesNotMatch(matched, /kubernetes/, 'Kubernetes is absent from the resume');
  });
});

describe('GET /api/analyses/:id', () => {
  test('reopens the stored analysis unchanged', async () => {
    const res = await alice.request<AnalysisBody>('GET', `/api/analyses/${analysis.id}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.analysis.fitScore, analysis.fitScore);
    // Proves the JSONB column round-tripped rather than being re-generated.
    assert.equal(res.body.analysis.result.coverLetter, analysis.result.coverLetter);
  });

  test('hides it from another user', async () => {
    const { client } = await registerClient(server.baseUrl, runId, 'bob');
    const res = await client.request('GET', `/api/analyses/${analysis.id}`);
    assert.equal(res.status, 404);
  });
});
