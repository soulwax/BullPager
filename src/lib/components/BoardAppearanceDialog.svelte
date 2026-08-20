<script lang="ts">
  /**
   * The board's quick appearance panel.
   *
   * Anchored under its trigger in the board header instead of centered as a
   * modal: the whole value of this panel is watching the board change behind
   * it, which a sheet covering the lanes would defeat. It is deliberately one
   * narrow scrollable column of segmented buttons — every option is one click
   * from open, with no nested selects to open and scan.
   *
   * Changes apply live to the parent's bound appearance object. Saving is a
   * separate, explicit step so a viewer without edit rights can still try a
   * look locally, and an editor can back out with Reset.
   */
  import {
    boardThemes,
    cardThemes,
    densities,
    laneWidths,
    radii,
    shadows,
    textScales,
    type BoardAppearance,
    type BoardCanvas,
    type CardThemeId,
    resolveCardTheme
  } from '$lib/boardAppearance';
  import { projectBackgrounds } from '$lib/projectBackgrounds';
  import Check from '@lucide/svelte/icons/check';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import X from '@lucide/svelte/icons/x';

  let {
    appearance = $bindable(),
    background = $bindable(),
    canvas,
    canEdit,
    dirty,
    saving,
    onclose,
    onsave,
    onreset
  }: {
    appearance: BoardAppearance;
    background: string;
    canvas: BoardCanvas;
    canEdit: boolean;
    dirty: boolean;
    saving: boolean;
    onclose: () => void;
    onsave: () => void;
    onreset: () => void;
  } = $props();

  const accentSwatches = ['#73b6ff', '#0c66e4', '#1fb6a0', '#7bb61b', '#e8912d', '#cf513f', '#d84a91', '#9b8afb', '#5e6c84'];
  // Only the self-contained options appear here; photos and uploads stay on
  // the settings page where they can be previewed at a usable size.
  const quickBackgrounds = projectBackgrounds.filter((option) => option.kind === 'none' || option.kind === 'color' || option.kind === 'gradient');

  const resolved = $derived(resolveCardTheme(appearance, canvas));
  const cardThemeHint = $derived(
    appearance.cardTheme === 'auto'
      ? `Auto → ${resolved.replace('-', ' ')} cards on this background`
      : cardThemes.find((option) => option.id === appearance.cardTheme)?.hint ?? ''
  );
  const usesGlass = $derived(resolved.startsWith('glass'));

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onclose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<button class="appearance-panel-backdrop" type="button" aria-label="Close appearance panel" onclick={onclose}></button>

<dialog open class="appearance-panel" aria-label="Board appearance">
  <header class="appearance-panel-heading">
    <h2>Appearance</h2>
    <button type="button" class="quiet-button icon-only" aria-label="Close appearance panel" onclick={onclose}><X /></button>
  </header>

  <div class="appearance-group">
    <span id="appearance-theme-label">Board theme</span>
    <div class="appearance-themes" role="group" aria-labelledby="appearance-theme-label">
      {#each boardThemes as theme}
        <button
          type="button"
          class="appearance-theme"
          style={`--theme-swatch: ${theme.swatch}`}
          aria-pressed={appearance.theme === theme.id}
          title={theme.hint}
          onclick={() => { appearance.theme = theme.id; }}
        ><span aria-hidden="true"></span><small>{theme.label}</small></button>
      {/each}
    </div>
  </div>

  <div class="appearance-group">
    <span id="appearance-bg-label">Background</span>
    <div class="appearance-swatches" role="group" aria-labelledby="appearance-bg-label">
      {#each quickBackgrounds as option}
        <button
          type="button"
          class="appearance-swatch"
          style={`--swatch-color: ${option.color ?? 'var(--board-canvas, #2b3442)'}`}
          aria-pressed={background === option.id}
          aria-label={option.label}
          title={option.label}
          onclick={() => { background = option.id; }}
        ></button>
      {/each}
    </div>
  </div>

  <div class="appearance-group">
    <span id="appearance-card-label">Cards</span>
    <div class="appearance-options" role="group" aria-labelledby="appearance-card-label">
      {#each cardThemes as option}
        <button
          type="button"
          aria-pressed={appearance.cardTheme === option.id}
          title={option.hint}
          onclick={() => { appearance.cardTheme = option.id as CardThemeId; }}
        >{option.label}</button>
      {/each}
    </div>
    <p class="appearance-note">{cardThemeHint}</p>
  </div>

  {#if usesGlass}
    <label class="appearance-group appearance-slider">
      <span>Frost — {appearance.glassIntensity}%</span>
      <input type="range" min="0" max="100" step="1" bind:value={appearance.glassIntensity} aria-label="Frost intensity" />
    </label>
  {/if}

  <div class="appearance-group">
    <span id="appearance-density-label">Density</span>
    <div class="appearance-options" role="group" aria-labelledby="appearance-density-label">
      {#each densities as option}
        <button type="button" aria-pressed={appearance.density === option.id} onclick={() => { appearance.density = option.id; }}>{option.label}</button>
      {/each}
    </div>
  </div>

  <div class="appearance-group">
    <span id="appearance-lane-label">List width</span>
    <div class="appearance-options" role="group" aria-labelledby="appearance-lane-label">
      {#each laneWidths as option}
        <button type="button" aria-pressed={appearance.laneWidth === option.id} onclick={() => { appearance.laneWidth = option.id; }}>{option.label}</button>
      {/each}
    </div>
  </div>

  <div class="appearance-group">
    <span id="appearance-text-label">Text size</span>
    <div class="appearance-options" role="group" aria-labelledby="appearance-text-label">
      {#each textScales as option}
        <button type="button" aria-pressed={appearance.textScale === option.id} onclick={() => { appearance.textScale = option.id; }}>{option.label}</button>
      {/each}
    </div>
  </div>

  <div class="appearance-group">
    <span id="appearance-corner-label">Corners</span>
    <div class="appearance-options" role="group" aria-labelledby="appearance-corner-label">
      {#each radii as option}
        <button type="button" aria-pressed={appearance.radius === option.id} onclick={() => { appearance.radius = option.id; }}>{option.label}</button>
      {/each}
    </div>
  </div>

  <div class="appearance-group">
    <span id="appearance-shadow-label">Depth</span>
    <div class="appearance-options" role="group" aria-labelledby="appearance-shadow-label">
      {#each shadows as option}
        <button type="button" aria-pressed={appearance.shadow === option.id} onclick={() => { appearance.shadow = option.id; }}>{option.label}</button>
      {/each}
    </div>
  </div>

  <div class="appearance-group">
    <span id="appearance-accent-label">Accent</span>
    <div class="appearance-swatches" role="group" aria-labelledby="appearance-accent-label">
      {#each accentSwatches as color}
        <button
          type="button"
          class="appearance-swatch"
          style={`--swatch-color: ${color}`}
          aria-pressed={appearance.accent.toLowerCase() === color}
          aria-label={`Accent ${color}`}
          title={color}
          onclick={() => { appearance.accent = color; }}
        ></button>
      {/each}
    </div>
  </div>

  <label class="appearance-toggle">
    <input type="checkbox" bind:checked={appearance.highContrast} />
    High contrast
  </label>
  <label class="appearance-toggle">
    <input type="checkbox" bind:checked={appearance.cardAging} />
    Card aging — fade cards nobody has touched in a while
  </label>

  <footer class="appearance-footer">
    {#if canEdit}
      <p class="appearance-note">{dirty ? 'Unsaved' : 'Saved for everyone on this board'}</p>
      <div class="appearance-actions">
        <button type="button" class="quiet-button" disabled={!dirty || saving} onclick={onreset}><RotateCcw /> Reset</button>
        <button type="button" disabled={!dirty || saving} onclick={onsave}><Check /> {saving ? 'Saving…' : 'Save'}</button>
      </div>
    {:else}
      <p class="appearance-note">Preview only — editor access is required to save this board's look.</p>
      <div class="appearance-actions">
        <button type="button" class="quiet-button" disabled={!dirty} onclick={onreset}><RotateCcw /> Reset</button>
      </div>
    {/if}
  </footer>
</dialog>
