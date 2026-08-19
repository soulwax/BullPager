<script lang="ts">
  import type { BoardProject, ProjectCard, ProjectTag } from '$lib/types';
  import Check from '@lucide/svelte/icons/check';
  import Circle from '@lucide/svelte/icons/circle';

  let { data }: { data: { project: BoardProject; cards: ProjectCard[]; tags: ProjectTag[] } } = $props();
  let query = $state('');
  let lane = $state('all');
  let tag = $state('all');
  let includeArchived = $state(false);

  const lanes = $derived([...new Set(data.cards.map((card) => card.lane))]);
  const cards = $derived(data.cards.filter((card) => {
    const haystack = `${card.title} ${card.details} ${card.owner} ${card.tags.map((item) => item.name).join(' ')}`.toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) &&
      (lane === 'all' || card.lane === lane) &&
      (tag === 'all' || card.tags.some((item) => item.id === tag)) &&
      (includeArchived || !card.archived);
  }));
  function checklistLabel(card: ProjectCard) {
    const done = card.checklist.filter((item) => item.done).length;
    return card.checklist.length ? `${done}/${card.checklist.length} checklist items complete` : 'No checklist';
  }
</script>

<svelte:head><title>{data.project.name} backlog · BullPager</title></svelte:head>

<main class="backlog-page">
  <header class="topbar">
    <div>
      <p class="eyebrow">DETAILED BACKLOG</p>
      <h1>{data.project.name}</h1>
      <p class="subtitle">Every saved card in one readable list. Use the board for movement; use this view for planning and review.</p>
    </div>
    <div class="top-links"><a class="quiet-button" href={`/projects/${data.project.slug}`}>Open board</a><a class="quiet-button" href={`/projects/${data.project.slug}/files`}>Cloud</a></div>
  </header>

  <section class="backlog-toolbar" aria-label="Backlog filters">
    <label>Search <input bind:value={query} placeholder="Title, detail, owner, or tag" /></label>
    <label>Lane <select bind:value={lane}><option value="all">All lanes</option>{#each lanes as item}<option value={item}>{item}</option>{/each}</select></label>
    <label>Tag <select bind:value={tag}><option value="all">All tags</option>{#each data.tags as item}<option value={item.id}>{item.name}</option>{/each}</select></label>
    <label class="check"><input type="checkbox" bind:checked={includeArchived} /> Include archived</label>
    <span class="backlog-count">{cards.length} of {data.cards.length} cards</span>
  </section>

  {#if cards.length === 0}
    <section class="project-filter-empty"><p class="eyebrow">NO MATCHES</p><h2>No backlog cards match these filters.</h2><p class="subtitle">Clear the search or broaden the selected lane/tag.</p></section>
  {:else}
    <ol class="backlog-list">
      {#each cards as card (card.id)}
        <li class:archived={card.archived} class="backlog-card">
          <div class="backlog-card-heading">
            <div><p class="backlog-card-id">{card.id}</p><h2>{card.title}</h2></div>
            <a class="quiet-button" href={`/projects/${data.project.slug}?card=${encodeURIComponent(card.id)}`}>Open on board</a>
          </div>
          <div class="backlog-meta"><span>{card.lane}</span><span>{card.priority} priority</span><span>{card.owner || 'unassigned'}</span>{#if card.dueDate}<span>Due {new Date(`${card.dueDate}T00:00:00`).toLocaleDateString()}</span>{/if}{#if card.archived}<span>Archived</span>{/if}</div>
          {#if card.tags.length}<div class="backlog-tags">{#each card.tags as item}<span style={`--tag-color: ${item.color}`}>{item.name}</span>{/each}</div>{/if}
          {#if card.details}<p class="backlog-details">{card.details}</p>{/if}
          <details class="backlog-checklist" open={card.checklist.length > 0}>
            <summary>{checklistLabel(card)}</summary>
            {#if card.checklist.length}<ol>{#each card.checklist as item}<li class:done={item.done}>{#if item.done}<Check />{:else}<Circle />{/if} {item.text}</li>{/each}</ol>{:else}<p>No implementation checklist has been attached yet.</p>{/if}
          </details>
        </li>
      {/each}
    </ol>
  {/if}
</main>
