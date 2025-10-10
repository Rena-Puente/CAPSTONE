import { createActionGroup, props } from '@ngrx/store';

export const UiActions = createActionGroup({
  source: 'UI',
  events: {
    'Select Tab': props<{ tab: string }>(),
  },
});
