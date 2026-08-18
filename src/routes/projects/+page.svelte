<script lang="ts">
  import type { BoardProject, UserRole } from '$lib/types';

  let { data }: { data: { projects: BoardProject[]; username: string; role: UserRole | '' } } = $props();
  const canCreate = $derived(['superadmin', 'admin', 'editor'].includes(data.role));
</script>

<svelte:head>
  <title>Projects · Project Agile</title>
  <meta name="description" content="Choose a project board and keep its working context together." />
</svelte:head>

<main class="project-hub">
  <header class="topbar project-hub-header">
    <div>
      <p class="eyebrow">PROJECTS</p>
      <h1>Choose the work to move.</h1>
      <p class="subtitle">Each project has one focused board for movement, one cloud for context, and an optional graph for relationships.</p>
    </div>
    <div class="top-links">
      {#if canCreate}<a class="primary-button" href="/projects/new">+ New project</a>{/if}
      <a class="quiet-button" href="/projects/unity-plan/backlog">Unity backlog</a>
    </div>
  </header>

  <section class="project-hub-principles" aria-label="How Project Agile works">
    <article><span class="principle-icon">↗</span><div><strong>Move work</strong><p>Capture cards, clarify the next step, and move them across the project board.</p></div></article>
    <article><span class="principle-icon">☁</span><div><strong>Keep context</strong><p>Store briefs, screenshots, and notes beside the board in the project cloud.</p></div></article>
    <article><span class="principle-icon">⌘</span><div><strong>See relationships</strong><p>Use graph mode when dependencies and ideas need more space than a list.</p></div></article>
  </section>

  {#if data.projects.length}
    <section class="project-hub-section" aria-labelledby="your-projects-title">
      <div class="project-hub-section-heading"><div><p class="eyebrow">YOUR WORKSPACES</p><h2 id="your-projects-title">Projects</h2></div><span class="health valid">{data.projects.length} {data.projects.length === 1 ? 'project' : 'projects'}</span></div>
      <div class="project-hub-grid">
        {#each data.projects as project}
          <article class="project-hub-card">
            <div class="project-hub-card-heading"><span class="project-mark" aria-hidden="true">{project.name.slice(0, 2).toUpperCase()}</span><div><h3>{project.name}</h3><p>{project.visibility === 'private' ? 'Private workspace' : 'Shared workspace'} · owned by {project.owner}</p></div></div>
            <p class="project-hub-card-copy">One board for the active queue, with project files and optional graph context kept close by.</p>
            <div class="project-hub-card-actions"><a class="primary-button" href={`/projects/${project.slug}`}>Open board</a><a class="quiet-button" href={`/projects/${project.slug}/backlog`}>Backlog</a><a class="project-cloud-link" href={`/projects/${project.slug}/files`}><span aria-hidden="true">☁</span> Cloud</a><a class="quiet-button" href={`/projects/${project.slug}/graph`}>Graph</a></div>
            <small class="project-hub-slug">/{project.slug}</small>
          </article>
        {/each}
      </div>
    </section>
  {:else}
    <section class="project-hub-empty" aria-labelledby="first-project-title">
      <div><p class="eyebrow">A CALM START</p><h2 id="first-project-title">Create the first project when there is work to move.</h2><p>Start with a template, then keep the board small and the supporting context close. You can rename columns and adjust the visual rhythm later.</p></div>
      {#if canCreate}<a class="primary-button" href="/projects/new">Choose a template</a>{:else}<p class="empty">An editor or administrator can create the first project.</p>{/if}
    </section>
  {/if}
</main>
