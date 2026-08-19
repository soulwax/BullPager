<script lang="ts">
  import { page } from '$app/state';
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
  import Plus from '@lucide/svelte/icons/plus';
  import Search from '@lucide/svelte/icons/search';
  import type { SearchCardResult, UserRole } from '$lib/types';

  let { username = '', role }: { username?: string; role?: UserRole } = $props();
  const canManage = $derived(role === 'superadmin' || role === 'admin');
  const canCreate = $derived(role === 'superadmin' || role === 'admin' || role === 'editor');
  const isActive = (path: string) => path === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(path);

  let query = $state('');
  let results = $state<SearchCardResult[]>([]);
  let open = $state(false);
  let searching = $state(false);
  let activeIndex = $state(-1);
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  async function runSearch(value: string) {
    if (value.trim().length < 2) { results = []; open = false; return; }
    searching = true;
    try {
      const response = await fetch(`/search?q=${encodeURIComponent(value)}`);
      const body = await response.json() as { results?: SearchCardResult[] };
      results = body.results ?? [];
      open = true;
      activeIndex = -1;
    } catch {
      results = [];
    } finally {
      searching = false;
    }
  }

  function onInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(query), 220);
  }

  function closeSearch() { open = false; activeIndex = -1; }

  function resultHref(result: SearchCardResult) { return `/projects/${result.projectSlug}?card=${encodeURIComponent(result.cardId)}`; }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') { closeSearch(); (event.currentTarget as HTMLElement).blur(); return; }
    if (!open || !results.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); activeIndex = Math.min(activeIndex + 1, results.length - 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); }
    else if (event.key === 'Enter' && activeIndex >= 0) { event.preventDefault(); window.location.href = resultHref(results[activeIndex]); }
  }
</script>

<header class="workspace-nav">
  <a class="workspace-brand" href="/" aria-label="Project Agile home">
    <img class="brand-mark" src="/assets/brand/project-agile-mark.svg" alt="" />
    <span><strong>Project Agile</strong><small>Boards for focused delivery</small></span>
  </a>
  {#if username}
    <nav aria-label="Primary navigation">
      <a class="nav-launcher" class:active={isActive('/projects') && !isActive('/projects/unity-plan')} href="/projects" aria-label="Open project boards"><LayoutGrid /> Boards</a>
      <a class:active={isActive('/projects/unity-plan')} href="/projects/unity-plan">Unity board</a>
      {#if canManage}<a class:active={isActive('/settings')} href="/settings">Settings</a>{/if}
    </nav>
    <div class="nav-search" role="search" onfocusout={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) closeSearch(); }}>
      <Search class="nav-search-icon" aria-hidden="true" />
      <input
        type="search"
        bind:value={query}
        oninput={onInput}
        onkeydown={onKeydown}
        onfocus={() => { if (results.length) open = true; }}
        placeholder="Search all boards"
        aria-label="Search cards across every board"
        aria-expanded={open}
        role="combobox"
        aria-controls="nav-search-results"
      />
      {#if open}
        <div id="nav-search-results" class="nav-search-results" role="listbox">
          {#if searching}<p class="nav-search-status">Searching…</p>
          {:else if results.length}
            <ol>
              {#each results as result, index (result.cardId)}
                <li role="option" aria-selected={index === activeIndex}>
                  <a href={resultHref(result)} class:active={index === activeIndex} onmouseenter={() => { activeIndex = index; }}>
                    <span class="nav-search-card-number">#{result.cardNumber}</span>
                    <span class="nav-search-card-title">{result.title}{#if result.archived}<span class="nav-search-archived">Archived</span>{/if}</span>
                    <span class="nav-search-card-meta">{result.projectName} · {result.lane}</span>
                  </a>
                </li>
              {/each}
            </ol>
          {:else}
            <p class="nav-search-status">No cards match “{query}”.</p>
          {/if}
        </div>
      {/if}
    </div>
    {#if canCreate}<a class="nav-create" href="/projects/new"><Plus /> Create</a>{/if}
    <div class="workspace-account"><span>{username}</span>{#if canManage}<a href="/settings" class="account-link">Settings</a>{/if}<details class="lane-menu account-more-menu"><summary aria-label="More account actions"><MoreHorizontal /></summary><div class="lane-menu-body"><form method="POST" action="/?/logoutEverywhere" onsubmit={(event) => { if (!confirm('Sign out of every device? You will need to log in again here too.')) event.preventDefault(); }}><button type="submit">Sign out everywhere</button></form></div></details><form method="POST" action="/?/logout"><button class="nav-signout" type="submit">Sign out</button></form></div>
  {:else}
    <span class="workspace-private">Private workspace</span>
  {/if}
</header>
