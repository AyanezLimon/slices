const KEY = 'slices-theme';

/** 'system' | 'light' | 'dark' — se guarda local para pintar bien antes de cargar datos. */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  try { localStorage.setItem(KEY, theme || 'system'); } catch (e) { /* sin almacenamiento */ }
}

export function storedTheme() {
  try { return localStorage.getItem(KEY) || 'system'; } catch (e) { return 'system'; }
}
