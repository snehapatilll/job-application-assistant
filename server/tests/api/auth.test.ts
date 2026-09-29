import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, type TestServer } from '../helpers/testServer.js';
import {
  ApiClient,
  TEST_PASSWORD,
  makeRunId,
  registerClient,
  testEmail,
} from '../helpers/apiClient.js';
import { closeTestPool, deleteTestUsers } from '../helpers/db.js';

const runId = makeRunId();
let server: TestServer;

interface UserBody {
  user: { id: number; email: string; createdAt: string };
}

before(async () => {
  server = await startTestServer();
});

after(async () => {
  server.stop();
  await deleteTestUsers(runId);
  await closeTestPool();
});

describe('POST /api/auth/register', () => {
  test('creates an account and starts a session', async () => {
    const client = new ApiClient(server.baseUrl);
    const email = testEmail(runId, 'register');
    const res = await client.request<UserBody>('POST', '/api/auth/register', {
      email,
      password: TEST_PASSWORD,
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, email);
    assert.ok(!JSON.stringify(res.body).includes('assword'), 'must not leak a password hash');
  });

  test('sets an httpOnly, SameSite=Lax session cookie', async () => {
    const client = new ApiClient(server.baseUrl);
    const res = await client.request('POST', '/api/auth/register', {
      email: testEmail(runId, 'cookie'),
      password: TEST_PASSWORD,
    });

    const cookie = res.setCookie.find((c) => c.startsWith('jaa_session='));
    assert.ok(cookie, 'expected a jaa_session cookie');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    // Secure would stop the cookie working over plain http in development.
    assert.doesNotMatch(cookie, /Secure/i);
  });

  test('rejects a duplicate email with 409', async () => {
    const email = testEmail(runId, 'dupe');
    const first = new ApiClient(server.baseUrl);
    await first.request('POST', '/api/auth/register', { email, password: TEST_PASSWORD });

    const second = new ApiClient(server.baseUrl);
    const res = await second.request('POST', '/api/auth/register', {
      email,
      password: TEST_PASSWORD,
    });
    assert.equal(res.status, 409);
  });

  test('treats differently-cased emails as the same account', async () => {
    const email = testEmail(runId, 'casing');
    const first = new ApiClient(server.baseUrl);
    await first.request('POST', '/api/auth/register', { email, password: TEST_PASSWORD });

    const second = new ApiClient(server.baseUrl);
    const res = await second.request('POST', '/api/auth/register', {
      email: email.toUpperCase(),
      password: TEST_PASSWORD,
    });
    assert.equal(res.status, 409);
  });

  test('reports per-field validation errors', async () => {
    const client = new ApiClient(server.baseUrl);
    const res = await client.request<{ details?: Record<string, string> }>(
      'POST',
      '/api/auth/register',
      { email: 'not-an-email', password: 'short' },
    );

    assert.equal(res.status, 400);
    assert.ok(res.body.details?.email);
    assert.ok(res.body.details?.password);
  });

  test('rejects an empty body', async () => {
    const client = new ApiClient(server.baseUrl);
    const res = await client.request('POST', '/api/auth/register', {});
    assert.equal(res.status, 400);
  });

  test('rejects a password longer than bcrypt can hash', async () => {
    // bcrypt silently ignores bytes past 72, so a longer password must not be
    // quietly truncated into a weaker one.
    const client = new ApiClient(server.baseUrl);
    const res = await client.request('POST', '/api/auth/register', {
      email: testEmail(runId, 'longpw'),
      password: 'a'.repeat(73),
    });
    assert.equal(res.status, 400);
  });
});

describe('POST /api/auth/login', () => {
  test('exchanges correct credentials for a session', async () => {
    const { email } = await registerClient(server.baseUrl, runId, 'login');

    const fresh = new ApiClient(server.baseUrl);
    const res = await fresh.request('POST', '/api/auth/login', {
      email,
      password: TEST_PASSWORD,
    });

    assert.equal(res.status, 200);
    assert.notEqual(fresh.sessionCookie, '');

    const me = await fresh.request('GET', '/api/auth/me');
    assert.equal(me.status, 200);
  });

  test('matches the email case-insensitively', async () => {
    const { email } = await registerClient(server.baseUrl, runId, 'logincase');

    const fresh = new ApiClient(server.baseUrl);
    const res = await fresh.request('POST', '/api/auth/login', {
      email: email.toUpperCase(),
      password: TEST_PASSWORD,
    });
    assert.equal(res.status, 200);
  });

  test('gives the same answer for a wrong password and an unknown email', async () => {
    // Differing responses would let someone enumerate which emails are
    // registered, so body and status must be identical.
    const { email } = await registerClient(server.baseUrl, runId, 'enum');
    const client = new ApiClient(server.baseUrl);

    const wrongPassword = await client.request('POST', '/api/auth/login', {
      email,
      password: 'definitely-not-the-password',
    });
    const unknownEmail = await client.request('POST', '/api/auth/login', {
      email: testEmail(runId, 'nobody'),
      password: TEST_PASSWORD,
    });

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.deepEqual(unknownEmail.body, wrongPassword.body);
  });

  test('spends bcrypt time even when no user matches', async () => {
    // Without a decoy hash, an instant 401 would reveal that the email is
    // unregistered regardless of what the body says.
    const client = new ApiClient(server.baseUrl);
    const started = Date.now();
    await client.request('POST', '/api/auth/login', {
      email: testEmail(runId, 'timing'),
      password: TEST_PASSWORD,
    });
    assert.ok(Date.now() - started > 50, 'expected a bcrypt-comparable delay');
  });
});

describe('GET /api/auth/me', () => {
  test('returns the signed-in user', async () => {
    const { client, email } = await registerClient(server.baseUrl, runId, 'me');
    const res = await client.request<UserBody>('GET', '/api/auth/me');

    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, email);
  });

  test('rejects a request with no session', async () => {
    const client = new ApiClient(server.baseUrl);
    const res = await client.request('GET', '/api/auth/me');
    assert.equal(res.status, 401);
  });

  test('rejects a forged session cookie', async () => {
    const client = new ApiClient(server.baseUrl);
    const res = await client.withRawCookie('/api/auth/me', 'jaa_session=not.a.real.jwt');
    assert.equal(res.status, 401);
  });
});

describe('POST /api/auth/logout', () => {
  test('clears the session cookie', async () => {
    const { client } = await registerClient(server.baseUrl, runId, 'logout');

    const res = await client.request('POST', '/api/auth/logout');
    assert.equal(res.status, 204);

    const cleared = res.setCookie.find((c) => c.startsWith('jaa_session='));
    assert.ok(cleared, 'expected a cookie-clearing header');
    assert.match(cleared, /jaa_session=;/);
  });
});

describe('routing', () => {
  test('returns JSON, not HTML, for an unknown route', async () => {
    const client = new ApiClient(server.baseUrl);
    const res = await client.request<{ error: string }>('GET', '/api/does-not-exist');

    assert.equal(res.status, 404);
    assert.equal(typeof res.body.error, 'string');
  });
});
