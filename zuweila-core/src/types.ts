export interface Flag {
  key: string;
  enabled: boolean;
  rollout_pct: number;
  description: string;
  created_at: string;
  updated_at: string;
}

export type ChangeType =
  | 'created'
  | 'enabled'
  | 'disabled'
  | 'deleted'
  | 'rollout_updated'
  | 'override_set'
  | 'override_removed';

export interface ChangeEvent {
  flagKey: string;
  type: ChangeType;
  timestamp: string;
}
