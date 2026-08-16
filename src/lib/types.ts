export type PacketState = 'OPEN' | 'ACTIVE' | 'PARTIAL' | 'BLOCKED' | 'CLOSED' | 'DROPPED';

export type Packet = {
  id: string;
  title: string;
  state: PacketState;
  owner: string;
  dependsOn: string[];
  milestone: string;
  outcome: string;
  checks: string;
  evidence: string;
  remainder: string;
  steps: string;
};

export type PlanView = {
  valid: boolean;
  errors: string[];
  guidePath: string;
  unityPath: string;
  packets: Packet[];
  stateCounts: Record<PacketState, number>;
  readyIds: string[];
};

export type TransitionPreview = {
  packetId: string;
  nextState: PacketState;
  diff: string;
  message: string;
};
