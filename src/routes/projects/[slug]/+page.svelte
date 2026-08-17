<script lang="ts">
  import type { BoardProject, ProjectActivity, ProjectCard, ProjectTag, ProjectViewState } from '$lib/types';
  import { defaultProjectTags, tagId, tagPalette } from '$lib/projectTags';
  import { invalidateAll } from '$app/navigation';

  let { data, form }: { data: { project: BoardProject; prefix: string; settings: Record<string, string>; lanes: string[]; cards: ProjectCard[]; tags: ProjectTag[]; activity: ProjectActivity[]; viewState: ProjectViewState; canEdit: boolean; created: boolean }; form?: { message?: string; error?: string } } = $props();
  const setting = (name: string, fallback = '') => data.settings[`${data.prefix}${name}`] ?? fallback;
  const isDefaultTag = (id: string) => defaultProjectTags.some((tag) => tagId(data.project.slug, tag.slug) === id);
  let collapsed = $state<Record<string, boolean>>({});
  let density = $state<'comfortable' | 'compact'>('comfortable');
  let query = $state('');
  let priorityFilter = $state<'all' | 'low' | 'normal' | 'high' | 'urgent'>('all');
  let tagFilter = $state('all');
  let showArchived = $state(false);
  let composerLane = $state<string | null>(null);
  let editingCardId = $state<string | null>(null);
  let savedStatus = $state('');
  let draggedCardId = $state('');
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    collapsed = { ...(data.viewState.collapsed ?? {}) };
    density = data.viewState.density === 'compact' ? 'compact' : 'comfortable';
    query = data.viewState.query ?? '';
    priorityFilter = data.viewState.priority ?? 'all';
    tagFilter = data.viewState.tag ?? 'all';
    showArchived = data.viewState.showArchived === true;
    if (data.cards.length === 0 && composerLane === null) composerLane = data.lanes[0] ?? null;
  });

  const visibleCards = $derived(data.cards.filter((card) => {
    const matchesText = !query || `${card.title} ${card.details} ${card.owner} ${card.tags.map((tag) => tag.name).join(' ')}`.toLowerCase().includes(query.toLowerCase());
    const matchesPriority = priorityFilter === 'all' || card.priority === priorityFilter;
    const matchesTag = tagFilter === 'all' || card.tags.some((tag) => tag.id === tagFilter);
    const matchesArchive = showArchived || !card.archived;
    return matchesText && matchesPriority && matchesTag && matchesArchive;
  }));
  const activeCards = $derived(data.cards.filter((card) => !card.archived));
  const urgentCount = $derived(activeCards.filter((card) => card.priority === 'urgent').length);
  const datedCount = $derived(activeCards.filter((card) => card.dueDate).length);
  const archivedCount = $derived(data.cards.filter((card) => card.archived).length);
  const filtered = $derived(query || priorityFilter !== 'all' || tagFilter !== 'all' || showArchived);
  const editingCard = $derived(data.cards.find((card) => card.id === editingCardId) ?? null);
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
      body.set('tag', tagFilter);
      body.set('showArchived', String(showArchived));
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
    tagFilter = 'all';
    showArchived = false;
    queueViewSave();
  }
  function startDrag(card: ProjectCard, event: DragEvent) {
    if (!data.canEdit) return;
    draggedCardId = card.id;
    event.dataTransfer?.setData('text/plain', card.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }
  async function dropCard(lane: string, beforeId: string, event: DragEvent) {
    event.preventDefault();
    const id = event.dataTransfer?.getData('text/plain') || draggedCardId;
    draggedCardId = '';
    if (!id || id === beforeId) return;
    const body = new FormData();
    body.set('id', id);
    body.set('lane', lane);
    body.set('beforeId', beforeId);
    try {
      const response = await fetch('?/reorderCard', { method: 'POST', body, headers: { accept: 'application/json' } });
      if (response.ok) {
        savedStatus = 'Card order saved';
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

  <div class="project-toolbar"><div class="project-toolbar-copy"><p class="eyebrow">WORKFLOW</p><p class="project-save-note">{data.cards.length ? 'Cards and board preferences are saved automatically.' : 'Your first card will be saved to this project.'}{#if savedStatus} <span class="save-status">· {savedStatus}</span>{/if}</p></div><div class="project-stats" aria-label="Project summary"><span><strong>{activeCards.length}</strong> active</span><span><strong>{urgentCount}</strong> urgent</span><span><strong>{data.tags.length}</strong> tags</span><span><strong>{archivedCount}</strong> archived</span></div><div class="project-controls"><label class="project-search">Search <input bind:value={query} oninput={queueViewSave} placeholder="Title, detail, or owner" aria-label="Search project cards" /></label><label>Priority <select bind:value={priorityFilter} onchange={queueViewSave}><option value="all">All priorities</option><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label><label>Tag <select bind:value={tagFilter} onchange={queueViewSave}><option value="all">All tags</option>{#each data.tags as tag}<option value={tag.id}>{tag.name}</option>{/each}</select></label><label>Density <select bind:value={density} onchange={queueViewSave}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>{#if archivedCount}<button type="button" class:active={showArchived} class="quiet-button archive-toggle" onclick={() => { showArchived = !showArchived; queueViewSave(); }}>{showArchived ? "Hide archived" : "Show archived"}</button>{/if}{#if filtered}<button type="button" class="quiet-button clear-project-filters" onclick={clearFilters}>Clear</button>{/if}<details class="tag-manager"><summary>Manage tags</summary><div class="tag-manager-body"><div class="tag-cloud">{#each data.tags as tag}<span class="tag-chip" style={`--tag-color: ${tag.color}`}><span>{tag.name}</span>{#if data.canEdit && !isDefaultTag(tag.id)}<form method="POST" action="?/deleteTag"><input type="hidden" name="id" value={tag.id} /><button type="submit" aria-label={`Remove ${tag.name} tag`} title="Remove tag">×</button></form>{/if}</span>{/each}</div>{#if data.canEdit}<form method="POST" action="?/createTag" class="tag-create-form"><input name="name" maxlength="32" placeholder="New tag" aria-label="New tag name" required /><select name="color" aria-label="New tag color">{#each tagPalette as palette}<option value={palette.color}>{palette.name}</option>{/each}</select><button type="submit">Create tag</button></form>{/if}</div></details></div></div>

  {#if data.cards.length === 0}
    <section class="project-empty-intro"><img src="/assets/illustrations/organizing-projects.svg" alt="" /><div><p class="eyebrow">EMPTY SLATE</p><h2>Nothing is stuck here yet.</h2><p class="subtitle">This board has {data.lanes.length} lanes from your template. Add one small, concrete card and the empty state will disappear.</p></div></section>
  {:else if visibleCards.length === 0}
    <section class="project-filter-empty"><p class="eyebrow">NO MATCHES</p><h2>Nothing matches this view.</h2><p class="subtitle">Try a different search or priority, or clear the filters to see every saved card.</p><button type="button" class="quiet-button" onclick={clearFilters}>Clear filters</button></section>
  {/if}

  {#if data.cards.length === 0 || visibleCards.length > 0}<section class:project-board-compact={density === 'compact'} class="project-board" aria-label={`${data.project.name} workflow`}>
    {#each data.lanes as lane, index}
      {@const laneCards = cardsFor(lane)}
      <section id={laneId(lane)} role="list" aria-label={`${lane} lane`} class:collapsed={collapsed[lane]} class:drop-target={Boolean(draggedCardId)} class="project-column" ondragover={(event) => event.preventDefault()} ondrop={(event) => dropCard(lane, '', event)}>
        <h2><span>{lane}<small>{laneCards.length} {laneCards.length === 1 ? 'card' : 'cards'}</small></span><button class="collapse-button" type="button" aria-expanded={!collapsed[lane]} aria-label={`${collapsed[lane] ? 'Expand' : 'Collapse'} ${lane}`} onclick={() => toggleLane(lane)}>{collapsed[lane] ? '+' : '−'}</button></h2>
        {#if !collapsed[lane]}
          <div class="project-column-cards">
            {#each laneCards as card}
              <article role="listitem" aria-label={`${card.title}, ${card.priority} priority`} class:dragging={draggedCardId === card.id} class:archived={card.archived} class="project-card" draggable={data.canEdit} ondragstart={(event) => startDrag(card, event)} ondragend={() => { draggedCardId = ''; }} ondragover={(event) => event.preventDefault()} ondrop={(event) => { event.stopPropagation(); dropCard(card.lane, card.id, event); }}><div class="project-card-heading"><strong>{card.title}</strong><span class="priority-badge" class:priority-low={card.priority === 'low'} class:priority-high={card.priority === 'high'} class:priority-urgent={card.priority === 'urgent'}>{card.priority}</span></div>{#if card.tags.length}<div class="project-card-tags">{#each card.tags as tag}<span class="tag-chip" style={`--tag-color: ${tag.color}`}>{tag.name}</span>{/each}</div>{/if}{#if card.checklist.length}{@const checklistDone = card.checklist.filter((item) => item.done).length}<div class="checklist-summary" aria-label={`${checklistDone} of ${card.checklist.length} checklist items complete`}><span>✓ {checklistDone}/{card.checklist.length}</span><progress max={card.checklist.length} value={checklistDone}></progress></div>{/if}{#if card.archived}<span class="archived-badge">Archived</span>{/if}<div class="project-card-meta"><span>{card.owner || 'unassigned'}</span>{#if card.dueDate}<span class={`due-date due-${dueState(card.dueDate)}`}>Due {dueLabel(card.dueDate)}</span>{/if}{#if data.canEdit}<span class="drag-hint">Drag to move</span>{/if}</div>{#if card.details}<p>{card.details}</p>{/if}<button type="button" class="card-edit-trigger" onclick={() => { editingCardId = card.id; }}>Edit card</button></article>
            {:else}<div class="project-column-empty"><strong>{filtered ? 'No matching cards' : index === 0 ? 'Add the first card' : 'Ready when you are'}</strong><p>{filtered ? 'Clear the filters or keep this lane focused.' : index === 0 ? 'Capture one outcome, request, or question.' : 'Cards will collect here as work moves forward.'}</p></div>{/each}
          </div>
          {#if data.canEdit}
            {#if composerLane === lane}<form method="POST" action="?/createCard" class="card-composer"><label>Title <input name="title" maxlength="160" required placeholder="What needs to move?" /></label><label>Details <textarea name="details" rows="3" maxlength="4000" placeholder="Outcome, context, or next check"></textarea></label><div class="card-form-grid"><label>Owner <input name="owner" maxlength="120" placeholder="Optional" /></label><label>Priority <select name="priority"><option value="normal">Normal</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></select></label></div><label>Due date <input name="dueDate" type="date" /></label><input type="hidden" name="lane" value={lane} /><fieldset class="tag-picker"><legend>Tags</legend><div class="tag-options">{#each data.tags as option}<label><input type="checkbox" name="tagId" value={option.id} /><span class="tag-chip" style={`--tag-color: ${option.color}`}>{option.name}</span></label>{/each}</div></fieldset><div class="card-actions"><button type="submit">Save card</button><button class="quiet-button" type="button" onclick={() => { composerLane = null; }}>Cancel</button></div></form>{:else}<button type="button" class="add-card-button" onclick={() => { composerLane = lane; }}>+ Add card</button>{/if}
          {/if}
        {/if}
      </section>
    {/each}
  </section>{/if}

  {#if editingCard}
    <div class="modal-backdrop" role="presentation" onclick={(event) => { if (event.currentTarget === event.target) editingCardId = null; }}></div>
    <dialog open class="card-editor-modal" aria-labelledby="card-editor-title">
      <div class="modal-heading"><div><p class="eyebrow">EDIT CARD</p><h2 id="card-editor-title">{editingCard.title}</h2><p class="subtitle">Changes are saved only when you confirm.</p></div><button type="button" class="quiet-button" aria-label="Close card editor" onclick={() => { editingCardId = null; }}>×</button></div>
      <form method="POST" action="?/updateCard" class="card-edit-form">
        <input type="hidden" name="id" value={editingCard.id} /><input type="hidden" name="cardArchived" value={String(editingCard.archived)} />
        <label>Title <input name="title" value={editingCard.title} maxlength="160" required /></label>
        <label>Details <textarea name="details" rows="5" maxlength="4000">{editingCard.details}</textarea></label>
        <div class="card-form-grid"><label>Owner <input name="owner" value={editingCard.owner} maxlength="120" /></label><label>Lane <select name="lane">{#each data.lanes as option}<option value={option} selected={option === editingCard.lane}>{option}</option>{/each}</select></label></div>
        <div class="card-form-grid"><label>Priority <select name="priority"><option value="low" selected={editingCard.priority === 'low'}>Low</option><option value="normal" selected={editingCard.priority === 'normal'}>Normal</option><option value="high" selected={editingCard.priority === 'high'}>High</option><option value="urgent" selected={editingCard.priority === 'urgent'}>Urgent</option></select></label><label>Due date <input name="dueDate" type="date" value={editingCard.dueDate ?? ''} /></label></div>
        <fieldset class="tag-picker"><legend>Labels</legend><div class="tag-options">{#each data.tags as option}<label><input type="checkbox" name="tagId" value={option.id} checked={editingCard.tags.some((tag) => tag.id === option.id)} /><span class="tag-chip" style={`--tag-color: ${option.color}`}>{option.name}</span></label>{/each}</div></fieldset>
        <fieldset class="checklist-editor"><legend>Checklist</legend>{#each editingCard.checklist as item}<div class="checklist-edit-row"><input type="hidden" name="checkItemId" value={item.id} /><input class="checklist-done" type="checkbox" name="checkItemDone" value={item.id} checked={item.done} aria-label={`Complete ${item.text}`} /><input name="checkItemText" value={item.text} maxlength="240" aria-label="Checklist item" /></div>{/each}<div class="checklist-edit-row checklist-new-row"><input type="hidden" name="checkItemId" value="new" /><span class="checklist-new-marker" aria-hidden="true">＋</span><input name="checkItemText" maxlength="240" placeholder="Add a checklist item" aria-label="New checklist item" /></div></fieldset>
        <div class="modal-actions"><button type="button" class="quiet-button" onclick={() => { editingCardId = null; }}>Cancel</button><button type="submit">Confirm changes</button><button type="submit" class="quiet-button" formaction="?/duplicateCard" name="id" value={editingCard.id}>Duplicate</button><button type="submit" class="quiet-button danger" formaction="?/archiveCard" name="archived" value={String(!editingCard.archived)} onclick={(event) => { if (!confirm(editingCard.archived ? 'Restore this card?' : 'Archive this card?')) event.preventDefault(); }}>{editingCard.archived ? 'Restore' : 'Archive'}</button><button type="submit" class="quiet-button danger" formaction="?/deleteCard" onclick={(event) => { if (!confirm('Delete this card?')) event.preventDefault(); }}>Delete</button></div>
      </form>
    </dialog>
  {/if}

  {#if data.activity.length}<section class="project-activity"><details><summary>Recent activity <span>{data.activity.length}</span></summary><ol>{#each data.activity.slice(0, 8) as entry}<li><div><strong>{entry.action}</strong><span>{entry.actor} · {new Date(entry.createdAt).toLocaleString()}</span></div><p>{entry.summary}</p></li>{/each}</ol></details></section>{/if}

  {#if data.cards.length}<section class="project-next-steps"><div><strong>Keep the board honest</strong><p>Give each card an outcome and owner, then move it only when the evidence is ready.</p></div><a class="quiet-button" href={`/projects/${data.project.slug}/settings`}>Edit lanes and appearance</a></section>{/if}
</main>
