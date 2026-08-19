import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import { sessionCookie, sessionFromCookie } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
  const session = await sessionFromCookie(event.cookies.get(sessionCookie));
  event.locals.authenticated = Boolean(session);
  event.locals.username = session?.username;
  event.locals.role = session?.role;
  // `/auth/dev` has to be reachable unauthenticated or the redirect below
  // would bounce it to /login before it can issue a session. It is inert
  // outside `vite dev` and without DEV_LOGIN_KEY — see that route's comment.
  const publicPath =
    ['/login', '/register', '/health'].includes(event.url.pathname) ||
    event.url.pathname.startsWith('/auth/github') ||
    event.url.pathname === '/auth/dev';
  if (!publicPath && !event.locals.authenticated) {
    const next = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
    throw redirect(303, `/login?next=${next}`);
  }
  if (['/login', '/register'].includes(event.url.pathname) && event.locals.authenticated) throw redirect(303, '/');
  const response = await resolve(event);
  response.headers.set('cache-control', 'private, no-store');
  return response;
};
