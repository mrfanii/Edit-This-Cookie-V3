import { storage } from './common-utils.js';

if (!Object.prototype.watch) {
  Object.defineProperty(Object.prototype, 'watch', {
    enumerable: false,
    configurable: true,
    writable: false,
    value: function (prop, writeHandler, readHandler) {
      let oldVal = this[prop];
      let newVal = oldVal;
      const getter = function () {
        if (readHandler) readHandler.call(this, prop);
        return newVal;
      };
      const setter = function (val) {
        oldVal = newVal;
        return (newVal = writeHandler.call(this, prop, oldVal, val));
      };
      if (delete this[prop]) {
        Object.defineProperty(this, prop, {
          get: getter,
          set: setter,
          enumerable: true,
          configurable: true,
        });
      }
    },
  });
}

if (!Object.prototype.unwatch) {
  Object.defineProperty(Object.prototype, 'unwatch', {
    enumerable: false,
    configurable: true,
    writable: false,
    value: function (prop) {
      const val = this[prop];
      delete this[prop];
      this[prop] = val;
    },
  });
}
export async function startData(updateCallback) {
  const preferences_template = {
    showAlerts: {
      default_value: false,
    },
    showCommandsLabels: {
      default_value: false,
    },
    showDomain: {
      default_value: true,
    },
    showDomainBeforeName: {
      default_value: true,
    },
    showFlagAndDeleteAll: {
      default_value: false,
    },
    showContextMenu: {
      default_value: true,
    },
    refreshAfterSubmit: {
      default_value: false,
    },
    skipCacheRefresh: {
      default_value: true,
    },
    useMaxCookieAge: {
      default_value: false,
    },
    maxCookieAgeType: {
      default_value: -1,
    },
    maxCookieAge: {
      default_value: 1,
    },
    useCustomLocale: {
      default_value: false,
    },
    customLocale: {
      default_value: 'en',
    },
    copyCookiesType: {
      default_value: 'json',
    },
    exportCookiesAction: {
      default_value: 'download',
    },
    showChristmasIcon: {
      default_value: true,
    },
    sortCookiesType: {
      default_value: 'domain_alpha',
    },
    showDevToolsPanel: {
      default_value: true,
    },
  };

  const data_template = {
    filters: {
      default_value: [],
    },
    readOnly: {
      default_value: [],
    },
    nCookiesCreated: {
      default_value: 0,
    },
    nCookiesChanged: {
      default_value: 0,
    },
    nCookiesDeleted: {
      default_value: 0,
    },
    nCookiesProtected: {
      default_value: 0,
    },
    nCookiesFlagged: {
      default_value: 0,
    },
    nCookiesShortened: {
      default_value: 0,
    },
    nPopupClicked: {
      default_value: 0,
    },
    nPanelClicked: {
      default_value: 0,
    },
    nCookiesImported: {
      default_value: 0,
    },
    nCookiesExported: {
      default_value: 0,
    },
    lastVersionRun: {
      default_value: undefined,
    },
  };

  const preferences_prefix = 'options_';
  const data_prefix = 'data_';
  const dataToSync = {};
  let isSyncDataToStorageLook = false;
  const preferences = {};
  const data = {};

  async function syncDataToStorage() {
    if (isSyncDataToStorageLook) return;
    isSyncDataToStorageLook = true;
    while (Object.keys(dataToSync).length > 0) {
      const key = Object.keys(dataToSync)[0];
      await storage.set(key, dataToSync[key]);
      delete dataToSync[key];
    }
    isSyncDataToStorageLook = false;
  }

  async function fetchData() {
    for (const key in preferences_template) {
      const default_value = preferences_template[key].default_value;
      preferences[key] = await storage.get(preferences_prefix + key, default_value);
      const onPreferenceChange = function (id, oldval, newval) {
        dataToSync[preferences_prefix + id] = newval;
        syncDataToStorage();
        return newval;
      };
      const onPreferenceRead = function (id) {
        preferences_template[id].used = true;
      };
      preferences.watch(key, onPreferenceChange, onPreferenceRead);
    }

    for (const key in data_template) {
      const default_value = data_template[key].default_value;
      data[key] = await storage.get(data_prefix + key, default_value);
      const onDataChange = function (id, oldval, newval) {
        dataToSync[data_prefix + id] = newval;
        syncDataToStorage();
        return newval;
      };
      const onDataRead = function (id) {
        data_template[id].used = true;
      };
      data.watch(key, onDataChange, onDataRead);
    }
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      for (const [key, { oldValue, newValue }] of Object.entries(changes)) {
        if (key.startsWith(preferences_prefix)) {
          const prefKey = key.substring(preferences_prefix.length);
          preferences[prefKey] = newValue !== undefined ? newValue : preferences_template[prefKey].default_value;
        } else if (key.startsWith(data_prefix)) {
          const dataKey = key.substring(data_prefix.length);
          data[dataKey] = newValue !== undefined ? newValue : data_template[dataKey].default_value;
        }
      }
      if (updateCallback) {
        updateCallback({ data, preferences });
      }
    }
  });

  await fetchData();
  await syncDataToStorage();

  return { data, preferences };
}
