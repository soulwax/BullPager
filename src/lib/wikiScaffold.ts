import { pageIdFor } from '$lib/wikiFiles';

/**
 * The starter wiki a new project is created with.
 *
 * Three of the four pillars arrive with something in them: a board has lanes,
 * the cloud has a root folder, the graph has a canvas. The wiki arrived empty,
 * which is the one state that teaches a person nothing — an empty page list
 * does not say what a page is for, that pages link to each other, or that a
 * page can cite a card. So every project starts with a few real pages.
 *
 * These are *seeds, not fixtures*: they are written once at creation as
 * ordinary markdown files and never referenced again. Editing or deleting them
 * is expected, and nothing later reads them back or repairs them.
 */

export type WikiSeedPage = {
  /** Relative to the wiki root; may nest, e.g. `decisions/index`. */
  id: string;
  title: string;
  pinned?: boolean;
  body: string;
};

/**
 * Written into every project regardless of template.
 *
 * The syntax examples sit inside fenced code deliberately. A page that taught
 * `[[Page]]` by writing one would register a link to a page nobody intends to
 * write, and it would surface in "Wanted pages" as a chore the wiki invented
 * for itself. Fenced code is skipped by the link parser, so the guide can show
 * the grammar without polluting the very lists it is describing.
 */
const guide: WikiSeedPage = {
  id: 'how-this-wiki-works',
  title: 'How this wiki works',
  pinned: true,
  body: `# How this wiki works

Every page here is a markdown file in this project's cloud, under \`wiki/\`.
There is no hidden database: you can open, download, or edit the same file from
the **Cloud** tab, and a file you drop in there by hand shows up here as a page.

## Linking

Link to another page by its title:

\`\`\`md
See [[Decisions]] before changing the schedule.
[[Decisions|the decision log]] renders with your own wording.
\`\`\`

A link to a page nobody has written yet still works — it renders in a muted
style and offers to create that page. Those pending links are collected on the
wiki index under **Wanted pages**, so the wiki tells you what it is missing.

## Citing a board card

A card number links straight to the card:

\`\`\`md
Blocked by [[#42]], waiting on [[#17|the migration]].
\`\`\`

The link shows the card's real title, so it stays readable when the card is
renamed. The card returns the favour: open it on the board and a **Wiki**
section lists every page that cites it.

## Folders

A page id can nest. A page called \`decisions/2026-schema\` lives at
\`wiki/decisions/2026-schema.md\` and is grouped under *decisions* on the index.
`
};

const home = (name: string, purpose: string, sections: string): WikiSeedPage => ({
  id: 'home',
  title: 'Home',
  pinned: true,
  body: `# ${name}

${purpose}

${sections}

---

New here? Start with [[How this wiki works]].
`
});

/**
 * Per-template pages, keyed by template id.
 *
 * Kept short on purpose. A seed page earns its place by showing what belongs
 * in it; a long one is just text somebody has to delete before they can think.
 */
const byTemplate: Record<string, (name: string) => WikiSeedPage[]> = {
  'software-delivery': (name) => [
    home(name, 'How this team ships: what we are building, how it gets released, and what we decided along the way.',
      '## Start here\n\n- [[Definition of done]] — what "Done" on the board actually means\n- [[Release process]] — how a change reaches production\n- [[Decisions]] — why things are the way they are'),
    {
      id: 'definition-of-done',
      title: 'Definition of done',
      body: `# Definition of done

A card reaches **Done** when all of these are true. Edit this list until it
matches what this team actually requires — a definition nobody believes is
worse than none.

- [ ] The change is reviewed by someone who did not write it
- [ ] Tests cover the new behaviour, and the suite passes
- [ ] It is deployed and observed in production
- [ ] Anything surprising is written down in [[Decisions]]
`
    },
    {
      id: 'release-process',
      title: 'Release process',
      body: `# Release process

Describe the path from a merged change to a released one: who can release,
what gates exist, and how a release is rolled back.

## Rolling back

Write the rollback steps *before* you need them. The moment you need this
section is the worst possible moment to be writing it.
`
    },
    decisions()
  ],
  'content-launch': (name) => [
    home(name, 'Everything editorial: what we publish, in whose voice, and on what schedule.',
      '## Start here\n\n- [[Style guide]] — voice, tone, and the house rules\n- [[Publishing checklist]] — what happens before a piece goes live\n- [[Decisions]] — editorial calls worth remembering'),
    {
      id: 'style-guide',
      title: 'Style guide',
      body: `# Style guide

## Voice

Two or three sentences on how this publication sounds. Concrete beats abstract:
name the things you would reject in review.

## House rules

- Spellings and capitalisations we standardise on
- How we refer to the product, the company, and the reader
- What we never do
`
    },
    {
      id: 'publishing-checklist',
      title: 'Publishing checklist',
      body: `# Publishing checklist

- [ ] Edited by someone other than the author
- [ ] Every claim sourced or linked
- [ ] Images have alt text and the rights are clear
- [ ] Headline and summary written for someone who will not read the piece
- [ ] Scheduled, with the channel and time recorded on the card
`
    },
    decisions()
  ],
  'research-sprint': (name) => [
    home(name, 'What we are trying to learn, what we have found, and what we now believe.',
      '## Start here\n\n- [[Research questions]] — what this sprint is trying to answer\n- [[Findings]] — evidence as it accumulates\n- [[Decisions]] — what we concluded, and on what basis'),
    {
      id: 'research-questions',
      title: 'Research questions',
      body: `# Research questions

One heading per question. A good question here names what would change
depending on the answer — a question no answer would act on is not worth the
sprint.

## Question

**What we would do differently depending on the answer:**

**Status:** open / answered in [[Findings]]
`
    },
    {
      id: 'findings',
      title: 'Findings',
      body: `# Findings

Evidence, newest first. Keep the observation separate from the interpretation —
the observation stays true when the interpretation turns out to be wrong.

## Finding

**Observed:**

**What we think it means:**

**Confidence:** low / medium / high
`
    },
    decisions()
  ],
  'event-planning': (name) => [
    home(name, 'The single source of truth for this event: the plan, the people, and the run of show.',
      '## Start here\n\n- [[Run of show]] — the minute-by-minute plan\n- [[Suppliers and contacts]] — who to call when something goes wrong\n- [[Decisions]] — what was agreed, and by whom'),
    {
      id: 'run-of-show',
      title: 'Run of show',
      body: `# Run of show

| Time | What | Who | Notes |
| --- | --- | --- | --- |
|  |  |  |  |

Keep this the *live* document on the day. If it disagrees with someone's
memory, this wins.
`
    },
    {
      id: 'suppliers-and-contacts',
      title: 'Suppliers and contacts',
      body: `# Suppliers and contacts

Who to call, for what, and by when. Include the out-of-hours number — the
useful version of this page is the one that works at 6am on the day.

| Role | Name | Contact | Covers |
| --- | --- | --- | --- |
|  |  |  |  |
`
    },
    decisions()
  ],
  'customer-operations': (name) => [
    home(name, 'How requests are handled: the routes in, the standards we hold, and the answers we reuse.',
      '## Start here\n\n- [[Triage guide]] — how a request gets a priority and an owner\n- [[Canned answers]] — replies worth reusing\n- [[Escalation paths]] — who to involve, and when'),
    {
      id: 'triage-guide',
      title: 'Triage guide',
      body: `# Triage guide

## Priority

| Priority | Means | First response |
| --- | --- | --- |
| Urgent | Work is blocked and there is no workaround | Same day |
| High | Meaningful impact, workaround exists | 2 days |
| Normal | Everything else | 5 days |

## Ownership

A request without a named owner is nobody's. Assign one at triage even if the
work has not started.
`
    },
    {
      id: 'canned-answers',
      title: 'Canned answers',
      body: `# Canned answers

Reusable replies. Keep them human — a canned answer that reads as canned costs
more goodwill than writing a fresh one.

## Topic

> Draft the reply here.
`
    },
    {
      id: 'escalation-paths',
      title: 'Escalation paths',
      body: `# Escalation paths

Who to involve when the normal route is not working, what to tell them, and
what counts as enough to escalate. See [[Triage guide]] for priorities.
`
    }
  ],
  'game-production': (name) => [
    home(name, 'The design intent, the systems that serve it, and the decisions behind both.',
      '## Start here\n\n- [[Design pillars]] — what this game is, in three commitments\n- [[Systems]] — how the parts fit together\n- [[Decisions]] — what we tried, kept, and cut'),
    {
      id: 'design-pillars',
      title: 'Design pillars',
      body: `# Design pillars

Three commitments, no more. A pillar is only useful if it can *reject* an
otherwise good idea — if every proposal passes, these are adjectives, not
pillars.

## 1.

## 2.

## 3.
`
    },
    {
      id: 'systems',
      title: 'Systems',
      body: `# Systems

One page per system once they grow; start with headings here. For each: what
it is responsible for, what it must never do, and which pillar it serves.
`
    },
    decisions()
  ],
  'implementation-plan': (name) => [
    home(name, 'The plan of record: what is being built, in what order, and how we know each step is finished.',
      '## Start here\n\n- [[Scope]] — what is in, and explicitly what is out\n- [[Evidence]] — how each step is proven done\n- [[Decisions]] — the calls that shaped the plan'),
    {
      id: 'scope',
      title: 'Scope',
      body: `# Scope

## In scope

## Out of scope

The second list is the load-bearing one. Scope is defended by what it excludes,
and an unwritten exclusion is not an exclusion.
`
    },
    {
      id: 'evidence',
      title: 'Evidence',
      body: `# Evidence

How each step is proven finished — the command that runs, the artefact it
produces, the check somebody can repeat. Cite the card it closes with a
reference like the one shown in [[How this wiki works]].
`
    },
    decisions()
  ],
  'personal-tasks': (name) => [
    home(name, 'Your own notes alongside your own board.',
      '## Start here\n\n- [[Someday]] — things worth doing, but not now\n- [[Notes]] — anything that does not belong on a card'),
    {
      id: 'someday',
      title: 'Someday',
      body: `# Someday

Ideas that are worth keeping but do not deserve a card yet. Moving something
off the board and onto this page is a decision, not a failure — it stops the
board from lying about what you are actually doing.
`
    },
    { id: 'notes', title: 'Notes', body: '# Notes\n\nAnything that outlives a single card.\n' }
  ],
  'bug-triage': (name) => [
    home(name, 'How defects are reported, prioritised, and prevented from recurring.',
      '## Start here\n\n- [[Severity levels]] — what each level means and promises\n- [[Reproduction guide]] — what a usable bug report contains\n- [[Known issues]] — what we have already seen'),
    {
      id: 'severity-levels',
      title: 'Severity levels',
      body: `# Severity levels

| Severity | Means |
| --- | --- |
| S1 | Data loss, or everyone is blocked |
| S2 | A core path is broken; no reasonable workaround |
| S3 | Broken, but there is a workaround |
| S4 | Cosmetic or minor |

Severity is about impact, not effort. A one-line fix for an S1 is still an S1.
`
    },
    {
      id: 'reproduction-guide',
      title: 'Reproduction guide',
      body: `# Reproduction guide

A report is actionable when it has all four:

1. What you did, in steps someone else can follow
2. What you expected
3. What happened instead
4. Version, environment, and time — enough to find it in the logs

Anything less becomes a conversation before it becomes a fix.
`
    },
    { id: 'known-issues', title: 'Known issues', body: '# Known issues\n\nWhat we know is broken, and what to say when it is reported again.\n' }
  ],
  'writing-project': (name) => [
    home(name, 'The manuscript around the manuscript: what is true in this world, and what has already been decided.',
      '## Start here\n\n- [[Outline]] — the shape of the whole\n- [[Characters]] — who they are and what they want\n- [[Continuity]] — facts that must stay true'),
    { id: 'outline', title: 'Outline', body: '# Outline\n\nThe shape of the whole, at whatever resolution is currently useful.\n' },
    {
      id: 'characters',
      title: 'Characters',
      body: `# Characters

One heading each: what they want, what they fear, and what they are wrong
about. The third is usually where the story is.
`
    },
    {
      id: 'continuity',
      title: 'Continuity',
      body: `# Continuity

Facts that must stay true: names, dates, distances, who knew what and when.
The page exists so you can check rather than remember.
`
    }
  ],
  'blank-board': (name) => [
    home(name, 'Write what this project is here — the first thing a new person should read.',
      '## Start here\n\nAdd the pages this project needs. Link to one that does not exist yet and the wiki will offer to create it.'),
    guideless()
  ]
};

function decisions(): WikiSeedPage {
  return {
    id: 'decisions',
    title: 'Decisions',
    body: `# Decisions

Newest first. Record the decision *and* what you rejected — six months from now
the rejected option is the part nobody can reconstruct.

## Decision

**Date:**

**What we decided:**

**What we rejected, and why:**

**Revisit if:**
`
  };
}

/** A placeholder so `blank-board` still gets exactly two pages. */
function guideless(): WikiSeedPage {
  return {
    id: 'notes',
    title: 'Notes',
    body: '# Notes\n\nAnything that does not belong on a card.\n'
  };
}

/**
 * The pages to write for a new project.
 *
 * Ids are passed through `pageIdFor` so a seed can never produce a path the
 * store would reject — the seeds are authored by hand and this is the same
 * normalisation a typed page name gets.
 */
export function wikiSeedFor(templateId: string, projectName: string): WikiSeedPage[] {
  const build = byTemplate[templateId];
  const pages = build ? build(projectName) : [home(projectName, 'What this project is, and where to start.', '')];
  return [...pages, guide].map((page) => ({ ...page, id: pageIdFor(page.id) }));
}
