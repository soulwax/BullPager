import { fail, redirect } from '@sveltejs/kit';
import { createBoardUser, loadBoardSettings, persistenceEnabled } from '$lib/server/persistence';

export const actions = {
  default: async ({ request }) => {
    if (!persistenceEnabled()) return fail(503, { error: 'Registration is not configured on this deployment.' });
    const settings = await loadBoardSettings();
    if (settings.registration_enabled === 'false') return fail(403, { error: 'Registration is currently closed by an administrator.' });
    const form = await request.formData();
    const username = String(form.get('username') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');
    if (!/^[a-zA-Z0-9._-]{3,48}$/.test(username)) return fail(400, { error: 'Use 3–48 letters, numbers, dots, underscores, or hyphens.', username });
    if (password.length < 8) return fail(400, { error: 'Passwords must be at least 8 characters.', username });
    if (password !== confirm) return fail(400, { error: 'Passwords do not match.', username });
    try {
      const role = settings.default_role === 'editor' ? 'editor' : 'viewer';
      await createBoardUser(username, password, role);
      throw redirect(303, '/login?registered=1');
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error) throw error;
      return fail(409, { error: 'That username is already registered.', username });
    }
  }
};
