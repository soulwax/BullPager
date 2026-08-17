<script lang="ts">
  import { onMount } from 'svelte';
  import type { ProjectCard } from '$lib/types';

  let { cards }: { cards: ProjectCard[] } = $props();
  let selectedId = $state('');
  let voices = $state<SpeechSynthesisVoice[]>([]);
  let voiceName = $state('');
  let rate = $state(1);
  let pitch = $state(1);
  let playing = $state(false);
  let paused = $state(false);
  let message = $state('');
  let supported = $state(false);

  const selected = $derived(cards.find((card) => card.id === selectedId));
  const previewText = $derived(selected ? `${selected.title}. ${selected.details}`.trim() : '');

  $effect(() => {
    if (!selectedId || !cards.some((card) => card.id === selectedId)) selectedId = cards[0]?.id ?? '';
  });

  function refreshVoices() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      supported = false;
      return;
    }
    supported = true;
    voices = window.speechSynthesis.getVoices().toSorted((a, b) => a.name.localeCompare(b.name));
    if (!voiceName && voices.length) {
      voiceName = voices.find((voice) => voice.lang.startsWith('en') && /Alex|Samantha|Daniel|Karen/i.test(voice.name))?.name ?? voices[0].name;
    }
  }

  function speak() {
    if (!previewText || !supported || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      message = 'Apple voice preview is unavailable in this browser.';
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(previewText);
    utterance.voice = voices.find((voice) => voice.name === voiceName) ?? null;
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.onstart = () => { playing = true; paused = false; message = 'Playing preview.'; };
    utterance.onend = () => { playing = false; paused = false; message = 'Preview complete.'; };
    utterance.onerror = () => { playing = false; paused = false; message = 'Preview could not be played.'; };
    window.speechSynthesis.speak(utterance);
  }

  function togglePause() {
    if (!playing) return;
    if (paused) {
      window.speechSynthesis.resume();
      paused = false;
      message = 'Resuming preview.';
    } else {
      window.speechSynthesis.pause();
      paused = true;
      message = 'Preview paused.';
    }
  }

  function stop() {
    window.speechSynthesis?.cancel();
    playing = false;
    paused = false;
    message = 'Preview stopped.';
  }

  function selectionChanged() {
    if (playing) stop();
  }

  onMount(() => {
    refreshVoices();
    window.speechSynthesis?.addEventListener('voiceschanged', refreshVoices);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', refreshVoices);
  });
</script>

<section class="apple-voice-preview" aria-labelledby="apple-voice-title">
  <div class="voice-preview-heading">
    <div>
      <p class="eyebrow">APPLE VOICE PREVIEW</p>
      <h2 id="apple-voice-title">Hear the work before it moves</h2>
      <p>Uses voices installed on this Mac or browser. Nothing is uploaded.</p>
    </div>
    <div class="voice-platform"><span>{!supported ? 'Browser voice unavailable' : voices.length ? `${voices.length} voices available` : 'Loading voices…'}</span><button type="button" class="voice-refresh" onclick={refreshVoices} aria-label="Refresh available voices">↻</button></div>
  </div>

  {#if cards.length}
    <div class="voice-preview-controls">
      <label>Card
        <select bind:value={selectedId} onchange={selectionChanged} aria-label="Card to preview">
          {#each cards as card}<option value={card.id}>{card.title}</option>{/each}
        </select>
      </label>
      <label>Voice
        <select bind:value={voiceName} onchange={selectionChanged} aria-label="Apple voice" disabled={!supported || !voices.length}>
          {#each voices as voice}<option value={voice.name}>{voice.name} · {voice.lang}</option>{/each}
        </select>
      </label>
      <label>Rate <output>{rate.toFixed(1)}×</output>
        <input type="range" min="0.5" max="2" step="0.1" bind:value={rate} aria-label="Voice rate" />
      </label>
      <label>Pitch <output>{pitch.toFixed(1)}</output>
        <input type="range" min="0.5" max="1.5" step="0.1" bind:value={pitch} aria-label="Voice pitch" />
      </label>
      <div class="voice-preview-actions">
        {#if playing}<button type="button" onclick={togglePause}>{paused ? '▶ Resume' : 'Ⅱ Pause'}</button>{:else}<button type="button" onclick={speak} disabled={!previewText || !supported || !voices.length}>▶ Preview</button>{/if}
        <button type="button" class="quiet-button" onclick={stop} disabled={!playing}>Stop</button>
      </div>
    </div>
    <p class="voice-preview-copy">{previewText || 'Add card details to create a preview.'}</p>
    <p class="voice-preview-meta">{previewText.length} characters · {selected?.owner || 'unassigned'} · {selected?.priority || 'normal'} priority</p>
  {:else}
    <p class="empty">Create a card to unlock voice preview.</p>
  {/if}
  <p class="voice-preview-status" role="status" aria-live="polite">{message}</p>
</section>
