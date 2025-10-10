// core/auth/state/auth.reducer.ts
import { createFeature, createReducer, on } from '@ngrx/store';
import { AuthActions } from './auth.actions';

// ============================
// 1️⃣ Definición del estado
// ============================
export interface AuthState {
  logged: boolean;
  status: 'idle' | 'authenticating' | 'authenticated' | 'error';
  error: string | null;
}

// Estado inicial
export const initialAuthState: AuthState = {
  logged: false,
  status: 'idle',
  error: null,
};

// ============================
// 2️⃣ Definición del feature
// ============================
export const authFeature = createFeature({
  name: 'auth',
  reducer: createReducer(
    initialAuthState,
    on(AuthActions.login,        s => ({ ...s, status: 'authenticating', error: null })),
    on(AuthActions.loginSuccess, s => ({ ...s, logged: true, status: 'authenticated' })),
    on(AuthActions.loginFailure, (s, { error }) => ({ ...s, status: 'error', error })),
    on(AuthActions.logout,       () => initialAuthState),
  ),
});

// ============================
// 3️⃣ Exports para el Store
// ============================
export const {
  name: AUTH_FEATURE_KEY,
  reducer: authReducer,
  selectAuthState,
} = authFeature;
