<script lang="ts">
  import PacketCard from '$lib/components/PacketCard.svelte';
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
  let selectedId = $state('');
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
</script>

<svelte:head><title>Project Agile Board</title><meta name="description" content="A local project plan board backed by the migration authority." /></svelte:head>

<main>
  <header class="topbar">
    <div><p class="eyebrow">LOCAL PROJECT TOOL</p><h1>Project Agile Board</h1><p class="subtitle">A readable view of the migration plan and its next actionable work.</p></div>
    <div class:valid={data.plan.valid} class="health">{data.plan.valid ? 'Plan valid' : 'Plan needs attention'}</div>
  </header>

  {#if data.plan.errors.length}<section class="errors" aria-live="polite"><h2>Plan issues</h2>{#each data.plan.errors as error}<p>{error}</p>{/each}</section>{/if}

  <section class="toolbar" aria-label="Board filters">
    <label>Search <input bind:value={query} placeholder="ID, title, or outcome" /></label>
    <label>State <select bind:value={selectedState}><option value="ALL">All states</option>{#each Object.keys(data.plan.stateCounts) as item}<option value={item}>{item}</option>{/each}</select></label>
    <label>Milestone <select bind:value={milestone}><option value="ALL">All milestones</option>{#each milestones as item}<option value={item}>{item}</option>{/each}</select></label>
    <label class="check"><input type="checkbox" bind:checked={readyOnly} /> Ready next</label>
  </section>

  <div class="layout">
    <section class="board" aria-label="Migration packets">
      {#each columns as column}
        <section class="column"><h2>{column.label} <span>{filtered.filter((packet) => inColumn(packet, column.states)).length}</span></h2>
          {#each filtered.filter((packet) => inColumn(packet, column.states)) as packet}<PacketCard {packet} ready={data.plan.readyIds.includes(packet.id)} selected={selected?.id === packet.id} />{:else}<p class="empty">No packets</p>{/each}
        </section>
      {/each}
    </section>

    {#if selected}<aside class="detail" aria-label="Selected packet"><p class="eyebrow">SELECTED PACKET</p><h2>{selected.id}</h2><h3>{selected.title}</h3><p class="meta">{selected.state} · {selected.owner} · {selected.milestone}</p>{#if data.plan.readyIds.includes(selected.id)}<p class="ready-banner">Dependencies are closed. This packet is ready to pull.</p>{/if}<dl><dt>Outcome</dt><dd>{selected.outcome || 'Not recorded.'}</dd><dt>Dependencies</dt><dd>{selected.dependsOn.length ? selected.dependsOn.join(', ') : 'None'}</dd><dt>Checks</dt><dd>{selected.checks || 'Not recorded.'}</dd><dt>Evidence</dt><dd>{selected.evidence || 'None recorded.'}</dd><dt>Remainder</dt><dd>{selected.remainder || 'None recorded.'}</dd></dl>
      <form method="POST" action="?/previewTransition" class="transition-form">
        <h3>Preview a state change</h3>
        <input type="hidden" name="packetId" value={selected.id} />
        <label>Next state <select name="nextState" required><option value="OPEN">OPEN</option><option value="ACTIVE">ACTIVE</option><option value="PARTIAL">PARTIAL</option><option value="BLOCKED">BLOCKED</option><option value="CLOSED">CLOSED</option><option value="DROPPED">DROPPED</option></select></label>
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
