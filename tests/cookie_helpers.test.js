import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  Filter,
  buildCookieUrl,
  buildUrl,
  clonePartitionKey,
  compareCookies,
  cookieForCreationFromFullCookie,
  cookiesHaveSameIdentity,
  cookiesToStringGenerator,
  deleteAll,
  deleteCookie,
  getAllCookies,
  getCookie,
  partitionKeysEqual,
} from '../js/cookie_helpers.js';

afterEach(() => {
  delete globalThis.chrome;
});

test('buildUrl strips a leading dot and follows the current protocol', () => {
  assert.equal(buildUrl('.example.com', '/account', 'https://example.com/'), 'https://example.com/account');
  assert.equal(buildUrl('example.com', '/', 'http://example.com/'), 'http://example.com/');
});

test('buildCookieUrl uses the cookie secure flag and normalized domain', () => {
  assert.equal(buildCookieUrl({ domain: '.example.com', path: '/a', secure: true }), 'https://example.com/a');
  assert.equal(buildCookieUrl({ domain: 'example.com', path: '/', secure: false }), 'http://example.com/');
});

test('partition helpers clone supported fields without sharing references', () => {
  const source = {
    topLevelSite: 'https://top.example',
    hasCrossSiteAncestor: false,
    ignored: 'value',
  };
  const clone = clonePartitionKey(source);

  assert.deepEqual(clone, {
    topLevelSite: 'https://top.example',
    hasCrossSiteAncestor: false,
  });
  assert.notStrictEqual(clone, source);
  assert.equal(clonePartitionKey(null), undefined);
});

test('partition key equality handles missing and different partition keys', () => {
  assert.equal(partitionKeysEqual(undefined, undefined), true);
  assert.equal(partitionKeysEqual(undefined, {}), false);
  assert.equal(partitionKeysEqual({ topLevelSite: 'https://a.example' }, { topLevelSite: 'https://a.example' }), true);
  assert.equal(partitionKeysEqual({ topLevelSite: 'https://a.example' }, { topLevelSite: 'https://b.example' }), false);
  assert.equal(partitionKeysEqual({ hasCrossSiteAncestor: false }, { hasCrossSiteAncestor: true }), false);
});

test('getAllCookies requests partitioned and unpartitioned cookies without mutating details', () => {
  const details = { url: 'https://example.com', storeId: '0' };
  let receivedDetails;
  globalThis.chrome = {
    cookies: {
      getAll(received, callback) {
        receivedDetails = received;
        callback([]);
      },
    },
  };

  getAllCookies(details, () => {});

  assert.deepEqual(receivedDetails, {
    url: 'https://example.com',
    storeId: '0',
    partitionKey: {},
  });
  assert.deepEqual(details, { url: 'https://example.com', storeId: '0' });
});

test('getCookie includes store and a cloned cookie partition key', () => {
  const cookie = {
    name: 'session',
    domain: '.example.com',
    path: '/',
    secure: true,
    storeId: '0',
    partitionKey: {
      topLevelSite: 'https://top-level.example',
      hasCrossSiteAncestor: true,
    },
  };
  let receivedDetails;
  globalThis.chrome = {
    cookies: {
      get(details, callback) {
        receivedDetails = details;
        callback(cookie);
      },
    },
  };

  getCookie(cookie, () => {});

  assert.deepEqual(receivedDetails, {
    url: 'https://example.com/',
    name: 'session',
    storeId: '0',
    partitionKey: {
      topLevelSite: 'https://top-level.example',
      hasCrossSiteAncestor: true,
    },
  });
  assert.notStrictEqual(receivedDetails.partitionKey, cookie.partitionKey);
});

test('getCookie omits optional store and partition information', () => {
  let receivedDetails;
  globalThis.chrome = {
    cookies: {
      get(details, callback) {
        receivedDetails = details;
        callback(null);
      },
    },
  };

  getCookie({ name: 'plain', domain: 'example.com', path: '/', secure: false }, () => {});

  assert.deepEqual(receivedDetails, {
    url: 'http://example.com/',
    name: 'plain',
  });
});

test('deleteCookie supports partition keys and reports whether removal succeeded', () => {
  const calls = [];
  const callbackResults = [];
  globalThis.chrome = {
    cookies: {
      remove(details, callback) {
        calls.push(details);
        callback(calls.length === 1 ? details : null);
      },
    },
  };

  deleteCookie('https://example.com/', 'partitioned', '0', { topLevelSite: 'https://top.example', hasCrossSiteAncestor: true }, (removed) =>
    callbackResults.push(removed),
  );
  deleteCookie('https://example.com/', 'legacy', '0', (removed) => callbackResults.push(removed));

  assert.deepEqual(calls[0], {
    url: 'https://example.com/',
    name: 'partitioned',
    storeId: '0',
    partitionKey: { topLevelSite: 'https://top.example', hasCrossSiteAncestor: true },
  });
  assert.deepEqual(calls[1], {
    url: 'https://example.com/',
    name: 'legacy',
    storeId: '0',
  });
  assert.deepEqual(callbackResults, [true, false]);
});

test('deleteAll removes every cookie with its own partition identity', () => {
  const calls = [];
  globalThis.chrome = {
    cookies: {
      remove(details, callback) {
        calls.push(details);
        callback(details);
      },
    },
  };
  const cookies = [
    { name: 'plain', domain: '.example.com', path: '/', storeId: '0' },
    {
      name: 'partitioned',
      domain: '.example.com',
      path: '/account',
      storeId: '1',
      partitionKey: { topLevelSite: 'https://top.example' },
    },
  ];

  deleteAll(cookies, 'https://example.com/');

  assert.deepEqual(calls, [
    { url: 'https://example.com/', name: 'plain', storeId: '0' },
    {
      url: 'https://example.com/account',
      name: 'partitioned',
      storeId: '1',
      partitionKey: { topLevelSite: 'https://top.example' },
    },
  ]);
});

test('Filter exposes every configured cookie filter', () => {
  const filter = new Filter();
  filter.setUrl('https://example.com');
  filter.setDomain('example.com');
  filter.setName('session');
  filter.setSecure(true);
  filter.setSession(false);

  assert.deepEqual(filter.getFilter(), {
    url: 'https://example.com',
    domain: 'example.com',
    name: 'session',
    secure: true,
    session: false,
  });
});

test('cookieForCreationFromFullCookie preserves persistent partitioned cookie data', () => {
  const fullCookie = {
    name: 'session',
    value: 'value',
    domain: '.example.com',
    path: '/',
    secure: true,
    httpOnly: true,
    hostOnly: false,
    session: false,
    expirationDate: 2_000_000_000,
    sameSite: 'no_restriction',
    storeId: '0',
    partitionKey: {
      topLevelSite: 'https://top-level.example',
      hasCrossSiteAncestor: false,
    },
  };

  const createdCookie = cookieForCreationFromFullCookie(fullCookie);

  assert.deepEqual(createdCookie, {
    url: 'https://example.com/',
    name: 'session',
    value: 'value',
    path: '/',
    secure: true,
    httpOnly: true,
    domain: '.example.com',
    storeId: '0',
    expirationDate: 2_000_000_000,
    sameSite: 'no_restriction',
    partitionKey: {
      topLevelSite: 'https://top-level.example',
      hasCrossSiteAncestor: false,
    },
  });
  assert.notStrictEqual(createdCookie.partitionKey, fullCookie.partitionKey);
  assert.equal(fullCookie.domain, '.example.com');
});

test('cookieForCreationFromFullCookie supports legacy field names and session defaults', () => {
  const legacyCookie = cookieForCreationFromFullCookie({
    name: 'legacy',
    value: 'value',
    domain: 'example.com',
    hostOnly: true,
    session: true,
    expiration_date: 2_000_000_000,
    http_only: true,
    same_site: 'unspecified',
    store_id: '2',
    partition_key: { topLevelSite: 'https://top.example' },
  });

  assert.deepEqual(legacyCookie, {
    url: 'http://example.com/',
    name: 'legacy',
    value: 'value',
    path: '/',
    secure: false,
    httpOnly: true,
    storeId: '2',
    partitionKey: { topLevelSite: 'https://top.example' },
  });
});

test('cookie identity includes domain, path, store, and partition key', () => {
  const base = {
    name: 'duplicate',
    domain: '.example.com',
    path: '/',
    storeId: '0',
    partitionKey: { topLevelSite: 'https://first.example' },
  };

  assert.equal(cookiesHaveSameIdentity(base, { ...base, partitionKey: { ...base.partitionKey } }), true);
  assert.equal(cookiesHaveSameIdentity(base, { ...base, path: '/other' }), false);
  assert.equal(cookiesHaveSameIdentity(base, { ...base, storeId: '1' }), false);
  assert.equal(cookiesHaveSameIdentity(base, { ...base, partitionKey: { topLevelSite: 'https://second.example' } }), false);
  assert.equal(cookiesHaveSameIdentity(base, null), false);
});

test('compareCookies checks value, security, host scope, and persistence', () => {
  const base = {
    name: 'session',
    value: 'value',
    domain: '.example.com',
    path: '/',
    storeId: '0',
    secure: true,
    httpOnly: true,
    hostOnly: false,
    session: false,
    expirationDate: 2_000_000_000,
  };

  assert.equal(compareCookies(base, { ...base }), true);
  assert.equal(compareCookies(base, { ...base, value: 'other' }), false);
  assert.equal(compareCookies(base, { ...base, secure: false }), false);
  assert.equal(compareCookies(base, { ...base, httpOnly: false }), false);
  assert.equal(compareCookies(base, { ...base, hostOnly: true }), false);
  assert.equal(compareCookies(base, { ...base, expirationDate: 2_000_000_001 }), false);
});

test('cookie exporters generate JSON, Netscape, semicolon, and LWP formats', () => {
  const cookies = [
    {
      name: 'session',
      value: 'a=b',
      domain: '.example.com',
      path: '/',
      hostOnly: false,
      secure: true,
      expirationDate: 1_893_456_000,
      partitionKey: { topLevelSite: 'https://top.example' },
    },
  ];
  const generator = cookiesToStringGenerator({}, { copyCookiesType: 'json' });

  const json = JSON.parse(generator.get(structuredClone(cookies)));
  assert.equal(json[0].id, 1);
  assert.deepEqual(json[0].partitionKey, { topLevelSite: 'https://top.example' });
  assert.match(generator.netscape(cookies, 'https://example.com/'), /\.example\.com\tTRUE\t\/\tTRUE\t1893456000\tsession\ta=b/);
  assert.match(generator.semicolonPairs(cookies), /session=a=b;/);
  assert.match(generator.lpw(cookies), /Set-Cookie3: session=a=b; path="\/"; domain=\.example\.com/);
  assert.equal(generator.get([], 'https://example.com/'), undefined);
});
