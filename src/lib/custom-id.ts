export type ComponentAction =
  | 'start' | 'status' | 'rules' | 'profile' | 'motivation' | 'confirm'
  | 'preview' | 'submit' | 'back' | 'save' | 'cancel' | 'details' | 'reply'
  | 'next' | 'claim' | 'ask' | 'approve' | 'reject' | 'hold' | 'reassign' | 'audit' | 'appeal';

export function customId(action: ComponentAction, applicationId = 'new'): string {
  return `astraea:${action}:${applicationId}`;
}

export function parseCustomId(value: string): { action: ComponentAction; applicationId: string } | null {
  const match = /^astraea:([a-z]+):([A-Za-z0-9_-]+)$/.exec(value);
  return match ? { action: match[1] as ComponentAction, applicationId: match[2]! } : null;
}
