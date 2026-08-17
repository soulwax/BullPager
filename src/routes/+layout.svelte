<script lang="ts">
  import '../app.css';
  import WorkspaceNav from '$lib/components/WorkspaceNav.svelte';
  let { children, data }: { children: import('svelte').Snippet; data: { settings: Record<string, string>; username?: string; role?: import('$lib/types').UserRole } } = $props();
</script>

<div class={`app-theme theme-${data.settings.theme || 'midnight'}`} style={`--accent: ${data.settings.accent || '#73b6ff'}`}>
  <a class="skip-link" href="#main-content">Skip to workspace</a>
  <WorkspaceNav username={data.username} role={data.role} />
  <div id="main-content">{@render children()}</div>
</div>
