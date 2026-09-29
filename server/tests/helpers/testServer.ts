import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

/** server/ — two levels up from tests/helpers/. */
const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Ask the OS for an unused port.
 *
 * Test files run concurrently, so each needs its own server; a fixed port
 * would make them collide. There is a small race between closing this probe
 * and the server binding, which is acceptable for a local test run.
 */
async function findFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (address === null || typeof address === 'string') {
        probe.close();
        reject(new Error('Could not determine a free port'));
        return;
      }
      const { port } = address;
      probe.close(() => {
        resolvePort(port);
      });
    });
  });
}

export interface TestServer {
  baseUrl: string;
  stop: () => void;
}

/**
 * Start the real server as a child process and wait until it answers.
 *
 * Running the actual entry point rather than importing the Express app means
 * these tests exercise the middleware stack, cookie handling, and error
 * handlers exactly as production does.
 */
export async function startTestServer(): Promise<TestServer> {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  // Windows refuses to spawn .cmd shims directly, so tsx's CLI is run through
  // this same node binary rather than via `npm run`.
  const child: ChildProcess = spawn(
    process.execPath,
    [join(SERVER_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join('src', 'index.ts')],
    {
      cwd: SERVER_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: String(port) },
    },
  );

  const log: string[] = [];
  child.stdout?.on('data', (d: Buffer) => log.push(d.toString()));
  child.stderr?.on('data', (d: Buffer) => log.push(d.toString()));

  const stop = (): void => {
    child.kill();
  };

  for (let i = 0; i < 60; i += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early (code ${child.exitCode}):\n${log.join('')}`);
    }
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return { baseUrl, stop };
    } catch {
      // Not listening yet.
    }
    await sleep(500);
  }

  stop();
  throw new Error(`Server never became healthy:\n${log.join('')}`);
}
