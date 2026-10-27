import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { applyTheme, resolveTheme } from '../js/theme.js';

function installThemeEnvironment(initialMatches = false) {
  const listeners = new Set();
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
  return { mediaQuery, listeners };
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
