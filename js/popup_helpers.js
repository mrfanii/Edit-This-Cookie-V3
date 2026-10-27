export function cookieMatchesSearch(cookie, pattern) {
  const normalizedPattern = String(pattern ?? '')
    .trim()
    .toLowerCase();
  if (normalizedPattern === '') return true;

  return [cookie?.name, cookie?.domain, cookie?.value].some((field) =>
    String(field ?? '')
      .toLowerCase()
      .includes(normalizedPattern),
  );
}

export function buildBlockRule({ domainChecked, domain, nameChecked, name, valueChecked, value }) {
  const rule = {};

  addRuleCriterion(rule, 'domain', domainChecked, domain);
  addRuleCriterion(rule, 'name', nameChecked, name);
  addRuleCriterion(rule, 'value', valueChecked, value);

  return isValidBlockRule(rule) ? rule : null;
}

export function isValidBlockRule(rule) {
  if (rule === null || typeof rule !== 'object') return false;

  return ['domain', 'name', 'value'].some((key) => typeof rule[key] === 'string' && rule[key].trim() !== '');
}

export async function readCookieImportFile(file) {
  if (file === null || typeof file?.text !== 'function') {
    throw new TypeError('A readable import file is required.');
  }

  return file.text();
}

export function parseCookieImport(text, defaultUrl) {
  const source = String(text ?? '').replace(/^\uFEFF/, '');
  if (source.trim() === '') throw new Error('The cookie import is empty.');

  const trimmedStart = source.trimStart();
  if (/^[\[{]/.test(trimmedStart)) return createImportResult('json', parseJsonCookies(trimmedStart));

  const lines = source.split(/\r?\n/);
  if (lines.some((line) => /^\s*Set-Cookie3:/i.test(line))) {
    return createImportResult('lpw', parseLwpCookies(lines, defaultUrl));
  }
  if (lines.some(isNetscapeCookieLine) || lines.some((line) => /^\s*#\s*Netscape HTTP Cookie File/i.test(line))) {
    return createImportResult('netscape', parseNetscapeCookies(lines));
  }
  if (lines.some((line) => !/^\s*\/\//.test(line) && line.includes('='))) {
    return createImportResult('semicolonPairs', parseSemicolonPairs(lines, defaultUrl));
  }

  throw new Error('Unsupported cookie import format.');
}

function parseJsonCookies(source) {
  const parsed = JSON.parse(source);
  const cookies = Array.isArray(parsed) ? parsed : [parsed];
  cookies.forEach((cookie, index) => assertCookieRecord(cookie, index));
  return cookies;
}

function parseNetscapeCookies(lines) {
  return lines.filter(isNetscapeCookieLine).map((line, index) => {
    let httpOnly = false;
    let cookieLine = line.trimStart();
    if (/^#HttpOnly_/i.test(cookieLine)) {
      httpOnly = true;
      cookieLine = cookieLine.replace(/^#HttpOnly_/i, '');
    }

    const fields = cookieLine.split('\t');
    if (fields.length < 7) throw new Error(`Invalid Netscape cookie on line ${index + 1}.`);
    const [domain, includeSubdomains, path, secure, expires, name, ...valueParts] = fields;
    const expirationDate = Number(expires);

    return {
      domain: domain.trim(),
      hostOnly: includeSubdomains.trim().toUpperCase() !== 'TRUE',
      path: path || '/',
      secure: secure.trim().toUpperCase() === 'TRUE',
      httpOnly,
      session: !Number.isFinite(expirationDate) || expirationDate <= 0,
      ...(Number.isFinite(expirationDate) && expirationDate > 0 ? { expirationDate } : {}),
      name,
      value: valueParts.join('\t'),
    };
  });
}

function parseSemicolonPairs(lines, defaultUrl) {
  const scope = getDefaultCookieScope(defaultUrl);
  const body = lines
    .filter((line) => !/^\s*\/\//.test(line))
    .join(';')
    .trim();

  return body
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((pair, index) => {
      const separator = pair.indexOf('=');
      if (separator < 0) throw new Error(`Invalid name=value cookie at position ${index + 1}.`);
      return {
        ...scope,
        name: pair.slice(0, separator).trim(),
        value: pair.slice(separator + 1).trim(),
      };
    });
}

function parseLwpCookies(lines, defaultUrl) {
  const defaultScope = getOptionalDefaultCookieScope(defaultUrl);
  return lines
    .map((line) => line.trim())
    .filter((line) => /^Set-Cookie3:/i.test(line))
    .map((line, index) => {
      const payload = line.replace(/^Set-Cookie3:\s*/i, '');
      const cookieMatch = /^([^=;\s]+)=([\s\S]*?)(?=;\s*(?:path|domain|path_spec|expires|version|secure|httponly)(?:\s*=|\s*;|\s*$)|$)/i.exec(payload);
      if (cookieMatch === null) throw new Error(`Invalid Perl::LWP cookie on line ${index + 1}.`);

      const attributes = parseCookieAttributes(payload.slice(cookieMatch[0].length));
      const domain = attributes.domain || defaultScope?.domain;
      if (!domain) throw new Error(`Perl::LWP cookie ${index + 1} does not include a domain.`);
      const expirationDate = parseExpirationDate(attributes.expires);

      return {
        domain,
        hostOnly: attributes.domain === undefined,
        path: attributes.path || '/',
        secure: attributes.secure !== undefined,
        httpOnly: attributes.httponly !== undefined,
        session: expirationDate === undefined,
        ...(expirationDate === undefined ? {} : { expirationDate }),
        name: cookieMatch[1],
        value: cookieMatch[2],
      };
    });
}

function parseCookieAttributes(text) {
  const attributes = {};
  const attributePattern = /(?:^|;)\s*([A-Za-z_][\w-]*)(?:\s*=\s*(?:"([^"]*)"|([^;]*)))?/g;
  let match;
  while ((match = attributePattern.exec(text)) !== null) {
    attributes[match[1].toLowerCase()] = (match[2] ?? match[3] ?? '').trim();
  }
  return attributes;
}

function parseExpirationDate(value) {
  if (value === undefined || value === '' || value === '0') return undefined;
  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue > 0) return numericValue;
  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) return timestamp / 1000;
  throw new Error(`Invalid cookie expiration date: ${value}`);
}

function getDefaultCookieScope(defaultUrl) {
  const scope = getOptionalDefaultCookieScope(defaultUrl);
  if (scope === null) throw new Error('A valid website URL is required for this import format.');
  return scope;
}

function getOptionalDefaultCookieScope(defaultUrl) {
  let value = String(defaultUrl ?? '').trim();
  if (value === '') return null;
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) value = `http://${value}`;

  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.hostname === '') return null;
    return {
      domain: url.hostname,
      hostOnly: true,
      path: '/',
      secure: url.protocol === 'https:',
      httpOnly: false,
      session: true,
    };
  } catch {
    return null;
  }
}

function createImportResult(format, cookies) {
  if (cookies.length === 0) throw new Error('No cookies were found in the import.');
  return { format, cookies };
}

function assertCookieRecord(cookie, index) {
  if (cookie === null || typeof cookie !== 'object' || Array.isArray(cookie)) {
    throw new Error(`Cookie ${index + 1} is not an object.`);
  }
}

function isNetscapeCookieLine(line) {
  const candidate = line.trimStart().replace(/^#HttpOnly_/i, '');
  return candidate !== '' && !candidate.startsWith('#') && candidate.split('\t').length >= 7;
}
function addRuleCriterion(rule, key, isChecked, value) {
  if (!isChecked || typeof value !== 'string' || value.trim() === '') return;
  rule[key] = value;
}
