<script lang="ts">
  const pillars = [
    ['A house with continuity', 'Rooms change through time, weather, light, sound, and the consequences of earlier actions.'],
    ['Evidence before exposition', 'Meaning is reconstructed from objects, voices, broadcasts, and repeatable observations.'],
    ['Gentle, consequential agency', 'Choices shape access, trust, pacing, and later scenes without becoming a score chase.'],
    ['A memorable voice world', 'Dialogue and ambience carry identity, distance, hesitation, and emotional texture.'],
    ['Accessible immersion', 'Keyboard play, captions, readable focus states, adjustable text, and reliable save recovery are part of the experience.']
  ];
  const loop = ['Enter a room and read its emotional temperature.', 'Observe objects, light, sound, and characters.', 'Choose one small interaction: inspect, listen, ask, write, compare, or wait.', 'Record a journal entry with certainty and source.', 'Notice a consequence in the house or a relationship.', 'Continue, rest, or revisit a clue with new context.'];
  const emotions = ['Comfort', 'Curiosity', 'Awkwardness', 'Suspicion', 'Tenderness', 'Grief', 'Relief', 'Quiet dread'];
</script>

<svelte:head>
  <title>Vision · Project Agile</title>
  <meta name="description" content="The Quarantine game design document: experience pillars, core loop, world, voice, and release shape." />
</svelte:head>

<main class="vision-page">
  <header class="vision-hero">
    <div>
      <p class="eyebrow">GAME DESIGN DOCUMENT</p>
      <h1>The Quarantine</h1>
      <p class="vision-lede">An intimate first-person story game set in a carefully observed house, where ordinary routines become a readable system of memory, uncertainty, and choice.</p>
      <div class="vision-actions"><a class="quiet-button" href="/">Back to planner</a><a class="quiet-button" href="/projects/unity-plan">Open Unity board</a><span class="vision-doc-link">Canonical GDD · content/GAME_DESIGN_DOCUMENT.md</span></div>
    </div>
    <aside class="vision-promise"><span>PLAYER PROMISE</span><strong>Curious · oriented · quietly responsible</strong><p>The experience rewards attention rather than speed and lets meaning stay uncertain until enough evidence is available.</p></aside>
  </header>

  <section class="vision-section vision-pillars"><div class="section-heading"><p class="eyebrow">01 · EXPERIENCE</p><h2>What the game protects</h2></div><div class="vision-grid">{#each pillars as pillar, index}<article class="vision-card"><span class="vision-index">0{index + 1}</span><h3>{pillar[0]}</h3><p>{pillar[1]}</p></article>{/each}</div></section>

  <section class="vision-section vision-loop"><div class="section-heading"><p class="eyebrow">02 · RHYTHM</p><h2>The six-step player loop</h2><p class="subtitle">Small actions create durable context. The loop is calm, repeatable, and easy to understand.</p></div><ol>{#each loop as step, index}<li><span>{index + 1}</span><p>{step}</p></li>{/each}</ol></section>

  <section class="vision-section vision-two-up"><article class="vision-panel"><p class="eyebrow">03 · EMOTIONAL PALETTE</p><h2>Intensity is not the goal</h2><p>The performance moves between quiet states instead of demanding constant drama. Pauses, distance, gaze, and the option to defer a choice are as important as spoken lines.</p><div class="emotion-tags">{#each emotions as emotion}<span>{emotion}</span>{/each}</div></article><article class="vision-panel"><p class="eyebrow">04 · WORLD RULE</p><h2>The house is the primary character</h2><p>The first day teaches the space through a consistent clock, restrained sound bed, and a small set of rooms. Later days reuse the accepted interaction loop with new context, disruptions, and three endings.</p><p class="callout">No scene depends on a single unrepeatable input: state is saved and restored deterministically.</p></article></section>

  <section class="vision-section vision-release"><div class="section-heading"><p class="eyebrow">05 · RELEASE SHAPE</p><h2>A complete Day 1 vertical slice</h2></div><div class="release-grid"><div><strong>Ship with confidence</strong><p>One polished Windows build, one complete sound bed, text-first dialogue, a working journal, save/restore, accessibility settings, and a verified route through the first ending gate.</p></div><div><strong>Keep the rules small</strong><p>Every room, line, and state transition remains testable and memorable. Later days extend the same interaction language rather than introducing a new one.</p></div><div><strong>Explicit boundaries</strong><p>No combat, loot economy, procedural story generator, or unreviewed generated voice belongs in the first release.</p></div></div></section>
</main>
