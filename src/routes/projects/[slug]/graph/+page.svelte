<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import type { GraphEdge, GraphNode, GraphNodeKind } from '$lib/types';
  import ProjectHeader from '$lib/components/ProjectHeader.svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import Minus from '@lucide/svelte/icons/minus';

  let { data, form }: { data: { project: { slug: string; name: string }; graph: { settings: { revision: number; snap: boolean; gridSize: number; background: 'midnight' | 'ocean' | 'light' }; nodes: GraphNode[]; edges: GraphEdge[] }; cards: { id: string; title: string; lane: string }[]; canEdit: boolean; username: string; starred: boolean }; form?: { message?: string; error?: string } } = $props();
  let selectedNodeId = $state<string | null>(null);
  let selectedEdgeId = $state<string | null>(null);
  let tool = $state<'select' | 'pan' | 'connect'>('select');
  let showCreate = $state(false);
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let drag: { id: string; startX: number; startY: number; nodeX: number; nodeY: number } | null = null;
  let panning: { startX: number; startY: number; panX: number; panY: number } | null = null;
  const selectedNode = $derived(data.graph.nodes.find((node) => node.id === selectedNodeId) ?? null);
  const selectedEdge = $derived(data.graph.edges.find((edge) => edge.id === selectedEdgeId) ?? null);
  const activeNodes = $derived(data.graph.nodes.filter((node) => !node.archived));
  const nodeById = $derived(new Map(data.graph.nodes.map((node) => [node.id, node])));

  function point(event: PointerEvent) {
    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (1600 / rect.width) / zoom - panX / zoom, y: (event.clientY - rect.top) * (900 / rect.height) / zoom - panY / zoom };
  }
  function selectNode(node: GraphNode, event: PointerEvent) {
    event.stopPropagation();
    selectedEdgeId = null;
    if (tool === 'connect') {
      if (!selectedNodeId) selectedNodeId = node.id;
      else if (selectedNodeId !== node.id) createEdge(selectedNodeId, node.id);
      return;
    }
    selectedNodeId = node.id;
    if (!data.canEdit || tool !== 'select') return;
    const p = point(event);
    drag = { id: node.id, startX: p.x, startY: p.y, nodeX: node.x, nodeY: node.y };
  }
  function canvasDown(event: PointerEvent) {
    if ((event.target as Element)?.tagName !== 'svg') return;
    selectedNodeId = null;
    selectedEdgeId = null;
    if (tool === 'pan' || event.button === 1) panning = { startX: event.clientX, startY: event.clientY, panX, panY };
  }
  function canvasMove(event: PointerEvent) {
    if (drag) {
      const p = point(event);
      const node = data.graph.nodes.find((item) => item.id === drag?.id);
      if (node) {
        node.x = Math.round((drag.nodeX + p.x - drag.startX) / (data.graph.settings.snap ? data.graph.settings.gridSize : 1)) * (data.graph.settings.snap ? data.graph.settings.gridSize : 1);
        node.y = Math.round((drag.nodeY + p.y - drag.startY) / (data.graph.settings.snap ? data.graph.settings.gridSize : 1)) * (data.graph.settings.snap ? data.graph.settings.gridSize : 1);
      }
    }
    if (panning) { panX = panning.panX + event.clientX - panning.startX; panY = panning.panY + event.clientY - panning.startY; }
  }
  async function canvasUp() {
    if (drag) {
      const node = data.graph.nodes.find((item) => item.id === drag?.id);
      if (node) { const body = new FormData(); body.set('id', node.id); body.set('x', String(node.x)); body.set('y', String(node.y)); body.set('revision', String(data.graph.settings.revision)); const response = await fetch('?/moveNode', { method: 'POST', body, headers: { accept: 'application/json' } }); if (!response.ok) await invalidateAll(); }
      drag = null;
      await invalidateAll();
    }
    panning = null;
  }
  async function createEdge(sourceNodeId: string, targetNodeId: string) {
    const body = new FormData(); body.set('sourceNodeId', sourceNodeId); body.set('targetNodeId', targetNodeId); body.set('kind', 'relates_to'); body.set('revision', String(data.graph.settings.revision));
    const response = await fetch('?/createEdge', { method: 'POST', body, headers: { accept: 'application/json' } });
    if (response.ok) { selectedNodeId = null; tool = 'select'; await invalidateAll(); }
  }
  function fitGraph() {
    if (!activeNodes.length) { zoom = 1; panX = 0; panY = 0; return; }
    const minX = Math.min(...activeNodes.map((node) => node.x));
    const minY = Math.min(...activeNodes.map((node) => node.y));
    const maxX = Math.max(...activeNodes.map((node) => node.x + node.width));
    const maxY = Math.max(...activeNodes.map((node) => node.y + node.height));
    zoom = Math.max(.45, Math.min(1.2, Math.min(1500 / Math.max(1, maxX - minX + 120), 800 / Math.max(1, maxY - minY + 120))));
    panX = 80 - minX * zoom; panY = 60 - minY * zoom;
  }
</script>

<svelte:head><title>{data.project.name} · Graph mode</title></svelte:head>

<main class={`graph-workspace graph-${data.graph.settings.background}`}>
  <ProjectHeader project={data.project} active="graph" canEdit={data.canEdit} username={data.username} starred={data.starred} />
  {#if form?.message}<p class="success" role="status">{form.message}</p>{/if}{#if form?.error}<p class="action-errors" role="alert">{form.error}</p>{/if}
  <section class="graph-shell">
    <div class="graph-toolbar" aria-label="Graph tools"><div class="graph-tool-group"><button class:active={tool === 'select'} type="button" onclick={() => { tool = 'select'; }}>Select</button><button class:active={tool === 'pan'} type="button" onclick={() => { tool = 'pan'; }}>Pan</button><button class:active={tool === 'connect'} type="button" onclick={() => { tool = 'connect'; selectedNodeId = null; }}>Connect</button></div><button type="button" onclick={() => { showCreate = !showCreate; }}><Plus /> Add object</button><button type="button" class="quiet-button icon-only" aria-label="Zoom in" onclick={() => { zoom = Math.min(2, zoom + .1); }}><Plus /></button><span class="zoom-label">{Math.round(zoom * 100)}%</span><button type="button" class="quiet-button icon-only" aria-label="Zoom out" onclick={() => { zoom = Math.max(.35, zoom - .1); }}><Minus /></button><button type="button" class="quiet-button" onclick={fitGraph}>Fit</button><span class="graph-count">{activeNodes.length} objects · {data.graph.edges.length} connections</span></div>
    {#if showCreate && data.canEdit}<form method="POST" action="?/createNode" class="graph-create-panel"><label>Type <select name="kind"><option value="note">Note</option><option value="group">Group</option><option value="card">Linked card</option></select></label><label>Title <input name="title" maxlength="160" placeholder="What should be visible?" required /></label><label>Body <textarea name="body" rows="2" maxlength="4000" placeholder="Context or decision"></textarea></label><label>Link card <select name="cardId"><option value="">None</option>{#each data.cards as card}<option value={card.id}>{card.title}</option>{/each}</select></label><label>Color <input name="color" type="color" value="#5E9CFF" /></label><button type="submit">Create object</button></form>{/if}
    <div class="graph-canvas-wrap"><svg class="graph-canvas" viewBox="0 0 1600 900" role="application" aria-label="Project graph canvas" onpointerdown={canvasDown} onpointermove={canvasMove} onpointerup={canvasUp} onpointerleave={canvasUp}>
      <defs><pattern id="graph-grid" width={data.graph.settings.gridSize * 4} height={data.graph.settings.gridSize * 4} patternUnits="userSpaceOnUse"><path d={`M ${data.graph.settings.gridSize * 4} 0 L 0 0 0 ${data.graph.settings.gridSize * 4}`} fill="none" stroke="currentColor" stroke-opacity=".12" /></pattern><marker id="graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" /></marker></defs>
      <rect width="1600" height="900" fill="url(#graph-grid)" />
      <g transform={`translate(${panX},${panY}) scale(${zoom})`}>
        {#each data.graph.edges as edge}
          {@const source = nodeById.get(edge.sourceNodeId)}{@const target = nodeById.get(edge.targetNodeId)}
          {#if source && target}<line class:selected={selectedEdgeId === edge.id} class="graph-edge" role="button" tabindex="0" aria-label={`${edge.kind.replace('_', ' ')} connection`} x1={source.x + source.width / 2} y1={source.y + source.height / 2} x2={target.x + target.width / 2} y2={target.y + target.height / 2} marker-end="url(#graph-arrow)" onclick={(event) => { event.stopPropagation(); selectedEdgeId = edge.id; selectedNodeId = null; }} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { selectedEdgeId = edge.id; selectedNodeId = null; } }} /><text class="graph-edge-label" x={(source.x + target.x + source.width / 2 + target.width / 2) / 2} y={(source.y + target.y + source.height / 2 + target.height / 2) / 2}>{edge.label || edge.kind.replace('_', ' ')}</text>{/if}
        {/each}
        {#each activeNodes as node}
          <g class:selected={selectedNodeId === node.id} class={`graph-node graph-node-${node.kind}`} transform={`translate(${node.x},${node.y})`} role="button" tabindex="0" aria-label={`${node.kind}: ${node.title}`} aria-pressed={selectedNodeId === node.id} onpointerdown={(event) => selectNode(node, event)} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') selectedNodeId = node.id; }}><rect width={node.width} height={node.height} rx="12" style={`--node-color: ${node.color}`} /><text class="graph-node-kind" x="16" y="24">{node.kind}{node.cardId ? ' · linked card' : ''}</text><text class="graph-node-title" x="16" y="52">{node.title}</text>{#if node.body && !node.collapsed}<foreignObject x="16" y="66" width={node.width - 32} height={node.height - 76}><p xmlns="http://www.w3.org/1999/xhtml">{node.body}</p></foreignObject>{/if}</g>
        {/each}
      </g>
    </svg>{#if !activeNodes.length}<div class="graph-empty"><p class="eyebrow">EMPTY GRAPH</p><h2>Start with one idea.</h2><p>Add a note, group a phase, or link a card to make the relationships visible.</p><button type="button" onclick={() => { showCreate = true; }}>Add first object</button></div>{/if}</div>
    <aside class="graph-inspector" aria-label="Graph inspector">
      {#if selectedNode && data.canEdit}<p class="eyebrow">SELECTED {selectedNode.kind.toUpperCase()}</p><h2>{selectedNode.title}</h2><form method="POST" action="?/updateNode" class="graph-inspector-form"><input type="hidden" name="id" value={selectedNode.id} /><input type="hidden" name="revision" value={data.graph.settings.revision} /><label>Title <input name="title" value={selectedNode.title} maxlength="160" required /></label><label>Notes <textarea name="body" rows="6" maxlength="4000">{selectedNode.body}</textarea></label><label>Color <input name="color" type="color" value={selectedNode.color} /></label><label class="check"><input type="checkbox" name="collapsed" checked={selectedNode.collapsed} /> Collapse body</label><button type="submit">Save object</button></form><form method="POST" action="?/deleteNode" onsubmit={(event) => { if (!confirm('Remove this graph object?')) event.preventDefault(); }}><input type="hidden" name="id" value={selectedNode.id} /><input type="hidden" name="revision" value={data.graph.settings.revision} /><button type="submit" class="quiet-button danger">Remove object</button></form>{:else if selectedEdge && data.canEdit}<p class="eyebrow">SELECTED CONNECTION</p><h2>{selectedEdge.kind.replace('_', ' ')}</h2><p class="subtitle">{selectedEdge.sourceNodeId} → {selectedEdge.targetNodeId}</p><form method="POST" action="?/deleteEdge"><input type="hidden" name="id" value={selectedEdge.id} /><input type="hidden" name="revision" value={data.graph.settings.revision} /><button type="submit" class="quiet-button danger">Remove connection</button></form>{:else}<p class="eyebrow">GRAPH GUIDE</p><h2>Make the structure visible.</h2><p class="subtitle">Select an object to edit it. Use Connect, then click two nodes to add a relationship. Drag the canvas with Pan or the middle mouse button.</p>{/if}
      {#if data.canEdit}<details class="graph-settings"><summary>Canvas settings</summary><form method="POST" action="?/saveSettings"><input type="hidden" name="revision" value={data.graph.settings.revision} /><label class="check"><input type="checkbox" name="snap" checked={data.graph.settings.snap} /> Snap to grid</label><label>Grid size <input name="gridSize" type="number" min="4" max="64" value={data.graph.settings.gridSize} /></label><label>Background <select name="background"><option value="midnight" selected={data.graph.settings.background === 'midnight'}>Midnight</option><option value="ocean" selected={data.graph.settings.background === 'ocean'}>Ocean</option><option value="light" selected={data.graph.settings.background === 'light'}>Light</option></select></label><button type="submit">Save canvas</button></form></details>{/if}
    </aside>
  </section>
</main>
