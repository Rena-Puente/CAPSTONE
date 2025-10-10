// core/auth/state/auth.selectors.ts
import { createSelector } from '@ngrx/store';
import { selectAuthState } from './auth.reducer';

export const selectIsLogged = createSelector(selectAuthState, s => s.logged);
