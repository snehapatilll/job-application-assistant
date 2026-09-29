import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, type TestServer } from '../helpers/testServer.js';
import { ApiClient, makeRunId, registerClient } from '../helpers/apiClient.js';
import { closeTestPool, deleteTestUsers, fixture } from '../helpers/db.js';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const runId = makeRunId();
let server: TestServer;
let alice: ApiClient;
let bob: ApiClient;
let pdf: Buffer;
let docx: Buffer;
let scanned: Buffer;

interface ResumeBody {
  format: string;
  resume: {
    id: number;
    originalFilename: string;
    characterCount: number;
    createdAt: string;
    extractedText?: string;
  };
}

before(async () => {
  server = await startTestServer();
  [pdf, docx, scanned] = await Promise.all([
    fixture('resume.pdf'),
    fixture('resume.docx'),
    fixture('scanned.pdf'),
  ]);
  alice = (await registerClient(server.baseUrl, runId, 'alice')).client;
  bob = (await registerClient(server.baseUrl, runId, 'bob')).client;
});

after(async () => {
  server.stop();
  await deleteTestUsers(runId);
  await closeTestPool();
});

describe('authentication', () => {
  test('rejects an upload with no session', async () => {
    const anon = new ApiClient(server.baseUrl);
    const res = await anon.upload(pdf, 'resume.pdf');
    assert.equal(res.status, 401);
  });

  test('rejects a listing with no session', async () => {
    const anon = new ApiClient(server.baseUrl);
    const res = await anon.request('GET', '/api/resumes');
    assert.equal(res.status, 401);
  });
});

describe('POST /api/resumes', () => {
  test('accepts a PDF and extracts its text', async () => {
    const res = await alice.upload<ResumeBody>(pdf, 'priya-resume.pdf');

    assert.equal(res.status, 201);
    assert.equal(res.body.format, 'pdf');
    assert.equal(res.body.resume.originalFilename, 'priya-resume.pdf');
    assert.ok(res.body.resume.characterCount > 400, 'expected substantial extracted text');
    assert.equal(res.body.resume.extractedText, undefined, 'summary should omit the body text');
  });

  test('accepts a DOCX and extracts its text', async () => {
    const res = await alice.upload<ResumeBody>(docx, 'priya-resume.docx', DOCX_MIME);

    assert.equal(res.status, 201);
    assert.equal(res.body.format, 'docx');
    assert.ok(res.body.resume.characterCount > 400);
  });

  test('identifies the format from the file bytes, not the declared type', async () => {
    // A .pdf name and PDF mime type on content that is not a PDF. Both are
    // client-controlled, so detection has to read the header instead.
    const res = await alice.upload(Buffer.from('NOTAPDF'.repeat(50)), 'liar.pdf');
    assert.equal(res.status, 400);
  });

  test('rejects a PDF with no extractable text', async () => {
    const res = await alice.upload<{ error: string }>(scanned, 'scanned.pdf');

    assert.equal(res.status, 400);
    assert.match(res.body.error, /scanned|text/i);
  });

  test('rejects an unsupported file type', async () => {
    const res = await alice.upload(
      Buffer.from('just some plain notes, not a document'),
      'notes.txt',
      'text/plain',
    );
    assert.equal(res.status, 400);
  });

  test('tells the user to re-save a legacy .doc file', async () => {
    const ole2Header = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const res = await alice.upload<{ error: string }>(
      Buffer.concat([ole2Header, Buffer.alloc(512)]),
      'old-resume.doc',
      'application/msword',
    );

    assert.equal(res.status, 400);
    assert.match(res.body.error, /\.docx/i);
  });

  test('rejects a file over the size limit', async () => {
    const oversized = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(6 * 1024 * 1024)]);
    const res = await alice.upload<{ error: string }>(oversized, 'huge.pdf');

    assert.equal(res.status, 400);
    assert.match(res.body.error, /5MB|larger/i);
  });

  test('rejects a request with no file part', async () => {
    const res = await alice.postEmpty('/api/resumes');
    assert.equal(res.status, 400);
  });

  test('strips directory traversal from the stored filename', async () => {
    const res = await alice.upload<ResumeBody>(pdf, '../../../etc/passwd.pdf');
    assert.equal(res.body.resume.originalFilename, 'passwd.pdf');
  });
});

describe('GET /api/resumes', () => {
  test('lists the user’s resumes newest first', async () => {
    const res = await alice.request<{ resumes: ResumeBody['resume'][] }>('GET', '/api/resumes');

    assert.equal(res.status, 200);
    assert.ok(res.body.resumes.length >= 2);

    const dates = res.body.resumes.map((r) => r.createdAt);
    const sorted = [...dates].sort().reverse();
    assert.deepEqual(dates, sorted);
  });
});

describe('GET /api/resumes/:id', () => {
  test('returns the extracted text to its owner', async () => {
    const uploaded = await alice.upload<ResumeBody>(pdf, 'roundtrip.pdf');
    const res = await alice.request<{ resume: Required<ResumeBody['resume']> }>(
      'GET',
      `/api/resumes/${uploaded.body.resume.id}`,
    );

    assert.equal(res.status, 200);
    assert.match(res.body.resume.extractedText, /Priya Raman/);
    assert.match(res.body.resume.extractedText, /PostgreSQL/);
    assert.doesNotMatch(res.body.resume.extractedText, /\n{3,}/, 'whitespace should be normalized');
  });

  test('hides one user’s resume from another', async () => {
    // user_id is part of the WHERE clause, so this is a 404 rather than a 403 —
    // Bob is not told the row exists.
    const uploaded = await alice.upload<ResumeBody>(pdf, 'private.pdf');
    const res = await bob.request('GET', `/api/resumes/${uploaded.body.resume.id}`);
    assert.equal(res.status, 404);
  });

  test('keeps a new user’s listing empty', async () => {
    const { client } = await registerClient(server.baseUrl, runId, 'newcomer');
    const res = await client.request<{ resumes: unknown[] }>('GET', '/api/resumes');

    assert.equal(res.status, 200);
    assert.equal(res.body.resumes.length, 0);
  });

  test('rejects a non-numeric id', async () => {
    const res = await alice.request('GET', '/api/resumes/not-a-number');
    assert.equal(res.status, 400);
  });
});
