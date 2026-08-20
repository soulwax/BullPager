<script lang="ts">
  import { untrack } from 'svelte';
  import type { BoardProject, WikiPage } from '$lib/types';
  import { appearanceAttributes, appearanceFromSettings, appearanceStyle } from '$lib/boardAppearance';
  import { projectBackground } from '$lib/projectBackgrounds';
  import ProjectHeader from '$lib/components/ProjectHeader.svelte';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import FileQuestion from '@lucide/svelte/icons/file-question';
  import Pin from '@lucide/svelte/icons/pin';
  import Plus from '@lucide/svelte/icons/plus';

  let { data, form }: {
    data: {
      project: BoardProject;
      pages: (WikiPage & { excerpt: string })[];
      wanted: { slug: string; target: string; from: string[] }[];
      canEdit: boolean;
      username: string;
      starred: boolean;
      newTitle: string;
      settings?: Record<string, string>;
      prefix?: string;
    };
    form?: { error?: string; title?: string };
  } = $props();

  const chromeBackground = $derived(
    (data.settings ?? {})[`${data.prefix ?? ''}background`] === 'custom' && data.settings?.[`${data.prefix}background_custom_path`]
      ? { id: 'custom', label: 'Custom', src: `/projects/${data.project.slug}/files/raw?path=${encodeURIComponent(data.settings?.[`${data.prefix}background_custom_path`] as string)}`, kind: 'photo' as const, credit: 'Uploaded' }
      : projectBackground((data.settings ?? {})[`${data.prefix ?? ''}background`] ?? 'none')
  );
  const chromeCanvas = $derived({ src: chromeBackground.src || undefined, color: chromeBackground.color });
  const chromeAppearance = $derived(appearanceFromSettings(data.settings ?? {}, data.prefix ?? ''));
  const chromeAttributes = $derived(appearanceAttributes(chromeAppearance, chromeCanvas));
  const chromeStyle = $derived(appearanceStyle(chromeAppearance, chromeCanvas));

  // A red link lands here with the title already chosen, so the composer opens
  // ready to write rather than asking for something the reader already said.
  let composing = $state(untrack(() => Boolean(data.newTitle)));
  let title = $state(untrack(() => data.newTitle));
  $effect(() => {
    if (!data.newTitle) return;
    composing = true;
    title = data.newTitle;
  });

  // Arriving from a red link, the cursor should already be where the writing
  // happens, with the pre-filled title selected so it is trivial to replace.
  function focusOnMount(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  const pinned = $derived(data.pages.filter((page) => page.pinned));
  const rest = $derived(data.pages.filter((page) => !page.pinned));
  const when = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
</script>

<svelte:head><title>Wiki · {data.project.name}</title></svelte:head>

<main class="wiki-page" {...chromeAttributes} style={chromeStyle}>
  <ProjectHeader
    project={data.project}
    active="wiki"
    canEdit={data.canEdit}
    username={data.username}
    starred={data.starred}
  >
    {#snippet extra()}
      {#if data.canEdit}
        <div class="top-links board-header-actions">
          <button type="button" class="quiet-button" onclick={() => { composing = !composing; }}><Plus /> New page</button>
        </div>
      {/if}
    {/snippet}
  </ProjectHeader>

  <p class="subtitle page-intro">
    Long-lived knowledge for this project. Link pages with <code>[[double brackets]]</code> — a link to a page nobody has written yet still works, and offers to create it.
  </p>

  {#if form?.error}<p class="action-errors" role="alert">{form.error}</p>{/if}

  {#if composing && data.canEdit}
    <form method="POST" action="?/create" class="wiki-composer">
      <label>Page title
        <input name="title" bind:value={title} maxlength="120" placeholder="Deployment runbook" required use:focusOnMount />
      </label>
      <label>First words <textarea name="body" rows="3" placeholder="What is this page for?"></textarea></label>
      <div class="card-actions">
        <button type="submit"><Plus /> Create page</button>
        <button type="button" class="quiet-button" onclick={() => { composing = false; }}>Cancel</button>
      </div>
    </form>
  {/if}

  {#if data.pages.length === 0 && !composing}
    <section class="wiki-empty">
      <div>
        <p class="eyebrow">NOTHING WRITTEN YET</p>
        <h2>This project has no wiki pages.</h2>
        <p>Start with the one page you keep re-explaining — a runbook, a glossary, the decisions behind the board.</p>
      </div>
      {#if data.canEdit}
        <button type="button" class="primary-button" onclick={() => { composing = true; }}><Plus /> Write the first page</button>
      {:else}
        <p class="empty">An editor can write the first page.</p>
      {/if}
    </section>
  {/if}

  {#each [{ id: 'pinned', label: 'Pinned', items: pinned }, { id: 'all', label: pinned.length ? 'Other pages' : 'Pages', items: rest }] as group (group.id)}
    {#if group.items.length}
      <section class="wiki-section" aria-labelledby={`wiki-${group.id}`}>
        <div class="board-home-section-heading">
          <div><h2 id={`wiki-${group.id}`}>{group.label}</h2></div>
          <span class="board-home-count">{group.items.length}</span>
        </div>
        <ul class="wiki-list">
          {#each group.items as page (page.pageId)}
            <li class="wiki-item">
              <a href={`/projects/${data.project.slug}/wiki/${page.pageId}`}>
                <span class="wiki-item-icon" aria-hidden="true">{#if page.pinned}<Pin />{:else}<BookOpen />{/if}</span>
                <span class="wiki-item-copy">
                  <strong>{page.title}</strong>
                  {#if page.excerpt}<small>{page.excerpt}</small>{/if}
                </span>
              </a>
              <p class="wiki-item-meta">
                {page.updatedBy} · {when(page.updatedAt)}
                <a class="wiki-item-file" href={`/projects/${data.project.slug}/files?file=${encodeURIComponent(page.path)}`} title="Open this page's markdown file in the project cloud">{page.path}</a>
              </p>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {/each}

  {#if data.wanted.length}
    <section class="wiki-section" aria-labelledby="wiki-wanted">
      <div class="board-home-section-heading">
        <div>
          <h2 id="wiki-wanted">Wanted pages</h2>
          <p>Linked from somewhere, not written yet.</p>
        </div>
        <span class="board-home-count">{data.wanted.length}</span>
      </div>
      <ul class="wiki-wanted">
        {#each data.wanted as entry (entry.slug)}
          <li>
            <a class="wiki-link wiki-link-missing" href={`/projects/${data.project.slug}/wiki?new=${encodeURIComponent(entry.target)}`}>
              <FileQuestion /> {entry.target}
            </a>
            <span>linked from {entry.from.length} {entry.from.length === 1 ? 'page' : 'pages'}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</main>
