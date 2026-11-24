import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

type Check = { name: string; passed: boolean; detail?: string };
const checks: Check[] = [];

function check(name: string, passed: boolean, detail?: string): void {
  checks.push({ name, passed, detail });
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'schoolcare-oauth-test-'));
process.env.SCHOOLCARE_DATA_DIR = tempDir;
process.env.SCHOOLCARE_SKIP_SERVER_START = '1';
process.env.GOOGLE_CLIENT_ID = 'MY_GOOGLE_CLIENT_ID';
process.env.GOOGLE_CLIENT_SECRET = 'MY_GOOGLE_CLIENT_SECRET';
process.env.APP_URL = 'http://localhost:3010';
delete process.env.GOOGLE_REDIRECT_URI;

let server: ReturnType<ReturnType<typeof import('express')>['listen']> | undefined;

try {
  const { app } = await import('../server');
  const {
    buildGoogleAuthorizeUrl,
    defaultGoogleRedirectUri,
    googleOAuthConfig,
    newOAuthState,
    oauthStateMatches,
    setOAuthStateCookie,
    readOAuthStateCookie,
    clearOAuthStateCookie
  } = await import('../server/googleOAuth');

  server = app.listen(0);
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;

  const status = await fetch(`${base}/api/auth/google/status`);
  const statusBody = await status.json() as { available?: boolean };
  check('OAuth status endpoint is public', status.status === 200, `status ${status.status}`);
  check('Placeholder credentials keep Google sign-in disabled', statusBody.available === false, JSON.stringify(statusBody));

  const start = await fetch(`${base}/api/auth/google`, { redirect: 'manual' });
  check('Unconfigured OAuth start returns 503', start.status === 503, `status ${start.status}`);

  const callback = await fetch(`${base}/api/auth/google/callback?code=x&state=y`, { redirect: 'manual' });
  const location = callback.headers.get('location') || '';
  check('Unconfigured callback redirects to login', callback.status === 302 && location.includes('authError=unconfigured'), location);
  check('Callback clears the state cookie', (callback.headers.get('set-cookie') || '').includes('schoolcare_oauth_state=;'), 'state cookie cleared');

  check(
    'Derived redirect URI is the documented callback',
    defaultGoogleRedirectUri() === 'http://localhost:3010/api/auth/google/callback',
    defaultGoogleRedirectUri()
  );

  process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret-value';
  process.env.GOOGLE_REDIRECT_URI = 'https://school.example.rw/api/auth/google/callback';
  check('Real-looking credentials enable the flow', googleOAuthConfig().enabled === true);
  const authorizeUrl = new URL(buildGoogleAuthorizeUrl('state-value'));
  check('Authorize URL uses the configured redirect URI', authorizeUrl.searchParams.get('redirect_uri') === process.env.GOOGLE_REDIRECT_URI);
  check('Authorize URL requests openid email profile', authorizeUrl.searchParams.get('scope') === 'openid email profile');
  check('Authorize URL carries the state value', authorizeUrl.searchParams.get('state') === 'state-value');

  const state = newOAuthState();
  check('Generated state is 32 random bytes encoded', state.length === 43 && /^[A-Za-z0-9_-]+$/.test(state), `length ${state.length}`);
  check('State comparison accepts an identical value', oauthStateMatches(state, state));
  check('State comparison rejects a different value', !oauthStateMatches(state, newOAuthState()));

  const headers: Record<string, string> = {};
  const fakeRes = {
    setHeader(name: string, value: string | number | readonly string[]) { headers[name] = String(value); },
    getHeader(name: string) { return headers[name]; }
  } as any;
  setOAuthStateCookie(fakeRes, state);
  check('State cookie is HttpOnly and SameSite=Lax', /HttpOnly/i.test(headers['Set-Cookie']) && /SameSite=Lax/i.test(headers['Set-Cookie']), headers['Set-Cookie']);
  const fakeReq = { headers: { cookie: `schoolcare_oauth_state=${encodeURIComponent(state)}` } } as any;
  check('State cookie can be read back', readOAuthStateCookie(fakeReq) === state);
  clearOAuthStateCookie(fakeRes);
  check('State cookie can be cleared alongside another cookie', /Max-Age=0/.test(headers['Set-Cookie']));
} catch (error) {
  check('OAuth verification completed without throwing', false, error instanceof Error ? error.message : String(error));
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  rmSync(tempDir, { recursive: true, force: true });
}

for (const item of checks) {
  console.log(`[${item.passed ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? ` (${item.detail})` : ''}`);
}
const passed = checks.filter(item => item.passed).length;
console.log(`${passed}/${checks.length} Google OAuth checks passed.`);
if (passed !== checks.length) process.exitCode = 1;
