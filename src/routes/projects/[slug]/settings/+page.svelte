<script lang="ts">
  import type { BoardProject } from '$lib/types';
  import { projectBackgrounds } from '$lib/projectBackgrounds';

  let { data, form }: { data: { slug: string; prefix: string; project: BoardProject; settings: Record<string, string>; created?: boolean }; form?: { message?: string; error?: string } } = $props();
  const setting = (name: string, fallback = '') => data.settings[`${data.prefix}${name}`] ?? fallback;
  let lanes = $state<{ original: string; name: string }[]>((() => {
    try {
      const saved = JSON.parse(setting('lanes', '[]')) as unknown;
      if (Array.isArray(saved)) {
        const names = saved.filter((lane): lane is string => typeof lane === 'string' && Boolean(lane.trim())).map((lane) => lane.trim());
        if (names.length >= 2) return names.map((lane) => ({ original: lane, name: lane }));
      }
    } catch { /* use the safe fallback below */ }
    return [{ original: 'Backlog', name: 'Backlog' }, { original: 'In progress', name: 'In progress' }, { original: 'Done', name: 'Done' }];
  })());
  let glassIntensity = $state(Number(setting('glass_intensity', '38')));
  function addLane() { if (lanes.length < 8) lanes = [...lanes, { original: '', name: `Column ${lanes.length + 1}` }]; }
  function removeLane(index: number) { if (lanes.length > 2) lanes = lanes.filter((_, laneIndex) => laneIndex !== index); }
</script>

<svelte:head><title>{data.project.name} settings · Project Agile Board</title></svelte:head>

<main class="settings-shell">
  <header class="topbar">
    <div><p class="eyebrow">PROJECT SETTINGS</p><h1>{data.project.name}</h1><p class="subtitle">Tune the workflow, appearance, and defaults for this project only.</p></div>
    <div class="top-links"><a class="quiet-button settings-back" href="/settings">All projects</a><a class="quiet-button settings-back" href="/">Back to board</a></div>
  </header>

  {#if data.created}<p class="success" role="status">Project created. Review the defaults below before inviting collaborators.</p>{/if}
  {#if form?.message}<p class="success" role="status">{form.message}</p>{/if}
  {#if form?.error}<p class="action-errors" role="alert">{form.error}</p>{/if}

  <section class="settings-card project-summary-card">
    <div><p class="eyebrow">PROJECT OVERVIEW</p><h2>{data.project.name}</h2><p class="subtitle"><code>{data.project.slug}</code> · owned by {data.project.owner} · {setting('template', 'custom')} template</p></div>
    <a class="quiet-button" href={`/projects/${data.project.slug}`}>Open workspace</a>
    <span class="health valid">{setting('visibility', data.project.visibility)}</span>
  </section>

  <section class="settings-card">
    <p class="eyebrow">WORKFLOW</p><h2>Project defaults</h2>
    <p class="subtitle">These values are intentionally small and reversible. Column changes apply to this project’s single board.</p>
    <form method="POST" class="policy-form">
      <label>Workflow key <input name="workflowKey" value={setting('workflow_key')} maxlength="120" placeholder="Optional team reference" /></label>
      <label>Review cadence <select name="cadence"><option value="weekly" selected={setting('cadence', 'weekly') === 'weekly'}>Weekly</option><option value="biweekly" selected={setting('cadence') === 'biweekly'}>Every two weeks</option><option value="monthly" selected={setting('cadence') === 'monthly'}>Monthly</option></select></label>
      <label>Project visibility <select name="visibility"><option value="private" selected={setting('visibility', 'private') === 'private'}>Private</option><option value="shared" selected={setting('visibility') === 'shared'}>Shared</option></select></label>
      <label>Board theme <select name="boardTheme"><option value="midnight" selected={setting('theme', 'midnight') === 'midnight'}>Midnight</option><option value="ocean" selected={setting('theme') === 'ocean'}>Ocean</option><option value="light" selected={setting('theme') === 'light'}>Light</option></select></label>
      <label>Background image <select name="background"><option value="none" selected={setting('background', 'none') === 'none'}>Plain midnight</option>{#each projectBackgrounds.filter((background) => background.id !== 'none') as background}<option value={background.id} selected={setting('background') === background.id}>{background.label}</option>{/each}</select></label>
      <label>Milk-glass intensity <output class="range-output">{glassIntensity}%</output><input name="glassIntensity" type="range" min="0" max="100" step="1" bind:value={glassIntensity} /><small>Higher values blur and soften the background behind board surfaces.</small></label>
      <label>Card density <select name="cardDensity"><option value="comfortable" selected={setting('density', 'comfortable') === 'comfortable'}>Comfortable</option><option value="compact" selected={setting('density') === 'compact'}>Compact</option></select></label>
      <label>Lane layout <select name="laneStyle"><option value="scroll" selected={setting('lane_style', 'scroll') === 'scroll'}>Horizontal scroll</option><option value="wrap" selected={setting('lane_style') === 'wrap'}>Wrap lanes</option></select></label>
      <fieldset class="lane-editor wide-field"><legend>Board columns</legend><p class="field-help">Rename, add, or remove columns. Existing cards follow a renamed column.</p>{#each lanes as lane, index}<div class="lane-editor-row"><input name="laneName" value={lane.name} maxlength="48" aria-label={`Column ${index + 1} name`} oninput={(event) => { lanes[index] = { ...lanes[index], name: (event.currentTarget as HTMLInputElement).value }; lanes = [...lanes]; }} /><input type="hidden" name="laneOriginal" value={lane.original} />{#if lanes.length > 2}<button type="button" class="quiet-button danger" aria-label={`Remove ${lane.name || `column ${index + 1}`}`} onclick={() => removeLane(index)}>×</button>{/if}</div>{/each}<button type="button" class="quiet-button lane-add-button" disabled={lanes.length >= 8} onclick={addLane}>+ Add column</button></fieldset>
      <label class="check"><input type="checkbox" name="showOutcomes" checked={setting('show_outcomes', 'true') !== 'false'} /> Show card outcomes</label>
      <button type="submit">Save project settings</button>
    </form>
  </section>
</main>
