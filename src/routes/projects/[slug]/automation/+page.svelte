<script lang="ts">
  import { untrack } from "svelte";
  import {
    actionTypes,
    describeAction,
    describeTrigger,
    PRIORITIES,
    type AutomationAction,
    type Priority,
  } from "$lib/automation";
  import type { BoardProject, ProjectTag } from "$lib/types";
  import ProjectHeader from "$lib/components/ProjectHeader.svelte";
  import Zap from "@lucide/svelte/icons/zap";
  import Trash2 from "@lucide/svelte/icons/trash-2";

  let {
    data,
    form,
  }: {
    data: {
      project: BoardProject;
      rules: import("$lib/automation").AutomationRule[];
      lanes: string[];
      tags: ProjectTag[];
      username: string;
      starred: boolean;
    };
    form?: { message?: string; error?: string };
  } = $props();

  const tagNameById = $derived(
    new Map(data.tags.map((tag) => [tag.id, tag.name])),
  );

  let name = $state("");
  let triggerType = $state<"enters-lane" | "checklist-completed">(
    "enters-lane",
  );
  // The new-rule form seeds its defaults from the board's lanes/tags once,
  // at open — not a live binding, so `untrack` here is deliberate rather
  // than a missed reactivity dependency.
  let triggerLane = $state(untrack(() => data.lanes[0] ?? ""));

  type ActionRow = {
    type: AutomationAction["type"];
    lane: string;
    tagId: string;
    priority: Priority;
  };
  function blankRow(): ActionRow {
    return {
      type: "set-priority",
      lane: data.lanes[0] ?? "",
      tagId: data.tags[0]?.id ?? "",
      priority: "normal",
    };
  }
  let actionRows = $state<ActionRow[]>(untrack(() => [blankRow()]));

  // One JSON field carries the variable-length action list, the same idiom
  // this app already uses for board columns and card order — a plain
  // parallel-array form encoding breaks the moment a row's fields differ by
  // type, since only the fields a row actually renders get submitted.
  const actionsJson = $derived(
    JSON.stringify(
      actionRows.map((row) => {
        if (row.type === "move-to-lane")
          return { type: row.type, lane: row.lane };
        if (row.type === "add-tag" || row.type === "remove-tag")
          return { type: row.type, tagId: row.tagId };
        if (row.type === "set-priority")
          return { type: row.type, priority: row.priority };
        return { type: row.type };
      }),
    ),
  );

  function addRow() {
    if (actionRows.length < 6) actionRows = [...actionRows, blankRow()];
  }
  function removeRow(index: number) {
    if (actionRows.length > 1)
      actionRows = actionRows.filter((_, rowIndex) => rowIndex !== index);
  }
</script>

<svelte:head
  ><title>{data.project.name} automation · Cirrus Architecture Tool Board</title
  ></svelte:head
>

<main class="settings-shell">
  <ProjectHeader
    project={data.project}
    active="automation"
    canEdit={true}
    username={data.username}
    starred={data.starred}
  />
  <p class="subtitle page-intro">
    Rules that react to what already happened on the board — the same idea as
    Trello's own Butler. One trigger, up to six actions, applied automatically
    the next time a card matches.
  </p>

  {#if form?.message}<p class="success" role="status">{form.message}</p>{/if}
  {#if form?.error}<p class="action-errors" role="alert">{form.error}</p>{/if}

  <section class="settings-card">
    <p class="eyebrow">ACTIVE RULES</p>
    <h2>
      {data.rules.length
        ? `${data.rules.length} rule${data.rules.length === 1 ? "" : "s"}`
        : "No rules yet"}
    </h2>
    {#if data.rules.length}
      <ul class="automation-rule-list">
        {#each data.rules as rule (rule.id)}
          <li class="automation-rule" class:disabled={!rule.enabled}>
            <div class="automation-rule-copy">
              <strong>{rule.name}</strong>
              <p>
                When {describeTrigger(rule.trigger)}, {rule.actions
                  .map((action) => describeAction(action, tagNameById))
                  .join(", ")}.
              </p>
            </div>
            <div class="automation-rule-actions">
              <form method="POST" action="?/toggleRule">
                <input type="hidden" name="id" value={rule.id} />
                <input
                  type="hidden"
                  name="enabled"
                  value={String(!rule.enabled)}
                />
                <button type="submit" class="quiet-button"
                  >{rule.enabled ? "Disable" : "Enable"}</button
                >
              </form>
              <form
                method="POST"
                action="?/deleteRule"
                onsubmit={(event) => {
                  if (!confirm(`Delete the rule "${rule.name}"?`))
                    event.preventDefault();
                }}
              >
                <input type="hidden" name="id" value={rule.id} />
                <button
                  type="submit"
                  class="quiet-button danger icon-only"
                  aria-label={`Delete ${rule.name}`}><Trash2 /></button
                >
              </form>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="comment-empty">
        Nothing runs on this board yet. Try: "When a card is moved into Done,
        mark its due date complete."
      </p>
    {/if}
  </section>

  <section class="settings-card">
    <p class="eyebrow">NEW RULE</p>
    <h2>Build a rule</h2>
    <form method="POST" action="?/saveRule" class="policy-form automation-form">
      <label
        >Name <input
          name="name"
          bind:value={name}
          maxlength="80"
          placeholder="e.g. Wrap up on Done"
          required
        /></label
      >

      <fieldset class="automation-trigger">
        <legend>When…</legend>
        <label class="check">
          <input
            type="radio"
            name="triggerType"
            value="enters-lane"
            bind:group={triggerType}
          />
          A card is moved into
          <select
            name="triggerLane"
            bind:value={triggerLane}
            disabled={triggerType !== "enters-lane"}
          >
            {#each data.lanes as lane}<option value={lane}>{lane}</option
              >{/each}
          </select>
        </label>
        <label class="check">
          <input
            type="radio"
            name="triggerType"
            value="checklist-completed"
            bind:group={triggerType}
          />
          A card's checklist is completed
        </label>
      </fieldset>

      <fieldset class="automation-actions">
        <legend>Then…</legend>
        {#each actionRows as row, index}
          <div class="automation-action-row">
            <select bind:value={row.type}
              >{#each actionTypes as option}<option value={option.id}
                  >{option.label}</option
                >{/each}</select
            >
            {#if row.type === "move-to-lane"}
              <select bind:value={row.lane}
                >{#each data.lanes as lane}<option value={lane}>{lane}</option
                  >{/each}</select
              >
            {:else if row.type === "add-tag" || row.type === "remove-tag"}
              <select bind:value={row.tagId}
                >{#each data.tags as tag}<option value={tag.id}
                    >{tag.name}</option
                  >{/each}</select
              >
            {:else if row.type === "set-priority"}
              <select bind:value={row.priority}
                >{#each PRIORITIES as priority}<option value={priority}
                    >{priority}</option
                  >{/each}</select
              >
            {/if}
            {#if actionRows.length > 1}<button
                type="button"
                class="quiet-button danger icon-only"
                aria-label="Remove this action"
                onclick={() => removeRow(index)}><Trash2 /></button
              >{/if}
          </div>
        {/each}
        <button
          type="button"
          class="quiet-button automation-add-action"
          disabled={actionRows.length >= 6 || !data.lanes.length}
          onclick={addRow}>+ Add another action</button
        >
      </fieldset>

      <input type="hidden" name="actionsJson" value={actionsJson} />
      <button type="submit"><Zap /> Save rule</button>
    </form>
  </section>
</main>
