<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { BoardProject, BoardUser, CardTemplate, ProjectActivity, ProjectCard, ProjectCardAttachment, ProjectComment, ProjectTag, ProjectViewState } from '$lib/types';
  import { moveProjectCard, PROJECT_CARD_DETAILS_LIMIT } from '$lib/projectState';
  import { defaultProjectTags, tagId, tagPalette } from '$lib/projectTags';
  import { projectBackground } from '$lib/projectBackgrounds';
  import { appearanceAttributes, appearanceFromSettings, appearanceStyle, resolveCardTheme, type BoardAppearance } from '$lib/boardAppearance';
  import BoardAppearanceDialog from '$lib/components/BoardAppearanceDialog.svelte';
  import Avatar from '$lib/components/Avatar.svelte';
  import { invalidateAll } from '$app/navigation';
  import { marked } from 'marked';
  import Archive from '@lucide/svelte/icons/archive';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import Check from '@lucide/svelte/icons/check';
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
  import Cloud from '@lucide/svelte/icons/cloud';
  import Eye from '@lucide/svelte/icons/eye';
  import FileIcon from '@lucide/svelte/icons/file';
  import FileText from '@lucide/svelte/icons/file-text';
  import History from '@lucide/svelte/icons/history';
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import Lock from '@lucide/svelte/icons/lock';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import Minus from '@lucide/svelte/icons/minus';
  import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
  import Paperclip from '@lucide/svelte/icons/paperclip';
  import Plus from '@lucide/svelte/icons/plus';
  import Rows3 from '@lucide/svelte/icons/rows-3';
  import Zap from '@lucide/svelte/icons/zap';
  import Palette from '@lucide/svelte/icons/palette';
  import Search from '@lucide/svelte/icons/search';
  import Settings from '@lucide/svelte/icons/settings';
  import Star from '@lucide/svelte/icons/star';
  import Waypoints from '@lucide/svelte/icons/waypoints';
  import GripVertical from '@lucide/svelte/icons/grip-vertical';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import X from '@lucide/svelte/icons/x';

  let { data, form }: { data: { project: BoardProject; prefix: string; settings: Record<string, string>; sourceOwned: boolean; wipLimits: Record<string, number>; templates: Record<string, CardTemplate[]>; starred: boolean; lanes: string[]; cards: ProjectCard[]; tags: ProjectTag[]; members: BoardUser[]; activity: ProjectActivity[]; comments: ProjectComment[]; attachments: ProjectCardAttachment[]; viewState: ProjectViewState; canEdit: boolean; username: string; role: string; openCard?: string | null; created: boolean }; form?: { message?: string; error?: string } } = $props();
  const setting = (name: string, fallback = '') => data.settings[`${data.prefix}${name}`] ?? fallback;
  // Appearance is board-level, mirroring `background`: everyone looking at the
  // board sees the same thing. It is held as local state rather than read
  // straight from `data` so the panel can preview a change against the live
  // board before anyone commits it.
  const savedAppearance = $derived(appearanceFromSettings(data.settings, data.prefix));
  const savedBackgroundId = $derived(setting('background', 'none'));
  let appearance = $state<BoardAppearance>(untrack(() => appearanceFromSettings(data.settings, data.prefix)));
  let backgroundId = $state(untrack(() => data.settings[`${data.prefix}background`] ?? 'none'));
  let appearanceSlug = untrack(() => data.project.slug);
  let showAppearance = $state(false);
  let savingAppearance = $state(false);
  const boardBackground = $derived(
    backgroundId === 'custom' && setting('background_custom_path')
      ? { id: 'custom', label: 'Custom', src: `/projects/${data.project.slug}/files/raw?path=${encodeURIComponent(setting('background_custom_path'))}`, kind: 'photo' as const, credit: 'Uploaded' }
      : projectBackground(backgroundId)
  );
  const boardCanvas = $derived({ src: boardBackground.src || undefined, color: boardBackground.color });
  const boardSurfaceStyle = $derived(appearanceStyle(appearance, boardCanvas));
  const boardAttributes = $derived(appearanceAttributes(appearance, boardCanvas));
  const appearanceDirty = $derived(
    backgroundId !== savedBackgroundId ||
      (Object.keys(appearance) as (keyof BoardAppearance)[]).some((key) => appearance[key] !== savedAppearance[key])
  );
  // The legacy two-step density class still drives a handful of cover-image
  // sizes; the four-step scale collapses onto it rather than duplicating them.
  const compactBoard = $derived(appearance.density === 'compact' || appearance.density === 'dense');

  // Navigating to another board reuses this component, so the local preview
  // copy has to be re-seeded from the board that is now on screen.
  $effect(() => {
    if (data.project.slug === appearanceSlug) return;
    appearanceSlug = data.project.slug;
    appearance = { ...savedAppearance };
    backgroundId = savedBackgroundId;
    showAppearance = false;
  });

  function resetAppearance() {
    appearance = { ...savedAppearance };
    backgroundId = savedBackgroundId;
  }

  async function saveAppearance() {
    if (!data.canEdit || savingAppearance) return;
    savingAppearance = true;
    const body = new FormData();
    for (const [key, value] of Object.entries(appearance)) body.set(key, String(value));
    body.set('background', backgroundId);
    try {
      const response = await fetch('?/saveAppearance', { method: 'POST', body, headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('save failed');
      savedStatus = 'Appearance saved';
      await invalidateAll();
    } catch {
      savedStatus = 'Could not save appearance';
    } finally {
      savingAppearance = false;
      setTimeout(() => { if (savedStatus.startsWith('Appearance') || savedStatus.startsWith('Could not save appearance')) savedStatus = ''; }, 2400);
    }
  }
  const isDefaultTag = (id: string) => defaultProjectTags.some((tag) => tagId(data.project.slug, tag.slug) === id);
  let collapsed = $state<Record<string, boolean>>({});
  let labelText = $state(false);
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
  let editingDescription = $state(false);
  let attachmentUploadStatus = $state('');
  let draggedLane = $state('');
  let dropTargetLaneHeader = $state('');
  let toast = $state<{ message: string; undo?: () => void } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let sanitizeHtml: ((html: string) => string) | undefined = $state(undefined);
  let searchInput: HTMLInputElement | undefined = $state(undefined);
  let showShortcutHelp = $state(false);
  let renamingLane = $state<string | null>(null);
  let renameDraft = $state('');
  let copyingLane = $state<string | null>(null);
  let copyDraft = $state('');
  let wipEditingLane = $state<string | null>(null);
  let wipDraft = $state('');
  let addingListAfter = $state<string | null>(null);
  let addListDraft = $state('');
  let showArchiveBrowser = $state(false);
  let showActivityPanel = $state(false);
  let renamingBoard = $state(false);
  let boardNameDraft = $state('');
  let starred = $state(false);
  $effect(() => { starred = data.starred; });

  onMount(() => {
    void import('dompurify').then((module) => { sanitizeHtml = module.default(window).sanitize; });
    const poll = setInterval(() => {
      // Pause while a card or composer is open so a background refresh never
      // clobbers text someone is mid-way through typing.
      if (document.hidden || editingCardId || composerLane !== null) return;
      void invalidateAll();
    }, 20000);
    return () => clearInterval(poll);
  });

  function renderMarkdown(source: string): string {
    if (!source.trim()) return '';
    const html = marked.parse(source, { breaks: true, gfm: true }) as string;
    return sanitizeHtml ? sanitizeHtml(html) : '';
  }

  function showToast(message: string, undo?: () => void) {
    if (toastTimer) clearTimeout(toastTimer);
    toast = { message, undo };
    toastTimer = setTimeout(() => { toast = null; }, undo ? 8000 : 3000);
  }

  // SvelteKit form actions return a devalue-encoded envelope, not plain JSON
  // — the same reason `saveOrder`/`saveView` elsewhere in this file only ever
  // check `response.ok` rather than parsing the body. Follow that pattern.
  async function postAction(action: string, body: FormData): Promise<{ ok: boolean }> {
    try {
      const response = await fetch(action, { method: 'POST', body, headers: { accept: 'application/json' } });
      return { ok: response.ok };
    } catch {
      return { ok: false };
    }
  }

  async function quickArchive(card: ProjectCard, archived: boolean) {
    const body = new FormData();
    body.set('id', card.id);
    body.set('archived', String(archived));
    const result = await postAction(`?/archiveCard`, body);
    if (!result.ok) { showToast(archived ? 'Could not archive the card.' : 'Could not restore the card.'); return; }
    await invalidateAll();
    showToast(archived ? `“${card.title}” archived` : `“${card.title}” restored`, async () => {
      const undoBody = new FormData();
      undoBody.set('id', card.id);
      undoBody.set('archived', String(!archived));
      await postAction('?/archiveCard', undoBody);
      await invalidateAll();
    });
  }

  let hoveredCardId = $state('');

  async function quickAssign(card: ProjectCard) {
    if (!data.canEdit || data.sourceOwned) return;
    const nextOwner = card.owner === data.username ? '' : data.username;
    const body = new FormData();
    body.set('id', card.id);
    body.set('owner', nextOwner);
    const result = await postAction('?/assignCard', body);
    if (!result.ok) { showToast('Could not assign the card.'); return; }
    await invalidateAll();
  }

  async function quickToggleWatch(card: ProjectCard) {
    const body = new FormData();
    body.set('id', card.id);
    body.set('watching', String(!card.watching));
    const result = await postAction('?/toggleWatch', body);
    if (!result.ok) { showToast('Could not update watching.'); return; }
    await invalidateAll();
  }

  async function quickMove(card: ProjectCard, lane: string) {
    const previousLane = card.lane;
    if (previousLane === lane) return;
    const body = new FormData();
    body.set('id', card.id);
    body.set('lane', lane);
    const result = await postAction(`?/moveCard`, body);
    if (!result.ok) { showToast('Could not move the card.'); return; }
    await invalidateAll();
    showToast(`Moved “${card.title}” to ${lane}`, async () => {
      const undoBody = new FormData();
      undoBody.set('id', card.id);
      undoBody.set('lane', previousLane);
      await postAction('?/moveCard', undoBody);
      await invalidateAll();
    });
  }

  function focusOnMount(node: HTMLElement) { node.focus(); }

  function attachmentsFor(cardId: string) { return data.attachments.filter((attachment) => attachment.cardId === cardId); }

  async function uploadAttachment(cardId: string, file: File) {
    if (!data.canEdit) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const body = new FormData();
    body.set('file', file);
    body.set('path', `attachments/${cardId}/${timestamp}-${file.name || 'file'}`);
    attachmentUploadStatus = `Uploading ${file.name || 'file'}…`;
    try {
      const response = await fetch(`/projects/${data.project.slug}/files/upload`, { method: 'POST', body });
      const result = await response.json() as { id?: string; path?: string; url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || 'Upload failed.');
      const linkBody = new FormData();
      linkBody.set('cardId', cardId);
      linkBody.set('name', file.name || result.path || 'file');
      linkBody.set('url', result.url);
      linkBody.set('mimeType', file.type || 'application/octet-stream');
      linkBody.set('size', String(file.size));
      const linked = await postAction('?/attachFile', linkBody);
      if (!linked.ok) throw new Error('Could not attach the uploaded file.');
      attachmentUploadStatus = 'Attached';
      await invalidateAll();
    } catch (error) {
      attachmentUploadStatus = error instanceof Error ? error.message : 'Upload failed.';
    } finally {
      setTimeout(() => { attachmentUploadStatus = ''; }, 2400);
    }
  }

  async function removeAttachment(attachment: { id: string; cardId: string }) {
    const body = new FormData();
    body.set('id', attachment.id);
    body.set('cardId', attachment.cardId);
    const result = await postAction('?/deleteAttachment', body);
    if (!result.ok) { showToast('Could not remove the attachment.'); return; }
    await invalidateAll();
  }

  function formatBytes(size: number) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function startLaneDrag(lane: string, event: DragEvent) {
    if (!data.canEdit) return;
    draggedLane = lane;
    event.dataTransfer?.setData('text/plain', lane);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  async function dropLane(targetLane: string) {
    dropTargetLaneHeader = '';
    const source = draggedLane;
    draggedLane = '';
    if (!source || source === targetLane) return;
    const order = [...data.lanes];
    const from = order.indexOf(source);
    const to = order.indexOf(targetLane);
    if (from < 0 || to < 0) return;
    order.splice(to, 0, ...order.splice(from, 1));
    const body = new FormData();
    body.set('lanes', JSON.stringify(order));
    const result = await postAction('?/reorderLanes', body);
    if (!result.ok) { showToast('Could not reorder lists.'); return; }
    await invalidateAll();
  }

  async function sortLane(lane: string, key: 'name' | 'due' | 'priority' | 'created') {
    if (!data.canEdit) return;
    const priorityRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
    const grouped = new Map<string, ProjectCard[]>();
    for (const card of boardCards) grouped.set(card.lane, [...(grouped.get(card.lane) ?? []), card]);
    const target = [...(grouped.get(lane) ?? [])].sort((a, b) => {
      if (key === 'name') return a.title.localeCompare(b.title);
      if (key === 'due') return (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31');
      if (key === 'priority') return (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9);
      return a.createdAt.localeCompare(b.createdAt);
    });
    grouped.set(lane, target);
    const order: Array<{ id: string; lane: string; position: number }> = [];
    for (const [laneName, cards] of grouped) cards.forEach((card, index) => order.push({ id: card.id, lane: laneName, position: index }));
    const body = new FormData();
    body.set('order', JSON.stringify(order));
    const result = await postAction('?/saveOrder', body);
    if (!result.ok) { showToast('Could not sort the list.'); return; }
    await invalidateAll();
  }

  async function submitMoveAll(fromLane: string, toLane: string) {
    if (!toLane || toLane === fromLane) return;
    if (!confirm(`Move every card in "${fromLane}" to "${toLane}"?`)) return;
    const body = new FormData();
    body.set('fromLane', fromLane);
    body.set('toLane', toLane);
    const result = await postAction('?/moveAllInLane', body);
    if (!result.ok) { showToast('Could not move the cards.'); return; }
    await invalidateAll();
  }

  async function submitArchiveAll(lane: string) {
    if (!confirm(`Archive every card in "${lane}"?`)) return;
    const body = new FormData();
    body.set('lane', lane);
    const result = await postAction('?/archiveAllInLane', body);
    if (!result.ok) { showToast('Could not archive the list.'); return; }
    await invalidateAll();
  }

  async function submitCopyLane() {
    const lane = copyingLane;
    const name = copyDraft.trim();
    if (!lane || !name) { copyingLane = null; return; }
    const body = new FormData();
    body.set('sourceLane', lane);
    body.set('name', name);
    copyingLane = null;
    const result = await postAction('?/copyLane', body);
    if (!result.ok) { showToast('Could not copy the list.'); return; }
    await invalidateAll();
  }

  async function submitSaveAsTemplate(card: ProjectCard) {
    const name = prompt(`Save “${card.title}” as a template for “${card.lane}”:`, card.title);
    if (!name || !name.trim()) return;
    const body = new FormData();
    body.set('cardId', card.id);
    body.set('name', name.trim());
    const result = await postAction('?/saveCardAsTemplate', body);
    if (!result.ok) { showToast('Could not save the template.'); return; }
    await invalidateAll();
    showToast(`Saved “${name.trim()}” as a template`);
  }

  async function submitCreateFromTemplate(lane: string, templateId: string) {
    if (!templateId) return;
    const body = new FormData();
    body.set('lane', lane);
    body.set('templateId', templateId);
    const result = await postAction('?/createCardFromTemplate', body);
    if (!result.ok) { showToast('Could not create the card.'); return; }
    await invalidateAll();
  }

  async function submitDeleteTemplate(lane: string, templateId: string, name: string) {
    if (!confirm(`Remove the “${name}” template?`)) return;
    const body = new FormData();
    body.set('lane', lane);
    body.set('templateId', templateId);
    const result = await postAction('?/deleteTemplate', body);
    if (!result.ok) { showToast('Could not remove the template.'); return; }
    await invalidateAll();
  }

  async function submitRenameLane() {
    const from = renamingLane;
    const to = renameDraft.trim();
    renamingLane = null;
    if (!from || !to || to === from) return;
    const body = new FormData();
    body.set('from', from);
    body.set('to', to);
    const result = await postAction('?/renameLane', body);
    if (!result.ok) { showToast('Could not rename the list.'); return; }
    await invalidateAll();
  }

  async function submitAddLane() {
    const after = addingListAfter ?? '__end__';
    const name = addListDraft.trim();
    addingListAfter = null;
    if (!name) return;
    const body = new FormData();
    body.set('name', name);
    body.set('after', after);
    const result = await postAction('?/addLane', body);
    if (!result.ok) { showToast('Could not add the list.'); return; }
    await invalidateAll();
  }

  async function submitWipLimit() {
    const lane = wipEditingLane;
    const limit = wipDraft.trim();
    wipEditingLane = null;
    if (!lane) return;
    const body = new FormData();
    body.set('lane', lane);
    body.set('limit', limit);
    const result = await postAction('?/setWipLimit', body);
    if (!result.ok) { showToast('Could not set the limit.'); return; }
    await invalidateAll();
  }

  async function submitRenameBoard() {
    const name = boardNameDraft.trim();
    renamingBoard = false;
    if (!name || name === data.project.name) return;
    const body = new FormData();
    body.set('name', name);
    const result = await postAction('?/renameBoard', body);
    if (!result.ok) { showToast('Could not rename the board.'); return; }
    await invalidateAll();
  }

  async function toggleBoardStar() {
    const next = !starred;
    starred = next;
    const body = new FormData();
    body.set('starred', String(next));
    const result = await postAction('?/toggleStar', body);
    if (!result.ok) { starred = !next; showToast('Could not update the star.'); return; }
    await invalidateAll();
  }

  function isEditable(target: EventTarget | null) {
    return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable || target.tagName === 'SELECT');
  }

  /** A single line submits normally (native form POST, same as every other
   * form on this page). Multiple lines — typically a paste — create one card
   * per non-empty line instead of one card with a multi-line title. */
  function enhanceComposer(node: HTMLFormElement, _params: { lane: string }) {
    async function handleSubmit(event: SubmitEvent) {
      const titleField = node.querySelector('textarea[name="title"]') as HTMLTextAreaElement | null;
      const lines = (titleField?.value ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
      if (lines.length <= 1) return;
      event.preventDefault();
      const formData = new FormData(node);
      for (const line of lines) {
        const body = new FormData();
        for (const [key, value] of formData.entries()) if (key !== 'title') body.append(key, value as string);
        body.set('title', line);
        await postAction('?/createCard', body);
      }
      composerLane = null;
      await invalidateAll();
    }
    node.addEventListener('submit', handleSubmit);
    return { destroy() { node.removeEventListener('submit', handleSubmit); } };
  }

  function handleShortcut(event: KeyboardEvent) {
    if (isEditable(event.target)) return;
    if (event.key === '?') { showShortcutHelp = !showShortcutHelp; return; }
    // The appearance panel owns Escape while it is open (it closes itself), so
    // it is checked before the editor/composer Escape handling below.
    if (event.key === 'v' || event.key === 'V') { showAppearance = !showAppearance; return; }
    if (showAppearance && event.key === 'Escape') { showAppearance = false; return; }
    if (showShortcutHelp) { if (event.key === 'Escape') showShortcutHelp = false; return; }
    if (event.key === 'Escape') { if (editingCardId) closeEditor(); else if (composerLane !== null) composerLane = null; return; }
    if (event.key === '/') { event.preventDefault(); searchInput?.focus(); return; }
    if (event.key === 'x') { clearFilters(); return; }
    if (event.key === 'q') { assigneeFilter = assigneeFilter === data.username ? 'all' : data.username; queueViewSave(); return; }
    if (event.key === 'n' && data.canEdit && !data.sourceOwned) { composerLane = data.lanes.find((lane) => !collapsed[lane]) ?? data.lanes[0] ?? null; return; }
    // The remaining shortcuts act on whichever card the pointer is currently
    // over, matching Trello's own hover-driven card shortcuts.
    if (!hoveredCardId) return;
    const hovered = boardCards.find((card) => card.id === hoveredCardId);
    if (!hovered) return;
    // `l` and `d` jump to the card rather than opening a floating popover —
    // this app has no label/due-date popover built, and honestly landing on
    // the full card (which has both) beats pretending to have one.
    if (event.key === 'l' || event.key === 'd') { openEditor(hovered.id); return; }
    if (event.key === 's' && data.username && data.username !== 'anonymous') { void quickToggleWatch(hovered); return; }
    if (!data.canEdit) return;
    if (event.key === ' ') { event.preventDefault(); void quickAssign(hovered); return; }
    if (event.key === 'c') { if (!hovered.archived) void quickArchive(hovered, true); return; }
    if (event.key === ',' || event.key === '.') {
      const laneIndex = data.lanes.indexOf(hovered.lane);
      const nextLane = data.lanes[laneIndex + (event.key === '.' ? 1 : -1)];
      if (nextLane) void quickMove(hovered, nextLane);
    }
  }

  $effect(() => {
    collapsed = { ...(data.viewState.collapsed ?? {}) };
    labelText = data.viewState.labelText === true;
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
  const workflowStates = ['open', 'active', 'partial', 'blocked', 'closed'] as const;
  type WorkflowState = typeof workflowStates[number];
  function workflowStateForLane(lane: string): WorkflowState | null {
    const normalized = lane.trim().toLowerCase().replace(/[_-]+/g, ' ');
    return workflowStates.find((state) => normalized === state || normalized.startsWith(`${state} `)) ?? null;
  }
  const workflowPulse = $derived(workflowStates.map((state) => ({
    state,
    lanes: data.lanes.filter((lane) => workflowStateForLane(lane) === state),
    cards: activeCards.filter((card) => workflowStateForLane(card.lane) === state).length,
  })));
  const workflowPulseVisible = $derived(workflowPulse.some((entry) => entry.lanes.length > 0));
  function cardsFor(lane: string) { return visibleCards.filter((card) => card.lane === lane); }
  function commentsFor(cardId: string) { return data.comments.filter((comment) => comment.cardId === cardId); }
  function activityFor(cardId: string) { return data.activity.filter((entry) => entry.cardId === cardId).slice(0, 8); }
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
      body.set('density', compactBoard ? 'compact' : 'comfortable');
      body.set('labelText', String(labelText));
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

  // A nested link can become the native drag source in some browsers instead
  // of the draggable shell. Recover the card id from its URL so the drop path
  // remains usable regardless of which element initiated the drag.
  function captureWindowDrag(event: DragEvent) {
    if (!data.canEdit || !(event.target instanceof Element)) return;
    const cardLink = event.target.closest<HTMLAnchorElement>('a.project-card');
    const cardId = cardLink ? new URL(cardLink.href, window.location.href).searchParams.get('card') : null;
    if (!cardId) return;
    draggedCardId = cardId;
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', cardId);
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  function finishWindowDrag() {
    draggedCardId = '';
    dropTargetLane = '';
    dropTargetCardId = '';
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

<svelte:window ondragstart={captureWindowDrag} ondragend={finishWindowDrag} onkeydown={handleShortcut} />

<svelte:head><title>{data.project.name} · BullPager Board</title></svelte:head>

<main class={`project-workspace theme-${appearance.theme} project-lane-${setting('lane_style', 'scroll')}`} class:has-project-background={Boolean(boardBackground.src)} class:has-color-background={Boolean(boardBackground.color)} style={boardSurfaceStyle} {...boardAttributes}>
  {#if data.members.length}<datalist id="project-members">{#each data.members as member}<option value={member.username}>{member.role}</option>{/each}</datalist>{/if}
  <header class="topbar project-board-header">
    <div class="board-title-group"><a class="board-switcher" href="/" aria-label="All boards"><LayoutGrid /><span>Board</span></a><span class="board-divider" aria-hidden="true"></span>{#if data.username}<button type="button" class="star-toggle board-star" class:active={starred} aria-pressed={starred} aria-label={starred ? 'Unstar this board' : 'Star this board'} onclick={toggleBoardStar}><Star fill={starred ? 'currentColor' : 'none'} /></button>{/if}<div><p class="eyebrow">{data.project.visibility} workspace</p>{#if renamingBoard}<form class="board-rename-form" onsubmit={(event) => { event.preventDefault(); void submitRenameBoard(); }}><input bind:value={boardNameDraft} maxlength="120" aria-label="Board name" use:focusOnMount onblur={submitRenameBoard} onkeydown={(event) => { if (event.key === 'Escape') renamingBoard = false; }} /></form>{:else}<h1>{#if data.canEdit}<button type="button" class="board-name-button" onclick={() => { boardNameDraft = data.project.name; renamingBoard = true; }} title="Click to rename this board">{data.project.name}</button>{:else}{data.project.name}{/if}{#if data.sourceOwned}<span class="source-lock-chip" title="Title, description, checklist text, owner, priority, and cover are synced from UNITY_PLAN.md. Lane, dates, comments, attachments, and checklist ticks stay editable here."><Lock /> synced from plan</span>{/if}</h1>{/if}</div><span class="board-card-count">{boardCards.length} {boardCards.length === 1 ? 'card' : 'cards'}</span></div>
    <div class="top-links board-header-actions"><button type="button" class="quiet-button" class:active={showActivityPanel} onclick={() => { showActivityPanel = !showActivityPanel; showArchiveBrowser = false; }}><History /> Activity</button><button type="button" class="quiet-button" class:active={showArchiveBrowser} onclick={() => { showArchiveBrowser = !showArchiveBrowser; showActivityPanel = false; }}><Archive /> Archive</button><a class="quiet-button" href={`/projects/${data.project.slug}/backlog`}><Rows3 /> Backlog</a><a class="board-cloud-link" href={`/projects/${data.project.slug}/files`}><Cloud /> Cloud</a><a class="quiet-button" href={`/projects/${data.project.slug}/graph`}><Waypoints /> Graph</a>{#if data.canEdit}<a class="quiet-button icon-only" href={`/projects/${data.project.slug}/automation`} aria-label="Board automation" title="Board automation"><Zap /></a>{/if}<button type="button" class="quiet-button icon-only" class:active={showAppearance} aria-haspopup="dialog" aria-expanded={showAppearance} aria-label="Board appearance (V)" title="Board appearance — V" onclick={() => { showAppearance = !showAppearance; }}><Palette /></button><a class="quiet-button icon-only" href={`/projects/${data.project.slug}/settings`} aria-label="Project settings"><Settings /></a></div>
  </header>

  {#if showAppearance}
    <BoardAppearanceDialog
      bind:appearance
      bind:background={backgroundId}
      canvas={boardCanvas}
      canEdit={data.canEdit}
      dirty={appearanceDirty}
      saving={savingAppearance}
      onclose={() => { showAppearance = false; }}
      onsave={saveAppearance}
      onreset={resetAppearance}
    />
  {/if}

  {#if data.created}<section class="project-welcome" role="status"><div><p class="eyebrow">PROJECT CREATED</p><h2>Your workspace is ready.</h2><p>Start with one concrete outcome, then invite collaborators when the workflow feels right.</p></div><a class="quiet-button" href={`/projects/${data.project.slug}/settings`}>Tune workflow</a></section>{/if}
  {#if form?.message}<p class="success" role="status">{form.message}</p>{/if}
  {#if form?.error}<p class="action-errors" role="alert">{form.error}</p>{/if}

  <div class="project-toolbar"><div class="project-toolbar-copy"><details class="find-work-menu"><summary><span class="find-work-icon"><Search /></span><span><strong>Find work</strong><small>{visibleCards.length} visible · {activeCards.length} active</small></span><ChevronDown class="find-work-chevron" /></summary><div class="find-work-body"><p>Jump to the work that needs attention.</p><div class="find-work-actions"><button type="button" class:active={!filtered} class="quiet-button" onclick={clearFilters}>All cards</button><button type="button" class:active={assigneeFilter === data.username} class="quiet-button" onclick={() => { assigneeFilter = data.username; queueViewSave(); }}>My cards</button><button type="button" class:active={priorityFilter === 'urgent'} class="quiet-button" onclick={() => { priorityFilter = 'urgent'; queueViewSave(); }}>Urgent</button><button type="button" class="quiet-button" onclick={() => { query = ''; priorityFilter = 'all'; tagFilter = 'all'; assigneeFilter = 'unassigned'; showArchived = false; queueViewSave(); }}>Unassigned</button></div></div></details><a class="project-cloud-button" href={`/projects/${data.project.slug}/files`} aria-label="Open project cloud"><Cloud class="project-cloud-glyph" aria-hidden="true" /><span>Cloud</span></a>{#if savedStatus}<span class="save-status" role="status" aria-live="polite">{savedStatus}</span>{/if}</div><div class="toolbar-summary"><div class="project-stats" aria-label="Project summary"><span><strong>{activeCards.length}</strong> active</span><span><strong>{urgentCount}</strong> urgent</span><span><strong>{data.tags.length}</strong> tags</span><span><strong>{archivedCount}</strong> archived</span></div>{#if workflowPulseVisible}<div class="workflow-pulse" aria-label="Workflow state summary">{#each workflowPulse as entry}{#if entry.lanes.length}<span class={`workflow-state workflow-${entry.state}`}><strong>{entry.cards}</strong> {entry.state}</span>{/if}{/each}</div>{/if}</div><div class="project-controls"><label class="project-search" title="Search cards"><span class="sr-only">Search</span><Search class="project-search-icon" aria-hidden="true" /><input bind:this={searchInput} bind:value={query} oninput={queueViewSave} placeholder="Find cards by title, owner, or detail (press / to focus)" aria-label="Search project cards" /></label><label title="Filter by priority"><span class="sr-only">Priority</span><select bind:value={priorityFilter} onchange={queueViewSave}><option value="all">All priorities</option><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label><label title="Filter by tag"><span class="sr-only">Tag</span><select bind:value={tagFilter} onchange={queueViewSave}><option value="all">All tags</option>{#each data.tags as tag}<option value={tag.id}>{tag.name}</option>{/each}</select></label><label title="Filter by assignee"><span class="sr-only">Assignee</span><select bind:value={assigneeFilter} onchange={queueViewSave}><option value="all">Everyone</option><option value="unassigned">Unassigned</option>{#each data.members as member}<option value={member.username}>{member.username}</option>{/each}</select></label>{#if data.tags.length}<button type="button" class:active={labelText} class="quiet-button label-text-toggle" title={labelText ? 'Show labels as color bars' : 'Show label names'} onclick={() => { labelText = !labelText; queueViewSave(); }}>{labelText ? 'Hide label text' : 'Show label text'}</button>{/if}{#if archivedCount}<button type="button" class:active={showArchived} class="quiet-button archive-toggle" onclick={() => { showArchived = !showArchived; queueViewSave(); }}>{showArchived ? "Hide archived" : "Show archived"}</button>{/if}{#if filtered}<button type="button" class="quiet-button clear-project-filters" onclick={clearFilters}>Clear</button>{/if}<details class="tag-manager"><summary>Manage tags</summary><div class="tag-manager-body"><div class="tag-cloud">{#each data.tags as tag}<span class="tag-chip" style={`--tag-color: ${tag.color}`}><span>{tag.name}</span>{#if data.canEdit && !isDefaultTag(tag.id)}<form method="POST" action="?/deleteTag"><input type="hidden" name="id" value={tag.id} /><button type="submit" aria-label={`Remove ${tag.name} tag`} title="Remove tag"><X /></button></form>{/if}</span>{/each}</div>{#if data.canEdit}<form method="POST" action="?/createTag" class="tag-create-form"><input name="name" maxlength="32" placeholder="New tag" aria-label="New tag name" required /><select name="color" aria-label="New tag color">{#each tagPalette as palette}<option value={palette.color}>{palette.name}</option>{/each}</select><button type="submit">Create tag</button></form>{/if}</div></details></div></div>

  {#if boardCards.length === 0}
    <section class="project-empty-intro"><img src="/assets/illustrations/organizing-projects.svg" alt="" /><div><p class="eyebrow">EMPTY SLATE</p><h2>Nothing is stuck here yet.</h2><p class="subtitle">This board has {data.lanes.length} lanes from your template. Add one small, concrete card and the empty state will disappear.</p></div></section>
  {:else if visibleCards.length === 0}
    <section class="project-filter-empty"><p class="eyebrow">NO MATCHES</p><h2>Nothing matches this view.</h2><p class="subtitle">Try a different search or priority, or clear the filters to see every saved card.</p><button type="button" class="quiet-button" onclick={clearFilters}>Clear filters</button></section>
  {/if}

  {#if boardCards.length === 0 || visibleCards.length > 0}<section class:project-board-compact={compactBoard} class="project-board" aria-label={`${data.project.name} workflow`}>
    {#each data.lanes as lane, index}
      {@const laneCards = cardsFor(lane)}
      {@const wipLimit = data.wipLimits[lane]}
      {@const overWip = Boolean(wipLimit && laneCards.filter((card) => !card.archived).length > wipLimit)}
      <section id={laneId(lane)} role="list" aria-label={`${lane} lane`} class:collapsed={collapsed[lane]} class:drop-target={dropTargetLane === lane && !dropTargetCardId} class:lane-drop-target={dropTargetLaneHeader === lane} class:project-column-backlog={index === 0} class="project-column" ondragenter={() => { dropTargetLane = lane; dropTargetCardId = ''; }} ondragover={(event) => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; }} ondrop={(event) => dropCard(lane, '', event)}>
        <h2 draggable={data.canEdit && renamingLane !== lane} ondragstart={(event) => startLaneDrag(lane, event)} ondragend={() => { draggedLane = ''; dropTargetLaneHeader = ''; }} ondragenter={(event) => { if (draggedLane) { event.stopPropagation(); dropTargetLaneHeader = lane; } }} ondragover={(event) => { if (draggedLane) { event.preventDefault(); event.stopPropagation(); } }} ondrop={(event) => { if (draggedLane) { event.preventDefault(); event.stopPropagation(); void dropLane(lane); } }} title={data.canEdit ? 'Drag to reorder lists' : undefined}>
          {#if renamingLane === lane}
            <input class="lane-rename-input" bind:value={renameDraft} maxlength="48" aria-label={`Rename ${lane}`} use:focusOnMount onblur={submitRenameLane} onkeydown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submitRenameLane(); } if (event.key === 'Escape') renamingLane = null; }} />
          {:else}
            <span>{lane}<small class:over-wip={overWip} aria-label={`${laneCards.length} ${laneCards.length === 1 ? 'card' : 'cards'}${wipLimit ? ` of ${wipLimit} limit` : ''}${overWip ? ', over limit' : ''}`}>{laneCards.length}{#if wipLimit}/{wipLimit}{/if}</small></span>
          {/if}
          <span class="lane-header-actions"><details class="lane-menu"><summary aria-label={`More actions for ${lane}`}><MoreHorizontal /></summary><div class="lane-menu-body">{#if data.canEdit && !data.sourceOwned}<button type="button" onclick={() => { composerLane = lane; }}><Plus /> Add card</button>{/if}<button type="button" onclick={() => toggleLane(lane)}>{collapsed[lane] ? 'Expand list' : 'Collapse list'}</button>{#if data.canEdit}<hr /><span class="lane-menu-label">Sort by</span><button type="button" onclick={() => sortLane(lane, 'name')}>Name</button><button type="button" onclick={() => sortLane(lane, 'due')}>Due date</button><button type="button" onclick={() => sortLane(lane, 'priority')}>Priority</button><button type="button" onclick={() => sortLane(lane, 'created')}>Date created</button><hr /><label class="lane-menu-select">Move all to <select value="" onchange={(event) => { void submitMoveAll(lane, event.currentTarget.value); event.currentTarget.value = ''; }}><option value="" disabled>Choose a list…</option>{#each data.lanes.filter((option) => option !== lane) as option}<option value={option}>{option}</option>{/each}</select></label><button type="button" onclick={() => submitArchiveAll(lane)}>Archive all cards</button>{#if !data.sourceOwned}<button type="button" onclick={() => { copyingLane = lane; copyDraft = `${lane} copy`; }}>Copy list</button>{/if}<button type="button" onclick={() => { renamingLane = lane; renameDraft = lane; }}>Rename list</button><button type="button" onclick={() => { wipEditingLane = lane; wipDraft = wipLimit ? String(wipLimit) : ''; }}>Set WIP limit</button>{#if !data.sourceOwned && data.templates[lane]?.length}<hr /><span class="lane-menu-label">New from template</span>{#each data.templates[lane] as template (template.id)}<div class="lane-menu-template-row"><button type="button" onclick={() => submitCreateFromTemplate(lane, template.id)}>{template.name}</button><button type="button" class="icon-only" aria-label={`Remove template ${template.name}`} title="Remove template" onclick={() => submitDeleteTemplate(lane, template.id, template.name)}><X /></button></div>{/each}{/if}<hr /><button type="button" onclick={() => { addingListAfter = lane; addListDraft = ''; }}><Plus /> Add list after this one</button>{/if}</div></details><button class="collapse-button" type="button" aria-expanded={!collapsed[lane]} aria-label={`${collapsed[lane] ? 'Expand' : 'Collapse'} ${lane}`} onclick={() => toggleLane(lane)}>{#if collapsed[lane]}<Plus />{:else}<Minus />{/if}</button></span>
        </h2>
        {#if copyingLane === lane}<form class="lane-inline-form" onsubmit={(event) => { event.preventDefault(); void submitCopyLane(); }}><input bind:value={copyDraft} maxlength="48" aria-label="New list name" use:focusOnMount /><button type="submit">Copy</button><button type="button" class="quiet-button" onclick={() => { copyingLane = null; }}>Cancel</button></form>{/if}
        {#if wipEditingLane === lane}<form class="lane-inline-form" onsubmit={(event) => { event.preventDefault(); void submitWipLimit(); }}><input type="number" min="1" max="999" bind:value={wipDraft} placeholder="No limit" aria-label={`WIP limit for ${lane}`} use:focusOnMount /><button type="submit">Save</button><button type="button" class="quiet-button" onclick={() => { wipEditingLane = null; }}>Cancel</button></form>{/if}
        {#if addingListAfter === lane}<form class="lane-inline-form" onsubmit={(event) => { event.preventDefault(); void submitAddLane(); }}><input bind:value={addListDraft} maxlength="48" placeholder="List name" aria-label="New list name" use:focusOnMount /><button type="submit">Add</button><button type="button" class="quiet-button" onclick={() => { addingListAfter = null; }}>Cancel</button></form>{/if}
        {#if !collapsed[lane]}
          {#if data.canEdit && !data.sourceOwned && laneCards.length > 0}<button type="button" class="add-card-button add-card-top" onclick={() => { composerLane = lane; }}><Plus /> Add a card</button>{/if}
          <div class="project-column-cards">
            {#each laneCards as card}
              <div role="listitem" class:dragging={draggedCardId === card.id} class:drop-target={dropTargetCardId === card.id} class="project-card-shell" draggable={data.canEdit} onpointerenter={() => { hoveredCardId = card.id; }} onpointerleave={() => { if (hoveredCardId === card.id) hoveredCardId = ''; }} ondragstart={(event) => startDrag(card, event)} ondragend={() => { draggedCardId = ''; dropTargetLane = ''; dropTargetCardId = ''; }} ondragenter={(event) => { event.stopPropagation(); dropTargetLane = card.lane; dropTargetCardId = card.id; }} ondragover={(event) => { event.preventDefault(); event.stopPropagation(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; }} ondrop={(event) => { event.stopPropagation(); dropCard(card.lane, card.id, event); }}><a aria-label={`${card.title}, ${card.priority} priority`} href={`?card=${encodeURIComponent(card.id)}`} class:archived={card.archived} class="project-card">{#if card.coverColor?.startsWith('/')}<div class="card-cover card-cover-image" style={`background-image: url("${card.coverColor}")`} aria-hidden="true"></div>{:else if card.coverColor}<div class="card-cover" style={`--cover-color: ${card.coverColor}`} aria-hidden="true"></div>{/if}<div class="project-card-heading"><strong>{card.title}</strong><span class="priority-badge" class:priority-low={card.priority === 'low'} class:priority-high={card.priority === 'high'} class:priority-urgent={card.priority === 'urgent'}>{card.priority}</span></div>{#if card.tags.length}<div class="project-card-tags" class:project-card-tags-compact={!labelText}>{#each card.tags as tag}<span class="tag-chip" class:tag-chip-compact={!labelText} style={`--tag-color: ${tag.color}`} aria-label={!labelText ? tag.name : undefined} title={!labelText ? tag.name : undefined}>{#if labelText}{tag.name}{/if}</span>{/each}</div>{/if}{#if card.checklist.length}{@const checklistDone = card.checklist.filter((item) => item.done).length}<div class="checklist-summary" class:checklist-complete={checklistDone === card.checklist.length} aria-label={`${checklistDone} of ${card.checklist.length} checklist items complete`}><span><Check /> {checklistDone}/{card.checklist.length}</span><progress max={card.checklist.length} value={checklistDone}></progress></div>{/if}{#if card.archived}<span class="archived-badge">Archived</span>{/if}{#if card.dueComplete}<span class="due-complete-badge" aria-label="Due date complete"><CheckCircle2 /> Done</span>{/if}<div class="project-card-meta"><span class="card-number" aria-hidden="true">#{card.cardNumber}</span>{#if card.owner}<span class="card-owner"><Avatar name={card.owner} size="sm" /><span class="sr-only">{card.owner}</span></span>{:else}<span>Unassigned</span>{/if}{#if card.startDate && card.dueDate}<span class={`due-date due-${dueState(card.dueDate)}`} class:due-complete={card.dueComplete} aria-label={`${dueLabel(card.startDate)} to ${dueLabel(card.dueDate)}${card.dueComplete ? ', complete' : ''}`}><CalendarDays /> {dueLabel(card.startDate)} – {dueLabel(card.dueDate)}</span>{:else}{#if card.startDate}<span class="start-date" aria-label={`Starts ${dueLabel(card.startDate)}`}><CalendarDays /> {dueLabel(card.startDate)}</span>{/if}{#if card.dueDate}<span class={`due-date due-${dueState(card.dueDate)}`} class:due-complete={card.dueComplete}>Due {dueLabel(card.dueDate)}</span>{/if}{/if}{#if card.details}<span class="badge-description" aria-label="Has a description" title="Has a description"><FileText /></span>{/if}{#if card.attachmentCount}<span aria-label={`${card.attachmentCount} attachments`} title={`${card.attachmentCount} attachments`}><Paperclip /> {card.attachmentCount}</span>{/if}{#if card.watcherCount}<span class:watching={card.watching} aria-label={`${card.watcherCount} watchers`}><Eye /> {card.watcherCount}</span>{/if}{#if commentsFor(card.id).length}<span aria-label={`${commentsFor(card.id).length} comments`}><MessageSquare /> {commentsFor(card.id).length}</span>{/if}{#if data.canEdit}<span class="drag-hint"><GripVertical /> Drag to move</span>{/if}</div></a><details class="card-quick-menu"><summary aria-label={`Quick actions for ${card.title}`}><MoreHorizontal /></summary><div class="card-quick-menu-body"><button type="button" onclick={() => copyCardLink(card.id)}>Copy link</button>{#if data.username && data.username !== 'anonymous'}<form method="POST" action="?/toggleWatch"><input type="hidden" name="id" value={card.id} /><input type="hidden" name="watching" value={String(!card.watching)} /><button type="submit">{card.watching ? 'Unwatch' : 'Watch'}</button></form>{/if}{#if data.canEdit}<div class="card-move-form"><label>Move to <select value={card.lane} onchange={(event) => quickMove(card, event.currentTarget.value)}>{#each data.lanes as option}<option value={option}>{option}</option>{/each}</select></label></div>{#if !data.sourceOwned}<button type="button" onclick={() => quickAssign(card)}>{card.owner === data.username ? 'Unassign me' : 'Assign to me'}</button><form method="POST" action="?/duplicateCard"><input type="hidden" name="id" value={card.id} /><button type="submit">Duplicate</button></form><button type="button" onclick={() => submitSaveAsTemplate(card)}>Save as template</button>{/if}<button type="button" onclick={() => { if (card.archived) quickArchive(card, false); else if (confirm('Archive this card?')) quickArchive(card, true); }}>{card.archived ? 'Restore' : 'Archive'}</button>{/if}</div></details></div>
            {:else}<div class="project-column-empty"><strong>{draggedCardId && dropTargetLane === lane ? 'Drop card here' : filtered ? 'No matching cards' : index === 0 ? 'Add the first card' : 'Ready when you are'}</strong><p>{draggedCardId && dropTargetLane === lane ? 'Release to move this card into the column.' : filtered ? 'Clear the filters or keep this lane focused.' : index === 0 ? 'Capture one outcome, request, or question.' : 'Cards will collect here as work moves forward.'}</p></div>{/each}
          </div>
          {#if data.canEdit && !data.sourceOwned}
            {#if composerLane === lane}<form method="POST" action="?/createCard" class="card-composer" use:enhanceComposer={{ lane }}><label>Title <textarea name="title" rows="1" maxlength="160" required placeholder="What needs to move? (Enter to save, Shift+Enter for a new line, one line per card)" onkeydown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } if (event.key === 'Escape') composerLane = null; }}></textarea></label><label>Details <textarea name="details" rows="3" maxlength={PROJECT_CARD_DETAILS_LIMIT} placeholder="Outcome, context, or next check"></textarea></label><div class="card-form-grid"><label>Owner <input name="owner" list="project-members" maxlength="120" placeholder="Optional" /></label><label>Priority <select name="priority"><option value="normal">Normal</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></select></label></div><label>Due date <input name="dueDate" type="date" /></label><input type="hidden" name="lane" value={lane} /><fieldset class="tag-picker"><legend>Tags</legend><div class="tag-options">{#each data.tags as option}<label><input type="checkbox" name="tagId" value={option.id} /><span class="tag-chip" style={`--tag-color: ${option.color}`}>{option.name}</span></label>{/each}</div></fieldset><div class="card-actions"><button type="submit">Save card</button><button class="quiet-button" type="button" onclick={() => { composerLane = null; }}>Cancel</button></div></form>{:else}<button type="button" class="add-card-button" onclick={() => { composerLane = lane; }}><Plus /> Add card</button>{/if}
          {/if}
        {/if}
      </section>
    {/each}
    {#if data.canEdit && data.lanes.length < 8}
      <section class="project-column project-column-add-list">
        {#if addingListAfter === '__end__'}<form class="lane-inline-form" onsubmit={(event) => { event.preventDefault(); void submitAddLane(); }}><input bind:value={addListDraft} maxlength="48" placeholder="List name" aria-label="New list name" use:focusOnMount /><button type="submit">Add list</button><button type="button" class="quiet-button" onclick={() => { addingListAfter = null; }}>Cancel</button></form>{:else}<button type="button" class="add-list-button" onclick={() => { addingListAfter = '__end__'; addListDraft = ''; }}><Plus /> Add another list</button>{/if}
      </section>
    {/if}
  </section>{/if}

  {#if editingCard}
    <div class="modal-backdrop" role="presentation" onclick={(event) => { if (event.currentTarget === event.target) closeEditor(); }}></div>
    <dialog open class="card-editor-modal" aria-labelledby="card-editor-title">
      <section class="card-editor-overview" aria-label="Card summary"><span class={`card-editor-state priority-${editingCard.priority}`}>{editingCard.priority}</span><span class="card-editor-lane">{editingCard.lane}</span>{#if editingCard.owner}<span class="card-owner"><Avatar name={editingCard.owner} size="sm" />{editingCard.owner}</span>{:else}<span>Unassigned</span>{/if}{#if editingCard.startDate}<span class="start-date">Starts {dueLabel(editingCard.startDate)}</span>{/if}{#if editingCard.dueDate}<span class={`due-date due-${dueState(editingCard.dueDate)}`} class:due-complete={editingCard.dueComplete}>Due {dueLabel(editingCard.dueDate)}{editingCard.dueComplete ? ' · complete' : ''}</span>{/if}{#if editingCard.checklist.length}{@const editChecklistDone = editingCard.checklist.filter((item) => item.done).length}<span class="checklist-summary-inline" class:checklist-complete={editChecklistDone === editingCard.checklist.length}><Check /> {editChecklistDone}/{editingCard.checklist.length}</span>{/if}<span>{commentsFor(editingCard.id).length} {commentsFor(editingCard.id).length === 1 ? 'comment' : 'comments'}</span></section>
      <nav class="card-action-rail" aria-label="Card sections"><a href="#card-editor-form">Description & details</a><a href="#card-checklist">Checklist</a><a href="#card-attachments">Attachments</a><a href="#card-comments-title">Comments</a><a href={`/projects/${data.project.slug}/files`}><Cloud /> Cloud</a></nav>
      <div class="modal-heading"><div><p class="eyebrow">EDIT CARD{#if data.sourceOwned}<span class="source-lock-chip" title="Title, description, checklist text, owner, priority, and cover are synced from UNITY_PLAN.md."><Lock /> synced</span>{/if}</p><h2 id="card-editor-title">{editingCard.title} <span class="card-number">#{editingCard.cardNumber}</span></h2><p class="subtitle">{data.sourceOwned ? 'Lane, dates, comments, attachments, and checklist ticks are saved here; everything else comes from the plan file.' : 'Changes are saved only when you confirm.'}</p></div><div class="modal-heading-actions"><button type="submit" form="card-editor-form" class="quiet-button watch-button" formaction="?/toggleWatch" name="watching" value={String(!editingCard.watching)}><Eye /> {editingCard.watching ? 'Watching' : 'Watch'}</button><button type="button" class="quiet-button" onclick={() => copyCardLink(editingCard.id)}>Copy link</button><button type="button" class="quiet-button icon-only" aria-label="Close card editor" onclick={closeEditor}><X /></button></div></div>
      <form method="POST" action="?/updateCard" class="card-edit-form" id="card-editor-form">
        <input type="hidden" name="id" value={editingCard.id} /><input type="hidden" name="cardArchived" value={String(editingCard.archived)} />
        <label>Title <input name="title" value={editingCard.title} maxlength="160" required readonly={data.sourceOwned} aria-readonly={data.sourceOwned} /></label>
        <div class="card-description-field">
          <span class="field-label">Details</span>
          {#if data.sourceOwned}
            <div class="markdown-preview-block">{#if editingCard.details}{@html renderMarkdown(editingCard.details)}{:else}<p class="empty">No description.</p>{/if}</div>
          {:else if editingDescription}
            <textarea name="details" rows="6" maxlength={PROJECT_CARD_DETAILS_LIMIT} placeholder="Outcome, context, or next check — Markdown supported" onblur={() => { editingDescription = false; }} use:focusOnMount>{editingCard.details}</textarea>
          {:else}
            <div class="description-preview" role="button" tabindex="0" onclick={() => { editingDescription = true; }} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); editingDescription = true; } }}>{#if editingCard.details}{@html renderMarkdown(editingCard.details)}{:else}<span class="empty">Click to add a description…</span>{/if}</div>
          {/if}
        </div>
        <div class="card-form-grid"><label>Owner <input name="owner" list="project-members" value={editingCard.owner} maxlength="120" readonly={data.sourceOwned} aria-readonly={data.sourceOwned} /></label><label>Lane <select name="lane">{#each data.lanes as option}<option value={option} selected={option === editingCard.lane}>{option}</option>{/each}</select></label></div>
        <div class="card-form-grid"><label>Priority <select name="priority" disabled={data.sourceOwned}><option value="low" selected={editingCard.priority === 'low'}>Low</option><option value="normal" selected={editingCard.priority === 'normal'}>Normal</option><option value="high" selected={editingCard.priority === 'high'}>High</option><option value="urgent" selected={editingCard.priority === 'urgent'}>Urgent</option></select></label><label>Start date <input name="startDate" type="date" value={editingCard.startDate ?? ''} /></label></div>
        <div class="card-form-grid"><label>Due date <input name="dueDate" type="date" value={editingCard.dueDate ?? ''} /></label><label class="due-complete-field"><input type="checkbox" name="dueComplete" value="true" checked={editingCard.dueComplete} /> Due date complete</label></div>
        <fieldset class="tag-picker"><legend>Labels</legend><div class="tag-options">{#each data.tags as option}<label><input type="checkbox" name="tagId" value={option.id} checked={editingCard.tags.some((tag) => tag.id === option.id)} /><span class="tag-chip" style={`--tag-color: ${option.color}`}>{option.name}</span></label>{/each}</div></fieldset>
        <fieldset class="cover-picker" disabled={data.sourceOwned}><legend>Card cover</legend><div class="cover-options"><label><input type="radio" name="coverColor" value="" checked={!editingCard.coverColor} /><span class="cover-swatch cover-none">None</span></label>{#each ['#5E9CFF', '#9B8AFB', '#F08FC0', '#F4B860', '#68D6A4', '#55C2C9'] as color}<label><input type="radio" name="coverColor" value={color} checked={editingCard.coverColor === color} /><span class="cover-swatch" style={`--cover-color: ${color}`} aria-label={`Use ${color} cover`}></span></label>{/each}{#each attachmentsFor(editingCard.id).filter((attachment) => attachment.mimeType.startsWith('image/')) as attachment}<label><input type="radio" name="coverColor" value={attachment.url} checked={editingCard.coverColor === attachment.url} /><span class="cover-swatch cover-swatch-image" style={`background-image: url("${attachment.url}")`} aria-label={`Use ${attachment.name} as cover`}></span></label>{/each}</div>{#if attachmentsFor(editingCard.id).some((attachment) => attachment.mimeType.startsWith('image/'))}<p class="field-help">Attach an image below to add it here as a full cover.</p>{/if}</fieldset>
        <fieldset id="card-checklist" class="checklist-editor"><legend>Checklist <small>{editingCard.checklist.filter((item) => item.done).length}/{editingCard.checklist.length} complete</small></legend>{#each editingCard.checklist as item}<div class="checklist-edit-row"><input type="hidden" name="checkItemId" value={item.id} /><input class="checklist-done" type="checkbox" name="checkItemDone" value={item.id} checked={item.done} aria-label={`Complete ${item.text}`} /><input name="checkItemText" value={item.text} maxlength="240" aria-label="Checklist item" readonly={data.sourceOwned} aria-readonly={data.sourceOwned} /></div>{/each}{#if !data.sourceOwned}<div class="checklist-edit-row checklist-new-row"><input type="hidden" name="checkItemId" value="new" /><span class="checklist-new-marker" aria-hidden="true"><Plus /></span><input name="checkItemText" maxlength="240" placeholder="Add a checklist item" aria-label="New checklist item" /></div>{/if}</fieldset>
        <div class="modal-actions"><button type="button" class="quiet-button" onclick={closeEditor}>Cancel</button><button type="submit">Confirm changes</button>{#if !data.sourceOwned}<button type="submit" class="quiet-button" formaction="?/duplicateCard" name="id" value={editingCard.id}>Duplicate</button><button type="button" class="quiet-button" onclick={() => submitSaveAsTemplate(editingCard)}>Save as template</button>{/if}<button type="button" class="quiet-button danger" onclick={() => { const next = !editingCard.archived; if (next && !confirm('Archive this card?')) return; quickArchive(editingCard, next); closeEditor(); }}>{editingCard.archived ? 'Restore' : 'Archive'}</button>{#if !data.sourceOwned}<button type="submit" class="quiet-button danger" formaction="?/deleteCard" onclick={(event) => { if (!confirm('Delete this card?')) event.preventDefault(); }}>Delete</button>{/if}</div>
      </form>
      <section id="card-attachments" class="card-attachments" aria-labelledby="card-attachments-title"><div class="card-comments-heading"><h3 id="card-attachments-title">Attachments</h3><span>{attachmentsFor(editingCard.id).length}</span></div>{#if attachmentsFor(editingCard.id).length}<ul class="card-attachment-list">{#each attachmentsFor(editingCard.id) as attachment}<li>{#if attachment.mimeType.startsWith('image/')}<img class="attachment-thumb" src={attachment.url} alt="" loading="lazy" />{:else}<span class="attachment-icon" aria-hidden="true"><FileIcon /></span>{/if}<a href={attachment.url} target="_blank" rel="noopener noreferrer">{attachment.name}</a><span class="attachment-meta">{formatBytes(attachment.size)}</span>{#if data.canEdit}<button type="button" class="comment-delete icon-only" aria-label={`Remove ${attachment.name}`} onclick={() => { if (confirm('Remove this attachment?')) void removeAttachment(attachment); }}><X /></button>{/if}</li>{/each}</ul>{:else}<p class="comment-empty">No files attached yet.</p>{/if}{#if data.canEdit}<label class="attachment-upload"><input type="file" onchange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadAttachment(editingCard.id, file); event.currentTarget.value = ''; }} /><Paperclip /> Attach a file{#if attachmentUploadStatus} · {attachmentUploadStatus}{/if}</label>{/if}</section>
      <section class="card-comments" aria-labelledby="card-comments-title"><div class="card-comments-heading"><h3 id="card-comments-title">Comments</h3><span>{commentsFor(editingCard.id).length}</span></div>{#if commentsFor(editingCard.id).length}<ol class="card-comment-list">{#each commentsFor(editingCard.id) as comment}<li><div><Avatar name={comment.author} size="sm" /><strong>{comment.author}</strong><time datetime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time>{#if data.canEdit && (comment.author === data.username || ['superadmin', 'admin'].includes(data.role))}<form method="POST" action="?/deleteComment"><input type="hidden" name="id" value={comment.id} /><button type="submit" class="comment-delete icon-only" aria-label="Delete comment"><X /></button></form>{/if}</div>{#if commentText(comment.body)}<div class="comment-body">{@html renderMarkdown(commentText(comment.body))}</div>{/if}{#each commentImages(comment.body) as image}<img class="comment-attachment" src={image.url} alt={image.alt} loading="lazy" />{/each}</li>{/each}</ol>{:else}<p class="comment-empty">No comments yet. Leave context for the next person.</p>{/if}{#if data.canEdit}<form method="POST" action="?/createComment" class="comment-form"><input type="hidden" name="cardId" value={editingCard.id} /><textarea bind:value={commentDraft} onpaste={uploadCommentImage} name="body" rows="3" maxlength="4000" placeholder="Add a decision, update, or handoff note… Markdown supported, paste a screenshot here" required></textarea><small class="comment-paste-help">Paste a screenshot directly into this box to attach it to the project drive.{#if commentUploadStatus} {commentUploadStatus}{/if}</small><button type="submit">Add comment</button></form>{/if}</section>
      <section class="card-activity" aria-labelledby="card-activity-title"><div class="card-comments-heading"><h3 id="card-activity-title">Activity</h3><span>{activityFor(editingCard.id).length}</span></div>{#if activityFor(editingCard.id).length}<ol>{#each activityFor(editingCard.id) as entry}<li><span class="activity-dot" aria-hidden="true"></span><div><strong>{entry.action}</strong><p>{entry.summary}</p><time datetime={entry.createdAt}>{entry.actor || 'System'} · {new Date(entry.createdAt).toLocaleString()}</time></div></li>{/each}</ol>{:else}<p class="comment-empty">Card activity will appear here as the work changes.</p>{/if}</section>
    </dialog>
  {/if}

  {#if toast}<div class="board-toast" role="status"><span>{toast.message}</span>{#if toast.undo}<button type="button" onclick={() => { toast?.undo?.(); toast = null; }}>Undo</button>{/if}</div>{/if}

  {#if showShortcutHelp}
    <div class="modal-backdrop" role="presentation" onclick={() => { showShortcutHelp = false; }}></div>
    <dialog open class="shortcut-help-modal" aria-labelledby="shortcut-help-title">
      <div class="modal-heading"><div><h2 id="shortcut-help-title">Keyboard shortcuts</h2></div><button type="button" class="quiet-button icon-only" aria-label="Close shortcut help" onclick={() => { showShortcutHelp = false; }}><X /></button></div>
      <dl class="shortcut-list">
        <div><dt>/</dt><dd>Focus search</dd></div>
        <div><dt>n</dt><dd>Add a card in the first open list</dd></div>
        <div><dt>q</dt><dd>Toggle "my cards" filter</dd></div>
        <div><dt>x</dt><dd>Clear all filters</dd></div>
        <div><dt>v</dt><dd>Board appearance (theme, cards, density)</dd></div>
        <div><dt>Esc</dt><dd>Close the open card or composer</dd></div>
        <div><dt>?</dt><dd>Show this help</dd></div>
      </dl>
      <p class="shortcut-hover-heading">Point at a card, then:</p>
      <dl class="shortcut-list">
        <div><dt>space</dt><dd>Assign/unassign yourself</dd></div>
        <div><dt>c</dt><dd>Archive</dd></div>
        <div><dt>, / .</dt><dd>Move to the previous / next list</dd></div>
        <div><dt>s</dt><dd>Watch/unwatch</dd></div>
        <div><dt>l / d</dt><dd>Open the card (for labels / due date)</dd></div>
      </dl>
      <p class="subtitle">Shortcuts are inert while typing in a field. Every shortcut also has a menu you can click instead.</p>
    </dialog>
  {/if}

  {#if boardCards.length}<section class="project-next-steps"><div><strong>Keep the board honest</strong><p>Give each card an outcome and owner, then move it only when the evidence is ready.</p></div><a class="quiet-button" href={`/projects/${data.project.slug}/settings`}>Edit lanes and appearance</a></section>{/if}

  {#if showActivityPanel || showArchiveBrowser}<div class="side-panel-backdrop" role="presentation" onclick={() => { showActivityPanel = false; showArchiveBrowser = false; }}></div>{/if}

  {#if showActivityPanel}
    <aside class="side-panel" aria-label="Board activity">
      <div class="side-panel-heading"><h2>Activity</h2><button type="button" class="quiet-button icon-only" aria-label="Close activity panel" onclick={() => { showActivityPanel = false; }}><X /></button></div>
      {#if data.activity.length}<ol class="side-panel-activity">{#each data.activity as entry}<li><span class="activity-dot" aria-hidden="true"></span><div><strong>{entry.action}</strong><p>{entry.summary}</p><time datetime={entry.createdAt}>{entry.actor || 'System'} · {new Date(entry.createdAt).toLocaleString()}</time></div></li>{/each}</ol>{:else}<p class="comment-empty">Nothing has happened on this board yet.</p>{/if}
    </aside>
  {/if}

  {#if showArchiveBrowser}
    {@const archivedCards = boardCards.filter((card) => card.archived)}
    <aside class="side-panel" aria-label="Archived cards">
      <div class="side-panel-heading"><h2>Archive <span>{archivedCards.length}</span></h2><button type="button" class="quiet-button icon-only" aria-label="Close archive browser" onclick={() => { showArchiveBrowser = false; }}><X /></button></div>
      {#if archivedCards.length}
        <ul class="side-panel-archive">
          {#each archivedCards as card (card.id)}
            <li><div><strong>{card.title}</strong><span>{card.lane}</span></div><div class="side-panel-archive-actions"><a class="quiet-button" href={`?card=${encodeURIComponent(card.id)}`} onclick={() => { showArchiveBrowser = false; }}>Open</a>{#if data.canEdit}<button type="button" class="quiet-button" onclick={() => quickArchive(card, false)}>Restore</button>{#if !data.sourceOwned}<form method="POST" action="?/deleteCard"><input type="hidden" name="id" value={card.id} /><button type="submit" class="quiet-button danger" onclick={(event) => { if (!confirm('Delete this card permanently?')) event.preventDefault(); }}>Delete</button></form>{/if}{/if}</div></li>
          {/each}
        </ul>
      {:else}
        <p class="comment-empty">No archived cards. Archive a card from its ••• menu and it will show up here for easy restore.</p>
      {/if}
    </aside>
  {/if}
</main>
