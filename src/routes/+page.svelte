<script lang="ts">
  import type { ProjectGroup } from "$lib/projectAccess";
  import {
    accessLabel,
    canCreateProjects,
    projectMark,
  } from "$lib/projectAccess";
  import type { UserRole } from "$lib/types";
  import { invalidateAll } from "$app/navigation";
  import Cloud from "@lucide/svelte/icons/cloud";
  import LayoutGrid from "@lucide/svelte/icons/layout-grid";
  import Plus from "@lucide/svelte/icons/plus";
  import Rows3 from "@lucide/svelte/icons/rows-3";
  import Star from "@lucide/svelte/icons/star";
  import Waypoints from "@lucide/svelte/icons/waypoints";

  let {
    data,
  }: {
    data: {
      groups: ProjectGroup[];
      counts: Record<string, { active: number; total: number }>;
      starred: string[];
      username: string;
      role: UserRole | "";
    };
  } = $props();

  const canCreate = $derived(canCreateProjects(data.role));
  const total = $derived(
    data.groups.reduce((sum, group) => sum + group.projects.length, 0),
  );

  // Optimistic so the star fills the moment it is clicked; the reload behind it
  // only corrects the rare failure.
  let starred = $state<Set<string>>(new Set());
  $effect(() => {
    starred = new Set(data.starred);
  });

  async function toggleStar(slug: string) {
    const next = !starred.has(slug);
    const updated = new Set(starred);
    if (next) updated.add(slug);
    else updated.delete(slug);
    starred = updated;
    const body = new FormData();
    body.set("slug", slug);
    body.set("starred", String(next));
    try {
      await fetch("?/toggleStar", {
        method: "POST",
        body,
        headers: { accept: "application/json" },
      });
    } finally {
      await invalidateAll();
    }
  }

  const cardLabel = (slug: string) => {
    const count = data.counts[slug];
    if (!count) return "No cards yet";
    return `${count.active} active${count.total > count.active ? ` · ${count.total - count.active} archived` : ""}`;
  };
</script>

<svelte:head>
  <title>Boards · Cirrus Architecture Tool</title>
  <meta name="description" content="Every board you own, share, or can open." />
</svelte:head>

<main class="board-home">
  <header class="topbar board-home-header">
    <div>
      <p class="eyebrow">BOARDS</p>
      <h1>
        {data.username ? `Welcome back, ${data.username}.` : "Your boards"}
      </h1>
      <p class="subtitle">
        Every board you own, share, or can open — each with its own cards,
        files, and graph.
      </p>
    </div>
    <div class="top-links">
      {#if canCreate}<a class="primary-button" href="/projects/new"
          ><Plus /> Create board</a
        >{/if}
    </div>
  </header>

  {#if total === 0}
    <section class="board-home-empty" aria-labelledby="first-board-title">
      <div>
        <p class="eyebrow">A CALM START</p>
        <h2 id="first-board-title">No boards yet.</h2>
        <p>
          Start from a template — it sets the columns, cadence, and look, and
          you can change all three later.
        </p>
      </div>
      {#if canCreate}
        <a class="primary-button" href="/projects/new"
          ><Plus /> Choose a template</a
        >
      {:else}
        <p class="empty">
          An editor or administrator can create the first board.
        </p>
      {/if}
    </section>
  {:else}
    {#each data.groups as group (group.id)}
      <section class="board-home-section" aria-labelledby={`group-${group.id}`}>
        <div class="board-home-section-heading">
          <div>
            <h2 id={`group-${group.id}`}>{group.title}</h2>
            <p>{group.hint}</p>
          </div>
          <span class="board-home-count">{group.projects.length}</span>
        </div>
        <ul class="board-tile-grid">
          {#each group.projects as entry (entry.project.slug)}
            <li
              class="board-tile"
              class:starred={starred.has(entry.project.slug)}
            >
              <a
                class="board-tile-face"
                href={`/projects/${entry.project.slug}`}
              >
                <span class="board-tile-mark" aria-hidden="true"
                  >{projectMark(entry.project.name)}</span
                >
                <span class="board-tile-copy">
                  <strong>{entry.project.name}</strong>
                  <small>{cardLabel(entry.project.slug)}</small>
                </span>
              </a>
              <p class="board-tile-meta">
                <span class={`access-chip access-${entry.access}`}
                  >{accessLabel[entry.access]}</span
                >
                <span
                  >{entry.project.visibility === "private"
                    ? "Private"
                    : "Shared"}</span
                >
                <span>owned by {entry.project.owner}</span>
              </p>
              <div class="board-tile-actions">
                <a
                  class="quiet-button"
                  href={`/projects/${entry.project.slug}`}
                  aria-label={`Open the ${entry.project.name} board`}
                  ><LayoutGrid /> Board</a
                >
                <a
                  class="quiet-button"
                  href={`/projects/${entry.project.slug}/backlog`}
                  ><Rows3 /> Backlog</a
                >
                <a
                  class="quiet-button"
                  href={`/projects/${entry.project.slug}/files`}
                  ><Cloud /> Cloud</a
                >
                <a
                  class="quiet-button"
                  href={`/projects/${entry.project.slug}/graph`}
                  ><Waypoints /> Graph</a
                >
                {#if data.username}
                  <button
                    type="button"
                    class="star-toggle board-tile-star"
                    class:active={starred.has(entry.project.slug)}
                    aria-pressed={starred.has(entry.project.slug)}
                    aria-label={starred.has(entry.project.slug)
                      ? `Unstar ${entry.project.name}`
                      : `Star ${entry.project.name}`}
                    onclick={() => toggleStar(entry.project.slug)}
                    ><Star
                      fill={starred.has(entry.project.slug)
                        ? "currentColor"
                        : "none"}
                    /></button
                  >
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/each}

    {#if canCreate}
      <a class="board-tile board-tile-new" href="/projects/new">
        <span class="board-tile-mark" aria-hidden="true"><Plus /></span>
        <span class="board-tile-copy"
          ><strong>Create a board</strong><small>Start from a template</small
          ></span
        >
      </a>
    {/if}
  {/if}
</main>
