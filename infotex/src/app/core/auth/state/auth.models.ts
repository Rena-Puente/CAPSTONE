export interface User {
  id: string;
  name: string;
  email: string;
  // lo que necesites (roles, etc.)
}

export type AuthStatus = 'idle' | 'authenticating' | 'authenticated' | 'error';

export interface AuthState {
  user: User | null;
  token: string | null;
  status: AuthStatus;
  error: string | null;
}

export const initialAuthState: AuthState = {
  user: null,
  token: null,
  status: 'idle',
  error: null,
};
