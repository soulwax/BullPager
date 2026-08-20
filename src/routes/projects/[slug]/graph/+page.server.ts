import { fail, redirect } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { createGraphEdge, createGraphNode, deleteGraphEdge, deleteGraphNode, getBoardProject, listProjectCards, listStarredProjectSlugs, loadProjectGraph, saveGraphSettings, updateGraphNode, upsertProjectFile } from '$lib/server/persistence';
import type { GraphEdgeKind, GraphNodeKind } from '$lib/types';

const canEdit = (role: string | undefined) => ['superadmin', 'admin', 'editor'].includes(role ?? '');
const failure = (error: unknown) => {
  console.error('[graph persistence]', error);
  if (error instanceof Error && error.message === 'GRAPH_CONFLICT') return fail(409, { error: 'This graph changed elsewhere. Reload it before saving your edit.' });
  return fail(503, { error: 'The graph could not be saved. Try again shortly.' });
};

/** The default backup location every graph writes to on its own — a fixed
 * path rather than a timestamped one, so "nothing ever gets lost" means one
 * always-current encoded copy in the project's own Cloud, not an unbounded
 * pile of snapshots nobody prunes. It lives beside the other project files
 * (same `upsertProjectFile` path text notes already use), so it shows up on
 * the Files tab like anything else — not a hidden, special-cased backup. */
const GRAPH_BACKUP_FOLDER = 'graph';
const GRAPH_BACKUP_PATH = `${GRAPH_BACKUP_FOLDER}/graph-snapshot.json`;

/** Runs after every successful graph mutation. Deliberately fails soft: a
 * backup hiccup must never turn a card move or a note edit that already
 * succeeded into an error for the person who made it — the graph itself is
 * still the source of truth in Postgres either way. */
async function backupGraphSnapshot(slug: string, actor: string) {
  try {
    const graph = await loadProjectGraph(slug);
    const snapshot = JSON.stringify({ format: 'bullpager-graph-v1', projectSlug: slug, exportedAt: new Date().toISOString(), settings: graph.settings, nodes: graph.nodes, edges: graph.edges }, null, 2);
    await upsertProjectFile({ id: `file-${Date.now()}-${randomBytes(6).toString('hex')}`, projectSlug: slug, path: GRAPH_BACKUP_PATH, content: snapshot, mimeType: 'application/json', createdBy: actor });
  } catch (error) {
    console.error('[graph backup] failed to write the cloud snapshot', error);
  }
}

export async function load({ params, locals }) {
  const project = await getBoardProject(params.slug);
  if (!project) throw redirect(303, '/settings');
  const graph = await loadProjectGraph(params.slug);
  const starred = await listStarredProjectSlugs(locals.username ?? '');
  return { project, graph, cards: await listProjectCards(params.slug), canEdit: canEdit(locals.role), username: locals.username ?? 'unknown', starred: starred.has(params.slug) };
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
    await backupGraphSnapshot(params.slug, locals.username ?? 'unknown');
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
    await backupGraphSnapshot(params.slug, locals.username ?? 'unknown');
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
    await backupGraphSnapshot(params.slug, locals.username ?? 'unknown');
    return { message: 'Position saved.' };
  },
  deleteNode: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to edit the graph.' });
    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    if (!id) return fail(400, { error: 'Choose a graph object.' });
    try { await deleteGraphNode(params.slug, id, Number(form.get('revision') ?? 0) || undefined); } catch (error) { return failure(error); }
    await backupGraphSnapshot(params.slug, locals.username ?? 'unknown');
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
    await backupGraphSnapshot(params.slug, locals.username ?? 'unknown');
    return { message: 'Connection created.' };
  },
  deleteEdge: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to edit the graph.' });
    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    if (!id) return fail(400, { error: 'Choose a connection.' });
    try { await deleteGraphEdge(params.slug, id, Number(form.get('revision') ?? 0) || undefined); } catch (error) { return failure(error); }
    await backupGraphSnapshot(params.slug, locals.username ?? 'unknown');
    return { message: 'Connection removed.' };
  },
  saveSettings: async ({ request, locals, params }) => {
    if (!canEdit(locals.role)) return fail(403, { error: 'Editor access is required to edit graph settings.' });
    const form = await request.formData();
    const background = String(form.get('background') ?? 'midnight');
    if (!['midnight', 'ocean', 'light'].includes(background)) return fail(400, { error: 'Choose a valid graph background.' });
    try { await saveGraphSettings(params.slug, { snap: form.get('snap') === 'on', gridSize: Number(form.get('gridSize') ?? 8), background: background as 'midnight' | 'ocean' | 'light' }, Number(form.get('revision') ?? 0) || undefined); } catch (error) { return failure(error); }
    await backupGraphSnapshot(params.slug, locals.username ?? 'unknown');
    return { message: 'Graph settings saved.' };
  }
};
