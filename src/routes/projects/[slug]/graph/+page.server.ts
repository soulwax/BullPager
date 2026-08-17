import { fail, redirect } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { createGraphEdge, createGraphNode, deleteGraphEdge, deleteGraphNode, getBoardProject, listProjectCards, loadProjectGraph, saveGraphSettings, updateGraphNode } from '$lib/server/persistence';
import type { GraphEdgeKind, GraphNodeKind } from '$lib/types';

const canEdit = (role: string | undefined) => ['superadmin', 'admin', 'editor'].includes(role ?? '');
const failure = (error: unknown) => {
  console.error('[graph persistence]', error);
  if (error instanceof Error && error.message === 'GRAPH_CONFLICT') return fail(409, { error: 'This graph changed elsewhere. Reload it before saving your edit.' });
  return fail(503, { error: 'The graph could not be saved. Try again shortly.' });
};

export async function load({ params, locals }) {
  const project = await getBoardProject(params.slug);
  if (!project) throw redirect(303, '/settings');
  const graph = await loadProjectGraph(params.slug);
  return { project, graph, cards: await listProjectCards(params.slug), canEdit: canEdit(locals.role), username: locals.username ?? 'unknown' };
}

export const actions = {
  createNode: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to edit the graph.' });
    const form = await request.formData();
    const kind = String(form.get('kind') ?? 'note') as GraphNodeKind;
    const cardId = String(form.get('cardId') ?? '').trim() || null;
    const title = String(form.get('title') ?? '').trim();
    const body = String(form.get('body') ?? '').trim();
    const color = String(form.get('color') ?? '#5E9CFF');
    if (!['note', 'card', 'group'].includes(kind) || title.length < 1 || title.length > 160 || body.length > 4000 || !/^#[0-9a-f]{6}$/i.test(color)) return fail(400, { error: 'Choose a valid graph object, title, and color.' });
    if (kind === 'card' && !cardId) return fail(400, { error: 'Choose a card to link.' });
    try {
      await createGraphNode({ id: `graph-${Date.now()}-${randomBytes(5).toString('hex')}`, projectSlug: params.slug, kind, cardId, title, body, x: Number(form.get('x') ?? 120), y: Number(form.get('y') ?? 120), width: kind === 'group' ? 360 : 240, height: kind === 'group' ? 220 : 140, color, collapsed: false, archived: false, createdBy: locals.username ?? 'unknown' });
    } catch (error) { return failure(error); }
    return { message: 'Graph object created.' };
  },
  updateNode: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to edit the graph.' });
    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    if (!id) return fail(400, { error: 'Choose a graph object.' });
    const color = String(form.get('color') ?? '#5E9CFF');
    if (!/^#[0-9a-f]{6}$/i.test(color)) return fail(400, { error: 'Choose a valid graph color.' });
    try {
      await updateGraphNode(params.slug, id, { title: String(form.get('title') ?? '').trim(), body: String(form.get('body') ?? '').trim(), color, collapsed: form.get('collapsed') === 'true' }, Number(form.get('revision') ?? 0) || undefined);
    } catch (error) { return failure(error); }
    return { message: 'Graph object updated.' };
  },
  moveNode: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to edit the graph.' });
    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    const x = Number(form.get('x'));
    const y = Number(form.get('y'));
    if (!id || !Number.isFinite(x) || !Number.isFinite(y)) return fail(400, { error: 'Choose a valid graph position.' });
    try { await updateGraphNode(params.slug, id, { x, y }, Number(form.get('revision') ?? 0) || undefined); } catch (error) { return failure(error); }
    return { message: 'Position saved.' };
  },
  deleteNode: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to edit the graph.' });
    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    if (!id) return fail(400, { error: 'Choose a graph object.' });
    try { await deleteGraphNode(params.slug, id, Number(form.get('revision') ?? 0) || undefined); } catch (error) { return failure(error); }
    return { message: 'Graph object removed.' };
  },
  createEdge: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to edit the graph.' });
    const form = await request.formData();
    const sourceNodeId = String(form.get('sourceNodeId') ?? '').trim();
    const targetNodeId = String(form.get('targetNodeId') ?? '').trim();
    const kind = String(form.get('kind') ?? 'relates_to') as GraphEdgeKind;
    if (!sourceNodeId || !targetNodeId || !['relates_to', 'depends_on', 'leads_to', 'blocks'].includes(kind)) return fail(400, { error: 'Choose two nodes and a valid relationship.' });
    try { await createGraphEdge({ id: `edge-${Date.now()}-${randomBytes(5).toString('hex')}`, projectSlug: params.slug, sourceNodeId, targetNodeId, kind, label: String(form.get('label') ?? ''), createdBy: locals.username ?? 'unknown' }, Number(form.get('revision') ?? 0) || undefined); } catch (error) { return failure(error); }
    return { message: 'Connection created.' };
  },
  deleteEdge: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to edit the graph.' });
    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    if (!id) return fail(400, { error: 'Choose a connection.' });
    try { await deleteGraphEdge(params.slug, id, Number(form.get('revision') ?? 0) || undefined); } catch (error) { return failure(error); }
    return { message: 'Connection removed.' };
  },
  saveSettings: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to edit graph settings.' });
    const form = await request.formData();
    const background = String(form.get('background') ?? 'midnight');
    if (!['midnight', 'ocean', 'light'].includes(background)) return fail(400, { error: 'Choose a valid graph background.' });
    try { await saveGraphSettings(params.slug, { snap: form.get('snap') === 'on', gridSize: Number(form.get('gridSize') ?? 8), background: background as 'midnight' | 'ocean' | 'light' }, Number(form.get('revision') ?? 0) || undefined); } catch (error) { return failure(error); }
    return { message: 'Graph settings saved.' };
  }
};
