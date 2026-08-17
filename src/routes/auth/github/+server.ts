import { redirect } from '@sveltejs/kit';
import { githubAuthorizeUrl, githubConfigured, githubState, githubStateCookie } from '$lib/server/auth';

export function GET({ cookies, url }) {
  if (!githubConfigured()) throw redirect(303, '/login?oauth=unconfigured');
  const state = githubState();
  cookies.set(githubStateCookie, state, { path: '/', httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:', maxAge: 600 });
  throw redirect(302, githubAuthorizeUrl(state, url.origin));
}
