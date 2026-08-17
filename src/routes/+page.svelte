<script lang="ts">
  import PacketCard from '$lib/components/PacketCard.svelte';
  import { page } from '$app/state';
  import type { Packet, PlanView, PacketState, TransitionPreview } from '$lib/types';

  type ActionForm = {
    errors?: string[];
    preview?: TransitionPreview;
    applied?: string;
    message?: string;
    values?: { packetId: string; nextState: PacketState; owner: string; evidence: string; remainder: string };
  };

  let { data, form }: { data: { plan: PlanView }; form?: ActionForm } = $props();
  let query = $state('');
  let selectedState = $state<'ALL' | PacketState>('ALL');
  let milestone = $state('ALL');
  let readyOnly = $state(false);
  let copyStatus = $state('');
  let searchInput: HTMLInputElement;
  const selectedId = $derived(page.url.searchParams.get('packet') ?? '');
  const columns: { label: string; states: PacketState[] }[] = [
    { label: 'Ready / Open', states: ['OPEN'] },
    { label: 'In progress', states: ['ACTIVE', 'PARTIAL'] },
    { label: 'Blocked', states: ['BLOCKED'] },
    { label: 'Complete', states: ['CLOSED', 'DROPPED'] }
  ];

  const milestones = $derived([...new Set(data.plan.packets.map((packet) => packet.milestone))]);
  const selected = $derived(data.plan.packets.find((packet) => packet.id === selectedId) ?? data.plan.packets[0]);
  const filtered = $derived(data.plan.packets.filter((packet) => {
    const text = `${packet.id} ${packet.title} ${packet.outcome}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) &&
      (selectedState === 'ALL' || packet.state === selectedState) &&
      (milestone === 'ALL' || packet.milestone === milestone) &&
      (!readyOnly || data.plan.readyIds.includes(packet.id));
  }));

  function inColumn(packet: Packet, states: PacketState[]) { return states.includes(packet.state); }
  function resetFilters() { query = ''; selectedState = 'ALL'; milestone = 'ALL'; readyOnly = false; }
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
</script>

<svelte:window onkeydown={focusSearch} />

<svelte:head><title>Project Agile Board</title><meta name="description" content="A local project plan board backed by the migration authority." /></svelte:head>

<main>
  <header class="topbar">
    <div><p class="eyebrow">PROJECT TOOL</p><h1>Project Agile Board</h1><p class="subtitle">A readable view of the migration plan and its next actionable work.</p><p class="source-mode">Reading from {data.plan.sourceMode}.</p></div>
    <div class="top-actions"><div class:valid={data.plan.valid} class="health">{data.plan.valid ? 'Plan valid' : 'Plan needs attention'}</div><form method="POST" action="?/logout"><button class="quiet-button" type="submit">Sign out</button></form></div>
  </header>

  {#if data.plan.errors.length}<section class="errors" aria-live="polite"><h2>Plan issues</h2>{#each data.plan.errors as error}<p>{error}</p>{/each}</section>{/if}

  <section class="summary" aria-label="Plan summary"><div><strong>{data.plan.packets.length}</strong><span>packets</span></div><div><strong>{data.plan.readyIds.length}</strong><span>ready next</span></div><div><strong>{data.plan.stateCounts.ACTIVE + data.plan.stateCounts.PARTIAL}</strong><span>in progress</span></div><div><strong>{data.plan.stateCounts.BLOCKED}</strong><span>blocked</span></div></section>
  {#if data.plan.readyIds[0]}<p class="next-ready"><span>Recommended next:</span> <a href={`?packet=${data.plan.readyIds[0]}`}>{data.plan.readyIds[0]}</a> <span>— dependencies are closed.</span></p>{/if}

  <section class="toolbar" aria-label="Board filters">
    <label>Search <input bind:this={searchInput} bind:value={query} aria-label="Search packets" placeholder="ID, title, or outcome" /></label>
    <label>State <select bind:value={selectedState}><option value="ALL">All states</option>{#each Object.keys(data.plan.stateCounts) as item}<option value={item}>{item}</option>{/each}</select></label>
    <label>Milestone <select bind:value={milestone}><option value="ALL">All milestones</option>{#each milestones as item}<option value={item}>{item}</option>{/each}</select></label>
    <label class="check"><input type="checkbox" bind:checked={readyOnly} /> Ready next</label>
    <button type="button" class="quiet-button" onclick={resetFilters}>Reset filters</button>
  </section>

  <div class="layout">
    <section class="board" aria-label="Migration packets">
      {#each columns as column}
        <section class="column"><h2>{column.label} <span>{filtered.filter((packet) => inColumn(packet, column.states)).length}</span></h2>
          {#each filtered.filter((packet) => inColumn(packet, column.states)) as packet}<PacketCard {packet} ready={data.plan.readyIds.includes(packet.id)} selected={selected?.id === packet.id} />{:else}<p class="empty">No packets</p>{/each}
        </section>
      {/each}
    </section>

    {#if selected}<aside class="detail" aria-label="Selected packet"><p class="eyebrow">SELECTED PACKET</p><div class="detail-heading"><div><h2>{selected.id}</h2><h3>{selected.title}</h3></div><button class="quiet-button" type="button" onclick={() => copyPacketBrief(selected)}>Copy brief</button></div>{#if copyStatus}<p class="copy-status" role="status">{copyStatus}</p>{/if}<p class="meta">{selected.state} · {selected.owner} · {selected.milestone}</p>{#if data.plan.readyIds.includes(selected.id)}<p class="ready-banner">Dependencies are closed. This packet is ready to pull.</p>{/if}<dl><dt>Outcome</dt><dd>{selected.outcome || 'Not recorded.'}</dd><dt>Inputs</dt><dd>{selected.inputs || 'Not recorded.'}</dd><dt>Files</dt><dd>{selected.files || 'Not recorded.'}</dd><dt>Do not touch</dt><dd>{selected.doNotTouch || 'Not recorded.'}</dd><dt>Dependencies</dt><dd>{selected.dependsOn.length ? selected.dependsOn.join(', ') : 'None'}</dd><dt>Checks</dt><dd>{selected.checks || 'Not recorded.'}</dd><dt>Evidence</dt><dd>{selected.evidence || 'None recorded.'}</dd><dt>Remainder</dt><dd>{selected.remainder || 'None recorded.'}</dd></dl><details class="steps"><summary>Implementation steps</summary><pre>{selected.steps || 'No steps recorded.'}</pre></details>
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
    </aside>{/if}
  </div>
</main>
