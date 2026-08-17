import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import { sessionCookie, validSession } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.authenticated = validSession(event.cookies.get(sessionCookie));
  if (event.url.pathname !== '/login' && !event.locals.authenticated) {
    const next = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
    throw redirect(303, `/login?next=${next}`);
  }
  if (event.url.pathname === '/login' && event.locals.authenticated) throw redirect(303, '/');
  const response = await resolve(event);
  response.headers.set('cache-control', 'private, no-store');
  return response;
};
