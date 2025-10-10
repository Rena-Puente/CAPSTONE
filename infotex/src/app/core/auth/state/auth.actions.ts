// core/auth/state/auth.actions.ts
import { createActionGroup, emptyProps, props } from '@ngrx/store';

export const AuthActions = createActionGroup({
  source: 'Auth',
  events: {
    'Login': emptyProps(),
    'Login Success': emptyProps(),
    'Login Failure': props<{ error: string }>(), 
    'Logout': emptyProps(),
  },
});
