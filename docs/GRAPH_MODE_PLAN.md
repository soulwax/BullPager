# Graph mode plan

## Purpose

Add a secondary visual mode for each project: a lightweight, infinite-board
graph for mapping relationships, flows, dependencies, journeys, and ideas. The
Kanban board remains the default and the source of truth for work state. Graph
mode is an optional visual workspace that makes structure and reasoning easier
to see without turning the product into a full design suite.

The first release should feel like a focused FigJam board: moveable cards,
connectors, grouping, comments, and zoom. It should be fast to load, easy to
understand, and safe to use with a keyboard. Free-form drawing, real-time
multi-cursor editing, and pixel-perfect design tooling are deliberately out of
scope for the first version.

## Implementation status

Stage 1 is implemented at `/projects/<slug>/graph`: persisted SVG nodes and
edges, note/group/linked-card creation, selection, pan, zoom, grid snapping,
inspector editing, canvas settings, and viewer-safe read-only access. Graph
mutations use transactional Postgres writes with optimistic project revisions.
The remaining stages extend this foundation with richer imports, undo history,
and conflict recovery UI.

## User experience

### Entry point

1. Add a compact `Board | Graph` mode switch beside the project name.
2. Keep the selected mode in the existing per-user project view state.
3. Opening a project always returns to the last mode used by that user; new
   users start in Board mode.
4. Add a `Graph` link in project settings for graph defaults and cleanup.

### Graph surface

- Infinite-feeling dark canvas with a subtle grid and a clear empty state.
- Pan with the middle mouse button, space + drag, or touch drag.
- Zoom with the wheel/pinch and visible `−`, `100%`, and `+` controls.
- Fit-to-content action restores a useful camera position.
- A narrow toolbar contains: select, hand/pan, add node, connect, group,
  undo, redo, fit, and mode switch.
- A minimap appears only when the graph has enough content to justify it.
- The inspector opens as a right drawer so the canvas remains the superstar.

### Nodes

Initial node types:

- `card`: linked to a Kanban card and mirrors its title, owner, labels, and
  completion state.
- `note`: free text for a decision, assumption, question, or reminder.
- `group`: a labelled visual region for a phase, system, persona, or theme.

Node actions:

- Double-click or `Enter` edits the title inline.
- `E` opens the full inspector.
- `Delete` archives the selected graph object after confirmation.
- `Ctrl/Cmd+D` duplicates the selection with a small offset.
- Dragging snaps to a soft 8px grid by default; a toolbar toggle disables snap.
- Card nodes offer `Open card` and `Create card from node` actions.

### Connectors

- Drag from a node handle to another node to create a directed edge.
- Edge types: `relates_to`, `depends_on`, `leads_to`, and `blocks`.
- The edge label is optional and editable from the inspector.
- Deleting an edge never deletes either node.
- Card dependencies can be imported as graph edges, with an explicit
  `Refresh from cards` action so graph edits never silently rewrite the plan.

### Selection and editing

- Single click selects one item; Shift-click toggles selection.
- Dragging an empty canvas rectangle selects multiple items.
- The inspector shows title, type, linked card, color, notes, and metadata.
- Large changes use the existing confirmation pattern; accidental drag and
  edge creation use undo instead of a blocking modal.
- `Esc` closes the inspector, cancels a connection, or clears selection.

### Empty state

Offer three one-click starters:

- `Map a workflow` — creates phase groups and a few example note nodes.
- `Map dependencies` — imports active cards and their known dependencies.
- `Start blank` — leaves a clean canvas with the add-node prompt.

Starters create real persisted graph data and are undoable. They must never
modify Kanban cards without an explicit confirmation.

## Data model

Use separate graph tables rather than embedding a large document in
`board_settings`.

### `board_project_graphs`

- `project_slug` primary key
- `revision` integer for optimistic concurrency
- `settings` JSON text: grid, snap size, background, default edge style
- `created_at`, `updated_at`

### `board_project_graph_nodes`

- `id` text primary key
- `project_slug`
- `kind` enum-like text: `card`, `note`, `group`
- `card_id` nullable, constrained by application validation
- `title` text
- `body` text
- `x`, `y`, `width`, `height` numeric values
- `color` text
- `collapsed` boolean
- `archived` boolean
- `created_by`, `created_at`, `updated_at`

### `board_project_graph_edges`

- `id` text primary key
- `project_slug`
- `source_node_id`, `target_node_id`
- `kind` enum-like text
- `label` text
- `created_by`, `created_at`, `updated_at`

### `board_project_graph_history`

Store compact reversible operations for the last 50 graph changes per project:

- `id`, `project_slug`, `actor`, `operation`, `payload`, `created_at`

History is not a replacement for the current graph. It supports undo, audit,
and recovery when an optimistic write loses a race.

## Persistence and concurrency

1. Load graph nodes, edges, settings, and the latest revision with the project.
2. Apply local pointer movement immediately for responsive interaction.
3. Debounce position writes for 250–400ms and batch all moved nodes together.
4. Send mutations with the revision last seen by the client.
5. Reject stale revisions with `409`, reload the affected graph, and offer
   `Keep mine` / `Use saved` instead of overwriting another user's work.
6. Persist structural actions immediately; persist continuous movement in
   batches.
7. Record an activity entry for imports, group changes, edge changes, and
   destructive actions, not every pointer movement.

Graph mode should work read-only for viewers. Editors can create and move
objects. Project owners, admins, and superadmins can change graph defaults and
remove any object; ordinary editors can remove objects they created.

## Implementation shape in SvelteKit

### Route and components

- Add `src/routes/projects/[slug]/graph/+page.svelte` for the graph surface.
- Add a shared `ProjectModeSwitch` component used by Board and Graph routes.
- Add `GraphCanvas`, `GraphToolbar`, `GraphInspector`, `GraphMinimap`, and
  `GraphNode` components under `src/lib/components/graph/`.
- Keep graph rendering isolated from the existing Kanban route so board
  performance and markup remain stable.
- Use SVG for the first renderer: it is enough for hundreds of nodes, gives
  accessible DOM targets, and avoids introducing a heavyweight editor runtime.
  Revisit canvas/WebGL only after measuring a real large graph.

### Server actions

Add project actions for:

- `createGraphNode`, `updateGraphNode`, `moveGraphNodes`
- `createGraphEdge`, `updateGraphEdge`, `deleteGraphEdge`
- `archiveGraphObjects`, `duplicateGraphSelection`
- `importCardDependencies`, `saveGraphSettings`
- `undoGraphOperation`

All actions validate project scope, node ownership, node kinds, coordinates,
text lengths, and edge endpoints on the server. Never trust a client-provided
project slug or card link.

### Card synchronization

- Creating a card node stores the card ID; it does not clone card content into a
  second editable card record.
- The graph reads the current card title/labels/status when rendering.
- A card title change is therefore visible in both modes without a sync job.
- Graph-only position, color, grouping, and edge metadata remain graph-owned.
- Deleting a Kanban card leaves a labelled archived graph node so the graph
  does not silently lose context.

## Accessibility and usability requirements

- Every node has an accessible name and `aria-selected` state.
- Provide a keyboard-only path: focus canvas, create node, move with arrows,
  connect with a command, edit, and delete with confirmation.
- Show zoom level and selection count in text, not only icons.
- Respect reduced-motion preferences and avoid animated camera jumps by default.
- Keep contrast at WCAG AA for node text, edge labels, focus rings, and toolbar
  controls.
- On narrow screens, make the inspector a bottom sheet and keep the toolbar
  horizontally scrollable.

## Delivery stages

### Stage 1 — persisted graph foundation

- Add types, Drizzle tables, bootstrap DDL, indexes, and migration tests.
- Add graph route with empty state, mode switch, and a static SVG canvas.
- Implement notes, selection, pan, zoom, and durable node positions.

### Stage 2 — useful relationships

- Add card nodes and dependency import.
- Add edge creation/deletion and edge kinds.
- Add groups, snap-to-grid, fit-to-content, and minimap.

### Stage 3 — collaboration safety

- Add revision checks, batched writes, conflict recovery, undo history, and
  activity entries.
- Add viewer/editor/owner permission tests and audit coverage.

### Stage 4 — polish and scale

- Add keyboard shortcuts, touch gestures, better empty-state starters, and
  visual themes that reuse project settings.
- Measure graphs with 100, 250, and 500 nodes; virtualize or switch renderer
  only if profiling demonstrates a need.

## Acceptance criteria

- Board mode remains the default and all current Kanban actions still work.
- A user can create, move, edit, group, connect, archive, and restore graph
  objects, then reload and see the exact same graph.
- A graph can import card dependencies without changing card state.
- Viewer accounts cannot mutate the graph; editor and owner behavior follows
  the project permission rules.
- Two concurrent edits cannot silently overwrite each other.
- Keyboard navigation, narrow-screen layout, reduced motion, and empty states
  are covered by automated tests and a manual interaction checklist.
