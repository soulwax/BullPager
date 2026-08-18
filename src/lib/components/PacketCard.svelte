<script lang="ts">
  import type { Packet } from '$lib/types';
  let { packet, href, ready, selected = false, compact = false, showOutcome = true }: { packet: Packet; href: string; ready: boolean; selected?: boolean; compact?: boolean; showOutcome?: boolean } = $props();
</script>

<a class:selected class:compact href={href} aria-current={selected ? 'true' : undefined} class="card">
  <span class="id">{packet.id}</span>
  <strong>{packet.title}</strong>
  <span class="taxonomy" title={packet.subcategory}>{packet.category || 'Uncategorized'} <span>·</span> {packet.subcategory || 'General'}</span>
  {#if packet.tags?.length}<span class="tags" aria-label="Packet tags">{#each packet.tags.slice(0, 4) as tag}<span>{tag}</span>{/each}{#if packet.tags.length > 4}<span>+{packet.tags.length - 4}</span>{/if}</span>{/if}
  <span class="meta">{packet.owner} · {packet.milestone}</span>
  <span class={`state state-${packet.state.toLowerCase()}`}>{packet.state}</span>
  {#if showOutcome && packet.outcome}<span class="outcome">{packet.outcome}</span>{/if}
  {#if packet.dependsOn.length}<span class="dependencies">↳ {packet.dependsOn.length} dependenc{packet.dependsOn.length === 1 ? 'y' : 'ies'}</span>{/if}
  {#if ready}<span class="ready">Ready next</span>{/if}
</a>

<style>
  .card { display: grid; gap: .35rem; padding: .85rem; border: 1px solid var(--line); border-radius: .65rem; background: var(--panel); color: inherit; text-decoration: none; }
  .card.compact { gap: .2rem; padding: .55rem .65rem; }
  .card.compact .outcome { display: none; }
  .card:hover, .card.selected { border-color: var(--accent); }
  .id, .meta, .state, .ready { font-size: .72rem; color: var(--muted); }
  .id { color: var(--accent); font-weight: 700; }
  .taxonomy { overflow: hidden; color: #9eb4ca; font-size: .68rem; text-overflow: ellipsis; white-space: nowrap; }
  .taxonomy span { color: #5f7287; }
  .tags { display: flex; flex-wrap: wrap; gap: .25rem; }
  .tags span { padding: .12rem .35rem; border: 1px solid color-mix(in srgb, var(--accent) 34%, var(--line)); border-radius: 99px; color: #b8d8ff; background: color-mix(in srgb, var(--accent) 10%, transparent); font-size: .62rem; line-height: 1.2; }
  .state { width: max-content; padding: .14rem .4rem; border: 1px solid var(--line); border-radius: 99px; letter-spacing: .04em; }
  .state-active, .state-partial { color: #ffd28b; border-color: #80683b; }
  .state-blocked { color: #ffc19e; border-color: #9a6249; }
  .state-closed { color: var(--good); border-color: #377a59; }
  .state-dropped { color: #aeb8c4; border-color: #5b6572; }
  .outcome { display: -webkit-box; overflow: hidden; color: #c4ceda; font-size: .78rem; line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; }
  .dependencies { color: #8291a3; font-size: .7rem; }
  .ready { color: var(--good); font-weight: 700; }
</style>
