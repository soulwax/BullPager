<script lang="ts">
  import PacketCard from '$lib/components/PacketCard.svelte';
  import { page } from '$app/state';
  import Search from '@lucide/svelte/icons/search';
  import X from '@lucide/svelte/icons/x';
  import type { Packet, PlanView, PacketState, TransitionPreview, UserRole } from '$lib/types';

  type ActionForm = {
    errors?: string[];
    preview?: TransitionPreview;
    applied?: string;
    message?: string;
    values?: { packetId: string; nextState: PacketState; owner: string; evidence: string; remainder: string };
  };

  let { data, form }: { data: { plan: PlanView; role?: UserRole }; form?: ActionForm } = $props();
  let query = $state(page.url.searchParams.get('q') ?? '');
  let selectedState = $state<'ALL' | PacketState>((page.url.searchParams.get('state') as 'ALL' | PacketState) ?? 'ALL');
  let milestone = $state(page.url.searchParams.get('milestone') ?? 'ALL');
  let readyOnly = $state(page.url.searchParams.get('ready') === '1');
  let sortBy = $state<'plan' | 'title' | 'owner' | 'milestone'>((page.url.searchParams.get('sort') as 'plan' | 'title' | 'owner' | 'milestone') ?? 'plan');
  let density = $state<'comfortable' | 'compact'>('comfortable');
  let inspectorVisible = $state(false);
  let copyStatus = $state('');
  let viewStatus = $state('');
  let collapsed = $state<Record<string, boolean>>({});
  let searchInput: HTMLInputElement;
  const selectedId = $derived(page.url.searchParams.get('packet') ?? '');
  const columns: { label: string; states: PacketState[] }[] = [
    { label: 'Ready / Open', states: ['OPEN'] },
    { label: 'In progress', states: ['ACTIVE', 'PARTIAL'] },
    { label: 'Blocked', states: ['BLOCKED'] },
    { label: 'Complete', states: ['CLOSED', 'DROPPED'] }
  ];

  const milestones = $derived([...new Set(data.plan.packets.map((packet) => packet.milestone))]);
  // Details are an explicit selection, never an implicit first-card preview.
  // This keeps the board spacious on entry and makes the right-hand modal a
  // predictable consequence of selecting a card.
  const selected = $derived(selectedId ? data.plan.packets.find((packet) => packet.id === selectedId) : undefined);
  const dependents = $derived(selected ? data.plan.packets.filter((packet) => packet.dependsOn.includes(selected.id)) : []);
  const filtered = $derived(data.plan.packets.filter((packet) => {
    const text = `${packet.id} ${packet.title} ${packet.category} ${packet.subcategory} ${packet.outcome}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) &&
      (selectedState === 'ALL' || packet.state === selectedState) &&
      (milestone === 'ALL' || packet.milestone === milestone) &&
      (!readyOnly || data.plan.readyIds.includes(packet.id));
  }).toSorted((a, b) => {
    if (sortBy === 'plan') return data.plan.packets.indexOf(a) - data.plan.packets.indexOf(b);
    return a[sortBy].localeCompare(b[sortBy], undefined, { numeric: true, sensitivity: 'base' });
  }));

  $effect(() => {
    const requested = page.url.searchParams.get('density');
    density = requested === 'compact' || (!requested && data.plan.projectSettings.project_unity_density === 'compact') ? 'compact' : 'comfortable';
  });

  $effect(() => {
    const packet = page.url.searchParams.get('packet');
    inspectorVisible = Boolean(packet && page.url.searchParams.get('inspector') !== 'hidden');
  });

  $effect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    query ? url.searchParams.set('q', query) : url.searchParams.delete('q');
    selectedState !== 'ALL' ? url.searchParams.set('state', selectedState) : url.searchParams.delete('state');
    milestone !== 'ALL' ? url.searchParams.set('milestone', milestone) : url.searchParams.delete('milestone');
    readyOnly ? url.searchParams.set('ready', '1') : url.searchParams.delete('ready');
    sortBy !== 'plan' ? url.searchParams.set('sort', sortBy) : url.searchParams.delete('sort');
    density !== 'comfortable' ? url.searchParams.set('density', density) : url.searchParams.delete('density');
    inspectorVisible || !selectedId ? url.searchParams.delete('inspector') : url.searchParams.set('inspector', 'hidden');
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  });

  function inColumn(packet: Packet, states: PacketState[]) { return states.includes(packet.state); }
  function toggleColumn(label: string) { collapsed[label] = !collapsed[label]; }
  function setAllColumns(isCollapsed: boolean) {
    collapsed = Object.fromEntries(columns.map((column) => [column.label, isCollapsed]));
  }
  function resetFilters() { query = ''; selectedState = 'ALL'; milestone = 'ALL'; readyOnly = false; sortBy = 'plan'; density = 'comfortable'; }
  function quickFilter(state: 'ALL' | PacketState | 'READY') {
    query = '';
    milestone = 'ALL';
    if (state === 'READY') {
      selectedState = 'ALL';
      readyOnly = true;
    } else {
      selectedState = state;
      readyOnly = false;
    }
  }
  function viewHref(packetId = '') {
    const params = new URLSearchParams();
    if (packetId) params.set('packet', packetId);
    if (query) params.set('q', query);
    if (selectedState !== 'ALL') params.set('state', selectedState);
    if (milestone !== 'ALL') params.set('milestone', milestone);
    if (readyOnly) params.set('ready', '1');
    if (sortBy !== 'plan') params.set('sort', sortBy);
    if (density !== 'comfortable') params.set('density', density);
    return params.toString() ? `?${params.toString()}` : '?';
  }
  function packetHref(packetId: string) { return viewHref(packetId); }
  function clearSelectionHref() { return viewHref(); }
  function focusSearch(event: KeyboardEvent) {
    if (event.key === '/' && event.target instanceof HTMLElement && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) {
      event.preventDefault();
      searchInput?.focus();
    }
  }
  async function copyPacketBrief(packet: Packet) {
    const brief = [
      `${packet.id} — ${packet.title}`,
      `State: ${packet.state}`,
      `Owner: ${packet.owner}`,
      `Milestone: ${packet.milestone}`,
      `Category: ${packet.category || 'Uncategorized'}`,
      `Subcategory: ${packet.subcategory || 'General'}`,
      `Tags: ${packet.tags?.join(', ') || 'None'}`,
      `Outcome: ${packet.outcome || 'Not recorded.'}`,
      `Checks: ${packet.checks || 'Not recorded.'}`,
      `Evidence: ${packet.evidence || 'None recorded.'}`,
      `Remainder: ${packet.remainder || 'None recorded.'}`
    ].join('\n');
    try {
      await navigator.clipboard.writeText(brief);
      copyStatus = 'Packet brief copied.';
    } catch {
      const fallback = document.createElement('textarea');
      fallback.value = brief;
      fallback.setAttribute('readonly', '');
      fallback.style.position = 'fixed';
      fallback.style.opacity = '0';
      document.body.appendChild(fallback);
      fallback.select();
      document.execCommand('copy');
      fallback.remove();
      copyStatus = 'Packet brief copied.';
    }
    window.setTimeout(() => { copyStatus = ''; }, 2500);
  }
  async function copyViewLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      viewStatus = 'View link copied.';
    } catch {
      viewStatus = 'Copy unavailable; use the browser address bar.';
    }
    window.setTimeout(() => { viewStatus = ''; }, 2500);
  }
</script>

<svelte:window onkeydown={focusSearch} />

<svelte:head><title>BullPager Board</title><meta name="description" content="A source-backed greenfield Unity implementation plan." /></svelte:head>

<main class={`board-page theme-${data.plan.projectSettings.project_unity_theme || 'midnight'} project-lane-${data.plan.projectSettings.project_unity_lane_style || 'scroll'}`}>
  <header class="topbar board-topbar">
    <div><p class="eyebrow">REFERENCE PLAN</p><h1>Unity plan</h1><p class="subtitle">A source-backed plan view for the Unity project. Open Projects for the working boards.</p><p class="source-mode">{data.plan.packets.length} packets · {data.plan.sourceMode}{#if data.plan.projectSettings.project_unity_planner_digest} · DB mirror {data.plan.projectSettings.project_unity_planner_digest.slice(0, 12)}{/if}</p></div>
    <div class="top-actions"><div class:valid={data.plan.valid} class="health">{data.plan.valid ? 'Plan valid' : 'Plan needs attention'}</div><div class="top-links"><a class="quiet-button" href="/projects">Projects</a>{#if ['superadmin', 'admin', 'editor'].includes(data.role ?? '')}<a class="quiet-button" href="/projects/new">New project</a>{/if}{#if ['superadmin', 'admin'].includes(data.role ?? '')}<a class="quiet-button icon-link" href="/settings"><img class="ui-icon" src="/assets/icons/settings.svg" alt="" /> Settings</a>{/if}</div></div>
  </header>

  {#if data.plan.errors.length}<section class="errors" aria-live="polite"><h2>Plan issues</h2>{#each data.plan.errors as error}<p>{error}</p>{/each}</section>{/if}

  <section class="workspace" aria-label="Project workspace">
    <section class="board-shell">
      <div class="board-toolbar" aria-label="Board toolbar">
        <div class="toolbar-search-group"><details class="find-work-menu board-find-work" aria-label="Navigate / Find work"><summary><span class="find-work-icon"><Search /></span><span><strong>Find work</strong><small>{filtered.length} visible · {data.plan.readyIds.length} ready</small></span></summary><div class="find-work-body"><p>Jump to the work that needs attention.</p><div class="find-work-actions"><button type="button" class="quiet-button" class:active={selectedState === 'ALL' && !readyOnly} onclick={() => quickFilter('ALL')}>All cards</button><button type="button" class="quiet-button" class:active={readyOnly} onclick={() => quickFilter('READY')}>Ready next</button><button type="button" class="quiet-button" class:active={selectedState === 'BLOCKED' && !readyOnly} onclick={() => quickFilter('BLOCKED')}>Blocked</button><button type="button" class="quiet-button" class:active={selectedState === 'CLOSED' && !readyOnly} onclick={() => quickFilter('CLOSED')}>Complete</button></div></div></details><label class="toolbar-search"><span class="sr-only">Search packets</span><span class="search-control"><input bind:this={searchInput} bind:value={query} aria-label="Search packets" placeholder="Search cards" /><button class="clear-search" type="button" aria-label="Clear search" title="Clear search" hidden={!query} onclick={() => { query = ''; searchInput?.focus(); }}><X /></button></span></label><span class="shortcut">Press <kbd>/</kbd></span></div>
        <div class="quick-buttons" aria-label="Quick filters"><button type="button" class:active={selectedState === 'ALL' && !readyOnly} onclick={() => quickFilter('ALL')}>All</button><button type="button" class:active={selectedState === 'OPEN' && !readyOnly} onclick={() => quickFilter('OPEN')}>Open</button><button type="button" class:active={selectedState === 'ACTIVE' && !readyOnly} onclick={() => quickFilter('ACTIVE')}>Active</button><button type="button" class:active={selectedState === 'BLOCKED' && !readyOnly} onclick={() => quickFilter('BLOCKED')}>Blocked</button><button type="button" class:active={selectedState === 'CLOSED' && !readyOnly} onclick={() => quickFilter('CLOSED')}>Complete</button><button type="button" class:active={readyOnly} onclick={() => quickFilter('READY')}>Ready</button></div>
        <div class="toolbar-filters"><label>State <select bind:value={selectedState}><option value="ALL">All states</option>{#each Object.keys(data.plan.stateCounts) as item}<option value={item}>{item}</option>{/each}</select></label><label>Milestone <select bind:value={milestone}><option value="ALL">All milestones</option>{#each milestones as item}<option value={item}>{item}</option>{/each}</select></label><label>Sort <select bind:value={sortBy}><option value="plan">Plan order</option><option value="title">Title</option><option value="owner">Owner</option><option value="milestone">Milestone</option></select></label><label>Density <select bind:value={density}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label><button type="button" class="quiet-button" onclick={resetFilters}>Reset</button><button type="button" class="quiet-button" onclick={copyViewLink} aria-label="Copy this board view">Copy link</button></div>
        <div class="toolbar-status"><span role="status">Showing <strong>{filtered.length}</strong> of {data.plan.packets.length}</span>{#if data.plan.readyIds[0]}<span class="toolbar-recommendation">Next: <a href={`?packet=${data.plan.readyIds[0]}`}>{data.plan.readyIds[0]}</a></span>{/if}{#if viewStatus}<span class="copy-status" role="status">{viewStatus}</span>{/if}</div>
      </div>

      <div class="board-heading"><div><p class="eyebrow"><img class="ui-icon" src="/assets/icons/layout-kanban.svg" alt="" /> BOARD</p><h2>Packet flow</h2></div><div class="board-actions"><p>{selected ? `Inspecting ${selected.id}.` : 'Select a card to open its details.'}</p><div class="lane-actions"><button type="button" class="quiet-button" onclick={() => setAllColumns(true)}>Collapse all</button><button type="button" class="quiet-button" onclick={() => setAllColumns(false)}>Expand all</button>{#if selected}<a class="quiet-button" href={clearSelectionHref()}>Clear selection</a>{/if}</div></div></div>
      <div class:inspector-hidden={!inspectorVisible} class="layout">
        <section class="board" aria-label="Unity implementation packets">
      {#if filtered.length === 0}
        <div class="board-empty-state"><img src="/assets/illustrations/organizing-projects.svg" alt="" /><div><p class="eyebrow">EMPTY VIEW</p><h2>No packets match these filters.</h2><p class="empty">Clear the search or reset the filters to bring the workflow back into view.</p><button type="button" class="quiet-button" onclick={resetFilters}>Reset filters</button></div></div>
      {:else}{#each columns as column}
        {@const columnPackets = filtered.filter((packet) => inColumn(packet, column.states))}
        <section class:collapsed={collapsed[column.label]} class="column"><h2><span class="column-title">{column.label}<small>{columnPackets.length} visible</small></span><button class="collapse-button" type="button" aria-label={`${collapsed[column.label] ? 'Expand' : 'Collapse'} ${column.label} lane`} aria-expanded={!collapsed[column.label]} onclick={() => toggleColumn(column.label)}>{collapsed[column.label] ? '+' : '−'}</button></h2>
          {#if !collapsed[column.label]}<div class="column-cards">{#each columnPackets as packet}<PacketCard {packet} href={packetHref(packet.id)} ready={data.plan.readyIds.includes(packet.id)} selected={selected?.id === packet.id} compact={density === 'compact'} showOutcome={data.plan.projectSettings.project_unity_show_outcomes !== 'false'} />{:else}<div class="empty-state"><img src="/assets/illustrations/organizing-projects.svg" alt="" /><p class="empty">No packets</p></div>{/each}</div>{/if}
        </section>
      {/each}
      {/if}
        </section>

      {#if selected && inspectorVisible}<a class="detail-backdrop" href={clearSelectionHref()} aria-label="Close packet details"></a><div class="detail" role="dialog" aria-modal="true" aria-label="Selected packet"><p class="eyebrow">CARD DETAILS</p><div class="detail-heading"><div><h2>{selected.id}</h2><h3>{selected.title}</h3></div><div class="detail-actions"><button class="quiet-button" type="button" onclick={() => copyPacketBrief(selected)}>Copy brief</button><a class="quiet-button" href={clearSelectionHref()}>Close</a></div></div>{#if copyStatus}<p class="copy-status" role="status">{copyStatus}</p>{/if}<p class="meta">{selected.state} · {selected.owner} · {selected.milestone}</p><p class="taxonomy-detail">{selected.category || 'Uncategorized'} <span>·</span> {selected.subcategory || 'General'}</p>{#if selected.tags?.length}<p class="taxonomy-tags" aria-label="Packet tags">{#each selected.tags as tag}<span>{tag}</span>{/each}</p>{/if}{#if data.plan.readyIds.includes(selected.id)}<p class="ready-banner">Dependencies are closed. This packet is ready to pull.</p>{/if}<dl><dt>Outcome</dt><dd>{selected.outcome || 'Not recorded.'}</dd><dt>Inputs</dt><dd>{selected.inputs || 'Not recorded.'}</dd><dt>Files</dt><dd>{selected.files || 'Not recorded.'}</dd><dt>Do not touch</dt><dd>{selected.doNotTouch || 'Not recorded.'}</dd><dt>Dependencies</dt><dd>{#if selected.dependsOn.length}{#each selected.dependsOn as dependency, index}{#if index > 0}, {/if}<a href={packetHref(dependency)}>{dependency}</a>{/each}{:else}None{/if}</dd><dt>Downstream</dt><dd>{#if dependents.length}{#each dependents as packet, index}{#if index > 0}, {/if}<a href={packetHref(packet.id)}>{packet.id}</a>{/each}{:else}None{/if}</dd><dt>Checks</dt><dd>{selected.checks || 'Not recorded.'}</dd><dt>Evidence</dt><dd>{selected.evidence || 'None recorded.'}</dd><dt>Remainder</dt><dd>{selected.remainder || 'None recorded.'}</dd></dl><details class="steps"><summary>Implementation steps</summary><pre>{selected.steps || 'No steps recorded.'}</pre></details>
      {#if data.plan.transitionHistory.some((entry) => entry.packetId === selected.id)}<details class="activity"><summary>Recent activity</summary><ol>{#each data.plan.transitionHistory.filter((entry) => entry.packetId === selected.id) as entry}<li><strong>{entry.nextState}</strong><span>{entry.owner || 'unassigned'} · {new Date(entry.createdAt).toLocaleString()}</span>{#if entry.evidence}<small>{entry.evidence}</small>{/if}</li>{/each}</ol></details>{/if}
      <section class="notes"><h3>Packet notes</h3>{#if data.plan.packetNotes.some((note) => note.packetId === selected.id)}<ul>{#each data.plan.packetNotes.filter((note) => note.packetId === selected.id) as note}<li><div><strong>{note.author}</strong><span>{new Date(note.createdAt).toLocaleString()}</span></div><p>{note.body}</p></li>{/each}</ul>{:else}<p class="empty">No notes yet.</p>{/if}<form method="POST" action="?/saveNote" class="note-form"><input type="hidden" name="packetId" value={selected.id} /><label>Author <input name="author" value={selected.owner} maxlength="120" /></label><label>Note <textarea name="body" rows="3" maxlength="2000" placeholder="Leave durable context for the next pass."></textarea></label><button type="submit">Save note</button></form></section>
      <form method="POST" action="?/previewTransition" class="transition-form">
        <h3>Preview a state change</h3>
        <input type="hidden" name="packetId" value={selected.id} />
        <label>Next state <select name="nextState" value={form?.values?.nextState ?? (selected.state === 'OPEN' ? 'ACTIVE' : selected.state)} required><option value="OPEN">OPEN</option><option value="ACTIVE">ACTIVE</option><option value="PARTIAL">PARTIAL</option><option value="BLOCKED">BLOCKED</option><option value="CLOSED">CLOSED</option><option value="DROPPED">DROPPED</option></select></label>
        <label>Contributor <input name="owner" value={form?.values?.owner ?? selected.owner} /></label>
        <label>Evidence <textarea name="evidence" rows="2" placeholder="What proves this state?">{form?.values?.evidence ?? ''}</textarea></label>
        <label>Remainder / blocker <textarea name="remainder" rows="2" placeholder="What remains or blocks progress?">{form?.values?.remainder ?? ''}</textarea></label>
        <button type="submit">Generate preview</button>
      </form>
      {#if form?.errors?.length}<div class="action-errors" role="alert">{#each form.errors as error}<p>{error}</p>{/each}</div>{/if}
      {#if form?.message}<p class="success" role="status">{form.message}</p>{/if}
      {#if form?.preview}<section class="preview" aria-live="polite"><h3>{form.preview.packetId} → {form.preview.nextState}</h3><p>{form.preview.message}</p><pre>{form.preview.diff}</pre><form method="POST" action="?/applyTransition" class="apply-form"><input type="hidden" name="packetId" value={form.preview.packetId} /><input type="hidden" name="nextState" value={form.values?.nextState ?? form.preview.nextState} /><input type="hidden" name="owner" value={form.values?.owner ?? ''} /><input type="hidden" name="evidence" value={form.values?.evidence ?? ''} /><input type="hidden" name="remainder" value={form.values?.remainder ?? ''} /><input type="hidden" name="sourceHash" value={form.preview.sourceHash} /><label>Type {form.preview.packetId} to apply <input name="confirmation" autocomplete="off" required /></label><button type="submit">Apply exact preview</button></form></section>{/if}
        </div>{/if}
      </div>
    </section>
  </section>
</main>
