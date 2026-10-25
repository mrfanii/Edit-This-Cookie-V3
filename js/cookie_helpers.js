export function buildUrl(domain, path, searchUrl) {
  // Keep same protocol as searchUrl
  // This fixes a bug when we want to unset 'secure' property in an https domain
  var secure = searchUrl.indexOf('https://') === 0;

  if (domain.substr(0, 1) === '.') domain = domain.substring(1);

  return 'http' + (secure ? 's' : '') + '://' + domain + path;
}

export function buildCookieUrl(cookie) {
  const domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
  return `http${cookie.secure ? 's' : ''}://${domain}${cookie.path}`;
}

export function clonePartitionKey(partitionKey) {
  if (partitionKey === undefined || partitionKey === null) return undefined;

  const clonedPartitionKey = {};
  if (partitionKey.topLevelSite !== undefined) clonedPartitionKey.topLevelSite = partitionKey.topLevelSite;
  if (partitionKey.hasCrossSiteAncestor !== undefined) clonedPartitionKey.hasCrossSiteAncestor = partitionKey.hasCrossSiteAncestor;
  return clonedPartitionKey;
}

export function partitionKeysEqual(firstPartitionKey, secondPartitionKey) {
  const first = clonePartitionKey(firstPartitionKey);
  const second = clonePartitionKey(secondPartitionKey);

  if (first === undefined || second === undefined) return first === second;
  return first.topLevelSite === second.topLevelSite && first.hasCrossSiteAncestor === second.hasCrossSiteAncestor;
}

export function cookiesHaveSameIdentity(firstCookie, secondCookie) {
  if (!firstCookie || !secondCookie) return false;
  return (
    firstCookie.name === secondCookie.name &&
    firstCookie.domain === secondCookie.domain &&
    firstCookie.path === secondCookie.path &&
    firstCookie.storeId === secondCookie.storeId &&
    partitionKeysEqual(firstCookie.partitionKey, secondCookie.partitionKey)
  );
}

export function getAllCookies(details, callback) {
  chrome.cookies.getAll(
    {
      ...(details ?? {}),
      // An empty partition key asks Chrome for both partitioned and
      // unpartitioned cookies.
      partitionKey: {},
    },
    callback,
  );
}

export function getCookie(cookie, callback) {
  const details = {
    url: buildCookieUrl(cookie),
    name: cookie.name,
  };
  if (cookie.storeId !== undefined && cookie.storeId !== null) details.storeId = cookie.storeId;

  const partitionKey = clonePartitionKey(cookie.partitionKey);
  if (partitionKey !== undefined) details.partitionKey = partitionKey;

  chrome.cookies.get(details, callback);
}

export function deleteAll(cookieList, searchUrl) {
  for (var i = 0; i < cookieList.length; i++) {
    var curr = cookieList[i];
    var url = buildUrl(curr.domain, curr.path, searchUrl);
    deleteCookie(url, curr.name, curr.storeId, curr.partitionKey);
  }
}

export function deleteCookie(url, name, store, partitionKey, callback) {
  // Preserve compatibility with the old (url, name, store, callback)
  // signature while allowing callers to identify a partitioned cookie.
  if (typeof partitionKey === 'function') {
    callback = partitionKey;
    partitionKey = undefined;
  }

  const details = {
    url: url,
    name: name,
  };
  if (store !== undefined && store !== null) details.storeId = store;

  const clonedPartitionKey = clonePartitionKey(partitionKey);
  if (clonedPartitionKey !== undefined) details.partitionKey = clonedPartitionKey;

  chrome.cookies.remove(details, function (removedCookie) {
    if (typeof callback === 'undefined') return;
    callback(removedCookie !== undefined && removedCookie !== null);
  });
}

export function Filter() {
  var filter = {};

  this.setUrl = function (url) {
    filter.url = url;
  };
  this.setDomain = function (domain) {
    filter.domain = domain;
  };
  this.setName = function (name) {
    filter.name = name;
  };
  this.setSecure = function (secure) {
    filter.secure = secure;
  };
  this.setSession = function (session) {
    filter.session = session;
  };
  this.getFilter = function (session) {
    return filter;
  };
}

export function cookieForCreationFromFullCookie(fullCookie) {
  const originalDomain = fullCookie.domain ?? '';
  const urlDomain = originalDomain.startsWith('.') ? originalDomain.substring(1) : originalDomain;
  const path = fullCookie.path ?? '/';
  const newCookie = {};
  newCookie.url = `http${fullCookie.secure ? 's' : ''}://${urlDomain}${path}`;
  newCookie.name = fullCookie.name ?? '';
  newCookie.value = fullCookie.value ?? '';
  newCookie.path = path;
  newCookie.secure = fullCookie.secure ?? false;
  newCookie.httpOnly = fullCookie.httpOnly ?? fullCookie.http_only ?? false;

  const isDomainCookie = fullCookie.hostOnly === false || (fullCookie.hostOnly === undefined && originalDomain.startsWith('.'));
  if (isDomainCookie && originalDomain !== '') newCookie.domain = originalDomain;

  const storeId = fullCookie.storeId ?? fullCookie.store_id;
  if (storeId !== undefined && storeId !== null) newCookie.storeId = storeId;

  const expirationDate = fullCookie.expirationDate ?? fullCookie.expiration_date;
  if (fullCookie.session !== true && expirationDate !== undefined && expirationDate !== null) newCookie.expirationDate = expirationDate;

  const sameSite = fullCookie.sameSite ?? fullCookie.same_site;
  if (sameSite !== undefined && sameSite !== null && sameSite !== 'unspecified') newCookie.sameSite = sameSite;

  const partitionKey = clonePartitionKey(fullCookie.partitionKey ?? fullCookie.partition_key);
  if (partitionKey !== undefined) newCookie.partitionKey = partitionKey;

  return newCookie;
}

export function compareCookies(b, a) {
  try {
    if (!cookiesHaveSameIdentity(b, a)) return false;
    if (b.value !== a.value) return false;
    if (b.secure !== a.secure) return false;
    if (b.httpOnly !== a.httpOnly) return false;

    var aHostOnly = !!(a.hostOnly || a.domain === undefined);
    var bHostOnly = !!(b.hostOnly || b.domain === undefined);
    if (aHostOnly !== bHostOnly) return false;

    var aSession = !!(a.session || a.expirationDate === undefined);
    var bSession = !!(b.session || b.expirationDate === undefined);
    if (aSession !== bSession) return false;
    if (aSession === false && b.expirationDate !== a.expirationDate) return false;
  } catch (e) {
    console.error(e.message);
    return false;
  }
  return true;
}

const cookiesToString = {
  netscape: function (cookies, url) {
    var string = '';
    string += '# Netscape HTTP Cookie File\n';
    string += '# http://curl.haxx.se/rfc/cookie_spec.html\n';
    string += '# This file was generated by EditThisCookie\n';
    if (url !== undefined) string += '# URL: ' + url + '\n';
    for (var i = 0; i < cookies.length; i++) {
      const cookie = cookies[i];
      string +=
        cookie.domain +
        '\t' +
        (!cookie.hostOnly).toString().toUpperCase() +
        '\t' +
        cookie.path +
        '\t' +
        cookie.secure.toString().toUpperCase() +
        '\t' +
        (cookie.expirationDate ? Math.round(cookie.expirationDate) : '0') +
        '\t' +
        cookie.name +
        '\t' +
        cookie.value +
        (i === cookies.length - 1 ? '' : '\n');
    }
    return string;
  },

  json: function (cookies, url) {
    var string = '';
    string += '[\n';
    for (var i = 0; i < cookies.length; i++) {
      const cookie = cookies[i];
      cookie.id = i + 1;
      string += JSON.stringify(cookie, null, 4);
      if (i < cookies.length - 1) string += ',\n';
    }
    string += '\n]';
    return string;
  },

  semicolonPairs: function (cookies, url) {
    var string = '';
    string += '// Semicolon separated Cookie File\n';
    string += '// This file was generated by EditThisCookie\n';
    string += '// Details: http://www.ietf.org/rfc/rfc2109.txt\n';
    string += '// Example: http://www.tutorialspoint.com/javascript/javascript_cookies.htm\n';
    if (url !== undefined) string += '// URL: ' + url + '\n';
    for (var i = 0; i < cookies.length; i++) {
      const cookie = cookies[i];
      string += cookie.name + '=' + cookie.value + ';';
    }
    return string;
  },

  lpw: function (cookies, url) {
    var string = '';
    string += '// Semicolon separated Cookie File\n';
    string += '// This file was generated by EditThisCookie\n';
    string += '// Details: http://www.cookiecentral.com/faq/#3.5\n';
    string += '// Example: http://www.tutorialspoint.com/javascript/javascript_cookies.htm\n';
    if (url !== undefined) string += '// URL: ' + url + '\n';
    for (var i = 0; i < cookies.length; i++) {
      const cookie = cookies[i];
      string +=
        'Set-Cookie3: ' +
        cookie.name +
        '=' +
        cookie.value +
        '; path="/"; domain=' +
        cookie.domain +
        '; path_spec; expires="' +
        (cookie.expirationDate ? cookie.expirationDate : '0') +
        '"; version=0\n';
    }
    return string;
  },
};

export function cookiesToStringGenerator(data, preferences) {
  return {
    get: function (cookies, url) {
      if (cookiesToString[preferences.copyCookiesType] !== undefined && cookies.length > 0) return cookiesToString[preferences.copyCookiesType](cookies, url);
      else return undefined;
    },
    ...cookiesToString,
  };
}
