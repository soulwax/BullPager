<script lang="ts">
  import { personColor } from '$lib/boardAppearance';

  let { name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' } = $props();
  const color = $derived(personColor(name));
</script>

<span
  class={`avatar avatar-${size}`}
  class:avatar-dark-ink={color.ink === 'dark'}
  style={`--avatar-bg: ${color.background}`}
  title={name || 'Unassigned'}
  aria-hidden="true"
>{color.initials}</span>
