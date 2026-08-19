<script lang="ts">
  import '../app.css';
  import { setLucideProps } from '@lucide/svelte';
  import WorkspaceNav from '$lib/components/WorkspaceNav.svelte';
  let { children, data }: { children: import('svelte').Snippet; data: { settings: Record<string, string>; username?: string; role?: import('$lib/types').UserRole } } = $props();
  // App-wide icon defaults: 16px at the standard 2px stroke reads cleanly
  // inline with text at the sizes this UI uses; every icon inherits the
  // surrounding text color (currentColor) so it works on any background.
  setLucideProps({ size: 16, strokeWidth: 2 });
</script>

<div class={`app-theme theme-${data.settings.theme || 'midnight'}`} style={`--accent: ${data.settings.accent || '#73b6ff'}`}>
  <a class="skip-link" href="#main-content">Skip to workspace</a>
  <WorkspaceNav username={data.username} role={data.role} />
  <div id="main-content">{@render children()}</div>
</div>
