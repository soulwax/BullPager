export type PacketState = 'OPEN' | 'ACTIVE' | 'PARTIAL' | 'BLOCKED' | 'CLOSED' | 'DROPPED';

export type Packet = {
  id: string;
  title: string;
  state: PacketState;
  owner: string;
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
  type: ProjectType;
  owner: string;
  visibility: 'private' | 'shared';
};

export type ProjectType = 'standard' | 'storyline';

export type ProjectCard = {
  id: string;
  projectSlug: string;
  title: string;
  details: string;
  lane: string;
  owner: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectViewState = {
  density?: 'comfortable' | 'compact';
  collapsed?: Record<string, boolean>;
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

export type TransitionPreview = {
  packetId: string;
  nextState: PacketState;
  diff: string;
  sourceHash: string;
  message: string;
};
