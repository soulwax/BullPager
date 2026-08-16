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

The default source paths are `../../UNITY_PLAN.md` and
`../../tmp/HUMAN_AGILE_GUIDE.md`. Override them with `HAP_UNITY_PATH` and
`HAP_GUIDE_PATH` when using fixtures.

The packet detail panel includes a preview-only state transition form. It
validates required fields and shows a unified diff in memory; this release does
not write either authority document.
