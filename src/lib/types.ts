export type PacketState = 'OPEN' | 'ACTIVE' | 'PARTIAL' | 'BLOCKED' | 'CLOSED' | 'DROPPED';

export type Packet = {
  id: string;
  title: string;
  state: PacketState;
  owner: string;
  /** Human-facing planning taxonomy; optional for older local fixtures. */
  category?: string;
  subcategory?: string;
  tags?: string[];
  /** Ordered, milestone-prefixed implementation slices within a packet. */
  handles?: string[];
  /** Concrete ordered instructions for taking the packet from preparation to proof. */
  runbook?: string;
  dependsOn: string[];
  milestone: string;
  outcome: string;
  inputs: string;
  files: string;
  doNotTouch: string;
  checks: string;
  evidence: string;
  remainder: string;
  steps: string;
};

export type PlanView = {
  valid: boolean;
  sourceMode: 'local authority files' | 'hosted read-only snapshot';
  errors: string[];
  guidePath: string;
  unityPath: string;
  packets: Packet[];
  stateCounts: Record<PacketState, number>;
  readyIds: string[];
  transitionHistory: TransitionRecord[];
  packetNotes: PacketNote[];
  projectSettings: Record<string, string>;
  sourceDigest?: string;
};

export type TransitionRecord = {
  packetId: string;
  nextState: PacketState;
  owner: string;
  evidence: string;
  remainder: string;
  createdAt: string;
};

export type PacketNote = {
  id: string;
  packetId: string;
  author: string;
  body: string;
  createdAt: string;
};

export type UserRole = 'superadmin' | 'admin' | 'editor' | 'viewer';

export type BoardUser = {
  username: string;
  role: UserRole;
  createdAt: string;
};

export type BoardProject = {
  slug: string;
  name: string;
  owner: string;
  visibility: 'private' | 'shared';
};

export type ProjectTag = {
  id: string;
  projectSlug: string;
  name: string;
  color: string;
  createdAt: string;
};

export type ProjectChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

export type ProjectComment = {
  id: string;
  projectSlug: string;
  cardId: string;
  author: string;
  body: string;
  createdAt: string;
};

export type ProjectCardAttachment = {
  id: string;
  projectSlug: string;
  cardId: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
  createdBy: string;
  createdAt: string;
};

export type ProjectFile = {
  id: string;
  projectSlug: string;
  path: string;
  content: string;
  mimeType: string;
  size: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  previewUrl?: string;
};

export type ProjectFolder = {
  id: string;
  projectSlug: string;
  path: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type GraphNodeKind = 'note' | 'card' | 'group';

export type GraphNode = {
  id: string;
  projectSlug: string;
  kind: GraphNodeKind;
  cardId: string | null;
  title: string;
  body: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  collapsed: boolean;
  archived: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type GraphEdgeKind = 'relates_to' | 'depends_on' | 'leads_to' | 'blocks';

export type GraphEdge = {
  id: string;
  projectSlug: string;
  sourceNodeId: string;
  targetNodeId: string;
  kind: GraphEdgeKind;
  label: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type GraphSettings = {
  revision: number;
  snap: boolean;
  gridSize: number;
  background: 'midnight' | 'ocean' | 'light';
};

export type ProjectCard = {
  id: string;
  projectSlug: string;
  title: string;
  details: string;
  lane: string;
  position: number;
  archived: boolean;
  checklist: ProjectChecklistItem[];
  coverColor: string;
  watcherCount: number;
  watching: boolean;
  owner: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  dueDate: string | null;
  dueComplete: boolean;
  startDate: string | null;
  /** Permanent, sequential per-project number assigned at creation — never
   * reused or renumbered, matching Trello's card numbers. */
  cardNumber: number;
  attachmentCount: number;
  tags: ProjectTag[];
  createdAt: string;
  updatedAt: string;
};

/** Fields a source sync (e.g. the Unity plan mirror) owns on a card; the board
 * UI renders these read-only and the server rejects writes to them. */
export const SOURCE_OWNED_CARD_FIELDS = ['title', 'details', 'checklist', 'owner', 'priority', 'coverColor'] as const;
export type SourceOwnedCardField = (typeof SOURCE_OWNED_CARD_FIELDS)[number];

/** A reusable card shape saved from an existing card, scoped to the list it
 * was saved from. Stored as one JSON board setting, the same idiom as WIP
 * limits — a template is board config, not a card, so it only needs a
 * per-template id for delete/select, not the full card id space. */
export type CardTemplate = {
  id: string;
  name: string;
  title: string;
  details: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  coverColor: string;
  checklist: { id: string; text: string }[];
  tagIds: string[];
};

export type ProjectViewState = {
  density?: 'comfortable' | 'compact';
  collapsed?: Record<string, boolean>;
  query?: string;
  priority?: 'all' | 'low' | 'normal' | 'high' | 'urgent';
  tag?: string;
  assignee?: string;
  showArchived?: boolean;
};

export type ProjectActivity = {
  id: string;
  projectSlug: string;
  actor: string;
  action: 'created' | 'updated' | 'deleted';
  cardId: string;
  summary: string;
  createdAt: string;
};

export type SearchCardResult = {
  cardId: string;
  cardNumber: number;
  title: string;
  lane: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  archived: boolean;
  projectSlug: string;
  projectName: string;
};

export type TransitionPreview = {
  packetId: string;
  nextState: PacketState;
  diff: string;
  sourceHash: string;
  message: string;
};
