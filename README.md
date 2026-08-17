# Project Agile Web

Local SvelteKit board for the migration plan. It reads the existing authority
documents and presents packet state, filters, dependencies, and detail without
introducing a database.

## Run

Requires Node.js 24+ and npm.

```sh
npm install
npm run check
npm test
npm run dev
```

Set `APP_LOGIN`, `APP_PASSWORD`, and `APP_SESSION_SECRET` in a local `.env`
file before opening the board. The login uses an HTTP-only, same-site, signed
session cookie. Never commit `.env` or place these values in client-side code.

The default source paths are `../../UNITY_PLAN.md` and
`../../tmp/HUMAN_AGILE_GUIDE.md`. Override them with `HAP_UNITY_PATH` and
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

Vercel serves the board and preview actions. Apply actions are intentionally
disabled in hosted deployments because serverless filesystems are not the
authoritative checkout. Use the local project server for confirmed writes.

For Vercel, add the same three variables in Project Settings → Environment
Variables for Preview and Production. Rotate the password and session secret by
replacing the values and redeploying.

## Persistence choice

The current board does not need a database: the plan files remain the authority,
and the signed cookie is enough for one protected deployment. For durable
multi-account features, use **Supabase Postgres + Supabase Auth**. It provides
Postgres, cookie-based SSR sessions, and row-level security in one service; use
Supabase's `@supabase/ssr` integration for SvelteKit rather than storing users
or sessions in browser storage.

Add persistence in this order:

1. `packet_events` — append-only state transitions with actor, timestamp,
   source hash, and diff.
2. `comments` — review notes linked to a packet event or packet ID.
3. `projects` and `memberships` — only when more than one plan is managed.
4. Supabase Storage — only when evidence files or screenshots need durable
   uploads.

Keep the Markdown authority as import/export during the first database phase;
do not create a second editable packet model until the migration decision is
explicit. If you want a separate authentication provider, Neon Postgres is a
reasonable database alternative, but it requires choosing and operating auth
separately.

References: [Supabase SSR package guidance](https://supabase.com/docs/guides/auth/choosing-a-server-package)
and [Supabase's SvelteKit user-management tutorial](https://supabase.com/docs/guides/getting-started/tutorials/with-sveltekit).

The packet detail panel includes a validated transition form. Preview validates
required fields and shows a unified diff in memory. Apply requires the exact
packet ID and the unchanged source hash, then replaces the source atomically.
