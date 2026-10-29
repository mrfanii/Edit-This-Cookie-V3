// This classic script runs in <head>, before page modules and the first paint.
(() => {
  const cacheKey = 'editThisCookie.theme';
  let preference = 'system';
  try {
    preference = window.localStorage.getItem(cacheKey) ?? preference;
  } catch {
    // Storage may be unavailable; the system theme is still usable.
  }

  function applyInitialTheme(value) {
    const normalized = value === 'light' || value === 'dark' ? value : 'system';
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = normalized === 'system' ? (prefersDark ? 'dark' : 'light') : normalized;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      window.localStorage.setItem(cacheKey, normalized);
    } catch {
      // Applying the theme does not depend on being able to cache it.
    }
  }

  applyInitialTheme(preference);
  // Read only the theme now, without waiting for all application settings.
  chrome.storage.local
    .get('options_theme')
    .then(({ options_theme }) => applyInitialTheme(options_theme))
    .catch(() => {});
})();
