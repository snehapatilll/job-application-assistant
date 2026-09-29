import { randomUUID } from 'node:crypto';

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
  setCookie: string[];
}

/**
 * A client bound to one session.
 *
 * Node's fetch does not keep cookies, so the session cookie is captured from
 * `Set-Cookie` and replayed on later requests — which also means these tests
 * exercise the real cookie round-trip rather than a header shortcut.
 */
export class ApiClient {
  private cookie = '';

  constructor(private readonly baseUrl: string) {}

  private get cookieHeader(): Record<string, string> {
    return this.cookie === '' ? {} : { Cookie: this.cookie };
  }

  /** The raw session cookie string, or '' when not signed in. */
  get sessionCookie(): string {
    return this.cookie;
  }

  private captureCookies(res: Response): string[] {
    const all = res.headers.getSetCookie();
    for (const entry of all) {
      const pair = entry.split(';')[0] ?? '';
      if (pair.startsWith('jaa_session=')) {
        this.cookie = pair;
      }
    }
    return all;
  }

  private static async parse(res: Response): Promise<unknown> {
    const text = await res.text();
    if (text === '') return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /** Send a JSON request (or a bodyless one) and capture any session cookie. */
  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResponse<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...this.cookieHeader,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const setCookie = this.captureCookies(res);
    return { status: res.status, body: (await ApiClient.parse(res)) as T, setCookie };
  }

  /** Upload a file as multipart/form-data under the `resume` field. */
  async upload<T = unknown>(
    file: Buffer,
    filename: string,
    contentType = 'application/pdf',
  ): Promise<ApiResponse<T>> {
    const form = new FormData();
    form.append('resume', new Blob([new Uint8Array(file)], { type: contentType }), filename);

    const res = await fetch(`${this.baseUrl}/api/resumes`, {
      method: 'POST',
      headers: this.cookieHeader,
      body: form,
    });
    const setCookie = this.captureCookies(res);
    return { status: res.status, body: (await ApiClient.parse(res)) as T, setCookie };
  }

  /** POST with no body and no Content-Type, for the missing-file-part case. */
  async postEmpty(path: string): Promise<ApiResponse> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.cookieHeader,
    });
    return { status: res.status, body: await ApiClient.parse(res), setCookie: [] };
  }

  /** Send a raw cookie value, for testing forged or malformed sessions. */
  async withRawCookie(path: string, cookie: string): Promise<ApiResponse> {
    const res = await fetch(`${this.baseUrl}${path}`, { headers: { Cookie: cookie } });
    return { status: res.status, body: await ApiClient.parse(res), setCookie: [] };
  }
}

/** Password used by every test account. */
export const TEST_PASSWORD = 'correct-horse-battery';

/**
 * Test accounts are namespaced per run so that concurrent test files can clean
 * up after themselves without deleting each other's rows.
 */
export function makeRunId(): string {
  return randomUUID().slice(0, 8);
}

export function testEmail(runId: string, label: string): string {
  return `jaa-test-${runId}-${label}@example.com`;
}

/** Register a fresh account and return a client already holding its session. */
export async function registerClient(
  baseUrl: string,
  runId: string,
  label: string,
): Promise<{ client: ApiClient; email: string }> {
  const client = new ApiClient(baseUrl);
  const email = testEmail(runId, label);
  const res = await client.request('POST', '/api/auth/register', {
    email,
    password: TEST_PASSWORD,
  });
  if (res.status !== 201) {
    throw new Error(`Could not register ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { client, email };
}
