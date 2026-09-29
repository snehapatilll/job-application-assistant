import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, type TestServer } from '../helpers/testServer.js';
import { ApiClient, makeRunId, registerClient } from '../helpers/apiClient.js';
import { closeTestPool, deleteTestUsers, fixture } from '../helpers/db.js';
import { JOB_DESCRIPTION } from '../helpers/jobDescription.js';

/**
 * Guard tests for POST /api/analyses.
 *
 * Every case here is rejected BEFORE the Gemini call, so this file needs no API
 * key and no quota. The live round-trip lives in tests/live/analysis.test.ts.
 */

const runId = makeRunId();
let server: TestServer;
let alice: ApiClient;
let bob: ApiClient;
let resumeId: number;

before(async () => {
  server = await startTestServer();
  alice = (await registerClient(server.baseUrl, runId, 'alice')).client;
  bob = (await registerClient(server.baseUrl, runId, 'bob')).client;

  const uploaded = await alice.upload<{ resume: { id: number } }>(
    await fixture('resume.pdf'),
    'resume.pdf',
  );
  resumeId = uploaded.body.resume.id;
});

after(async () => {
  server.stop();
  await deleteTestUsers(runId);
  await closeTestPool();
});

describe('POST /api/analyses guards', () => {
  test('rejects a request with no session', async () => {
    const anon = new ApiClient(server.baseUrl);
    const res = await anon.request('POST', '/api/analyses', {
      resumeId,
      jobDescription: JOB_DESCRIPTION,
    });
    assert.equal(res.status, 401);
  });

  test('rejects a job description that is too short to analyse', async () => {
    const res = await alice.request<{ details?: Record<string, string> }>(
      'POST',
      '/api/analyses',
      { resumeId, jobDescription: 'Backend dev wanted.' },
    );

    assert.equal(res.status, 400);
    assert.ok(res.body.details?.jobDescription);
  });

  test('rejects a missing resumeId', async () => {
    const res = await alice.request('POST', '/api/analyses', {
      jobDescription: JOB_DESCRIPTION,
    });
    assert.equal(res.status, 400);
  });

  test('rejects a non-numeric resumeId', async () => {
    const res = await alice.request('POST', '/api/analyses', {
      resumeId: 'abc',
      jobDescription: JOB_DESCRIPTION,
    });
    assert.equal(res.status, 400);
  });

  test('refuses another user’s resume without spending an LLM call', async () => {
    // The ownership check must come first: an unauthorized resumeId should
    // never reach Gemini and consume quota. A fast rejection proves the
    // ordering — a real analysis takes seconds.
    const started = Date.now();
    const res = await bob.request('POST', '/api/analyses', {
      resumeId,
      jobDescription: JOB_DESCRIPTION,
    });
    const elapsed = Date.now() - started;

    assert.equal(res.status, 404);
    assert.ok(elapsed < 2000, `expected a fast rejection, took ${elapsed}ms`);
  });
});

describe('GET /api/analyses/:id guards', () => {
  test('rejects a request with no session', async () => {
    const anon = new ApiClient(server.baseUrl);
    const res = await anon.request('GET', '/api/analyses/1');
    assert.equal(res.status, 401);
  });

  test('rejects a non-numeric id', async () => {
    const res = await alice.request('GET', '/api/analyses/not-a-number');
    assert.equal(res.status, 400);
  });

  test('returns 404 for an analysis that does not exist', async () => {
    const res = await alice.request('GET', '/api/analyses/99999999');
    assert.equal(res.status, 404);
  });
});
