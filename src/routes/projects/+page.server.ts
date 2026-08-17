import { listBoardProjects } from '$lib/server/persistence';

export async function load({ locals }) {
  return {
    projects: await listBoardProjects(),
    username: locals.username ?? '',
    role: locals.role ?? ''
  };
}
