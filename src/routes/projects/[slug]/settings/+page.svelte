<script lang="ts">
  import type { BoardProject } from "$lib/types";
  import { projectBackgrounds } from "$lib/projectBackgrounds";
  import { appearanceFromSettings } from "$lib/boardAppearance";
  import { invalidateAll } from "$app/navigation";
  import ProjectHeader from "$lib/components/ProjectHeader.svelte";
  import Check from "@lucide/svelte/icons/check";
  import Plus from "@lucide/svelte/icons/plus";
  import X from "@lucide/svelte/icons/x";

  let {
    data,
    form,
  }: {
    data: {
      slug: string;
      prefix: string;
      project: BoardProject;
      settings: Record<string, string>;
      created?: boolean;
      username: string;
      starred: boolean;
    };
    form?: { message?: string; error?: string };
  } = $props();
  const setting = (name: string, fallback = "") =>
    data.settings[`${data.prefix}${name}`] ?? fallback;
  let backgroundUploadStatus = $state("");
  let customBackgroundUrl = $derived(
    setting("background_custom_path")
      ? `/projects/${data.slug}/files/raw?path=${encodeURIComponent(setting("background_custom_path"))}`
      : "",
  );

  async function uploadBackground(file: File) {
    const body = new FormData();
    body.set("file", file);
    backgroundUploadStatus = "Uploading…";
    try {
      const response = await fetch("?/uploadBackground", {
        method: "POST",
        body,
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error("Upload failed.");
      backgroundUploadStatus = "Uploaded";
      await invalidateAll();
    } catch {
      backgroundUploadStatus = "Upload failed. Try a smaller image.";
    } finally {
      setTimeout(() => {
        backgroundUploadStatus = "";
      }, 2400);
    }
  }

  // The board's own quick appearance panel already applies every other
  // appearance field immediately, board-wide, with no save button — a
  // built-in background swatch here should not be the one exception left
  // waiting behind this page's big "Save project settings" click. It posts
  // through the same ?/saveAppearance action the panel uses, carrying the
  // rest of the board's current look along so nothing else resets.
  let backgroundApplyStatus = $state("");
  async function chooseBackground(id: string) {
    if (setting("background", "none") === id) return;
    backgroundApplyStatus = "Applying…";
    const body = new FormData();
    for (const [key, value] of Object.entries(appearance))
      body.set(key, String(value));
    body.set("background", id);
    try {
      const response = await fetch("?/saveAppearance", {
        method: "POST",
        body,
        headers: { accept: "application/json" },
      });
      backgroundApplyStatus = response.ok ? "Applied" : "Could not apply";
      if (response.ok) await invalidateAll();
    } catch {
      backgroundApplyStatus = "Could not apply";
    } finally {
      setTimeout(() => {
        backgroundApplyStatus = "";
      }, 1800);
    }
  }
  let lanes = $state<{ original: string; name: string }[]>(
    (() => {
      try {
        const saved = JSON.parse(setting("lanes", "[]")) as unknown;
        if (Array.isArray(saved)) {
          const names = saved
            .filter(
              (lane): lane is string =>
                typeof lane === "string" && Boolean(lane.trim()),
            )
            .map((lane) => lane.trim());
          if (names.length >= 2)
            return names.map((lane) => ({ original: lane, name: lane }));
        }
      } catch {
        /* use the safe fallback below */
      }
      return [
        { original: "Backlog", name: "Backlog" },
        { original: "In progress", name: "In progress" },
        { original: "Done", name: "Done" },
      ];
    })(),
  );
  // Read-only here — used only to carry the board's current look along when
  // a background swatch below applies immediately, so that request doesn't
  // reset the fields the quick panel owns. Edited from the board itself.
  const appearance = $derived(
    appearanceFromSettings(data.settings, data.prefix),
  );
  function addLane() {
    if (lanes.length < 8)
      lanes = [...lanes, { original: "", name: `Column ${lanes.length + 1}` }];
  }
  function removeLane(index: number) {
    if (lanes.length > 2)
      lanes = lanes.filter((_, laneIndex) => laneIndex !== index);
  }
</script>

<svelte:head
  ><title>{data.project.name} settings · Cirrus Architecture Tool Board</title
  ></svelte:head
>

<main class="settings-shell">
  <ProjectHeader
    project={data.project}
    active="settings"
    canEdit={true}
    username={data.username}
    starred={data.starred}
  />
  <p class="subtitle page-intro">
    Tune the workflow and defaults for this project only. Theme, card style,
    density, and the rest of the board's look live on the board itself —
    press <kbd>V</kbd> or use the palette button — and apply instantly there,
    no save button.
  </p>

  {#if data.created}<p class="success" role="status">
      Project created. Review the defaults below before inviting collaborators.
    </p>{/if}
  {#if form?.message}<p class="success" role="status">{form.message}</p>{/if}
  {#if form?.error}<p class="action-errors" role="alert">{form.error}</p>{/if}

  <section class="settings-card project-summary-card">
    <div>
      <p class="eyebrow">PROJECT OVERVIEW</p>
      <h2>{data.project.name}</h2>
      <p class="subtitle">
        <code>{data.project.slug}</code> · owned by {data.project.owner} · {setting(
          "template",
          "custom",
        )} template
      </p>
    </div>
    <a class="quiet-button" href={`/projects/${data.project.slug}`}
      >Open workspace</a
    >
    <span class="health valid"
      >{setting("visibility", data.project.visibility)}</span
    >
  </section>

  <section class="settings-card">
    <p class="eyebrow">WORKFLOW</p>
    <h2>Project defaults</h2>
    <p class="subtitle">
      These values are intentionally small and reversible. Column changes apply
      to this project’s single board.
    </p>
    <form method="POST" action="?/saveSettings" class="policy-form">
      <label
        >Workflow key <input
          name="workflowKey"
          value={setting("workflow_key")}
          maxlength="120"
          placeholder="Optional team reference"
        /></label
      >
      <label
        >Review cadence <select name="cadence"
          ><option
            value="weekly"
            selected={setting("cadence", "weekly") === "weekly"}>Weekly</option
          ><option value="biweekly" selected={setting("cadence") === "biweekly"}
            >Every two weeks</option
          ><option value="monthly" selected={setting("cadence") === "monthly"}
            >Monthly</option
          ></select
        ></label
      >
      <label
        >Project visibility <select name="visibility"
          ><option
            value="private"
            selected={setting("visibility", "private") === "private"}
            >Private</option
          ><option value="shared" selected={setting("visibility") === "shared"}
            >Shared</option
          ></select
        ></label
      >
      <fieldset class="background-picker wide-field">
        <legend
          >Board background{#if backgroundApplyStatus}<small
              class="field-status">{backgroundApplyStatus}</small
            >{/if}</legend
        >
        <p class="field-help">
          Choose a color, gradient, or photo for this board — applies
          immediately, no separate save. Cards stay opaque and readable on
          every option.
        </p>
        <div class="background-swatch-grid">
          <label class="background-swatch none-swatch" title="Plain midnight"
            ><input
              type="radio"
              name="background"
              value="none"
              checked={setting("background", "none") === "none"}
              onchange={() => chooseBackground("none")}
            /><span class="swatch-check" aria-hidden="true"><Check /></span
            ></label
          >
          {#each projectBackgrounds.filter((background) => background.kind !== "none") as background}
            <label
              class="background-swatch"
              class:photo-swatch={Boolean(background.src)}
              style={background.src
                ? `--swatch-image: url("${background.src}")`
                : `--swatch: ${background.color}`}
              title={background.label}
            >
              <input
                type="radio"
                name="background"
                value={background.id}
                checked={setting("background") === background.id}
                onchange={() => chooseBackground(background.id)}
              />
              <span class="swatch-check" aria-hidden="true"><Check /></span>
            </label>
          {/each}
          {#if customBackgroundUrl}
            <label
              class="background-swatch photo-swatch"
              style={`--swatch-image: url("${customBackgroundUrl}")`}
              title="Your uploaded image"
            >
              <input
                type="radio"
                name="background"
                value="custom"
                checked={setting("background") === "custom"}
                onchange={() => chooseBackground("custom")}
              />
              <span class="swatch-check" aria-hidden="true"><Check /></span>
            </label>
          {/if}
          <label
            class="background-swatch upload-swatch"
            title="Upload your own image"
          >
            <input
              type="file"
              accept="image/*"
              onchange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void uploadBackground(file);
                event.currentTarget.value = "";
              }}
            />
            <span class="upload-swatch-label"
              ><Plus />
              {customBackgroundUrl
                ? "Replace"
                : "Upload"}{#if backgroundUploadStatus}<small
                  >{backgroundUploadStatus}</small
                >{/if}</span
            >
          </label>
        </div>
        <p class="field-help">
          Custom uploads are stored with this project's files and shown just
          like a photo background. Every other appearance choice — theme, card
          style, density, and the rest — lives on the board itself: press
          <kbd>V</kbd> or use the palette button in the board header.
        </p>
      </fieldset>
      <label
        >Lane layout <select name="laneStyle"
          ><option
            value="scroll"
            selected={setting("lane_style", "scroll") === "scroll"}
            >Horizontal scroll</option
          ><option value="wrap" selected={setting("lane_style") === "wrap"}
            >Wrap lanes</option
          ></select
        ></label
      >
      <fieldset class="lane-editor wide-field">
        <legend>Board columns</legend>
        <p class="field-help">
          Rename, add, or remove columns. Existing cards follow a renamed
          column.
        </p>
        {#each lanes as lane, index}<div class="lane-editor-row">
            <input
              name="laneName"
              value={lane.name}
              maxlength="48"
              aria-label={`Column ${index + 1} name`}
              oninput={(event) => {
                lanes[index] = {
                  ...lanes[index],
                  name: (event.currentTarget as HTMLInputElement).value,
                };
                lanes = [...lanes];
              }}
            /><input
              type="hidden"
              name="laneOriginal"
              value={lane.original}
            />{#if lanes.length > 2}<button
                type="button"
                class="quiet-button danger icon-only"
                aria-label={`Remove ${lane.name || `column ${index + 1}`}`}
                onclick={() => removeLane(index)}><X /></button
              >{/if}
          </div>{/each}<button
          type="button"
          class="quiet-button lane-add-button"
          disabled={lanes.length >= 8}
          onclick={addLane}><Plus /> Add column</button
        >
      </fieldset>
      <label class="check"
        ><input
          type="checkbox"
          name="showOutcomes"
          checked={setting("show_outcomes", "true") !== "false"}
        /> Show card outcomes</label
      >
      <button type="submit">Save project settings</button>
    </form>
  </section>
</main>
