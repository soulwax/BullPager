<script lang="ts">
  import { untrack } from 'svelte';
  import { marked } from 'marked';
  import type { BoardProject, WikiPage, WikiRevision } from '$lib/types';
  import type { WikiLink } from '$lib/wikiLinks';
  import { renderWikiLinks } from '$lib/wikiLinks';
  import { appearanceAttributes, appearanceFromSettings, appearanceStyle } from '$lib/boardAppearance';
  import { projectBackground } from '$lib/projectBackgrounds';
  import ProjectHeader from '$lib/components/ProjectHeader.svelte';
  import History from '@lucide/svelte/icons/history';
  import Link2 from '@lucide/svelte/icons/link-2';
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Pin from '@lucide/svelte/icons/pin';
  import Trash2 from '@lucide/svelte/icons/trash-2';

  let { data, form }: {
    data: {
      project: BoardProject;
      page: WikiPage;
      known: string[];
      outgoing: WikiLink[];
      backlinks: { pageId: string; title: string }[];
      revisions: WikiRevision[];
      referencedCards: { number: number; id: string; title: string; lane: string; archived: boolean }[];
      canEdit: boolean;
      username: string;
      starred: boolean;
      settings?: Record<string, string>;
      prefix?: string;
    };
    form?: { error?: string; message?: string };
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

  let editing = $state(false);
  let draftTitle = $state(untrack(() => data.page.title));
  let draftBody = $state(untrack(() => data.page.body));
  let showHistory = $state(false);
  let sanitize: ((html: string) => string) | undefined = $state();

  // DOMPurify is browser-only, so the rendered body stays empty until it has
  // loaded rather than briefly injecting unsanitised HTML.
  $effect(() => {
    let cancelled = false;
    import('dompurify').then((module) => {
      if (!cancelled) sanitize = (html: string) => module.default.sanitize(html);
    });
    return () => { cancelled = true; };
  });

  // Re-seed the editor when navigating between pages (the route reuses this
  // component), but never clobber an edit in progress.
  let trackedPage = untrack(() => data.page.pageId);
  $effect(() => {
    if (data.page.pageId === trackedPage) return;
    trackedPage = data.page.pageId;
    editing = false;
    showHistory = false;
    draftTitle = data.page.title;
    draftBody = data.page.body;
  });

  const known = $derived(new Set(data.known));
  const rendered = $derived.by(() => {
    if (!sanitize) return '';
    const withLinks = renderWikiLinks(data.page.body, {
      basePath: `/projects/${data.project.slug}/wiki`,
      cardBasePath: `/projects/${data.project.slug}`,
      exists: (slug) => known.has(slug),
      // `[[#42]]` opens the card drawer on the board rather than offering to
      // create a wiki page called "42".
      card: (number) => {
        const hit = data.referencedCards.find((entry) => entry.number === number && entry.id);
        return hit ? { id: hit.id, title: hit.title, lane: hit.lane } : null;
      }
    });
    return sanitize(marked.parse(withLinks, { breaks: true, gfm: true }) as string);
  });

  const when = (value: string) =>
    new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
</script>

<svelte:head><title>{data.page.title} · Wiki · {data.project.name}</title></svelte:head>

<main class="wiki-page wiki-page-single" {...chromeAttributes} style={chromeStyle}>
  <ProjectHeader
    project={data.project}
    active="wiki"
    canEdit={data.canEdit}
    username={data.username}
    starred={data.starred}
  >
    {#snippet extra()}
      <div class="top-links board-header-actions">
        <button type="button" class="quiet-button" class:active={showHistory} onclick={() => { showHistory = !showHistory; }}>
          <History /> History <span class="wiki-count">{data.revisions.length}</span>
        </button>
        {#if data.canEdit}
          <form method="POST" action="?/togglePin"><button type="submit" class="quiet-button" class:active={data.page.pinned}><Pin /> {data.page.pinned ? 'Pinned' : 'Pin'}</button></form>
          <button type="button" class="quiet-button" class:active={editing} onclick={() => { editing = !editing; draftTitle = data.page.title; draftBody = data.page.body; }}>
            <Pencil /> {editing ? 'Stop editing' : 'Edit'}
          </button>
        {/if}
      </div>
    {/snippet}
  </ProjectHeader>

  {#if form?.error}<p class="action-errors" role="alert">{form.error}</p>{/if}
  {#if form?.message}<p class="success" role="status">{form.message}</p>{/if}

  <article class="wiki-article">
    {#if editing}
      <form method="POST" action="?/save" class="wiki-editor">
        <label>Title <input name="title" bind:value={draftTitle} maxlength="120" required /></label>
        <label>Body <textarea name="body" bind:value={draftBody} rows="22" spellcheck="true"></textarea></label>
        <label>What changed <input name="summary" maxlength="200" placeholder="Optional — shown in history" /></label>
        <div class="card-actions">
          <button type="submit">Save page</button>
          <button type="button" class="quiet-button" onclick={() => { editing = false; }}>Cancel</button>
          <!-- Deleting posts to its own action, so the button lives outside the
               save form rather than nested inside it. -->
          <button type="submit" form="wiki-delete" class="quiet-button danger"><Trash2 /> Delete page</button>
        </div>
      </form>
      <form
        id="wiki-delete"
        method="POST"
        action="?/remove"
        onsubmit={(event) => { if (!confirm(`Delete “${data.page.title}”? Its history is kept.`)) event.preventDefault(); }}
      ></form>
    {:else}
      <header class="wiki-article-head">
        <h1>{data.page.title}</h1>
        <p class="wiki-article-meta">
          Edited by {data.page.updatedBy} · {when(data.page.updatedAt)} ·
          <a class="wiki-item-file" href={`/projects/${data.project.slug}/files?file=${encodeURIComponent(data.page.path)}`} title="Open this page's markdown file in the project cloud">{data.page.path}</a>
        </p>
      </header>
      {#if data.page.body.trim()}
        <div class="wiki-body">{@html rendered}</div>
      {:else}
        <p class="empty">This page is empty. {#if data.canEdit}Use <strong>Edit</strong> to write it.{/if}</p>
      {/if}
    {/if}
  </article>

  <aside class="wiki-aside">
    <section>
      <h2><Link2 /> Links from this page</h2>
      {#if data.outgoing.length}
        <ul class="wiki-link-list">
          {#each data.outgoing as link (link.slug)}
            <li>
              <a class="wiki-link" class:wiki-link-missing={!known.has(link.slug)}
                 href={known.has(link.slug) ? `/projects/${data.project.slug}/wiki/${link.slug}` : `/projects/${data.project.slug}/wiki?new=${encodeURIComponent(link.target)}`}>
                {link.label}
              </a>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="empty">None yet. Write <code>[[a page name]]</code> to link a page, or <code>[[#12]]</code> to link a card.</p>
      {/if}
    </section>

    {#if data.referencedCards.length}
      <section>
        <h2><LayoutGrid /> Cards referenced</h2>
        <ul class="wiki-link-list">
          {#each data.referencedCards as ref (ref.number)}
            <li>
              {#if ref.id}
                <a class="wiki-card-link" href={`/projects/${data.project.slug}?card=${encodeURIComponent(ref.id)}`}>
                  <span class="wiki-card-number">#{ref.number}</span>{ref.title}
                </a>
              {:else}
                <span class="wiki-card-link wiki-card-link-missing">
                  <span class="wiki-card-number">#{ref.number}</span>no such card
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section>
      <h2><Link2 /> Pages linking here</h2>
      {#if data.backlinks.length}
        <ul class="wiki-link-list">
          {#each data.backlinks as entry (entry.pageId)}
            <li><a class="wiki-link" href={`/projects/${data.project.slug}/wiki/${entry.pageId}`}>{entry.title}</a></li>
          {/each}
        </ul>
      {:else}
        <p class="empty">Nothing links here yet.</p>
      {/if}
    </section>

    {#if showHistory}
      <section>
        <h2><History /> History</h2>
        <ol class="wiki-history">
          {#each data.revisions as revision (revision.id)}
            <li>
              <strong>{revision.editedBy}</strong>
              <time>{when(revision.createdAt)}</time>
              {#if revision.summary}<p>{revision.summary}</p>{/if}
            </li>
          {/each}
        </ol>
      </section>
    {/if}
  </aside>
</main>
