import { createFeature, createReducer, on } from '@ngrx/store';
import { initialUiState } from './ui.models';
import { UiActions } from './ui.actions';

export const uiFeature = createFeature({
  name: 'ui',
  reducer: createReducer(
    initialUiState,
    on(UiActions.selectTab, (state, { tab }) => ({ ...state, activeTab: tab }))
  ),
});

export const {
  name: UI_FEATURE_KEY,
  reducer: uiReducer,
  selectUiState,
} = uiFeature;
