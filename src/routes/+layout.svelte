<script lang="ts">
  import '../app.css';
  let { children, data }: { children: import('svelte').Snippet; data: { settings: Record<string, string> } } = $props();
</script>

<div class={`app-theme theme-${data.settings.theme || 'midnight'}`} style={`--accent: ${data.settings.accent || '#73b6ff'}`}>
  {@render children()}
</div>
