// core/store/storage.metareducer.ts
import { MetaReducer, ActionReducer } from '@ngrx/store';
import { localStorageSync } from 'ngrx-store-localstorage';

export function storageSyncReducer(reducer: ActionReducer<unknown>): ActionReducer<unknown> {
  return localStorageSync({
    keys: ['auth'],   // persiste “auth” (y agrega 'ui' si quieres)
    rehydrate: true
  })(reducer);
}

export const metaReducers: MetaReducer[] = [storageSyncReducer];
