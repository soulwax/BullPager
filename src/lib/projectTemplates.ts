export type ProjectTemplate = {
  id: string;
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
    name: 'Software delivery',
    summary: 'Move features from a shared backlog to a shippable release.',
    bestFor: 'Product, engineering, and platform work',
    cadence: 'weekly',
    theme: 'ocean',
    lanes: ['Backlog', 'Ready', 'In progress', 'Review', 'Done']
  },
  {
    id: 'content-launch',
    name: 'Content launch',
    summary: 'Turn ideas into reviewed, scheduled, and published content.',
    bestFor: 'Editorial, marketing, and communications teams',
    cadence: 'weekly',
    theme: 'light',
    lanes: ['Ideas', 'Drafting', 'Review', 'Scheduled', 'Published']
  },
  {
    id: 'research-sprint',
    name: 'Research sprint',
    summary: 'Keep questions, evidence, synthesis, and decisions visible.',
    bestFor: 'Discovery, UX research, and technical investigation',
    cadence: 'biweekly',
    theme: 'midnight',
    lanes: ['Questions', 'Investigating', 'Synthesizing', 'Validated']
  },
  {
    id: 'event-planning',
    name: 'Event planning',
    summary: 'Coordinate an event from loose ideas through follow-up.',
    bestFor: 'Meetups, launches, workshops, and conferences',
    cadence: 'weekly',
    theme: 'ocean',
    lanes: ['Ideas', 'Planning', 'Confirmed', 'Live', 'Retrospective']
  },
  {
    id: 'customer-operations',
    name: 'Customer operations',
    summary: 'Give requests a clear owner, next step, and resolution path.',
    bestFor: 'Support, success, and internal service desks',
    cadence: 'weekly',
    theme: 'light',
    lanes: ['Inbox', 'Triage', 'In progress', 'Waiting', 'Resolved']
  },
  {
    id: 'game-production',
    name: 'Game production',
    summary: 'Shape ideas into tested, polished, and shipped game work.',
    bestFor: 'Game design, art, and production teams',
    cadence: 'biweekly',
    theme: 'midnight',
    lanes: ['Concept', 'Prototype', 'Production', 'QA', 'Shipped']
  },
];

export function templateById(id: string | null | undefined): ProjectTemplate {
  return projectTemplates.find((template) => template.id === id) ?? projectTemplates[0];
}
