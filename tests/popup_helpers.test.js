import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildBlockRule, cookieMatchesSearch, isValidBlockRule, parseCookieImport, readCookieImportFile } from '../js/popup_helpers.js';

const cookie = {
  name: 'session_token',
  domain: '.example.com',
  value: 'Needle Value',
};

test('popup search matches names, domains, and values without case sensitivity', () => {
  assert.equal(cookieMatchesSearch(cookie, 'SESSION'), true);
  assert.equal(cookieMatchesSearch(cookie, 'EXAMPLE.COM'), true);
  assert.equal(cookieMatchesSearch(cookie, 'needle value'), true);
});

test('empty popup search matches every cookie', () => {
  assert.equal(cookieMatchesSearch(cookie, ''), true);
  assert.equal(cookieMatchesSearch(cookie, '   '), true);
  assert.equal(cookieMatchesSearch(cookie, null), true);
});

test('popup search rejects unrelated text and tolerates missing cookie fields', () => {
  assert.equal(cookieMatchesSearch(cookie, 'missing'), false);
  assert.equal(cookieMatchesSearch({ name: 'only-name' }, 'example'), false);
  assert.equal(cookieMatchesSearch(null, 'example'), false);
});

test('buildBlockRule keeps only enabled non-empty criteria', () => {
  assert.deepEqual(
    buildBlockRule({
      domainChecked: true,
      domain: '.example.com',
      nameChecked: false,
      name: 'ignored',
      valueChecked: true,
      value: 'value',
    }),
    { domain: '.example.com', value: 'value' },
  );
});

test('buildBlockRule rejects empty and whitespace-only rules', () => {
  assert.equal(
    buildBlockRule({
      domainChecked: false,
      domain: '',
      nameChecked: false,
      name: '',
      valueChecked: false,
      value: '',
    }),
    null,
  );
  assert.equal(
    buildBlockRule({
      domainChecked: true,
      domain: '   ',
      nameChecked: false,
      name: '',
      valueChecked: false,
      value: '',
    }),
    null,
  );
});

test('isValidBlockRule requires an object with one meaningful supported field', () => {
  assert.equal(isValidBlockRule(null), false);
  assert.equal(isValidBlockRule('name=session'), false);
  assert.equal(isValidBlockRule({}), false);
  assert.equal(isValidBlockRule({ unsupported: 'value' }), false);
  assert.equal(isValidBlockRule({ domain: '   ' }), false);
  assert.equal(isValidBlockRule({ name: 'session' }), true);
});

test('cookie import files are read as text', async () => {
  const contents = '[{"name":"session"}]';
  const file = { text: async () => contents };

  assert.equal(await readCookieImportFile(file), contents);
});

test('missing and unreadable cookie import files are rejected', async () => {
  await assert.rejects(() => readCookieImportFile(null), /readable import file/i);
  await assert.rejects(() => readCookieImportFile({}), /readable import file/i);
  await assert.rejects(() => readCookieImportFile({ text: async () => Promise.reject(new Error('read failed')) }), /read failed/i);
});

test('JSON imports accept BOM-prefixed objects and arrays', () => {
  const objectImport = parseCookieImport('\uFEFF{"name":"session","domain":"example.com"}', 'https://example.com/');
  const arrayImport = parseCookieImport('[{"name":"one"},{"name":"two"}]', 'https://example.com/');

  assert.equal(objectImport.format, 'json');
  assert.equal(objectImport.cookies[0].name, 'session');
  assert.deepEqual(
    arrayImport.cookies.map(({ name }) => name),
    ['one', 'two'],
  );
});

test('JSON imports reject primitives, empty arrays, and malformed data', () => {
  assert.throws(() => parseCookieImport('[null]', 'https://example.com/'), /not an object/i);
  assert.throws(() => parseCookieImport('["cookie"]', 'https://example.com/'), /not an object/i);
  assert.throws(() => parseCookieImport('[]', 'https://example.com/'), /no cookies/i);
  assert.throws(() => parseCookieImport('[{"name":]', 'https://example.com/'), SyntaxError);
});

test('Netscape imports preserve scope, security, persistence, HttpOnly, and tabs in values', () => {
  const imported = parseCookieImport(
    '# Netscape HTTP Cookie File\n#HttpOnly_.example.com\tTRUE\t/account\tTRUE\t1893456000\tsession\tvalue\twith\ttabs',
    'https://ignored.example/',
  );

  assert.equal(imported.format, 'netscape');
  assert.deepEqual(imported.cookies[0], {
    domain: '.example.com',
    hostOnly: false,
    path: '/account',
    secure: true,
    httpOnly: true,
    session: false,
    expirationDate: 1_893_456_000,
    name: 'session',
    value: 'value\twith\ttabs',
  });
});

test('Netscape imports recognize session cookies and empty values', () => {
  const imported = parseCookieImport('# Netscape HTTP Cookie File\nexample.com\tFALSE\t/\tFALSE\t0\tempty\t', 'https://example.com/');

  assert.deepEqual(imported.cookies[0], {
    domain: 'example.com',
    hostOnly: true,
    path: '/',
    secure: false,
    httpOnly: false,
    session: true,
    name: 'empty',
    value: '',
  });
});

test('Netscape headers without valid cookie rows are rejected', () => {
  assert.throws(() => parseCookieImport('# Netscape HTTP Cookie File\ninvalid\trow', 'https://example.com/'), /no cookies/i);
});

test('semicolon imports use the current HTTPS website and keep equals signs in values', () => {
  const imported = parseCookieImport('// comment\nsession=first; token=a=b=c;', 'https://example.com/page');

  assert.equal(imported.format, 'semicolonPairs');
  assert.deepEqual(
    imported.cookies.map(({ name, value, domain, secure, session }) => ({ name, value, domain, secure, session })),
    [
      { name: 'session', value: 'first', domain: 'example.com', secure: true, session: true },
      { name: 'token', value: 'a=b=c', domain: 'example.com', secure: true, session: true },
    ],
  );
});

test('semicolon imports accept host names and use an insecure default scope', () => {
  const imported = parseCookieImport('session=value', 'example.com');

  assert.deepEqual(imported.cookies[0], {
    domain: 'example.com',
    hostOnly: true,
    path: '/',
    secure: false,
    httpOnly: false,
    session: true,
    name: 'session',
    value: 'value',
  });
});

test('Perl::LWP imports restore explicit cookie attributes', () => {
  const imported = parseCookieImport(
    'Set-Cookie3: session=value; path="/account"; domain=.example.com; path_spec; expires="1893456000"; secure; HttpOnly; version=0',
    'https://example.com/',
  );

  assert.equal(imported.format, 'lpw');
  assert.deepEqual(imported.cookies[0], {
    domain: '.example.com',
    hostOnly: false,
    path: '/account',
    secure: true,
    httpOnly: true,
    session: false,
    expirationDate: 1_893_456_000,
    name: 'session',
    value: 'value',
  });
});

test('Perl::LWP imports can use the current site when domain is omitted', () => {
  const imported = parseCookieImport('Set-Cookie3: session=value; path="/"; version=0', 'https://example.com/');

  assert.equal(imported.cookies[0].domain, 'example.com');
  assert.equal(imported.cookies[0].hostOnly, true);
  assert.equal(imported.cookies[0].session, true);
});

test('Perl::LWP imports reject invalid expiration dates and missing domains', () => {
  assert.throws(
    () => parseCookieImport('Set-Cookie3: session=value; domain=.example.com; expires="not-a-date"; version=0', 'https://example.com/'),
    /invalid cookie expiration/i,
  );
  assert.throws(() => parseCookieImport('Set-Cookie3: session=value; version=0', ''), /does not include a domain/i);
});

test('text imports reject empty input, invalid site contexts, and unsupported content', () => {
  assert.throws(() => parseCookieImport('session=value;', ''), /valid website URL/i);
  assert.throws(() => parseCookieImport('session=value;', 'ftp://example.com/'), /valid website URL/i);
  assert.throws(() => parseCookieImport('not a cookie file', 'https://example.com/'), /unsupported/i);
  assert.throws(() => parseCookieImport('   ', 'https://example.com/'), /empty/i);
});
