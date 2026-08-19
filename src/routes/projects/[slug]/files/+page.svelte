<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import MarkdownEditor from '$lib/components/MarkdownEditor.svelte';
  import type { BoardProject, ProjectActivity, ProjectFile, ProjectFolder } from '$lib/types';
  import ArrowUpToLine from '@lucide/svelte/icons/arrow-up-to-line';
  import History from '@lucide/svelte/icons/history';
  import House from '@lucide/svelte/icons/house';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Plus from '@lucide/svelte/icons/plus';
  import Folder from '@lucide/svelte/icons/folder';
  import List from '@lucide/svelte/icons/list';
  import Grid3x3 from '@lucide/svelte/icons/grid-3x3';
  import LayoutList from '@lucide/svelte/icons/layout-list';
  import Image from '@lucide/svelte/icons/image';
  import FileText from '@lucide/svelte/icons/file-text';
  import Music from '@lucide/svelte/icons/music';
  import Video from '@lucide/svelte/icons/video';
  import Archive from '@lucide/svelte/icons/archive';
  import FileType from '@lucide/svelte/icons/file-type';
  import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
  import Presentation from '@lucide/svelte/icons/presentation';
  import Box from '@lucide/svelte/icons/box';
  import Type from '@lucide/svelte/icons/type';
  import Database from '@lucide/svelte/icons/database';
  import Braces from '@lucide/svelte/icons/braces';
  import Settings from '@lucide/svelte/icons/settings';
  import Code from '@lucide/svelte/icons/code';
  import Hash from '@lucide/svelte/icons/hash';
  import FileIcon from '@lucide/svelte/icons/file';

  let { data, form }: { data: { project: BoardProject; files: ProjectFile[]; folders: ProjectFolder[]; selected: ProjectFile | null; activity: ProjectActivity[]; canEdit: boolean; username: string }; form?: { message?: string; error?: string; fileId?: string } } = $props();
  type ViewMode = 'list' | 'grid' | 'item';
  type SortMode = 'modified-desc' | 'modified-asc' | 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc';
  let activeId = $state('');
  let serverSelectedId = $state<string | null>(null);
  let serverSelectedPath = $state('');
  let draftPath = $state('notes/overview.md');
  let movePath = $state('');
  let draftContent = $state('# New project note\n\n');
  let uploadPath = $state('');
  let search = $state('');
  let activeFolder = $state('Root');
  let dragActive = $state(false);
  let uploadStatus = $state('');
  let saveForm = $state<HTMLFormElement>();
  let viewMode = $state<ViewMode>('list');
  let sortMode = $state<SortMode>('modified-desc');
  let showRecent = $state(false);
  let showAll = $state(false);

  onMount(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`project-drive:${data.project.slug}`) ?? '{}') as { view?: ViewMode; sort?: SortMode; folder?: string };
      if (saved.view && ['list', 'grid', 'item'].includes(saved.view)) viewMode = saved.view;
      if (saved.sort && ['modified-desc', 'modified-asc', 'name-asc', 'name-desc', 'size-desc', 'size-asc'].includes(saved.sort)) sortMode = saved.sort;
      if (saved.folder && folderPaths.includes(saved.folder)) activeFolder = saved.folder;
    } catch { /* a stale preference should never prevent the drive from opening */ }
  });

  $effect(() => {
    const selected = data.selected;
    const selectedId = selected?.id ?? '';
    if (selectedId !== serverSelectedId && activeId !== 'new') {
      serverSelectedId = selectedId;
      serverSelectedPath = selected?.path ?? '';
      activeId = selectedId;
      draftPath = selected?.path ?? 'notes/overview.md';
      movePath = selected?.path ?? '';
      draftContent = selected?.content ?? '# New project note\n\n';
      if (selected) activeFolder = selected.path.includes('/') ? selected.path.split('/').slice(0, -1).join('/') : 'Root';
    } else if (selected && selected.id === activeId && selected.path !== serverSelectedPath) {
      serverSelectedPath = selected.path;
      draftPath = selected.path;
      movePath = selected.path;
      activeFolder = selected.path.includes('/') ? selected.path.split('/').slice(0, -1).join('/') : 'Root';
    }
  });

  const isNew = $derived(activeId === 'new');
  const activeFile = $derived(data.files.find((file) => file.id === activeId) ?? null);
  const folderPaths = $derived(['Root', ...new Set([...data.folders.map((folder) => folder.path), ...data.files.flatMap((file) => {
    const segments = file.path.split('/').slice(0, -1);
    return segments.map((_, index) => segments.slice(0, index + 1).join('/'));
  })])].toSorted());
  const childFolders = $derived(folderPaths.filter((folder) => folder !== 'Root' && (folder.includes('/') ? folder.split('/').slice(0, -1).join('/') : 'Root') === activeFolder));
  const folderTrail = $derived(activeFolder === 'Root' ? [] : activeFolder.split('/').map((_, index, parts) => parts.slice(0, index + 1).join('/')));
  const totalBytes = $derived(data.files.reduce((total, file) => total + file.size, 0));
  const recentFiles = $derived(data.files.toSorted((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()).slice(0, 8));
  const visibleFiles = $derived((showRecent ? recentFiles : data.files).filter((file) => {
    const folder = file.path.includes('/') ? file.path.split('/').slice(0, -1).join('/') : 'Root';
    const needle = search.trim().toLowerCase();
    return (showRecent || showAll || needle ? true : folder === activeFolder) && (!needle || `${file.path} ${file.mimeType}`.toLowerCase().includes(needle));
  }).toSorted((left, right) => {
    const leftName = left.path.split('/').at(-1)?.toLowerCase() ?? left.path;
    const rightName = right.path.split('/').at(-1)?.toLowerCase() ?? right.path;
    if (sortMode === 'name-asc') return leftName.localeCompare(rightName);
    if (sortMode === 'name-desc') return rightName.localeCompare(leftName);
    if (sortMode === 'size-asc') return left.size - right.size || leftName.localeCompare(rightName);
    if (sortMode === 'size-desc') return right.size - left.size || leftName.localeCompare(rightName);
    const dateDelta = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    return (sortMode === 'modified-asc' ? -dateDelta : dateDelta) || leftName.localeCompare(rightName);
  }));
  const isTextFile = $derived(!activeFile || activeFile.mimeType.startsWith('text/') || /\.(md|markdown|txt|json|ya?ml|csv|html|css|js|ts|svelte|dart|shader|frag|vert|uxml|uss)$/i.test(activeFile.path));
  const isImageFile = $derived(Boolean(activeFile?.mimeType.startsWith('image/')));

  function fileVisual(file: ProjectFile) {
    const extension = file.path.split('.').pop()?.toLowerCase() ?? '';
    if (file.mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'ico'].includes(extension)) return { label: 'IMG', Icon: Image, kind: 'image' };
    if (file.mimeType === 'application/pdf' || extension === 'pdf') return { label: 'PDF', Icon: FileText, kind: 'pdf' };
    if (file.mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(extension)) return { label: 'AUDIO', Icon: Music, kind: 'audio' };
    if (file.mimeType.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv'].includes(extension)) return { label: 'VIDEO', Icon: Video, kind: 'video' };
    if (['zip', 'tar', 'gz', '7z', 'rar'].includes(extension)) return { label: 'ZIP', Icon: Archive, kind: 'archive' };
    if (['doc', 'docx', 'rtf', 'odt'].includes(extension)) return { label: 'DOC', Icon: FileType, kind: 'document' };
    if (['xls', 'xlsx', 'ods'].includes(extension)) return { label: 'SHEET', Icon: FileSpreadsheet, kind: 'spreadsheet' };
    if (['ppt', 'pptx', 'odp', 'key'].includes(extension)) return { label: 'SLIDE', Icon: Presentation, kind: 'presentation' };
    if (['blend', 'fbx', 'obj', 'gltf', 'glb', 'unitypackage'].includes(extension)) return { label: '3D', Icon: Box, kind: 'model' };
    if (['woff', 'woff2', 'ttf', 'otf'].includes(extension)) return { label: 'FONT', Icon: Type, kind: 'font' };
    if (['db', 'sqlite', 'sqlite3'].includes(extension)) return { label: 'DB', Icon: Database, kind: 'database' };
    if (['json', 'yaml', 'yml', 'csv', 'xml', 'toml'].includes(extension)) return { label: 'DATA', Icon: Braces, kind: 'data' };
    if (['env', 'ini', 'conf', 'config'].includes(extension)) return { label: 'CONFIG', Icon: Settings, kind: 'config' };
    if (['js', 'ts', 'svelte', 'dart', 'shader', 'frag', 'vert', 'css', 'html', 'py', 'rs', 'go'].includes(extension)) return { label: 'CODE', Icon: Code, kind: 'code' };
    if (['md', 'markdown'].includes(extension)) return { label: 'MD', Icon: Hash, kind: 'markdown' };
    return { label: extension.slice(0, 5).toUpperCase() || 'FILE', Icon: FileIcon, kind: 'file' };
  }

  function fileSize(size: number) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function fileDate(value: string) { return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  function rememberDrivePreferences() {
    try { localStorage.setItem(`project-drive:${data.project.slug}`, JSON.stringify({ view: viewMode, sort: sortMode, folder: activeFolder })); } catch { /* preferences are optional */ }
  }
  function selectFolder(folder: string) { showRecent = false; showAll = false; activeFolder = folder; activeId = ''; rememberDrivePreferences(); }
  function selectRecent() { showRecent = true; showAll = false; activeFolder = 'Root'; activeId = ''; }
  function selectAllFiles() { showRecent = false; showAll = true; search = ''; activeFolder = 'Root'; rememberDrivePreferences(); }

  function startNewFile() {
    activeId = 'new';
    draftPath = activeFolder === 'Root' ? 'notes/new-note.md' : `${activeFolder}/new-note.md`;
    movePath = draftPath;
    draftContent = '# New note\n\n';
    history.replaceState({}, '', `${location.pathname}?file=new`);
  }

  function selectFile(file: ProjectFile) {
    showRecent = false;
    activeId = file.id;
    draftPath = file.path;
    movePath = file.path;
    draftContent = file.content;
    activeFolder = file.path.includes('/') ? file.path.split('/').slice(0, -1).join('/') : 'Root';
    history.replaceState({}, '', `${location.pathname}?file=${encodeURIComponent(file.id)}`);
  }

  function rawUrl(file: ProjectFile) { return `/projects/${data.project.slug}/files/raw?path=${encodeURIComponent(file.path)}`; }

  async function copyText(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      uploadStatus = message;
    } catch {
      uploadStatus = 'Copy unavailable in this browser';
    }
    setTimeout(() => { uploadStatus = ''; }, 2400);
  }

  async function copyFileLink(file: ProjectFile) { await copyText(`${location.origin}${rawUrl(file)}`, 'File link copied'); }
  async function copyFilePath(file: ProjectFile) { await copyText(file.path, 'Path copied'); }

  function exportManifest() {
    const manifest = {
      project: data.project.slug,
      generatedAt: new Date().toISOString(),
      files: data.files.map(({ id, path, mimeType, size, createdBy, createdAt, updatedAt }) => ({ id, path, mimeType, size, createdBy, createdAt, updatedAt }))
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${data.project.slug}-file-manifest.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    uploadStatus = 'Manifest downloaded';
    setTimeout(() => { uploadStatus = ''; }, 2400);
  }

  async function uploadAsset(file: File, path = '') {
    const body = new FormData();
    body.set('file', file);
    body.set('path', path || file.name);
    uploadStatus = 'Uploading…';
    try {
      const response = await fetch(`/projects/${data.project.slug}/files/upload`, { method: 'POST', body });
      const result = await response.json() as { id?: string; path?: string; url?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error || 'Upload failed.');
      await invalidateAll();
      uploadStatus = `${result.path} uploaded`;
      setTimeout(() => { uploadStatus = ''; }, 2400);
      return result;
    } catch (error) {
      uploadStatus = error instanceof Error ? error.message : 'Upload failed.';
      setTimeout(() => { uploadStatus = ''; }, 4000);
      return null;
    }
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragActive = false;
    if (!data.canEdit) return;
    const file = event.dataTransfer?.files?.[0];
    if (file) await uploadAsset(file, activeFolder === 'Root' ? file.name : `${activeFolder}/${file.name}`);
  }

  async function handleImagePaste(file: File) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const result = await uploadAsset(file, `screenshots/${timestamp}-${file.name || 'pasted-image.png'}`);
    if (result?.url && isTextFile) draftContent = `${draftContent.trimEnd()}\n\n![${file.name || 'Screenshot'}](${result.url})\n`;
  }

  function saveWithShortcut(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (data.canEdit) saveForm?.requestSubmit();
    }
  }

</script>

<svelte:window onkeydown={saveWithShortcut} />

<svelte:head>
  <title>Files · {data.project.name} · BullPager</title>
  <meta name="description" content="Project-scoped Markdown and text files." />
</svelte:head>

<main class="project-files-page">
  <header class="topbar files-topbar">
    <div><p class="eyebrow">PROJECT FILES</p><h1>{data.project.name}</h1><p class="subtitle">A durable, focused place for Markdown notes, briefs, and lightweight project text.</p></div>
    <div class="top-links"><button type="button" class="quiet-button" onclick={exportManifest}>Export manifest</button><a class="quiet-button" href={`/projects/${data.project.slug}`}>Back to board</a><a class="quiet-button" href={`/projects/${data.project.slug}/graph`}>Graph mode</a></div>
  </header>

  {#if form?.message}<p class="success" role="status">{form.message}</p>{/if}
  {#if form?.error}<p class="action-errors" role="alert">{form.error}</p>{/if}

  <section class:drag-active={dragActive} class="files-workspace" aria-label="Project file workspace" ondragover={(event) => { event.preventDefault(); dragActive = true; }} ondragleave={() => { dragActive = false; }} ondrop={handleDrop}>
    {#if dragActive}<div class="files-drop-overlay" role="status"><span><ArrowUpToLine /></span><strong>Drop into {activeFolder === 'Root' ? 'project cloud' : activeFolder}</strong><small>Files stay scoped to this project</small></div>{/if}
    <aside class="files-sidebar">
      <div class="files-sidebar-heading"><div><p class="eyebrow">PROJECT DRIVE</p><h2>Files <small>{data.files.length}</small></h2><p class="drive-storage">{folderPaths.length - 1} folders · {fileSize(totalBytes)} stored</p></div>{#if data.canEdit}<button type="button" class="quiet-button" onclick={startNewFile}><Plus /> New</button>{/if}</div>
      <p class="files-sidebar-help">{data.canEdit ? 'Drop files anywhere, create folders, or paste screenshots into the editor.' : 'Read access includes every project file and preview. Editors can add and update files.'}</p>
      <label class="file-search"><span class="sr-only">Search files</span><input bind:value={search} placeholder="Search files" /></label>
      <nav class="drive-shortcuts" aria-label="Drive shortcuts"><button type="button" class:active={showRecent} onclick={selectRecent}><span><History /></span><span>Recent</span><small>{recentFiles.length}</small></button><button type="button" class:active={!showRecent && showAll && !search} onclick={selectAllFiles}><span><House /></span><span>All files</span><small>{data.files.length}</small></button></nav>
      <nav class="folder-list" aria-label="Project folders">{#each folderPaths as folder}<button type="button" class:active={!showRecent && folder === activeFolder} onclick={() => selectFolder(folder)}><span>{#if folder === 'Root'}<House />{:else}<ChevronRight />{/if}</span>{folder === 'Root' ? 'Root' : folder.split('/').at(-1)}<small>{folder !== 'Root' ? folder.split('/').slice(0, -1).join('/') : 'Project files'}</small></button>{/each}</nav>
      {#if data.canEdit}<form method="POST" action="?/createFolder" class="folder-create-form"><input type="hidden" name="parent" value={activeFolder === 'Root' ? '' : activeFolder} /><label><span class="sr-only">New folder name</span><input name="path" maxlength="180" placeholder={`New folder in ${activeFolder}`} required /></label><button type="submit" class="icon-only" aria-label="Create folder"><Plus /></button></form>{#if activeFolder !== 'Root' && !showRecent && !showAll}<form method="POST" action="?/deleteFolder" class="folder-delete-form" onsubmit={(event) => { if (!confirm(`Delete empty folder ${activeFolder}?`)) event.preventDefault(); }}><input type="hidden" name="path" value={activeFolder} /><button type="submit" class="quiet-button danger">Delete empty folder</button></form>{/if}{/if}
      <nav class="file-list" aria-label="Project files">
        {#if !search && !showRecent}{#each childFolders as folder}<button type="button" class="folder-entry" onclick={() => selectFolder(folder)}><span class="folder-entry-icon"><Folder /></span><span><strong>{folder.split('/').at(-1)}</strong><small>Folder · {folderPaths.filter((candidate) => candidate.startsWith(`${folder}/`)).length} nested</small></span><span class="folder-entry-arrow"><ChevronRight /></span></button>{/each}{/if}
        {#each visibleFiles as file}{#if viewMode === 'list'}<button type="button" class:active={file.id === activeId} class="file-list-item" onclick={() => selectFile(file)}>{#if file.previewUrl}<img class="file-thumb" src={file.previewUrl} alt="" loading="lazy" />{:else}{@const visual = fileVisual(file)}<span class={`file-type-icon file-type-${visual.kind}`}><visual.Icon /><small>{visual.label}</small></span>{/if}<span><strong>{file.path.split('/').at(-1)}</strong><small>{fileSize(file.size)} · Modified {fileDate(file.updatedAt)}</small></span></button>{:else if viewMode === 'grid'}<button type="button" class:active={file.id === activeId} class="file-grid-item" onclick={() => selectFile(file)}>{#if file.previewUrl}<img class="file-grid-preview" src={file.previewUrl} alt="" loading="lazy" />{:else}{@const visual = fileVisual(file)}<span class={`file-grid-icon file-type-${visual.kind}`}><visual.Icon /><small>{visual.label}</small></span>{/if}<strong>{file.path.split('/').at(-1)}</strong><small>{fileSize(file.size)} · {fileDate(file.updatedAt)}</small></button>{:else}{@const visual = fileVisual(file)}<button type="button" class:active={file.id === activeId} class="file-item-card" onclick={() => selectFile(file)}>{#if file.previewUrl}<img class="file-item-preview" src={file.previewUrl} alt="" loading="lazy" />{:else}<span class={`file-item-icon file-type-${visual.kind}`}><visual.Icon /><small>{visual.label}</small></span>{/if}<span class="file-item-copy"><strong>{file.path.split('/').at(-1)}</strong><small>{file.path} · {fileSize(file.size)}</small><small>Last modified {fileDate(file.updatedAt)}</small></span><span class="file-item-open">Open <ChevronRight /></span></button>{/if}{:else}<div class="file-list-empty"><strong>{search ? 'No matching files.' : `No files in ${activeFolder}.`}</strong><p>{data.canEdit ? 'Drop a file here, create a folder, or choose one below.' : 'This folder is empty.'}</p></div>{/each}
      </nav>
      {#if data.activity.length}<details class="file-activity"><summary>Recent cloud activity <span>{data.activity.length}</span></summary><ol>{#each data.activity.slice(0, 6) as entry}<li><span class="file-activity-dot" aria-hidden="true"></span><div><strong>{entry.action}</strong><p>{entry.summary}</p><time datetime={entry.createdAt}>{entry.actor || 'System'} · {new Date(entry.createdAt).toLocaleString()}</time></div></li>{/each}</ol></details>{/if}
      {#if data.canEdit}<form method="POST" action="?/uploadFile" enctype="multipart/form-data" class="file-upload-form"><p class="eyebrow">IMPORT TO {activeFolder.toUpperCase()}</p><label>Optional path <input bind:value={uploadPath} name="path" placeholder="docs/brief.md" /></label><label class="upload-drop">Choose file<input type="file" name="file" accept=".md,.markdown,.txt,.json,.yaml,.yml,.csv,.html,.css,.ts,.svelte,.dart,.shader,.frag,.vert,.uxml,.uss,image/*,.pdf,.zip,.mp3,.wav,.ogg,.mp4,.webm,.mov" required /></label><button type="submit">Upload file</button><small>Images up to 10 MB · other files up to 25 MB</small></form>{/if}
    </aside>

    <section class="file-editor-panel">
      <div class="drive-toolbar"><div class="drive-breadcrumbs">{#if showRecent}<button type="button" onclick={selectRecent}>Recent</button>{:else if showAll}<button type="button" onclick={selectAllFiles}>All files</button>{:else}<button type="button" onclick={() => selectFolder('Root')}>Root</button>{#each folderTrail as folder}<span>/</span><button type="button" onclick={() => selectFolder(folder)}>{folder.split('/').at(-1)}</button>{/each}{/if}<span class="drive-count">{search ? `${visibleFiles.length} matches` : `${visibleFiles.length} files`}</span></div><div class="drive-controls"><label>Sort <select bind:value={sortMode} onchange={rememberDrivePreferences}><option value="modified-desc">Last modified</option><option value="modified-asc">First modified</option><option value="name-asc">A to Z</option><option value="name-desc">Z to A</option><option value="size-desc">Largest first</option><option value="size-asc">Smallest first</option></select></label><div class="view-switcher" role="group" aria-label="File view"><button type="button" class="icon-only" class:active={viewMode === 'list'} aria-label="List view" onclick={() => { viewMode = 'list'; rememberDrivePreferences(); }}><List /></button><button type="button" class="icon-only" class:active={viewMode === 'grid'} aria-label="Grid view" onclick={() => { viewMode = 'grid'; rememberDrivePreferences(); }}><Grid3x3 /></button><button type="button" class="icon-only" class:active={viewMode === 'item'} aria-label="Item view" onclick={() => { viewMode = 'item'; rememberDrivePreferences(); }}><LayoutList /></button></div></div></div>
      {#if activeFile && !isTextFile}
        {@const visual = fileVisual(activeFile)}<div class="binary-file-preview"><p class="eyebrow">{isImageFile ? 'IMAGE PREVIEW' : 'FILE PREVIEW'}</p><h2>{activeFile.path}</h2>{#if isImageFile && activeFile.previewUrl}<img src={activeFile.previewUrl} alt={activeFile.path} />{:else}<div class={`binary-file-icon file-type-icon file-type-${visual.kind}`}><visual.Icon /><small>{visual.label}</small></div>{/if}<p>{fileSize(activeFile.size)} · {activeFile.mimeType} · Modified {fileDate(activeFile.updatedAt)}</p><div class="file-action-strip"><a class="quiet-button" href={rawUrl(activeFile)} target="_blank" rel="noreferrer">Open / download</a><button type="button" class="quiet-button" onclick={() => copyFileLink(activeFile)}>Copy link</button><button type="button" class="quiet-button" onclick={() => copyFilePath(activeFile)}>Copy path</button></div></div>
      {:else if activeFile || isNew}
        <div class="file-editor-heading"><div><p class="eyebrow">{isNew ? 'NEW DOCUMENT' : 'EDITING'}</p><input class="file-path-input" bind:value={draftPath} aria-label="File path" maxlength="180" disabled={!data.canEdit} /><p class="file-meta">{isNew ? 'Unsaved file' : `${activeFile?.size.toLocaleString()} bytes · ${activeFile?.mimeType} · Modified ${fileDate(activeFile?.updatedAt ?? '')}`}</p></div><div class="file-editor-actions">{#if data.canEdit}<form method="POST" action="?/deleteFile" onsubmit={(event) => { if (!confirm(`Delete ${draftPath}?`)) event.preventDefault(); }}><input type="hidden" name="id" value={activeId} /><button type="submit" class="quiet-button danger">Delete</button></form>{/if}</div></div>
        {#if activeFile}<div class="file-action-strip file-action-strip-editor"><span>Stored in <code>{activeFile.path}</code></span><div><a class="quiet-button" href={rawUrl(activeFile)} target="_blank" rel="noreferrer">Open / download</a><button type="button" class="quiet-button" onclick={() => copyFileLink(activeFile)}>Copy link</button><button type="button" class="quiet-button" onclick={() => copyFilePath(activeFile)}>Copy path</button></div></div>{#if data.canEdit}<form method="POST" action="?/moveFile" class="file-move-form"><input type="hidden" name="id" value={activeFile.id} /><label>Move to <input name="path" bind:value={movePath} maxlength="180" /></label><button type="submit" class="quiet-button">Move file</button></form>{/if}{/if}
        <form bind:this={saveForm} method="POST" action="?/saveFile" class="file-save-form"><input type="hidden" name="id" value={isNew ? '' : activeId} /><input type="hidden" name="path" value={draftPath} /><textarea class="sr-only" name="content" aria-hidden="true" readonly value={draftContent}></textarea><MarkdownEditor value={draftContent} readonly={!data.canEdit} onChange={(value) => { draftContent = value; }} onImagePaste={handleImagePaste} /><div class="file-save-bar"><span>{draftContent.length.toLocaleString()} characters · Markdown{#if uploadStatus} · {uploadStatus}{/if}</span>{#if data.canEdit}<button type="submit">Save file</button>{/if}</div></form>
      {:else}
        <div class="file-empty-state"><p class="eyebrow">MARKDOWN WORKSPACE</p><h2>Keep the project’s thinking close to the work.</h2><p>Create a note, upload a brief, or select a file from the library. The editor keeps source and preview side by side.</p>{#if data.canEdit}<button type="button" onclick={startNewFile}>Create the first note</button>{/if}</div>
      {/if}
    </section>
  </section>
</main>
