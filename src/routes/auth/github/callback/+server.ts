import { error, redirect } from '@sveltejs/kit';
import { authenticateGithub, createSession, githubConfigured, githubStateCookie, sessionCookie } from '$lib/server/auth';

export async function GET({ cookies, url }) {
  if (!githubConfigured()) throw redirect(303, '/login?oauth=unconfigured');
  const state = url.searchParams.get('state');
  const expected = cookies.get(githubStateCookie);
  cookies.delete(githubStateCookie, { path: '/' });
  if (!state || !expected || state !== expected) throw error(400, 'GitHub sign-in state expired. Try again.');
  const code = url.searchParams.get('code');
  if (!code) throw error(400, 'GitHub did not return an authorization code.');
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code }) });
  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) throw error(502, 'GitHub authorization failed.');
  const profileResponse = await fetch('https://api.github.com/user', { headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token.access_token}`, 'user-agent': 'project-agile-web' } });
  if (!profileResponse.ok) throw error(502, 'GitHub profile lookup failed.');
  const profile = await profileResponse.json() as { id: number; login: string };
  const role = await authenticateGithub(String(profile.id), profile.login);
  cookies.set(sessionCookie, await createSession(profile.login, role), { path: '/', httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:', maxAge: 7 * 24 * 60 * 60 });
  throw redirect(303, '/');
}
