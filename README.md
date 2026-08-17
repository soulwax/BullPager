# Project Agile Web

Local SvelteKit board for the migration plan. It reads the existing authority
documents and presents packet state, filters, dependencies, and detail. Vercel
deployments can persist confirmed transitions in Neon Postgres while retaining
the Markdown plan as the read-only baseline.

## Run

Requires Node.js 24+ and npm.

```sh
npm install
npm run check
npm test
npm run test:ci
npm run dev
```

Set `APP_LOGIN`, `APP_PASSWORD`, and `APP_SESSION_SECRET` in a local `.env`
file before opening the board. The login uses an HTTP-only, same-site, signed
session cookie. Never commit `.env` or place these values in client-side code.

The default source paths are `../../UNITY_PLAN.md` and
`../../external/docs/HUMAN_AGILE_GUIDE.md`. Override them with `HAP_UNITY_PATH` and
`HAP_GUIDE_PATH` when using fixtures.

## Deploy to Vercel

This repository is configured with the official Vercel adapter and pins the
Node.js 24 runtime. The authority documents are bundled as read-only snapshots
under `content/` so a deployment does not depend on files outside this project.

Import `soulwax/project-agile-web` in Vercel, keep the project root at the
repository root, and use the detected SvelteKit framework preset. Or use the
Vercel CLI:

```sh
npx vercel
npx vercel --prod
```

Vercel serves the board and preview actions. To enable durable hosted applies,
create a Neon database (Vercel Marketplace or Neon console) and add its pooled
connection string as `DATABASE_URL` for Preview and Production. The app creates
`packet_transitions` on first use, stores append-only transition events, and
overlays the latest event per packet on the bundled Markdown snapshot. Without
`DATABASE_URL`, hosted applies remain disabled with an actionable error. Local
development continues to write the authority file atomically.

### Database layer

Neon Postgres is wrapped with [Drizzle ORM](https://orm.drizzle.team/). The typed
schema lives in `src/lib/server/db/schema.ts`; persistence reads and writes use
Drizzle's typed query builder, while the existing bootstrap DDL only creates or
upgrades tables on first use so current deployments keep their data. For planned
schema changes, review the schema and use `npm run db:generate`, then apply the
reviewed migration with `npm run db:migrate`.

For Vercel, add the same three variables in Project Settings → Environment
Variables for Preview and Production. Rotate the password and session secret by
replacing the values and redeploying.

### GitHub sign-in

Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in Vercel Production (and
Preview if needed). Configure the GitHub OAuth callback as
`https://<your-domain>/auth/github/callback`, or set `GITHUB_OAUTH_REDIRECT`
explicitly. The GitHub login `soulwax` is always mapped to `superadmin`; other
GitHub identities are linked to an existing username or provisioned as
`viewer` users. OAuth state is protected with a short-lived HTTP-only cookie.

## Persistence model

The first persistence slice is intentionally small: `packet_transitions` is an
append-only audit trail with packet ID, next state, owner, evidence, remainder,
source hash, and timestamp. Markdown remains the import/export baseline; the
latest database event wins at runtime. A future multi-account phase can add
actors, comments, and memberships without changing the board API.

Project workspaces now persist their own cards in `board_project_cards` and
per-user board view preferences in `board_project_views`. Creating, editing,
moving, or deleting a card is a server-side write; lane collapse and density
changes are debounced and saved for the signed-in user. Reloading or opening the
same project on another device restores the saved project data and that user's
last board view. Cards also retain priority and an optional due date, while
`board_project_activity` keeps a compact audit trail of card changes.
Card order is stored explicitly, so lane moves and within-lane reordering
survive reloads; reorder writes now commit as one transaction so a partial lane
update cannot leave the board in an impossible order. Larger edits open in a
confirmation modal before they are written. Cards can be duplicated or
archived and restored without deleting their history.

Each project also gets a small Trello-style label palette in
`board_project_tags`. Editors can create color-coded labels, assign several to a
card, filter the board by label, and remove labels without losing card history.
Cards can be assigned to known board users through the owner suggestions, and
the board toolbar can filter down to one assignee or unassigned work. That
filter is saved per user alongside search, labels, priority, density, and lane
collapse preferences.
Cards can also carry up to 30 persistent checklist items. The editor shows
completion progress directly on each card, while confirmed card edits preserve
checked state, labels, ordering, archive state, and checklist text across
reloads and duplication.
Optional color covers add a fast visual cue to cards and are persisted with the
same transactional edit. Every card can also expose a copyable deep link using
`?card=<id>`, so handoffs reopen the exact card editor.
Signed-in viewers can watch cards without being assigned to them. Watchers are
stored per user, shown as a compact card badge, and survive reloads and lane
changes.
Each card has a durable comments thread for decisions, handoffs, and status
updates. Editors can add comments; authors can remove their own comments, while
administrators can moderate any comment. Comment changes are also reflected in
the project activity trail.

The packet detail panel includes a validated transition form. Preview validates
required fields and shows a unified diff in memory. Apply requires the exact
packet ID and the unchanged source hash, then replaces the source atomically.

## Projects and templates

Administrators and editors can open **New project** from the board or Settings.
The guided flow creates a private project record and seeds a reversible workflow
template. It currently includes starting points for software delivery, content
launches, research sprints, event planning, customer operations, and game
production. Each project gets its own settings namespace for cadence, visibility,
theme, card density, lane layout, outcomes, and comma-separated lane names.

The Unity migration plan remains the bundled reference board. New project
metadata and defaults are persisted in `board_projects` and `board_settings`, so
the creation flow is useful immediately while project-specific packet sources can
be attached in a later iteration.

The Unity board is also available at `/projects/unity-plan`. On planner load,
all canonical Unity packets are mirrored into that Kanban project using stable
`unity-mig-*` card IDs. The sync is additive: it fills missing cards, keeps
existing card edits and ordering intact, and can safely resume after a network
failure. The `/vision` route provides the readable game design document and
links back to both the planner and the Unity board.

The planned secondary visual workspace is documented in
[`docs/GRAPH_MODE_PLAN.md`](docs/GRAPH_MODE_PLAN.md). It keeps Kanban as the
default while adding a focused, persisted graph canvas for relationships,
dependencies, journeys, and free-form project notes.

The first graph-mode slice is now available at `/projects/<slug>/graph`. It
supports persisted note, group, and linked-card objects, SVG pan/zoom, snapping,
object editing, connections, canvas settings, and read-only viewer access.
Graph writes use Postgres transactions and an atomic per-project revision. A
stale editor receives a conflict response instead of overwriting a newer graph;
card/tag/checklist writes also commit as one transaction.

## Visual assets

The small interface icon set under `static/assets/icons/` comes from
[Tabler Icons](https://github.com/tabler/tabler-icons), licensed under MIT. The
included license text is kept beside the downloaded SVGs.

The empty-state illustrations under `static/assets/illustrations/` come from
unDraw and include a local copy of its license. They are used only as interface
supporting art, not redistributed as a standalone asset pack.
