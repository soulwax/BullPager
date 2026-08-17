<script lang="ts">
  import type { BoardProject, BoardUser, ProjectActivity, ProjectCard, ProjectComment, ProjectTag, ProjectViewState } from '$lib/types';
  import { moveProjectCard } from '$lib/projectState';
  import { defaultProjectTags, tagId, tagPalette } from '$lib/projectTags';
  import { projectBackground } from '$lib/projectBackgrounds';
  import { invalidateAll } from '$app/navigation';

  let { data, form }: { data: { project: BoardProject; prefix: string; settings: Record<string, string>; lanes: string[]; cards: ProjectCard[]; tags: ProjectTag[]; members: BoardUser[]; activity: ProjectActivity[]; comments: ProjectComment[]; viewState: ProjectViewState; canEdit: boolean; username: string; role: string; openCard?: string | null; created: boolean }; form?: { message?: string; error?: string } } = $props();
  const setting = (name: string, fallback = '') => data.settings[`${data.prefix}${name}`] ?? fallback;
  const boardBackground = $derived(projectBackground(setting('background', 'none')));
  const glassIntensity = $derived(Math.max(0, Math.min(100, Number(setting('glass_intensity', '38')) || 0)));
  const boardSurfaceStyle = $derived(boardBackground.src ? `--project-bg-image: url("${boardBackground.src}"); --project-glass-opacity: ${0.82 - glassIntensity * 0.003}; --project-glass-blur: ${Math.round(4 + glassIntensity * 0.18)}px;` : '');
  const isDefaultTag = (id: string) => defaultProjectTags.some((tag) => tagId(data.project.slug, tag.slug) === id);
  let collapsed = $state<Record<string, boolean>>({});
  let density = $state<'comfortable' | 'compact'>('comfortable');
  let query = $state('');
  let priorityFilter = $state<'all' | 'low' | 'normal' | 'high' | 'urgent'>('all');
  let tagFilter = $state('all');
  let assigneeFilter = $state('all');
  let showArchived = $state(false);
  let composerLane = $state<string | null>(null);
  let editingCardId = $state<string | null>(null);
  let savedStatus = $state('');
  let draggedCardId = $state('');
  let dropTargetLane = $state('');
  let dropTargetCardId = $state('');
  let optimisticCards = $state<ProjectCard[] | null>(null);
  let orderDirty = $state(false);
  let orderBaseSnapshot: ProjectCard[] | null = null;
  let orderRevision = 0;
  let orderSaveChain: Promise<void> = Promise.resolve();
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let commentDraft = $state('');
  let commentUploadStatus = $state('');
  $effect(() => {
    collapsed = { ...(data.viewState.collapsed ?? {}) };
    density = data.viewState.density === 'compact' ? 'compact' : 'comfortable';
    query = data.viewState.query ?? '';
    priorityFilter = data.viewState.priority ?? 'all';
    tagFilter = data.viewState.tag ?? 'all';
    assigneeFilter = data.viewState.assignee ?? 'all';
    showArchived = data.viewState.showArchived === true;
    if (data.openCard && data.cards.some((card) => card.id === data.openCard)) editingCardId = data.openCard;
    if (data.cards.length === 0 && composerLane === null) composerLane = data.lanes[0] ?? null;
  });

  const boardCards = $derived(optimisticCards ?? data.cards);

  const visibleCards = $derived(boardCards.filter((card) => {
    const matchesText = !query || `${card.title} ${card.details} ${card.owner} ${card.tags.map((tag) => tag.name).join(' ')}`.toLowerCase().includes(query.toLowerCase());
    const matchesPriority = priorityFilter === 'all' || card.priority === priorityFilter;
    const matchesTag = tagFilter === 'all' || card.tags.some((tag) => tag.id === tagFilter);
    const matchesAssignee = assigneeFilter === 'all' || (assigneeFilter === 'unassigned' ? !card.owner : card.owner === assigneeFilter);
    const matchesArchive = showArchived || !card.archived;
    return matchesText && matchesPriority && matchesTag && matchesAssignee && matchesArchive;
  }));
  const activeCards = $derived(boardCards.filter((card) => !card.archived));
  const urgentCount = $derived(activeCards.filter((card) => card.priority === 'urgent').length);
  const datedCount = $derived(activeCards.filter((card) => card.dueDate).length);
  const archivedCount = $derived(boardCards.filter((card) => card.archived).length);
  const filtered = $derived(query || priorityFilter !== 'all' || tagFilter !== 'all' || assigneeFilter !== 'all' || showArchived);
  const editingCard = $derived(boardCards.find((card) => card.id === editingCardId) ?? null);
  function cardsFor(lane: string) { return visibleCards.filter((card) => card.lane === lane); }
  function commentsFor(cardId: string) { return data.comments.filter((comment) => comment.cardId === cardId); }
  function commentText(body: string) { return body.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim(); }
  function commentImages(body: string) {
    const prefix = `/projects/${data.project.slug}/files/raw?path=`;
    return [...body.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)]
      .map((match) => ({ alt: match[1] || 'Screenshot', url: match[2] }))
      .filter((image) => image.url.startsWith(prefix));
  }
  function openEditor(cardId: string) { editingCardId = cardId; commentDraft = ''; commentUploadStatus = ''; history.replaceState({}, '', `?card=${encodeURIComponent(cardId)}`); }
  function closeEditor() { editingCardId = null; commentDraft = ''; commentUploadStatus = ''; history.replaceState({}, '', location.pathname); }
  async function uploadCommentImage(event: ClipboardEvent) {
    const image = [...(event.clipboardData?.items ?? [])].find((item) => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile();
    if (!image || !data.canEdit || !editingCard) return;
    event.preventDefault();
    const body = new FormData();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    body.set('file', image);
    body.set('path', `screenshots/${timestamp}-${image.name || 'pasted-image.png'}`);
    commentUploadStatus = 'Uploading screenshot…';
    try {
      const response = await fetch(`/projects/${data.project.slug}/files/upload`, { method: 'POST', body });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || 'Screenshot upload failed.');
      commentDraft = `${commentDraft.trimEnd()}\n\n![Screenshot](${result.url})\n`.trimStart();
      commentUploadStatus = 'Screenshot attached';
      await invalidateAll();
      setTimeout(() => { commentUploadStatus = ''; }, 2200);
    } catch (error) {
      commentUploadStatus = error instanceof Error ? error.message : 'Screenshot upload failed.';
      setTimeout(() => { commentUploadStatus = ''; }, 4000);
    }
  }
  async function copyCardLink(cardId: string) {
    const link = `${location.origin}${location.pathname}?card=${encodeURIComponent(cardId)}`;
    try { await navigator.clipboard.writeText(link); savedStatus = 'Card link copied'; setTimeout(() => { savedStatus = ''; }, 1800); } catch { savedStatus = link; }
  }
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
      body.set('assignee', assigneeFilter);
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
    assigneeFilter = 'all';
    showArchived = false;
    queueViewSave();
  }
  function startDrag(card: ProjectCard, event: DragEvent) {
    if (!data.canEdit) return;
    draggedCardId = card.id;
    dropTargetLane = card.lane;
    dropTargetCardId = '';
    event.dataTransfer?.setData('text/plain', card.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  function enqueueOrderSave(previous: ProjectCard[], next: ProjectCard[]) {
    if (!orderBaseSnapshot) orderBaseSnapshot = previous;
    const revision = ++orderRevision;
    // Use the explicit optimistic snapshot. Svelte updates derived values at
    // the end of the turn, so reading boardCards here can otherwise serialize
    // the pre-drop lane and make a cross-column move appear to snap back.
    const order = next.map((card) => ({ id: card.id, lane: card.lane, position: card.position }));
    savedStatus = 'Saving order…';
    orderSaveChain = orderSaveChain.then(async () => {
      if (revision !== orderRevision) return;
      const body = new FormData();
      body.set('order', JSON.stringify(order));
      try {
        const response = await fetch('?/saveOrder', { method: 'POST', body, headers: { accept: 'application/json' } });
        if (!response.ok) throw new Error(`order save failed (${response.status})`);
        if (revision !== orderRevision) return;
        await invalidateAll();
        if (revision !== orderRevision) return;
        optimisticCards = null;
        orderDirty = false;
        orderBaseSnapshot = null;
        savedStatus = 'Order saved';
        setTimeout(() => { if (!orderDirty) savedStatus = ''; }, 1800);
      } catch (error) {
        console.error('[project board] order save failed', error);
        if (revision !== orderRevision) return;
        optimisticCards = orderBaseSnapshot ?? previous;
        orderBaseSnapshot = null;
        orderDirty = false;
        savedStatus = 'Order could not be saved';
        setTimeout(() => { if (!orderDirty) savedStatus = ''; }, 3000);
      }
    });
  }

  function dropCard(lane: string, beforeId: string, event: DragEvent) {
    event.preventDefault();
    // Keep the local drag token authoritative. Some browsers clear
    // dataTransfer text when the pointer crosses another draggable element.
    const id = draggedCardId || event.dataTransfer?.getData('text/plain') || '';
    draggedCardId = '';
    dropTargetLane = '';
    dropTargetCardId = '';
    if (!id || id === beforeId) return;
    const previous = boardCards;
    const next = moveProjectCard(boardCards, id, lane, beforeId);
    if (next === previous || next.every((card, index) => card.id === previous[index]?.id && card.lane === previous[index]?.lane)) return;
    optimisticCards = next;
    orderDirty = true;
    enqueueOrderSave(previous, next);
  }
</script>

<svelte:head><title>{data.project.name} · Project Agile Board</title></svelte:head>

<main class={`project-workspace theme-${setting('theme', 'midnight')} project-lane-${setting('lane_style', 'scroll')}`} class:has-project-background={Boolean(boardBackground.src)} style={boardSurfaceStyle}>
  {#if data.members.length}<datalist id="project-members">{#each data.members as member}<option value={member.username}>{member.role}</option>{/each}</datalist>{/if}
  <header class="topbar">
    <div><p class="eyebrow">PROJECT WORKSPACE</p><h1>{data.project.name}</h1><p class="subtitle">{boardCards.length ? `${boardCards.length} saved cards across ${data.lanes.length} lanes.` : `A calm starting point for shared work. Your ${setting('template', 'custom')} template is ready for its first card.`}</p></div>
    <div class="top-links"><a class="quiet-button" href={`/projects/${data.project.slug}/files`}>Files</a><a class="quiet-button" href={`/projects/${data.project.slug}/graph`}>Graph mode</a><a class="quiet-button" href={`/projects/${data.project.slug}/settings`}>Project settings</a><a class="quiet-button" href="/settings">All projects</a></div>
  </header>

  {#if data.created}<section class="project-welcome" role="status"><div><p class="eyebrow">PROJECT CREATED</p><h2>Your workspace is ready.</h2><p>Start with one concrete outcome, then invite collaborators when the workflow feels right.</p></div><a class="quiet-button" href={`/projects/${data.project.slug}/settings`}>Tune workflow</a></section>{/if}
  {#if form?.message}<p class="success" role="status">{form.message}</p>{/if}
  {#if form?.error}<p class="action-errors" role="alert">{form.error}</p>{/if}

  <div class="project-toolbar"><div class="project-toolbar-copy"><details class="find-work-menu"><summary><span class="find-work-icon">⌕</span><span><strong>Find work</strong><small>{visibleCards.length} visible · {activeCards.length} active</small></span></summary><div class="find-work-body"><p>Jump to the work that needs attention.</p><div class="find-work-actions"><button type="button" class:active={!filtered} class="quiet-button" onclick={clearFilters}>All cards</button><button type="button" class:active={assigneeFilter === data.username} class="quiet-button" onclick={() => { assigneeFilter = data.username; queueViewSave(); }}>My cards</button><button type="button" class:active={priorityFilter === 'urgent'} class="quiet-button" onclick={() => { priorityFilter = 'urgent'; queueViewSave(); }}>Urgent</button><button type="button" class="quiet-button" onclick={() => { query = ''; priorityFilter = 'all'; tagFilter = 'all'; assigneeFilter = 'unassigned'; showArchived = false; queueViewSave(); }}>Unassigned</button></div></div></details><a class="project-cloud-button" href={`/projects/${data.project.slug}/files`} aria-label="Open project cloud"><span class="project-cloud-glyph" aria-hidden="true">☁</span><span>Cloud</span></a>{#if savedStatus}<span class="save-status" role="status" aria-live="polite">{savedStatus}</span>{/if}</div><div class="project-stats" aria-label="Project summary"><span><strong>{activeCards.length}</strong> active</span><span><strong>{urgentCount}</strong> urgent</span><span><strong>{data.tags.length}</strong> tags</span><span><strong>{archivedCount}</strong> archived</span></div><div class="project-controls"><label class="project-search">Search <input bind:value={query} oninput={queueViewSave} placeholder="Find cards by title, owner, or detail" aria-label="Search project cards" /></label><label>Priority <select bind:value={priorityFilter} onchange={queueViewSave}><option value="all">All priorities</option><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label><label>Tag <select bind:value={tagFilter} onchange={queueViewSave}><option value="all">All tags</option>{#each data.tags as tag}<option value={tag.id}>{tag.name}</option>{/each}</select></label><label>Assignee <select bind:value={assigneeFilter} onchange={queueViewSave}><option value="all">Everyone</option><option value="unassigned">Unassigned</option>{#each data.members as member}<option value={member.username}>{member.username}</option>{/each}</select></label><label>Density <select bind:value={density} onchange={queueViewSave}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>{#if archivedCount}<button type="button" class:active={showArchived} class="quiet-button archive-toggle" onclick={() => { showArchived = !showArchived; queueViewSave(); }}>{showArchived ? "Hide archived" : "Show archived"}</button>{/if}{#if filtered}<button type="button" class="quiet-button clear-project-filters" onclick={clearFilters}>Clear</button>{/if}<details class="tag-manager"><summary>Manage tags</summary><div class="tag-manager-body"><div class="tag-cloud">{#each data.tags as tag}<span class="tag-chip" style={`--tag-color: ${tag.color}`}><span>{tag.name}</span>{#if data.canEdit && !isDefaultTag(tag.id)}<form method="POST" action="?/deleteTag"><input type="hidden" name="id" value={tag.id} /><button type="submit" aria-label={`Remove ${tag.name} tag`} title="Remove tag">×</button></form>{/if}</span>{/each}</div>{#if data.canEdit}<form method="POST" action="?/createTag" class="tag-create-form"><input name="name" maxlength="32" placeholder="New tag" aria-label="New tag name" required /><select name="color" aria-label="New tag color">{#each tagPalette as palette}<option value={palette.color}>{palette.name}</option>{/each}</select><button type="submit">Create tag</button></form>{/if}</div></details></div></div>

  {#if boardCards.length === 0}
    <section class="project-empty-intro"><img src="/assets/illustrations/organizing-projects.svg" alt="" /><div><p class="eyebrow">EMPTY SLATE</p><h2>Nothing is stuck here yet.</h2><p class="subtitle">This board has {data.lanes.length} lanes from your template. Add one small, concrete card and the empty state will disappear.</p></div></section>
  {:else if visibleCards.length === 0}
    <section class="project-filter-empty"><p class="eyebrow">NO MATCHES</p><h2>Nothing matches this view.</h2><p class="subtitle">Try a different search or priority, or clear the filters to see every saved card.</p><button type="button" class="quiet-button" onclick={clearFilters}>Clear filters</button></section>
  {/if}

  {#if boardCards.length === 0 || visibleCards.length > 0}<section class:project-board-compact={density === 'compact'} class="project-board" aria-label={`${data.project.name} workflow`}>
    {#each data.lanes as lane, index}
      {@const laneCards = cardsFor(lane)}
      <section id={laneId(lane)} role="list" aria-label={`${lane} lane`} class:collapsed={collapsed[lane]} class:drop-target={dropTargetLane === lane && !dropTargetCardId} class:project-column-backlog={index === 0} class="project-column" ondragenter={() => { dropTargetLane = lane; dropTargetCardId = ''; }} ondragover={(event) => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; }} ondrop={(event) => dropCard(lane, '', event)}>
        <h2><span>{lane}<small>{laneCards.length} {laneCards.length === 1 ? 'card' : 'cards'}</small></span><span class="lane-header-actions"><details class="lane-menu"><summary aria-label={`More actions for ${lane}`}>•••</summary><div class="lane-menu-body"><button type="button" onclick={() => { composerLane = lane; }}>+ Add card</button><button type="button" onclick={() => toggleLane(lane)}>{collapsed[lane] ? 'Expand list' : 'Collapse list'}</button></div></details><button class="collapse-button" type="button" aria-expanded={!collapsed[lane]} aria-label={`${collapsed[lane] ? 'Expand' : 'Collapse'} ${lane}`} onclick={() => toggleLane(lane)}>{collapsed[lane] ? '+' : '−'}</button></span></h2>
        {#if !collapsed[lane]}
          <div class="project-column-cards">
            {#each laneCards as card}
              <div role="listitem" class:dragging={draggedCardId === card.id} class:drop-target={dropTargetCardId === card.id} class="project-card-shell" draggable={data.canEdit} ondragstart={(event) => startDrag(card, event)} ondragend={() => { draggedCardId = ''; dropTargetLane = ''; dropTargetCardId = ''; }} ondragenter={(event) => { event.stopPropagation(); dropTargetLane = card.lane; dropTargetCardId = card.id; }} ondragover={(event) => { event.preventDefault(); event.stopPropagation(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; }} ondrop={(event) => { event.stopPropagation(); dropCard(card.lane, card.id, event); }}><a aria-label={`${card.title}, ${card.priority} priority`} href={`?card=${encodeURIComponent(card.id)}`} class:archived={card.archived} class="project-card">{#if card.coverColor}<div class="card-cover" style={`--cover-color: ${card.coverColor}`} aria-hidden="true"></div>{/if}<div class="project-card-heading"><strong>{card.title}</strong><span class="priority-badge" class:priority-low={card.priority === 'low'} class:priority-high={card.priority === 'high'} class:priority-urgent={card.priority === 'urgent'}>{card.priority}</span></div>{#if card.tags.length}<div class="project-card-tags">{#each card.tags as tag}<span class="tag-chip" style={`--tag-color: ${tag.color}`}>{tag.name}</span>{/each}</div>{/if}{#if card.checklist.length}{@const checklistDone = card.checklist.filter((item) => item.done).length}<div class="checklist-summary" aria-label={`${checklistDone} of ${card.checklist.length} checklist items complete`}><span>✓ {checklistDone}/{card.checklist.length}</span><progress max={card.checklist.length} value={checklistDone}></progress></div>{/if}{#if card.archived}<span class="archived-badge">Archived</span>{/if}<div class="project-card-meta"><span>{card.owner || 'unassigned'}</span>{#if card.dueDate}<span class={`due-date due-${dueState(card.dueDate)}`}>Due {dueLabel(card.dueDate)}</span>{/if}{#if card.watcherCount}<span class:watching={card.watching} aria-label={`${card.watcherCount} watchers`}>◉ {card.watcherCount}</span>{/if}{#if commentsFor(card.id).length}<span aria-label={`${commentsFor(card.id).length} comments`}>▱ {commentsFor(card.id).length}</span>{/if}{#if data.canEdit}<span class="drag-hint">Drag to move</span>{/if}</div>{#if card.details}<p>{card.details}</p>{/if}</a><details class="card-quick-menu"><summary aria-label={`Quick actions for ${card.title}`}>•••</summary><div class="card-quick-menu-body"><button type="button" onclick={() => copyCardLink(card.id)}>Copy link</button>{#if data.username && data.username !== 'anonymous'}<form method="POST" action="?/toggleWatch"><input type="hidden" name="id" value={card.id} /><input type="hidden" name="watching" value={String(!card.watching)} /><button type="submit">{card.watching ? 'Unwatch' : 'Watch'}</button></form>{/if}{#if data.canEdit}<form method="POST" action="?/moveCard" class="card-move-form"><input type="hidden" name="id" value={card.id} /><label>Move to <select name="lane">{#each data.lanes as option}<option value={option} selected={option === card.lane}>{option}</option>{/each}</select></label><button type="submit">Move</button></form><form method="POST" action="?/duplicateCard"><input type="hidden" name="id" value={card.id} /><button type="submit">Duplicate</button></form><form method="POST" action="?/archiveCard"><input type="hidden" name="id" value={card.id} /><input type="hidden" name="archived" value={String(!card.archived)} /><button type="submit" onclick={(event) => { if (!confirm(card.archived ? 'Restore this card?' : 'Archive this card?')) event.preventDefault(); }}>{card.archived ? 'Restore' : 'Archive'}</button></form>{/if}</div></details></div>
            {:else}<div class="project-column-empty"><strong>{filtered ? 'No matching cards' : index === 0 ? 'Add the first card' : 'Ready when you are'}</strong><p>{filtered ? 'Clear the filters or keep this lane focused.' : index === 0 ? 'Capture one outcome, request, or question.' : 'Cards will collect here as work moves forward.'}</p></div>{/each}
          </div>
          {#if data.canEdit}
            {#if composerLane === lane}<form method="POST" action="?/createCard" class="card-composer"><label>Title <input name="title" maxlength="160" required placeholder="What needs to move?" /></label><label>Details <textarea name="details" rows="3" maxlength="4000" placeholder="Outcome, context, or next check"></textarea></label><div class="card-form-grid"><label>Owner <input name="owner" list="project-members" maxlength="120" placeholder="Optional" /></label><label>Priority <select name="priority"><option value="normal">Normal</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></select></label></div><label>Due date <input name="dueDate" type="date" /></label><input type="hidden" name="lane" value={lane} /><fieldset class="tag-picker"><legend>Tags</legend><div class="tag-options">{#each data.tags as option}<label><input type="checkbox" name="tagId" value={option.id} /><span class="tag-chip" style={`--tag-color: ${option.color}`}>{option.name}</span></label>{/each}</div></fieldset><div class="card-actions"><button type="submit">Save card</button><button class="quiet-button" type="button" onclick={() => { composerLane = null; }}>Cancel</button></div></form>{:else}<button type="button" class="add-card-button" onclick={() => { composerLane = lane; }}>+ Add card</button>{/if}
          {/if}
        {/if}
      </section>
    {/each}
  </section>{/if}

  {#if editingCard}
    <div class="modal-backdrop" role="presentation" onclick={(event) => { if (event.currentTarget === event.target) closeEditor(); }}></div>
    <dialog open class="card-editor-modal" aria-labelledby="card-editor-title">
      <div class="modal-heading"><div><p class="eyebrow">EDIT CARD</p><h2 id="card-editor-title">{editingCard.title}</h2><p class="subtitle">Changes are saved only when you confirm.</p></div><div class="modal-heading-actions"><button type="submit" form="card-editor-form" class="quiet-button watch-button" formaction="?/toggleWatch" name="watching" value={String(!editingCard.watching)}>{editingCard.watching ? 'Watching' : 'Watch'}</button><button type="button" class="quiet-button" onclick={() => copyCardLink(editingCard.id)}>Copy link</button><button type="button" class="quiet-button" aria-label="Close card editor" onclick={closeEditor}>×</button></div></div>
      <form method="POST" action="?/updateCard" class="card-edit-form" id="card-editor-form">
        <input type="hidden" name="id" value={editingCard.id} /><input type="hidden" name="cardArchived" value={String(editingCard.archived)} />
        <label>Title <input name="title" value={editingCard.title} maxlength="160" required /></label>
        <label>Details <textarea name="details" rows="5" maxlength="4000">{editingCard.details}</textarea></label>
        <div class="card-form-grid"><label>Owner <input name="owner" list="project-members" value={editingCard.owner} maxlength="120" /></label><label>Lane <select name="lane">{#each data.lanes as option}<option value={option} selected={option === editingCard.lane}>{option}</option>{/each}</select></label></div>
        <div class="card-form-grid"><label>Priority <select name="priority"><option value="low" selected={editingCard.priority === 'low'}>Low</option><option value="normal" selected={editingCard.priority === 'normal'}>Normal</option><option value="high" selected={editingCard.priority === 'high'}>High</option><option value="urgent" selected={editingCard.priority === 'urgent'}>Urgent</option></select></label><label>Due date <input name="dueDate" type="date" value={editingCard.dueDate ?? ''} /></label></div>
        <fieldset class="tag-picker"><legend>Labels</legend><div class="tag-options">{#each data.tags as option}<label><input type="checkbox" name="tagId" value={option.id} checked={editingCard.tags.some((tag) => tag.id === option.id)} /><span class="tag-chip" style={`--tag-color: ${option.color}`}>{option.name}</span></label>{/each}</div></fieldset>
        <fieldset class="cover-picker"><legend>Card cover</legend><div class="cover-options"><label><input type="radio" name="coverColor" value="" checked={!editingCard.coverColor} /><span class="cover-swatch cover-none">None</span></label>{#each ['#5E9CFF', '#9B8AFB', '#F08FC0', '#F4B860', '#68D6A4', '#55C2C9'] as color}<label><input type="radio" name="coverColor" value={color} checked={editingCard.coverColor === color} /><span class="cover-swatch" style={`--cover-color: ${color}`} aria-label={`Use ${color} cover`}></span></label>{/each}</div></fieldset>
        <fieldset class="checklist-editor"><legend>Checklist</legend>{#each editingCard.checklist as item}<div class="checklist-edit-row"><input type="hidden" name="checkItemId" value={item.id} /><input class="checklist-done" type="checkbox" name="checkItemDone" value={item.id} checked={item.done} aria-label={`Complete ${item.text}`} /><input name="checkItemText" value={item.text} maxlength="240" aria-label="Checklist item" /></div>{/each}<div class="checklist-edit-row checklist-new-row"><input type="hidden" name="checkItemId" value="new" /><span class="checklist-new-marker" aria-hidden="true">＋</span><input name="checkItemText" maxlength="240" placeholder="Add a checklist item" aria-label="New checklist item" /></div></fieldset>
        <div class="modal-actions"><button type="button" class="quiet-button" onclick={closeEditor}>Cancel</button><button type="submit">Confirm changes</button><button type="submit" class="quiet-button" formaction="?/duplicateCard" name="id" value={editingCard.id}>Duplicate</button><button type="submit" class="quiet-button danger" formaction="?/archiveCard" name="archived" value={String(!editingCard.archived)} onclick={(event) => { if (!confirm(editingCard.archived ? 'Restore this card?' : 'Archive this card?')) event.preventDefault(); }}>{editingCard.archived ? 'Restore' : 'Archive'}</button><button type="submit" class="quiet-button danger" formaction="?/deleteCard" onclick={(event) => { if (!confirm('Delete this card?')) event.preventDefault(); }}>Delete</button></div>
      </form>
      <section class="card-comments" aria-labelledby="card-comments-title"><div class="card-comments-heading"><h3 id="card-comments-title">Comments</h3><span>{commentsFor(editingCard.id).length}</span></div>{#if commentsFor(editingCard.id).length}<ol class="card-comment-list">{#each commentsFor(editingCard.id) as comment}<li><div><strong>{comment.author}</strong><time datetime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time>{#if data.canEdit && (comment.author === data.username || ['superadmin', 'admin'].includes(data.role))}<form method="POST" action="?/deleteComment"><input type="hidden" name="id" value={comment.id} /><button type="submit" class="comment-delete" aria-label="Delete comment">×</button></form>{/if}</div>{#if commentText(comment.body)}<p>{commentText(comment.body)}</p>{/if}{#each commentImages(comment.body) as image}<img class="comment-attachment" src={image.url} alt={image.alt} loading="lazy" />{/each}</li>{/each}</ol>{:else}<p class="comment-empty">No comments yet. Leave context for the next person.</p>{/if}{#if data.canEdit}<form method="POST" action="?/createComment" class="comment-form"><input type="hidden" name="cardId" value={editingCard.id} /><textarea bind:value={commentDraft} onpaste={uploadCommentImage} name="body" rows="3" maxlength="4000" placeholder="Add a decision, update, or handoff note… Paste a screenshot here" required></textarea><small class="comment-paste-help">Paste a screenshot directly into this box to attach it to the project drive.{#if commentUploadStatus} {commentUploadStatus}{/if}</small><button type="submit">Add comment</button></form>{/if}</section>
    </dialog>
  {/if}

  {#if data.activity.length}<section class="project-activity"><details><summary>Recent activity <span>{data.activity.length}</span></summary><ol>{#each data.activity.slice(0, 8) as entry}<li><div><strong>{entry.action}</strong><span>{entry.actor} · {new Date(entry.createdAt).toLocaleString()}</span></div><p>{entry.summary}</p></li>{/each}</ol></details></section>{/if}

  {#if boardCards.length}<section class="project-next-steps"><div><strong>Keep the board honest</strong><p>Give each card an outcome and owner, then move it only when the evidence is ready.</p></div><a class="quiet-button" href={`/projects/${data.project.slug}/settings`}>Edit lanes and appearance</a></section>{/if}
</main>
