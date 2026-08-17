<script lang="ts">
  import type { ProjectTemplate } from '$lib/projectTemplates';

  let { data, form }: { data: { templates: ProjectTemplate[] }; form?: { error?: string; name?: string; slug?: string; templateId?: string } } = $props();
  let selectedId = $state('software-delivery');
  let name = $state('');
  let slug = $state('');
  $effect(() => {
    if (!data.templates.some((template) => template.id === selectedId)) selectedId = data.templates[0].id;
    if (form?.templateId) selectedId = form.templateId;
    if (form?.name !== undefined) name = form.name;
    if (form?.slug !== undefined) slug = form.slug;
  });
  const selected = $derived(data.templates.find((template) => template.id === selectedId) ?? data.templates[0]);

  function selectTemplate(id: string) {
    selectedId = id;
  }
</script>

<svelte:head><title>New project · Project Agile Board</title><meta name="description" content="Start a project from a focused workflow template." /></svelte:head>

<main class="settings-shell new-project-shell">
  <header class="topbar">
    <div>
      <p class="eyebrow">NEW PROJECT</p>
      <h1>Start with a useful shape.</h1>
      <p class="subtitle">Choose a workflow that matches the work. Every project starts with one board, one project cloud, and an optional graph view; you can rename columns and adjust the look later.</p>
    </div>
    <a class="quiet-button settings-back" href="/settings">Back to settings</a>
  </header>

  {#if form?.error}<p class="action-errors" role="alert">{form.error}</p>{/if}

  <form method="POST" class="new-project-form">
    <section class="settings-card project-identity-card">
      <div class="empty-slate-copy">
        <img src="/assets/illustrations/project-team.svg" alt="" />
        <div><p class="eyebrow">A CLEAR FIRST STEP</p><h2>Name the workspace</h2><p class="subtitle">Keep the name recognizable. The optional slug becomes the stable link you can share later.</p></div>
      </div>
      <div class="project-fields">
        <label>Project name <input name="name" bind:value={name} required minlength="2" maxlength="80" placeholder="e.g. Website refresh" /></label>
        <label>URL slug <input name="slug" bind:value={slug} maxlength="48" pattern="[a-z0-9][a-z0-9-]&#123;1,47&#125;" placeholder="website-refresh (optional)" /><small>Leave blank to derive it from the name.</small></label>
      </div>
    </section>

    <section class="settings-card">
      <div class="settings-heading"><div><p class="eyebrow">WORKFLOW TEMPLATE</p><h2>Pick the closest starting point</h2><p class="subtitle">Templates only set sensible defaults; they do not lock the project into one process.</p></div><span class="health valid">{data.templates.length} options</span></div>
      <div class="template-grid">
        {#each data.templates as template}
          <label class:template-selected={selectedId === template.id} class="template-card">
            <input type="radio" name="template" value={template.id} checked={selectedId === template.id} onchange={() => selectTemplate(template.id)} />
            <span class="template-card-body"><strong>{template.name}</strong><span>{template.summary}</span><small>{template.bestFor}</small><span class="template-lanes">{template.lanes.join(' → ')}</span></span>
          </label>
        {/each}
      </div>
    </section>

    <section class="settings-card launch-card">
      <div><p class="eyebrow">READY TO OPEN</p><h2>{selected.name}</h2><p class="subtitle">{selected.lanes.length} lanes · {selected.cadence} review rhythm · {selected.theme} visual baseline</p></div>
      <input type="hidden" name="template" value={selected.id} />
      <button type="submit">Create project and tune settings</button>
    </section>
  </form>
</main>
