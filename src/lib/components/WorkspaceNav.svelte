<script lang="ts">
  import { page } from "$app/state";
  import LayoutGrid from "@lucide/svelte/icons/layout-grid";
  import MoreHorizontal from "@lucide/svelte/icons/more-horizontal";
  import Plus from "@lucide/svelte/icons/plus";
  import Search from "@lucide/svelte/icons/search";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import Cloud from "@lucide/svelte/icons/cloud";
  import Share2 from "@lucide/svelte/icons/share-2";
  import Avatar from "$lib/components/Avatar.svelte";
  import type { SearchHit, SearchHitKind, UserRole } from "$lib/types";

  let { username = "", role }: { username?: string; role?: UserRole } =
    $props();
  const canManage = $derived(role === "superadmin" || role === "admin");
  const canCreate = $derived(
    role === "superadmin" || role === "admin" || role === "editor",
  );
  const isActive = (path: string) => page.url.pathname.startsWith(path);

  let query = $state("");
  let results = $state<SearchHit[]>([]);
  let open = $state(false);
  let searching = $state(false);
  let activeIndex = $state(-1);
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  async function runSearch(value: string) {
    if (value.trim().length < 2) {
      results = [];
      open = false;
      return;
    }
    searching = true;
    try {
      const response = await fetch(`/search?q=${encodeURIComponent(value)}`);
      const body = (await response.json()) as { results?: SearchHit[] };
      results = body.results ?? [];
      open = true;
      activeIndex = -1;
    } catch {
      results = [];
    } finally {
      searching = false;
    }
  }

  function onInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(query), 220);
  }

  function closeSearch() {
    open = false;
    activeIndex = -1;
  }

  // Grouping is presentational only: `results` stays one flat, ordered list so
  // arrow-key navigation and `activeIndex` keep working across the groups.
  const GROUP_LABELS: Record<SearchHitKind, string> = {
    card: "Cards",
    wiki: "Wiki",
    graph: "Graph",
    file: "Files",
  };
  // Ordered by how specific an answer the pillar usually gives, not
  // alphabetically: a card or a page answers a question, a file often just
  // contains the word.
  const GROUP_ORDER: SearchHitKind[] = ["card", "wiki", "graph", "file"];
  const groups = $derived(
    GROUP_ORDER.map((kind) => ({
      kind,
      label: GROUP_LABELS[kind],
      hits: results.filter((hit) => hit.kind === kind),
    })).filter((group) => group.hits.length > 0),
  );

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      closeSearch();
      (event.currentTarget as HTMLElement).blur();
      return;
    }
    if (!open || !results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, results.length - 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      window.location.href = results[activeIndex].href;
    }
  }
</script>

<header class="workspace-nav">
  <a
    class="workspace-brand"
    href="/"
    aria-label="Cirrus Architecture Tool home"
  >
    <img class="brand-mark" src="/assets/brand/project-agile-mark.svg" alt="" />
    <span
      ><strong>Cirrus Architecture Tool</strong><small
        >Boards for focused delivery</small
      ></span
    >
  </a>
  {#if username}
    <nav aria-label="Primary navigation">
      <a
        class="nav-launcher"
        class:active={page.url.pathname === "/"}
        href="/"
        aria-label="All boards"><LayoutGrid /> Boards</a
      >
      <a class:active={isActive("/plan")} href="/plan">Plan</a>
      {#if canManage}<a class:active={isActive("/settings")} href="/settings"
          >Settings</a
        >{/if}
    </nav>
    <div
      class="nav-search"
      role="search"
      onfocusout={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          closeSearch();
      }}
    >
      <Search class="nav-search-icon" aria-hidden="true" />
      <input
        type="search"
        bind:value={query}
        oninput={onInput}
        onkeydown={onKeydown}
        onfocus={() => {
          if (results.length) open = true;
        }}
        placeholder="Search cards, wiki, and files"
        aria-label="Search cards, wiki pages, and files across every board"
        aria-expanded={open}
        role="combobox"
        aria-controls="nav-search-results"
      />
      {#if open}
        <div id="nav-search-results" class="nav-search-results" role="listbox">
          {#if searching}<p class="nav-search-status">Searching…</p>
          {:else if results.length}
            {#each groups as group (group.kind)}
              <p class="nav-search-group">{group.label}</p>
              <ol>
                {#each group.hits as hit (hit.kind + hit.id)}
                  {@const index = results.indexOf(hit)}
                  <li role="option" aria-selected={index === activeIndex}>
                    <a
                      href={hit.href}
                      class:active={index === activeIndex}
                      onmouseenter={() => {
                        activeIndex = index;
                      }}
                    >
                      <span class="nav-search-kind" aria-hidden="true">
                        {#if hit.kind === "card"}<LayoutGrid />{:else if hit.kind === "wiki"}<BookOpen
                          />{:else if hit.kind === "graph"}<Share2 />{:else}<Cloud />{/if}
                      </span>
                      <span class="nav-search-card-title"
                        >{#if hit.kind === "card"}<span
                            class="nav-search-card-number">#{hit.cardNumber}</span
                          >{/if}{hit.title}{#if hit.archived}<span
                            class="nav-search-archived">Archived</span
                          >{/if}</span
                      >
                      {#if hit.snippet}<span class="nav-search-snippet"
                          >{hit.snippet}</span
                        >{/if}
                      <span class="nav-search-card-meta"
                        >{hit.projectName} · {hit.meta}</span
                      >
                    </a>
                  </li>
                {/each}
              </ol>
            {/each}
          {:else}
            <p class="nav-search-status">Nothing matches “{query}”.</p>
          {/if}
        </div>
      {/if}
    </div>
    {#if canCreate}<a class="nav-create" href="/projects/new"><Plus /> Create</a
      >{/if}
    <div class="workspace-account">
      <Avatar name={username} size="md" /><span>{username}</span
      >{#if canManage}<a href="/settings" class="account-link">Settings</a>{/if}
      <details class="lane-menu account-more-menu">
        <summary aria-label="More account actions"><MoreHorizontal /></summary>
        <div class="lane-menu-body">
          <form
            method="POST"
            action="/?/logoutEverywhere"
            onsubmit={(event) => {
              if (
                !confirm(
                  "Sign out of every device? You will need to log in again here too.",
                )
              )
                event.preventDefault();
            }}
          >
            <button type="submit">Sign out everywhere</button>
          </form>
        </div>
      </details>
      <form method="POST" action="/?/logout">
        <button class="nav-signout" type="submit">Sign out</button>
      </form>
    </div>
  {:else}
    <span class="workspace-private">Private workspace</span>
  {/if}
</header>
