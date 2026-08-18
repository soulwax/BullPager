<script lang="ts">
  import { page } from '$app/state';
  import type { UserRole } from '$lib/types';

  let { username = '', role }: { username?: string; role?: UserRole } = $props();
  const canManage = $derived(role === 'superadmin' || role === 'admin');
  const isActive = (path: string) => path === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(path);
</script>

<header class="workspace-nav">
  <a class="workspace-brand" href="/" aria-label="Project Agile home">
    <span class="brand-mark" aria-hidden="true">PA</span>
    <span><strong>Project Agile</strong><small>Plan · make · remember</small></span>
  </a>
  {#if username}
    <nav aria-label="Primary navigation">
      <a class:active={isActive('/projects')} href="/projects">Projects</a>
      <a class="nav-vision" class:active={isActive('/vision')} href="/vision"><span aria-hidden="true">✦</span> Vision</a>
      <a class:active={isActive('/projects/unity-plan')} href="/projects/unity-plan">Unity board</a>
      {#if canManage}<a class:active={isActive('/settings')} href="/settings">Settings</a>{/if}
    </nav>
    <div class="workspace-account"><span>{username}</span>{#if canManage}<a href="/settings" class="account-link">Settings</a>{/if}<form method="POST" action="/?/logout"><button class="nav-signout" type="submit">Sign out</button></form></div>
  {:else}
    <span class="workspace-private">Private workspace</span>
  {/if}
</header>
