let activeMediaQuery;
let activeMediaListener;

export function resolveTheme(preference, prefersDark = false) {
  if (preference === 'light' || preference === 'dark') return preference;
  return prefersDark ? 'dark' : 'light';
}

export function applyTheme(preference) {
  stopWatchingSystemTheme();
  const normalizedPreference = preference === 'light' || preference === 'dark' ? preference : 'system';
  const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
  const updateTheme = () => {
    const theme = resolveTheme(normalizedPreference, mediaQuery?.matches === true);
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  };

  updateTheme();
  if (normalizedPreference === 'system' && mediaQuery !== undefined) {
    activeMediaQuery = mediaQuery;
    activeMediaListener = updateTheme;
    activeMediaQuery.addEventListener('change', activeMediaListener);
  }

  return document.documentElement.dataset.theme;
}

function stopWatchingSystemTheme() {
  if (activeMediaQuery !== undefined && activeMediaListener !== undefined) {
    activeMediaQuery.removeEventListener('change', activeMediaListener);
  }
  activeMediaQuery = undefined;
  activeMediaListener = undefined;
}
