function decodeXmlEntities(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function extractTag(itemXml, tagName) {
  const match = itemXml.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`));
  return match ? decodeXmlEntities(match[1].trim()) : null;
}

function extractEnclosureUrl(itemXml) {
  const match = itemXml.match(/<enclosure\b[^>]*\burl="([^"]+)"/);
  return match ? decodeXmlEntities(match[1]) : null;
}

export async function fetchAppcastReleases(feedUrl, options = {}) {
  const { fetchImpl = fetch } = options;
  const response = await fetchImpl(feedUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${feedUrl}: HTTP ${response.status}`);
  }
  const xml = await response.text();
  return parseAppcastXml(xml);
}

export function parseAppcastXml(xml) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => {
    const itemXml = match[1];
    const version = extractTag(itemXml, 'title') ?? extractTag(itemXml, 'sparkle:shortVersionString');
    const buildNumber = extractTag(itemXml, 'sparkle:version');
    const pubDate = extractTag(itemXml, 'pubDate');
    const enclosureUrl = extractEnclosureUrl(itemXml);
    if (!version || !buildNumber || !enclosureUrl) {
      return null;
    }
    return {
      version,
      buildNumber,
      pubDate,
      enclosureUrl
    };
  });

  return items.filter(Boolean);
}

export function resolveRelease(items, version) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('The selected appcast feed is empty.');
  }
  if (!version) {
    return items[0];
  }
  const release = items.find((item) => item.version === version);
  if (!release) {
    throw new Error(
      `Version ${version} was not found in the selected feed. Available versions: ${items
        .map((item) => item.version)
        .join(', ')}`
    );
  }
  return release;
}
