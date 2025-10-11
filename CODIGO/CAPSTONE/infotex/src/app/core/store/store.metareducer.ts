// core/store/storage.metareducer.ts
import { MetaReducer, ActionReducer } from '@ngrx/store';

const STORAGE_KEYS = ['auth'] as const;
type StorageKey = (typeof STORAGE_KEYS)[number];

function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readPersistedState(): Partial<Record<StorageKey, unknown>> {
  if (!isBrowserEnvironment()) {
    return {};
  }

  return STORAGE_KEYS.reduce<Partial<Record<StorageKey, unknown>>>((acc, key) => {
    try {
      const storedValue = window.localStorage.getItem(key);
      if (storedValue !== null) {
        acc[key] = JSON.parse(storedValue);
      }
    } catch (error) {
      console.warn('Error reading state from localStorage', error);
    }
    return acc;
  }, {});
}

function persistStateSlice(key: StorageKey, value: unknown): void {
  if (!isBrowserEnvironment()) {
    return;
  }

  try {
    if (value === undefined) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (error) {
    console.warn('Error saving state to localStorage', error);
  }
}

export function storageSyncReducer<State>(reducer: ActionReducer<State>): ActionReducer<State> {
  const rehydratedState = readPersistedState();

  return function (state, action) {
    const stateWithRehydration = state ?? ({ ...rehydratedState } as Partial<State>);
    const nextState = reducer(stateWithRehydration as State | undefined, action);

    STORAGE_KEYS.forEach((key) => {
      const value = (nextState as Record<string, unknown> | null | undefined)?.[key];
      persistStateSlice(key, value);
    });

    return nextState;
  };
}

export const metaReducers: MetaReducer[] = [storageSyncReducer];
