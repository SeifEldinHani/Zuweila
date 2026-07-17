import type { StorageAdapter, ChangeType, ChangeEvent } from 'zuweila-sdk';

export type { StorageAdapter } from 'zuweila-sdk';

export interface WriteStorageAdapter extends StorageAdapter {
  flagExists(key: string): Promise<boolean>;
  createFlag(key: string, description: string, enabled: boolean): Promise<void>;
  setEnabled(key: string, enabled: boolean): Promise<void>;
  deleteFlag(key: string): Promise<void>;
  setRollout(key: string, percent: number): Promise<void>;
  setOverride(key: string, contextKey: string, value: boolean): Promise<void>;
  removeOverride(key: string, contextKey: string): Promise<void>;
  appendAuditEvent(flagKey: string, type: ChangeType): Promise<void>;
  publish(event: ChangeEvent): Promise<void>;
}
