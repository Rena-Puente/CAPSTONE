export interface UiState {
  activeTab: string; // por ejemplo: 'home' | 'perfil' | 'ajustes'
}

export const initialUiState: UiState = {
  activeTab: 'home',
};
