<script lang="ts">
  import type { Packet } from '$lib/types';
  let { packet, ready, selected = false }: { packet: Packet; ready: boolean; selected?: boolean } = $props();
</script>

<a class:selected href={`?packet=${packet.id}`} aria-current={selected ? 'true' : undefined} class="card">
  <span class="id">{packet.id}</span>
  <strong>{packet.title}</strong>
  <span class="meta">{packet.owner} · {packet.milestone}</span>
  {#if ready}<span class="ready">Ready next</span>{/if}
</a>

<style>
  .card { display: grid; gap: .35rem; padding: .85rem; border: 1px solid var(--line); border-radius: .65rem; background: var(--panel); color: inherit; text-decoration: none; }
  .card:hover, .card.selected { border-color: var(--accent); }
  .id, .meta, .ready { font-size: .78rem; color: var(--muted); }
  .id { color: var(--accent); font-weight: 700; }
  .ready { color: var(--good); font-weight: 700; }
</style>
