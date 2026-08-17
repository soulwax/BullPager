<script lang="ts">
  import type { BoardProject, ProjectActivity, ProjectCard, ProjectViewState } from '$lib/types';
  import { invalidateAll } from '$app/navigation';

  let { data, form }: { data: { project: BoardProject; prefix: string; settings: Record<string, string>; lanes: string[]; cards: ProjectCard[]; activity: ProjectActivity[]; viewState: ProjectViewState; canEdit: boolean; created: boolean }; form?: { message?: string; error?: string } } = $props();
  const setting = (name: string, fallback = '') => data.settings[`${data.prefix}${name}`] ?? fallback;
  let collapsed = $state<Record<string, boolean>>({});
  let density = $state<'comfortable' | 'compact'>('comfortable');
  let query = $state('');
  let priorityFilter = $state<'all' | 'low' | 'normal' | 'high' | 'urgent'>('all');
  let composerLane = $state<string | null>(null);
  let savedStatus = $state('');
  let draggedCardId = $state('');
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    collapsed = { ...(data.viewState.collapsed ?? {}) };
    density = data.viewState.density === 'compact' ? 'compact' : 'comfortable';
    query = data.viewState.query ?? '';
    priorityFilter = data.viewState.priority ?? 'all';
    if (data.cards.length === 0 && composerLane === null) composerLane = data.lanes[0] ?? null;
  });

  const visibleCards = $derived(data.cards.filter((card) => {
    const matchesText = !query || `${card.title} ${card.details} ${card.owner}`.toLowerCase().includes(query.toLowerCase());
    const matchesPriority = priorityFilter === 'all' || card.priority === priorityFilter;
    return matchesText && matchesPriority;
  }));
  const urgentCount = $derived(data.cards.filter((card) => card.priority === 'urgent').length);
  const datedCount = $derived(data.cards.filter((card) => card.dueDate).length);
  const filtered = $derived(query || priorityFilter !== 'all');
  function cardsFor(lane: string) { return visibleCards.filter((card) => card.lane === lane); }
  function laneId(lane: string) { return `project-lane-${lane.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`; }
  function dueState(dueDate: string | null) {
    if (!dueDate) return '';
    const today = new Date().toISOString().slice(0, 10);
    return dueDate < today ? 'overdue' : dueDate === today ? 'today' : 'scheduled';
  }
  function dueLabel(dueDate: string | null) {
    return dueDate ? new Date(`${dueDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  }
  function toggleLane(lane: string) {
    collapsed[lane] = !collapsed[lane];
    queueViewSave();
  }
  function queueViewSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const body = new FormData();
      body.set('density', density);
      body.set('collapsed', JSON.stringify(collapsed));
      body.set('query', query);
      body.set('priority', priorityFilter);
      try {
        const response = await fetch('?/saveView', { method: 'POST', body, headers: { accept: 'application/json' } });
        if (response.ok) {
          savedStatus = 'View saved';
          setTimeout(() => { savedStatus = ''; }, 1800);
        }
      } catch { /* the board remains usable if persistence is temporarily unavailable */ }
    }, 250);
  }
  function clearFilters() {
    query = '';
    priorityFilter = 'all';
    queueViewSave();
  }
  function startDrag(card: ProjectCard, event: DragEvent) {
    if (!data.canEdit) return;
    draggedCardId = card.id;
    event.dataTransfer?.setData('text/plain', card.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }
  async function dropCard(lane: string, event: DragEvent) {
    event.preventDefault();
    const id = event.dataTransfer?.getData('text/plain') || draggedCardId;
    draggedCardId = '';
    if (!id) return;
    const body = new FormData();
    body.set('id', id);
    body.set('lane', lane);
    try {
      const response = await fetch('?/moveCard', { method: 'POST', body, headers: { accept: 'application/json' } });
      if (response.ok) {
        savedStatus = 'Card moved';
        await invalidateAll();
        setTimeout(() => { savedStatus = ''; }, 1800);
      }
    } catch { /* keep the card in place if the save cannot complete */ }
  }
</script>

<svelte:head><title>{data.project.name} · Project Agile Board</title></svelte:head>

<main class={`project-workspace theme-${setting('theme', 'midnight')} project-lane-${setting('lane_style', 'scroll')}`}>
  <header class="topbar">
    <div><p class="eyebrow">PROJECT WORKSPACE</p><h1>{data.project.name}</h1><p class="subtitle">{data.cards.length ? `${data.cards.length} saved cards across ${data.lanes.length} lanes.` : `A calm starting point for shared work. Your ${setting('template', 'custom')} template is ready for its first card.`}</p></div>
    <div class="top-links"><a class="quiet-button" href={`/projects/${data.project.slug}/settings`}>Project settings</a><a class="quiet-button" href="/settings">All projects</a></div>
  </header>

  {#if data.created}<section class="project-welcome" role="status"><div><p class="eyebrow">PROJECT CREATED</p><h2>Your workspace is ready.</h2><p>Start with one concrete outcome, then invite collaborators when the workflow feels right.</p></div><a class="quiet-button" href={`/projects/${data.project.slug}/settings`}>Tune workflow</a></section>{/if}
  {#if form?.message}<p class="success" role="status">{form.message}</p>{/if}
  {#if form?.error}<p class="action-errors" role="alert">{form.error}</p>{/if}

  <div class="project-toolbar"><div class="project-toolbar-copy"><p class="eyebrow">WORKFLOW</p><p class="project-save-note">{data.cards.length ? 'Cards and board preferences are saved automatically.' : 'Your first card will be saved to this project.'}{#if savedStatus} <span class="save-status">· {savedStatus}</span>{/if}</p></div><div class="project-stats" aria-label="Project summary"><span><strong>{data.cards.length}</strong> cards</span><span><strong>{urgentCount}</strong> urgent</span><span><strong>{datedCount}</strong> dated</span></div><div class="project-controls"><label class="project-search">Search <input bind:value={query} oninput={queueViewSave} placeholder="Title, detail, or owner" aria-label="Search project cards" /></label><label>Priority <select bind:value={priorityFilter} onchange={queueViewSave}><option value="all">All priorities</option><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label><label>Density <select bind:value={density} onchange={queueViewSave}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>{#if filtered}<button type="button" class="quiet-button clear-project-filters" onclick={clearFilters}>Clear</button>{/if}</div></div>

  {#if data.cards.length === 0}
    <section class="project-empty-intro"><img src="/assets/illustrations/organizing-projects.svg" alt="" /><div><p class="eyebrow">EMPTY SLATE</p><h2>Nothing is stuck here yet.</h2><p class="subtitle">This board has {data.lanes.length} lanes from your template. Add one small, concrete card and the empty state will disappear.</p></div></section>
  {:else if visibleCards.length === 0}
    <section class="project-filter-empty"><p class="eyebrow">NO MATCHES</p><h2>Nothing matches this view.</h2><p class="subtitle">Try a different search or priority, or clear the filters to see every saved card.</p><button type="button" class="quiet-button" onclick={clearFilters}>Clear filters</button></section>
  {/if}

  {#if data.cards.length === 0 || visibleCards.length > 0}<section class:project-board-compact={density === 'compact'} class="project-board" aria-label={`${data.project.name} workflow`}>
    {#each data.lanes as lane, index}
      {@const laneCards = cardsFor(lane)}
      <section id={laneId(lane)} role="list" aria-label={`${lane} lane`} class:collapsed={collapsed[lane]} class:drop-target={Boolean(draggedCardId)} class="project-column" ondragover={(event) => event.preventDefault()} ondrop={(event) => dropCard(lane, event)}>
        <h2><span>{lane}<small>{laneCards.length} {laneCards.length === 1 ? 'card' : 'cards'}</small></span><button class="collapse-button" type="button" aria-expanded={!collapsed[lane]} aria-label={`${collapsed[lane] ? 'Expand' : 'Collapse'} ${lane}`} onclick={() => toggleLane(lane)}>{collapsed[lane] ? '+' : '−'}</button></h2>
        {#if !collapsed[lane]}
          <div class="project-column-cards">
            {#each laneCards as card}
              <article role="listitem" aria-label={`${card.title}, ${card.priority} priority`} class:dragging={draggedCardId === card.id} class="project-card" draggable={data.canEdit} ondragstart={(event) => startDrag(card, event)} ondragend={() => { draggedCardId = ''; }}><div class="project-card-heading"><strong>{card.title}</strong><span class="priority-badge" class:priority-low={card.priority === 'low'} class:priority-high={card.priority === 'high'} class:priority-urgent={card.priority === 'urgent'}>{card.priority}</span></div><div class="project-card-meta"><span>{card.owner || 'unassigned'}</span>{#if card.dueDate}<span class={`due-date due-${dueState(card.dueDate)}`}>Due {dueLabel(card.dueDate)}</span>{/if}{#if data.canEdit}<span class="drag-hint">Drag to move</span>{/if}</div>{#if card.details}<p>{card.details}</p>{/if}<details><summary>Manage card</summary><form method="POST" action="?/updateCard" class="card-edit-form"><input type="hidden" name="id" value={card.id} /><label>Title <input name="title" value={card.title} maxlength="160" required /></label><label>Details <textarea name="details" rows="3" maxlength="4000">{card.details}</textarea></label><div class="card-form-grid"><label>Owner <input name="owner" value={card.owner} maxlength="120" /></label><label>Priority <select name="priority"><option value="low" selected={card.priority === 'low'}>Low</option><option value="normal" selected={card.priority === 'normal'}>Normal</option><option value="high" selected={card.priority === 'high'}>High</option><option value="urgent" selected={card.priority === 'urgent'}>Urgent</option></select></label></div><div class="card-form-grid"><label>Due date <input name="dueDate" type="date" value={card.dueDate ?? ''} /></label><label>Lane <select name="lane">{#each data.lanes as option}<option value={option} selected={option === card.lane}>{option}</option>{/each}</select></label></div><div class="card-actions"><button type="submit">Save card</button><button class="quiet-button danger" type="submit" formaction="?/deleteCard" onclick={(event) => { if (!confirm('Delete this card?')) event.preventDefault(); }}>Delete</button></div></form></details></article>
            {:else}<div class="project-column-empty"><strong>{filtered ? 'No matching cards' : index === 0 ? 'Add the first card' : 'Ready when you are'}</strong><p>{filtered ? 'Clear the filters or keep this lane focused.' : index === 0 ? 'Capture one outcome, request, or question.' : 'Cards will collect here as work moves forward.'}</p></div>{/each}
          </div>
          {#if data.canEdit}
            {#if composerLane === lane}<form method="POST" action="?/createCard" class="card-composer"><label>Title <input name="title" maxlength="160" required placeholder="What needs to move?" /></label><label>Details <textarea name="details" rows="3" maxlength="4000" placeholder="Outcome, context, or next check"></textarea></label><div class="card-form-grid"><label>Owner <input name="owner" maxlength="120" placeholder="Optional" /></label><label>Priority <select name="priority"><option value="normal">Normal</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></select></label></div><label>Due date <input name="dueDate" type="date" /></label><input type="hidden" name="lane" value={lane} /><div class="card-actions"><button type="submit">Save card</button><button class="quiet-button" type="button" onclick={() => { composerLane = null; }}>Cancel</button></div></form>{:else}<button type="button" class="add-card-button" onclick={() => { composerLane = lane; }}>+ Add card</button>{/if}
          {/if}
        {/if}
      </section>
    {/each}
  </section>{/if}

  {#if data.activity.length}<section class="project-activity"><details><summary>Recent activity <span>{data.activity.length}</span></summary><ol>{#each data.activity.slice(0, 8) as entry}<li><div><strong>{entry.action}</strong><span>{entry.actor} · {new Date(entry.createdAt).toLocaleString()}</span></div><p>{entry.summary}</p></li>{/each}</ol></details></section>{/if}

  {#if data.cards.length}<section class="project-next-steps"><div><strong>Keep the board honest</strong><p>Give each card an outcome and owner, then move it only when the evidence is ready.</p></div><a class="quiet-button" href={`/projects/${data.project.slug}/settings`}>Edit lanes and appearance</a></section>{/if}
</main>
