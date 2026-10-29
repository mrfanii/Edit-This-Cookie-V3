import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import { applyTheme, resolveTheme } from '../js/theme.js';

function installThemeEnvironment(initialMatches = false) {
  const listeners = new Set();
  const cache = new Map();
  const mediaQuery = {
    matches: initialMatches,
    addEventListener(event, listener) {
      assert.equal(event, 'change');
      listeners.add(listener);
    },
    removeEventListener(event, listener) {
      assert.equal(event, 'change');
      listeners.delete(listener);
    },
    dispatchChange(matches) {
      this.matches = matches;
      for (const listener of listeners) listener({ matches });
    },
  };
  globalThis.window = {
    localStorage: {
      getItem: (key) => cache.get(key) ?? null,
      setItem: (key, value) => cache.set(key, value),
    },
    matchMedia(query) {
      assert.equal(query, '(prefers-color-scheme: dark)');
      return mediaQuery;
    },
  };
  globalThis.document = {
    documentElement: {
      dataset: {},
      style: {},
    },
  };
  return { mediaQuery, listeners, cache };
}

afterEach(() => {
  if (globalThis.window && globalThis.document) applyTheme('light');
  delete globalThis.window;
  delete globalThis.document;
});

test('resolveTheme honors explicit values and resolves system preferences', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('invalid', true), 'dark');
});

test('applyTheme writes explicit theme and color-scheme values', () => {
  const { listeners } = installThemeEnvironment(true);

  assert.equal(applyTheme('light'), 'light');
  assert.equal(document.documentElement.dataset.theme, 'light');
  assert.equal(document.documentElement.style.colorScheme, 'light');
  assert.equal(listeners.size, 0);

  assert.equal(applyTheme('dark'), 'dark');
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.equal(document.documentElement.style.colorScheme, 'dark');
  assert.equal(listeners.size, 0);
});

test('system theme follows media-query changes', () => {
  const { mediaQuery, listeners } = installThemeEnvironment(false);

  assert.equal(applyTheme('system'), 'light');
  assert.equal(listeners.size, 1);

  mediaQuery.dispatchChange(true);
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.equal(document.documentElement.style.colorScheme, 'dark');

  mediaQuery.dispatchChange(false);
  assert.equal(document.documentElement.dataset.theme, 'light');
});

test('switching from system to an explicit theme removes the media listener', () => {
  const { mediaQuery, listeners } = installThemeEnvironment(false);

  applyTheme('system');
  assert.equal(listeners.size, 1);

  applyTheme('dark');
  assert.equal(listeners.size, 0);
  mediaQuery.dispatchChange(false);
  assert.equal(document.documentElement.dataset.theme, 'dark');
});

test('invalid theme preferences fall back to the system setting', () => {
  const { listeners } = installThemeEnvironment(true);

  assert.equal(applyTheme('unexpected'), 'dark');
  assert.equal(listeners.size, 1);
});

function runThemeInitializer(getPreference) {
  const script = readFileSync(new URL('../js/theme-init.js', import.meta.url), 'utf8');
  runInNewContext(script, {
    window,
    document,
    chrome: {
      storage: {
        local: {
          get(key) {
            assert.equal(key, 'options_theme');
            return getPreference();
          },
        },
      },
    },
  });
}

test('theme changes cache the preference immediately for the next page', () => {
  const { cache } = installThemeEnvironment(true);

  applyTheme('dark');
  assert.equal(cache.get('editThisCookie.theme'), 'dark');
  applyTheme('light');
  assert.equal(cache.get('editThisCookie.theme'), 'light');
  applyTheme('system');
  assert.equal(cache.get('editThisCookie.theme'), 'system');
  assert.equal(document.documentElement.dataset.theme, 'dark');
});

test('cached theme is applied before an asynchronous preference read completes', async () => {
  const { cache } = installThemeEnvironment(false);
  cache.set('editThisCookie.theme', 'dark');
  let resolvePreference;
  const preference = new Promise((resolve) => {
    resolvePreference = resolve;
  });

  runThemeInitializer(() => preference);
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.equal(document.documentElement.style.colorScheme, 'dark');

  resolvePreference({ options_theme: 'light' });
  await preference;
  assert.equal(document.documentElement.dataset.theme, 'light');
  assert.equal(cache.get('editThisCookie.theme'), 'light');
});

test('cached system preference resolves against the current OS theme on each load', async () => {
  for (const prefersDark of [true, false]) {
    const { cache } = installThemeEnvironment(prefersDark);
    cache.set('editThisCookie.theme', 'system');
    const preference = Promise.resolve({ options_theme: 'system' });

    runThemeInitializer(() => preference);
    assert.equal(document.documentElement.dataset.theme, prefersDark ? 'dark' : 'light');
    await preference;
    assert.equal(cache.get('editThisCookie.theme'), 'system');
  }
});

test('initial theme works without cache access and tolerates an unreadable preference', async () => {
  installThemeEnvironment(true);
  Object.defineProperty(window, 'localStorage', {
    get() {
      throw new Error('Storage is unavailable');
    },
  });
  const preference = Promise.reject(new Error('Preference is unavailable'));

  runThemeInitializer(() => preference);
  await preference.catch(() => {});
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.equal(applyTheme('light'), 'light');
});

test('first load reads the saved explicit theme independently of application startup', async () => {
  const { cache } = installThemeEnvironment(false);
  const preference = Promise.resolve({ options_theme: 'dark' });

  runThemeInitializer(() => preference);
  await preference;
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.equal(cache.get('editThisCookie.theme'), 'dark');
});
