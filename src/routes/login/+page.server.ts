import { fail, redirect } from '@sveltejs/kit';
import { authConfigured, authenticate, createSession, githubConfigured, sessionCookie } from '$lib/server/auth';

export function load({ url }) {
  return { githubEnabled: githubConfigured(), registered: url.searchParams.get('registered') === '1' };
}

export const actions = {
  default: async ({ request, cookies, url }) => {
    if (!authConfigured()) return fail(503, { error: 'Authentication is not configured on this deployment.' });
    const form = await request.formData();
    const login = String(form.get('login') ?? '');
    const password = String(form.get('password') ?? '');
    const role = await authenticate(login, password);
    if (!role) return fail(401, { error: 'Login or password is incorrect.', login });
    cookies.set(sessionCookie, createSession(login, role), {
      path: '/', httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:', maxAge: 7 * 24 * 60 * 60
    });
    const next = url.searchParams.get('next');
    throw redirect(303, next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
  }
};
