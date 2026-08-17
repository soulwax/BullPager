export type ProjectTemplate = {
  id: string;
  type: 'standard' | 'storyline';
  name: string;
  summary: string;
  bestFor: string;
  cadence: 'weekly' | 'biweekly' | 'monthly';
  theme: 'midnight' | 'ocean' | 'light';
  lanes: string[];
};

/** Small, opinionated starting points. Projects can tune these defaults later. */
export const projectTemplates: ProjectTemplate[] = [
  {
    id: 'software-delivery',
    type: 'standard',
    name: 'Software delivery',
    summary: 'Move features from a shared backlog to a shippable release.',
    bestFor: 'Product, engineering, and platform work',
    cadence: 'weekly',
    theme: 'ocean',
    lanes: ['Backlog', 'Ready', 'In progress', 'Review', 'Done']
  },
  {
    id: 'content-launch',
    type: 'standard',
    name: 'Content launch',
    summary: 'Turn ideas into reviewed, scheduled, and published content.',
    bestFor: 'Editorial, marketing, and communications teams',
    cadence: 'weekly',
    theme: 'light',
    lanes: ['Ideas', 'Drafting', 'Review', 'Scheduled', 'Published']
  },
  {
    id: 'research-sprint',
    type: 'standard',
    name: 'Research sprint',
    summary: 'Keep questions, evidence, synthesis, and decisions visible.',
    bestFor: 'Discovery, UX research, and technical investigation',
    cadence: 'biweekly',
    theme: 'midnight',
    lanes: ['Questions', 'Investigating', 'Synthesizing', 'Validated']
  },
  {
    id: 'event-planning',
    type: 'standard',
    name: 'Event planning',
    summary: 'Coordinate an event from loose ideas through follow-up.',
    bestFor: 'Meetups, launches, workshops, and conferences',
    cadence: 'weekly',
    theme: 'ocean',
    lanes: ['Ideas', 'Planning', 'Confirmed', 'Live', 'Retrospective']
  },
  {
    id: 'customer-operations',
    type: 'standard',
    name: 'Customer operations',
    summary: 'Give requests a clear owner, next step, and resolution path.',
    bestFor: 'Support, success, and internal service desks',
    cadence: 'weekly',
    theme: 'light',
    lanes: ['Inbox', 'Triage', 'In progress', 'Waiting', 'Resolved']
  },
  {
    id: 'game-production',
    type: 'standard',
    name: 'Game production',
    summary: 'Shape ideas into tested, polished, and shipped game work.',
    bestFor: 'Game design, art, and production teams',
    cadence: 'biweekly',
    theme: 'midnight',
    lanes: ['Concept', 'Prototype', 'Production', 'QA', 'Shipped']
  },
  {
    id: 'storyline-editor',
    type: 'storyline',
    name: 'Storyline editor',
    summary: 'Develop scenes, dialogue, branches, and voice-ready story beats in one governed workspace.',
    bestFor: 'Narrative design, dialogue, and audio direction',
    cadence: 'weekly',
    theme: 'midnight',
    lanes: ['Corpus', 'Drafting', 'Voice review', 'Validated', 'Shipped']
  }
];

export function templateById(id: string | null | undefined): ProjectTemplate {
  return projectTemplates.find((template) => template.id === id) ?? projectTemplates[0];
}
