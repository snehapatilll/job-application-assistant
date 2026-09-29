import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, type TestServer } from '../helpers/testServer.js';
import { ApiClient, makeRunId, registerClient } from '../helpers/apiClient.js';
import { closeTestPool, deleteTestUsers, fixture } from '../helpers/db.js';
import { seedAnalysis } from '../helpers/seedAnalysis.js';

/**
 * History listing. Rows are seeded straight into the database rather than
 * created through POST /api/analyses, so these tests never call Gemini.
 */

interface SummaryBody {
  analyses: {
    id: number;
    fitScore: number;
    createdAt: string;
    resumeFilename: string;
    jobTitle: string;
    result?: unknown;
  }[];
  hasMore: boolean;
}

const runId = makeRunId();
let server: TestServer;
let alice: ApiClient;
let bob: ApiClient;
let aliceUserId: number;
let bobUserId: number;
let aliceResumeId: number;

before(async () => {
  server = await startTestServer();

  const a = await registerClient(server.baseUrl, runId, 'alice');
  const b = await registerClient(server.baseUrl, runId, 'bob');
  alice = a.client;
  bob = b.client;

  const me = await alice.request<{ user: { id: number } }>('GET', '/api/auth/me');
  aliceUserId = me.body.user.id;
  const bobMe = await bob.request<{ user: { id: number } }>('GET', '/api/auth/me');
  bobUserId = bobMe.body.user.id;

  const uploaded = await alice.upload<{ resume: { id: number } }>(
    await fixture('resume.pdf'),
    'priya-resume.pdf',
  );
  aliceResumeId = uploaded.body.resume.id;
});

after(async () => {
  server.stop();
  await deleteTestUsers(runId);
  await closeTestPool();
});

describe('GET /api/analyses', () => {
  test('rejects a request with no session', async () => {
    const anon = new ApiClient(server.baseUrl);
    const res = await anon.request('GET', '/api/analyses');
    assert.equal(res.status, 401);
  });

  test('returns an empty list for a user with no history', async () => {
    const res = await alice.request<SummaryBody>('GET', '/api/analyses');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.analyses, []);
    assert.equal(res.body.hasMore, false);
  });

  test('lists an analysis with its score, filename, and derived title', async () => {
    await seedAnalysis({
      userId: aliceUserId,
      resumeId: aliceResumeId,
      jobText: 'Senior Backend Engineer — Payments\n\nWe need someone to own billing.',
      fitScore: 72,
    });

    const res = await alice.request<SummaryBody>('GET', '/api/analyses');
    assert.equal(res.status, 200);
    assert.equal(res.body.analyses.length, 1);

    const [row] = res.body.analyses;
    assert.equal(row?.fitScore, 72);
    assert.equal(row?.resumeFilename, 'priya-resume.pdf');
    // The title comes from the posting's first non-empty line.
    assert.equal(row?.jobTitle, 'Senior Backend Engineer — Payments');
  });

  test('omits the full result, which a list does not need', async () => {
    const res = await alice.request<SummaryBody>('GET', '/api/analyses');
    assert.equal(res.body.analyses[0]?.result, undefined);
    // A cover letter is kilobytes; it must not ride along on every row.
    assert.ok(!JSON.stringify(res.body).includes('coverLetter'));
  });

  test('falls back to a placeholder when the posting has no usable first line', async () => {
    await seedAnalysis({
      userId: aliceUserId,
      resumeId: aliceResumeId,
      jobText: '\n\n   \nBuried title after blank lines',
      fitScore: 10,
    });

    const res = await alice.request<SummaryBody>('GET', '/api/analyses?limit=1');
    assert.equal(res.body.analyses[0]?.jobTitle, 'Buried title after blank lines');
  });

  test('orders newest first', async () => {
    const res = await alice.request<SummaryBody>('GET', '/api/analyses');
    const dates = res.body.analyses.map((a) => a.createdAt);
    assert.deepEqual(dates, [...dates].sort().reverse());
  });

  test('paginates and reports whether more remain', async () => {
    // Three rows exist by now; ask for two.
    await seedAnalysis({
      userId: aliceUserId,
      resumeId: aliceResumeId,
      jobText: 'Third posting',
      fitScore: 40,
    });

    const first = await alice.request<SummaryBody>('GET', '/api/analyses?limit=2');
    assert.equal(first.body.analyses.length, 2);
    assert.equal(first.body.hasMore, true);

    const second = await alice.request<SummaryBody>('GET', '/api/analyses?limit=2&offset=2');
    assert.equal(second.body.hasMore, false);

    // Offset paging must not repeat a row from the previous page.
    const firstIds = first.body.analyses.map((a) => a.id);
    const secondIds = second.body.analyses.map((a) => a.id);
    assert.equal(firstIds.some((id) => secondIds.includes(id)), false);
  });

  test('rejects a limit above the cap', async () => {
    const res = await alice.request('GET', '/api/analyses?limit=500');
    assert.equal(res.status, 400);
  });

  test('rejects a negative offset', async () => {
    const res = await alice.request('GET', '/api/analyses?offset=-1');
    assert.equal(res.status, 400);
  });

  test('shows one user nothing of another’s history', async () => {
    const res = await bob.request<SummaryBody>('GET', '/api/analyses');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.analyses, []);
  });

  test('does not leak another user’s analysis even when seeded against their id', async () => {
    const bobResume = await bob.upload<{ resume: { id: number } }>(
      await fixture('resume.pdf'),
      'bob-resume.pdf',
    );
    await seedAnalysis({
      userId: bobUserId,
      resumeId: bobResume.body.resume.id,
      jobText: 'Bob only',
      fitScore: 99,
    });

    const aliceView = await alice.request<SummaryBody>('GET', '/api/analyses');
    assert.equal(aliceView.body.analyses.some((a) => a.jobTitle === 'Bob only'), false);
  });
});
