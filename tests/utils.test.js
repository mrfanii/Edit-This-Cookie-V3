import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  _getMessage,
  addBlockRule,
  deleteBlockRule,
  deleteReadOnlyRule,
  downloadCookies,
  filterMatchesCookie,
  getHost,
  getUrlVars,
  setLoaderVisible,
  switchReadOnlyRule,
} from '../js/utils.js';

afterEach(() => {
  delete globalThis.chrome;
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.$;
});

test('getHost normalizes www hosts and rejects invalid URLs', () => {
  assert.equal(getHost('https://www.example.com/account'), 'example.com');
  assert.equal(getHost('https://sub.example.com/'), 'sub.example.com');
  assert.equal(getHost('not a url'), null);
});

test('filterMatchesCookie evaluates every configured regular expression', () => {
  const rule = {
    domain: '^\\.example\\.com$',
    name: '^session_',
    value: 'token$|value$',
  };

  assert.equal(filterMatchesCookie(rule, 'session_id', '.example.com', 'secret-token'), true);
  assert.equal(filterMatchesCookie(rule, 'other', '.example.com', 'secret-token'), false);
  assert.equal(filterMatchesCookie({ name: '^empty$' }, 'empty', undefined, undefined), true);
});

test('filterMatchesCookie safely rejects invalid regular expressions', () => {
  assert.equal(filterMatchesCookie({ domain: '[' }, 'session', '.example.com', 'value'), false);
  assert.equal(filterMatchesCookie({ name: '(' }, 'session', '.example.com', 'value'), false);
});

test('addBlockRule rejects empty rules without touching cookies', () => {
  const data = { filters: [] };

  assert.equal(addBlockRule(data, {}), false);
  assert.equal(addBlockRule(data, { domain: '   ' }), false);
  assert.deepEqual(data.filters, []);
});

test('addBlockRule returns the existing index for duplicate rules', () => {
  const data = { filters: [{ name: '^session$' }] };

  assert.equal(addBlockRule(data, { name: '^session$' }), 0);
  assert.deepEqual(data.filters, [{ name: '^session$' }]);
});

test('addBlockRule stores a new rule and deletes only matching cookies', () => {
  const removed = [];
  globalThis.chrome = {
    cookies: {
      getAll(details, callback) {
        assert.deepEqual(details, { partitionKey: {} });
        callback([
          {
            name: 'session',
            domain: '.example.com',
            value: 'secret',
            path: '/',
            secure: true,
            storeId: '0',
            partitionKey: { topLevelSite: 'https://top.example' },
          },
          { name: 'other', domain: '.example.com', value: 'secret', path: '/', secure: true, storeId: '0' },
          { name: 'session', domain: '.other.com', value: 'secret', path: '/', secure: false, storeId: '0' },
        ]);
      },
      remove(details, callback) {
        removed.push(details);
        callback(details);
      },
    },
  };
  const data = { filters: [] };
  const rule = { name: '^session$', domain: 'example\\.com$' };

  assert.equal(addBlockRule(data, rule), undefined);

  assert.deepEqual(data.filters, [rule]);
  assert.equal(removed.length, 1);
  assert.equal(removed[0].name, 'session');
  assert.equal(removed[0].storeId, '0');
  assert.deepEqual(removed[0].partitionKey, { topLevelSite: 'https://top.example' });
});

test('switchReadOnlyRule distinguishes partition identities and toggles exact matches', () => {
  const first = {
    name: 'session',
    domain: '.example.com',
    path: '/',
    storeId: '0',
    partitionKey: { topLevelSite: 'https://first.example' },
  };
  const second = {
    ...first,
    partitionKey: { topLevelSite: 'https://second.example' },
  };
  const data = { readOnly: [] };

  assert.equal(switchReadOnlyRule(data, first), true);
  assert.equal(switchReadOnlyRule(data, second), true);
  assert.equal(data.readOnly.length, 2);
  assert.equal(switchReadOnlyRule(data, { ...first, partitionKey: { ...first.partitionKey } }), false);
  assert.deepEqual(data.readOnly, [second]);
});

test('delete helpers remove only the requested rule', () => {
  const data = {
    filters: [{ name: 'first' }, { name: 'second' }],
    readOnly: [{ name: 'first' }, { name: 'second' }],
  };

  deleteBlockRule(data, 0);
  deleteReadOnlyRule(data, 1);

  assert.deepEqual(data.filters, [{ name: 'second' }]);
  assert.deepEqual(data.readOnly, [{ name: 'first' }]);
});

test('_getMessage adds the extension message prefix and forwards arguments', () => {
  const calls = [];
  globalThis.chrome = {
    i18n: {
      getMessage(key, args) {
        calls.push({ key, args });
        return 'translated';
      },
    },
  };

  assert.equal(_getMessage('Options', ['one']), 'translated');
  assert.deepEqual(calls, [{ key: 'editThis_Options', args: ['one'] }]);
});

test('getUrlVars exposes query keys by index and name', () => {
  globalThis.window = { location: { href: 'chrome-extension://id/page.html?theme=dark&locale=fa' } };

  const vars = getUrlVars();

  assert.deepEqual([...vars], ['theme', 'locale']);
  assert.equal(vars.theme, 'dark');
  assert.equal(vars.locale, 'fa');
});

test('downloadCookies creates a sanitized download and revokes the object URL', async () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  let capturedBlob;
  let revokedUrl;
  let link;
  let clicked = false;
  let appended = false;
  let removed = false;

  URL.createObjectURL = (blob) => {
    capturedBlob = blob;
    return 'blob:test';
  };
  URL.revokeObjectURL = (url) => {
    revokedUrl = url;
  };
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'a');
      link = {
        style: {},
        click() {
          clicked = true;
        },
      };
      return link;
    },
    body: {
      appendChild(received) {
        appended = received === link;
      },
      removeChild(received) {
        removed = received === link;
      },
    },
  };

  try {
    downloadCookies('cookie text', 'https://sub.example.com/path', 'netscape');

    assert.equal(link.download, 'sub.example.com_cookies.txt');
    assert.equal(link.href, 'blob:test');
    assert.equal(capturedBlob.type, 'text/plain;charset=utf-8');
    assert.equal(await capturedBlob.text(), 'cookie text');
    assert.equal(clicked, true);
    assert.equal(appended, true);
    assert.equal(removed, true);
    assert.equal(revokedUrl, 'blob:test');
  } finally {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  }
});

test('downloadCookies ignores undefined content', () => {
  let created = false;
  globalThis.document = {
    createElement() {
      created = true;
    },
  };

  downloadCookies(undefined, 'https://example.com/', 'json');

  assert.equal(created, false);
});

test('setLoaderVisible delegates to the matching jQuery visibility action', () => {
  const actions = [];
  globalThis.$ = (selector) => {
    assert.equal(selector, '#loader-container');
    return {
      show: () => actions.push('show'),
      hide: () => actions.push('hide'),
    };
  };

  setLoaderVisible(true);
  setLoaderVisible(false);

  assert.deepEqual(actions, ['show', 'hide']);
});
