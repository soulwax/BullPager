import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import { sessionCookie, sessionFromCookie } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
  const session = sessionFromCookie(event.cookies.get(sessionCookie));
  event.locals.authenticated = Boolean(session);
  event.locals.username = session?.username;
  event.locals.role = session?.role;
  const publicPath = ['/login', '/register', '/health'].includes(event.url.pathname) || event.url.pathname.startsWith('/auth/github');
  if (!publicPath && !event.locals.authenticated) {
    const next = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
    throw redirect(303, `/login?next=${next}`);
  }
  if (['/login', '/register'].includes(event.url.pathname) && event.locals.authenticated) throw redirect(303, '/');
  const response = await resolve(event);
  response.headers.set('cache-control', 'private, no-store');
  return response;
};
