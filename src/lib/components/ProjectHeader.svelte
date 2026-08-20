<script lang="ts">
  /**
   * The one header every project page shares — board, backlog, files, graph,
   * automation, settings. Each of those used to draw its own header from
   * scratch (a different eyebrow, a different link set, several missing
   * links to sections the others had), which meant the six felt like six
   * different apps rather than six views of one board. This component is
   * the fix: identity (switcher, star, name) plus one tab bar with every
   * section, `active` picking which tab is current.
   *
   * Star and rename post to the board's own route by its full path
   * (`/projects/<slug>?/toggleStar`) rather than needing every page to
   * carry its own copy of those actions — the endpoint doesn't care which
   * page the request came from, only that it's the same origin. Renaming
   * needs `canEdit`; starring needs `username` (signed out has nothing to
   * star). Neither is a regression for pages that lacked them before —
   * they simply weren't offered anywhere until now.
   */
  import { untrack } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import Star from '@lucide/svelte/icons/star';
  import Lock from '@lucide/svelte/icons/lock';
  import type { Snippet } from 'svelte';

  export type ProjectTab = 'board' | 'backlog' | 'files' | 'graph' | 'automation' | 'settings';

  let {
    project,
    active,
    canEdit,
    sourceOwned = false,
    username = '',
    starred = false,
    extra
  }: {
    project: { slug: string; name: string };
    active: ProjectTab;
    canEdit: boolean;
    sourceOwned?: boolean;
    username?: string;
    starred?: boolean;
    extra?: Snippet;
  } = $props();

  const slug = $derived(project.slug);

  // Deep-linking (the global search jumps straight from one board to
  // another while staying on this same route) reuses this component rather
  // than remounting it, so the locally-held star/rename state has to be
  // re-seeded whenever the project underneath it actually changes.
  let trackedSlug = untrack(() => project.slug);
  let localStarred = $state(untrack(() => starred));
  let renaming = $state(false);
  let draft = $state('');
  $effect(() => {
    if (project.slug === trackedSlug) return;
    trackedSlug = project.slug;
    localStarred = starred;
    renaming = false;
  });

  async function toggleStar() {
    const next = !localStarred;
    localStarred = next;
    const body = new FormData();
    body.set('starred', String(next));
    const response = await fetch(`/projects/${slug}?/toggleStar`, { method: 'POST', body, headers: { accept: 'application/json' } });
    if (!response.ok) localStarred = !next;
    else await invalidateAll();
  }

  function startRename() {
    draft = project.name;
    renaming = true;
  }
  async function commitRename() {
    renaming = false;
    const name = draft.trim();
    if (!name || name === project.name) return;
    const body = new FormData();
    body.set('name', name);
    const response = await fetch(`/projects/${slug}?/renameBoard`, { method: 'POST', body, headers: { accept: 'application/json' } });
    if (response.ok) await invalidateAll();
  }
  function focusOnMount(node: HTMLElement) {
    node.focus();
  }

  const tabs = $derived<{ id: ProjectTab; label: string; href: string; editorOnly?: boolean }[]>([
    { id: 'board', label: 'Board', href: `/projects/${slug}` },
    { id: 'backlog', label: 'Backlog', href: `/projects/${slug}/backlog` },
    { id: 'files', label: 'Files', href: `/projects/${slug}/files` },
    { id: 'graph', label: 'Graph', href: `/projects/${slug}/graph` },
    { id: 'automation', label: 'Automation', href: `/projects/${slug}/automation`, editorOnly: true },
    { id: 'settings', label: 'Settings', href: `/projects/${slug}/settings`, editorOnly: true }
  ]);
</script>

<header class="project-header">
  <div class="project-header-top">
    <a class="board-switcher" href="/" aria-label="All boards"><LayoutGrid /></a>
    {#if username}
      <button
        type="button"
        class="star-toggle board-star"
        class:active={localStarred}
        aria-pressed={localStarred}
        aria-label={localStarred ? 'Unstar this board' : 'Star this board'}
        onclick={toggleStar}
      ><Star fill={localStarred ? 'currentColor' : 'none'} /></button>
    {/if}
    {#if renaming}
      <form
        class="board-rename-form"
        onsubmit={(event) => {
          event.preventDefault();
          void commitRename();
        }}
      >
        <input
          bind:value={draft}
          maxlength="120"
          aria-label="Board name"
          use:focusOnMount
          onblur={commitRename}
          onkeydown={(event) => {
            if (event.key === 'Escape') renaming = false;
          }}
        />
      </form>
    {:else if canEdit}
      <button type="button" class="board-name-button" onclick={startRename} title="Click to rename this board">{project.name}</button>
    {:else}
      <h1>{project.name}</h1>
    {/if}
    {#if sourceOwned}
      <span class="source-lock-chip" title="Title, description, checklist text, owner, priority, and cover are synced from UNITY_PLAN.md. Lane, dates, comments, attachments, and checklist ticks stay editable here."><Lock /> synced from plan</span>
    {/if}
    {#if extra}<div class="project-header-extra">{@render extra()}</div>{/if}
  </div>
  <nav class="project-tabs" aria-label="Project sections">
    {#each tabs as tab}
      {#if !tab.editorOnly || canEdit}
        <a class:active={active === tab.id} href={tab.href}>{tab.label}</a>
      {/if}
    {/each}
  </nav>
</header>
