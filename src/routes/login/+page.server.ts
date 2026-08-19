import { fail, redirect } from '@sveltejs/kit';
import { authConfigured, authenticate, createSession, githubConfigured, sessionCookie } from '$lib/server/auth';
import { clearLoginFailures, LOGIN_ATTEMPT_LIMIT, recentLoginFailures, recordLoginFailure } from '$lib/server/persistence';

export function load({ url }) {
  return { githubEnabled: githubConfigured(), registered: url.searchParams.get('registered') === '1' };
}

export const actions = {
  default: async ({ request, cookies, url, getClientAddress }) => {
    if (!authConfigured()) return fail(503, { error: 'Authentication is not configured on this deployment.' });
    const form = await request.formData();
    const login = String(form.get('login') ?? '');
    const password = String(form.get('password') ?? '');
    // Keyed by address + attempted username, not just address, so a shared
    // office IP doesn't throttle unrelated accounts off one bad actor.
    const attemptKey = `${getClientAddress()}:${login.toLowerCase()}`;
    if (await recentLoginFailures(attemptKey) >= LOGIN_ATTEMPT_LIMIT) {
      return fail(429, { error: 'Too many attempts for this login. Wait 15 minutes and try again.', login });
    }
    const role = await authenticate(login, password);
    if (!role) {
      await recordLoginFailure(attemptKey);
      return fail(401, { error: 'Login or password is incorrect.', login });
    }
    await clearLoginFailures(attemptKey);
    cookies.set(sessionCookie, createSession(login, role), {
      path: '/', httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:', maxAge: 7 * 24 * 60 * 60
    });
    const next = url.searchParams.get('next');
    throw redirect(303, next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
  }
};
