import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { isChristmasPeriod, storage } from '../js/common-utils.js';

const RealDate = globalThis.Date;

function setCurrentDate(isoDate) {
  const fixedTimestamp = new RealDate(isoDate).getTime();
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length === 0 ? [fixedTimestamp] : args));
    }

    static now() {
      return fixedTimestamp;
    }
  };
}

afterEach(() => {
  globalThis.Date = RealDate;
  delete globalThis.chrome;
});

test('isChristmasPeriod includes December 6 through the end of the year', () => {
  setCurrentDate('2026-12-06T12:00:00Z');
  assert.equal(isChristmasPeriod(), true);

  setCurrentDate('2026-12-31T12:00:00Z');
  assert.equal(isChristmasPeriod(), true);
});

test('isChristmasPeriod includes the first six days of January', () => {
  setCurrentDate('2026-01-01T12:00:00Z');
  assert.equal(isChristmasPeriod(), true);

  setCurrentDate('2026-01-06T12:00:00Z');
  assert.equal(isChristmasPeriod(), true);
});

test('isChristmasPeriod excludes dates outside the configured window', () => {
  setCurrentDate('2026-12-05T12:00:00Z');
  assert.equal(isChristmasPeriod(), false);

  setCurrentDate('2026-01-07T12:00:00Z');
  assert.equal(isChristmasPeriod(), false);

  setCurrentDate('2026-07-01T12:00:00Z');
  assert.equal(isChristmasPeriod(), false);
});

test('storage.set writes a single key to chrome local storage', async () => {
  const calls = [];
  globalThis.chrome = {
    storage: {
      local: {
        async set(value) {
          calls.push(value);
        },
      },
    },
  };

  await storage.set('theme', 'dark');

  assert.deepEqual(calls, [{ theme: 'dark' }]);
});

test('storage.get returns stored values and uses defaults only for undefined keys', async () => {
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) {
          if (key === 'present') return { present: false };
          if (key === 'empty') return { empty: null };
          return {};
        },
      },
    },
  };

  assert.equal(await storage.get('present', true), false);
  assert.equal(await storage.get('empty', 'fallback'), null);
  assert.equal(await storage.get('missing', 'fallback'), 'fallback');
});

test('storage.remove forwards the requested key', async () => {
  const calls = [];
  globalThis.chrome = {
    storage: {
      local: {
        async remove(key) {
          calls.push(key);
        },
      },
    },
  };

  await storage.remove('theme');

  assert.deepEqual(calls, ['theme']);
});
