import { isChristmasPeriod, storage } from './common-utils.js';
import { deleteCookie, cookieForCreationFromFullCookie, compareCookies } from '/js/cookie_helpers.js';
import { startData } from './data.js';
import { filterMatchesCookie } from './utils.js';
import "./statistics.js"

async function start() {
  let showContextMenu;
  const { data, preferences } = await startData(function ({ preferences }) {
    if (showContextMenu !== preferences.showContextMenu) {
      showContextMenu = preferences.showContextMenu;
      toggleContextMenusBtn(showContextMenu);
    }
    setChristmasIcon();
  });

  function issueRefresh(port) {
    port.postMessage({
      action: 'refresh',
    });
  }

  function getAll(port, message) {
    chrome.tabs.get(message.tabId, function (tab) {
      var url = tab.url;
      console.log('Looking for cookies on: ' + url);
      chrome.cookies.getAll(
        {
          url: url,
        },
        function (cks) {
          console.log('I have ' + cks.length + ' cookies');
          port.postMessage({
            action: 'getall',
            url: url,
            cks: cks,
          });
        },
      );
    });
  }

  function toggleContextMenusBtn() {
    chrome.contextMenus.removeAll(() => {
      if (showContextMenu) {
        chrome.contextMenus.create({
          id: 'editThisCookieMenu',
          title: 'EditThisCookie',
          contexts: ['page'],
        });
      }
    });
  }

  function showPopup(info, tab) {
    const tabUrl = encodeURIComponent(tab.url);
    const tabID = encodeURIComponent(tab.id);
    const tabIncognito = encodeURIComponent(tab.incognito);
    const urlToOpen = chrome.runtime.getURL('popup.html') + `?url=${tabUrl}&id=${tabID}&incognito=${tabIncognito}`;

    chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }, (tabList) => {
      for (const cTab of tabList) {
        if (cTab.url.startsWith(urlToOpen)) {
          chrome.tabs.update(cTab.id, { active: true });
          return;
        }
      }
      chrome.tabs.create({ url: urlToOpen });
    });
  }

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'editThisCookieMenu') {
      showPopup(info, tab);
    }
  });

  function setChristmasIcon() {
    if (isChristmasPeriod() && preferences.showChristmasIcon) {
      return chrome.action.setIcon({ path: '/img/cookie_xmas_19x19.png' });
    } else {
      return chrome.action.setIcon({ path: '/img/icon_19x19.png' });
    }
  }

  chrome.runtime.onConnect.addListener(function (port) {
    if (port.name !== 'devtools-page') {
      return;
    }
    const devToolsListener = function (message) {
      const action = message.action;
      if (action === 'getall') {
        getAll(port, message);
      } else if (action === 'submitCookie') {
        const cookie = message.cookie;
        const origName = message.origName;
        deleteCookie(cookie.url, origName, cookie.storeId);
        chrome.cookies.set(cookie);
        issueRefresh(port);
      }
    };
    port.onMessage.addListener(devToolsListener);

    port.onDisconnect.addListener(function () {
      port.onMessage.removeListener(devToolsListener);
    });
  });

  setChristmasIcon();
  setInterval(setChristmasIcon, 60 * 60 * 1000);

  await storage.set('option_panel', 'null');

  var currentVersion = chrome.runtime.getManifest().version;
  var oldVersion = data.lastVersionRun;

  data.lastVersionRun = currentVersion;

  if (oldVersion !== currentVersion) {
    if (oldVersion === undefined) {
      //Is firstrun
      chrome.tabs.create({ url: 'https://editcookie.com/#start' });
    }
  }

  chrome.runtime.onInstalled.addListener(() => {
    toggleContextMenusBtn(showContextMenu);
  });

  chrome.cookies.onChanged.addListener(function (changeInfo) {
    var removed = changeInfo.removed;
    var cookie = changeInfo.cookie;
    var cause = changeInfo.cause;

    var name = cookie.name;
    var domain = cookie.domain;
    var value = cookie.value;

    if (cause === 'expired' || cause === 'evicted') return;

    for (var i = 0; i < data.readOnly.length; i++) {
      var currentRORule = data.readOnly[i];
      if (compareCookies(cookie, currentRORule)) {
        if (removed) {
          chrome.cookies.get(
            {
              url: 'http' + (currentRORule.secure ? 's' : '') + '://' + currentRORule.domain + currentRORule.path,
              name: currentRORule.name,
              storeId: currentRORule.storeId,
            },
            function (currentCookie) {
              if (compareCookies(currentCookie, currentRORule)) return;
              var newCookie = cookieForCreationFromFullCookie(currentRORule);
              chrome.cookies.set(newCookie);
              ++data.nCookiesProtected;
            },
          );
        }
        return;
      }
    }

    //Check if a blocked cookie was added
    if (!removed) {
      for (var i = 0; i < data.filters.length; i++) {
        var currentFilter = data.filters[i];
        if (filterMatchesCookie(currentFilter, name, domain, value)) {
          chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            var url = tabs[0].url;
            var toRemove = {};
            toRemove.url = url;
            toRemove.url = 'http' + (cookie.secure ? 's' : '') + '://' + cookie.domain + cookie.path;
            toRemove.name = name;
            chrome.cookies.remove(toRemove);
            ++data.nCookiesFlagged;
          });
        }
      }
    }

    if (!removed && preferences.useMaxCookieAge && preferences.maxCookieAgeType > 0) {
      //Check expiration, if too far in the future shorten on user's preference
      var maxAllowedExpiration = Math.round(new Date().getTime() / 1000) + preferences.maxCookieAge * preferences.maxCookieAgeType;
      if (cookie.expirationDate !== undefined && cookie.expirationDate > maxAllowedExpiration + 60) {
        var newCookie = cookieForCreationFromFullCookie(cookie);
        if (!cookie.session) newCookie.expirationDate = maxAllowedExpiration;
        chrome.cookies.set(newCookie);
        ++data.nCookiesShortened;
      }
    }
  });
}

start().then();
