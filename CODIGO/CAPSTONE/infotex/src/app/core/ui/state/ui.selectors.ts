import { createSelector } from '@ngrx/store';
import { selectUiState } from './ui.reducer';

export const selectActiveTab = createSelector(selectUiState, s => s.activeTab);
