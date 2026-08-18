<script lang="ts">
  import { page } from '$app/state';
  import type { UserRole } from '$lib/types';

  let { username = '', role }: { username?: string; role?: UserRole } = $props();
  const canManage = $derived(role === 'superadmin' || role === 'admin');
  const canCreate = $derived(role === 'superadmin' || role === 'admin' || role === 'editor');
  const isActive = (path: string) => path === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(path);
</script>

<header class="workspace-nav">
  <a class="workspace-brand" href="/" aria-label="Project Agile home">
    <img class="brand-mark" src="/assets/brand/project-agile-mark.svg" alt="" />
    <span><strong>Project Agile</strong><small>Boards for focused delivery</small></span>
  </a>
  {#if username}
    <nav aria-label="Primary navigation">
      <a class="nav-launcher" class:active={isActive('/projects') && !isActive('/projects/unity-plan')} href="/projects" aria-label="Open project boards"><span aria-hidden="true">⠿</span> Boards</a>
      <a class:active={isActive('/projects/unity-plan')} href="/projects/unity-plan">Unity board</a>
      {#if canManage}<a class:active={isActive('/settings')} href="/settings">Settings</a>{/if}
    </nav>
    {#if canCreate}<a class="nav-create" href="/projects/new"><span aria-hidden="true">＋</span> Create</a>{/if}
    <div class="workspace-account"><span>{username}</span>{#if canManage}<a href="/settings" class="account-link">Settings</a>{/if}<form method="POST" action="/?/logout"><button class="nav-signout" type="submit">Sign out</button></form></div>
  {:else}
    <span class="workspace-private">Private workspace</span>
  {/if}
</header>
