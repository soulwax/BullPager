<script lang="ts">
  import { onMount } from 'svelte';
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
  import { markdown } from '@codemirror/lang-markdown';
  import { EditorState } from '@codemirror/state';
  import { EditorView, keymap } from '@codemirror/view';
  import { oneDark } from '@codemirror/theme-one-dark';
  import { marked } from 'marked';

  let { value = '', readonly = false, onChange = () => {}, onImagePaste = () => {} }: { value?: string; readonly?: boolean; onChange?: (value: string) => void; onImagePaste?: (file: File) => void } = $props();
  let editorHost: HTMLDivElement;
  let previewHtml = $state('');
  let showPreview = $state(true);
  let view: EditorView | undefined;
  let sanitize: ((html: string) => string) | undefined;

  function updatePreview(source: string) {
    const rendered = marked.parse(source, { breaks: true, gfm: true }) as string;
    // Never inject unsanitised Markdown HTML, even during the short client
    // hydration window before DOMPurify has loaded.
    previewHtml = sanitize ? sanitize(rendered) : '';
  }

  $effect(() => {
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    updatePreview(value);
  });

  onMount(() => {
    const state = EditorState.create({
      doc: value,
      extensions: [
        markdown(),
        oneDark,
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.editable.of(!readonly),
        EditorState.readOnly.of(readonly),
        EditorView.lineWrapping,
        EditorView.domEventHandlers({
          paste(event) {
            if (readonly) return false;
            const imageItem = [...(event.clipboardData?.items ?? [])].find((item) => item.type.startsWith('image/'));
            const file = imageItem?.getAsFile();
            if (!file) return false;
            event.preventDefault();
            onImagePaste(file);
            return true;
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '14px', backgroundColor: 'transparent' },
          '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
          '.cm-content': { padding: '1rem 1.1rem', minHeight: '30rem' },
          '.cm-gutters': { backgroundColor: 'transparent', border: '0', color: '#687991' },
          '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgb(115 182 255 / .06)' },
          '.cm-focused': { outline: 'none' }
        }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          const next = update.state.doc.toString();
          updatePreview(next);
          onChange(next);
        })
      ]
    });
    view = new EditorView({ state, parent: editorHost });
    updatePreview(value);
    void import('dompurify').then((module) => {
      sanitize = module.default(window).sanitize;
      updatePreview(view?.state.doc.toString() ?? value);
    });
    return () => view?.destroy();
  });
</script>

<div class="markdown-editor-shell">
  <div class="markdown-editor-toolbar" aria-label="Markdown editor tools">
    <span class="editor-label">Markdown</span>
    <span class="editor-help">Ctrl/Cmd + S saves · Tab indents</span>
    <button type="button" class="quiet-button" onclick={() => { showPreview = !showPreview; }}>{showPreview ? 'Hide preview' : 'Show preview'}</button>
  </div>
  <div class:preview-hidden={!showPreview} class="markdown-editor-grid">
    <div class="codemirror-host" bind:this={editorHost} aria-label="Markdown source editor"></div>
    {#if showPreview}<article class="markdown-preview" aria-label="Rendered Markdown preview"><p class="preview-label">PREVIEW</p>{#if previewHtml}{@html previewHtml}{:else}<p class="empty">Start writing to see a preview.</p>{/if}</article>{/if}
  </div>
</div>
