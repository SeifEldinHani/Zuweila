import type { Flag, ChangeEvent } from '../types';

export interface StorageAdapter {
  listFlags(): Promise<Flag[]>;
  getFlag(key: string): Promise<Flag | null>;
  getOverrides(key: string): Promise<Record<string, boolean>>;
  onChange(callback: (event: ChangeEvent) => void): Promise<void>;
  disconnect(): Promise<void>;
}
